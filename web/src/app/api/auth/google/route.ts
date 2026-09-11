export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateSessionToken, parseDeviceMetadata } from '@/lib/auth_helpers';

// In-memory cache for Google's public JWK certs (1-hour TTL)
let cachedJwks: { keys: any[]; expiresAt: number } | null = null;

async function getGoogleJwks(): Promise<any[]> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.expiresAt > now && cachedJwks.keys.length > 0) {
    return cachedJwks.keys;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const jwksRes = await fetch('https://www.googleapis.com/oauth2/v3/certs', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (jwksRes.ok) {
      const data = await jwksRes.json();
      if (Array.isArray(data?.keys) && data.keys.length > 0) {
        cachedJwks = {
          keys: data.keys,
          expiresAt: now + 60 * 60 * 1000
        };
        return data.keys;
      }
    }
  } catch (err) {
    if (cachedJwks && cachedJwks.keys.length > 0) {
      return cachedJwks.keys;
    }
    throw new Error('فشل الحصول على مفاتيح Google العامة للتحقق. يرجى التحقق من اتصال الإنترنت والمحاولة ثانية.');
  }

  if (cachedJwks && cachedJwks.keys.length > 0) {
    return cachedJwks.keys;
  }
  throw new Error('فشل الحصول على مفاتيح Google العامة للتحقق');
}

function base64UrlToUint8Array(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeJson(str: string): any {
  const bytes = base64UrlToUint8Array(str);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

// Cryptographically verify Google ID Token signature and claims
async function verifyGoogleIdToken(token: string, clientId: string): Promise<any> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('رمز الدخول من Google غير صالح أو غير مكتمل البنية');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: any;
  let payload: any;
  try {
    header = base64UrlDecodeJson(headerB64);
    payload = base64UrlDecodeJson(payloadB64);
  } catch (err) {
    throw new Error('فشل فك تشفير وتفسير محتويات رمز الدخول');
  }

  // 1. Verify claims
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error('رمز الدخول من Google منتهي الصلاحية');
  }
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
    throw new Error('جهة إصدار رمز الدخول غير موثوقة');
  }
  const allowedClientIds = [
    clientId,
    process.env.ANDROID_GOOGLE_CLIENT_ID || '868945795931-6hp5uq0eb234pbd3nck1jvvbv4p76kht.apps.googleusercontent.com',
    '868945795931-v00sqknb9qsgcq7hid3t2rkps2vu1348.apps.googleusercontent.com'
  ].filter(Boolean);

  if (!allowedClientIds.includes(payload.aud)) {
    throw new Error('رمز الدخول غير مخصص لهذا التطبيق (Client ID mismatch)');
  }

  // 2. Cryptographic signature verification
  const kid = header.kid;
  if (!kid) {
    throw new Error('لم يتم العثور على معرف المفتاح (kid) في رأس الرمز');
  }

  const keys = await getGoogleJwks();
  const jwk = keys.find((k: any) => k.kid === kid);
  if (!jwk) {
    throw new Error('مفتاح التحقق المطابق لمعرف الرمز غير متوفر');
  }

  // Import public key
  const algorithm = {
    name: 'RSASSA-PKCS1-v1_5',
    hash: { name: 'SHA-256' },
  };

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    algorithm,
    false,
    ['verify']
  );

  // Reconstruct signing data and verify signature
  const encoder = new TextEncoder();
  const signingData = encoder.encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlToUint8Array(signatureB64);

  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signatureBytes as unknown as BufferSource,
    signingData
  );

  if (!isValid) {
    throw new Error('فشل التحقق الرقمي من صحة توقيع Google (Signature invalid)');
  }

  return payload;
}

export async function POST(req: NextRequest) {
  try {
    const { credential, grade_level, track_id, elective_subject, browser_fingerprint, device_id, has_registered_before } = await req.json();

    if (!credential) {
      return NextResponse.json({ error: 'رمز الدخول (Credential) من Google مطلوب' }, { status: 400 });
    }

    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '868945795931-v00sqknb9qsgcq7hid3t2rkps2vu1348.apps.googleusercontent.com';

    // Verify token cryptographically
    let payload: any;
    try {
      payload = await verifyGoogleIdToken(credential, googleClientId);
    } catch (verifyErr: any) {
      return NextResponse.json({ error: verifyErr.message }, { status: 400 });
    }

    const { email: jwtEmail, name: jwtName, sub } = payload;

    if (!jwtEmail) {
      return NextResponse.json({ error: 'لم يتم العثور على بريد إلكتروني في حساب Google' }, { status: 400 });
    }

    const email = jwtEmail.toLowerCase().trim();
    const name = jwtName || 'Google User';
    const googleId = sub;

    // Find profile by email
    let profile = await db.getProfileByEmail(email);
    let isNewUser = false;

    if (!profile) {
      isNewUser = true;
      // Anti-Abuse Tracking (IP, User-Agent, Browser Fingerprint, Device ID)
      const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                        req.headers.get('cf-connecting-ip') ||
                        req.headers.get('x-real-ip') ||
                        'unknown';
      const userAgent = req.headers.get('user-agent') || 'unknown';
      const clientDeviceId = device_id || req.headers.get('x-device-id') || undefined;
      const clientFingerprint = browser_fingerprint || req.headers.get('x-browser-fingerprint') || undefined;
      const platform = (clientDeviceId && clientDeviceId.startsWith('mobile_')) ? 'mobile' : 'web';

      const userId = crypto.randomUUID();

      const trialResult = await db.checkAndRecordTrialGrant({
        userId,
        ipAddress,
        userAgent,
        browserFingerprint: clientFingerprint,
        deviceId: clientDeviceId,
        platform,
        hasRegisteredBefore: !!has_registered_before
      });

      const initialCoins = 20.0;
      const isClaimed = true;

      // Create new user profile directly
      profile = await db.createProfile({
        id: userId,
        email,
        name: name || 'طالب جديد',
        grade_level: grade_level || 'unselected',
        track_id: track_id || null,
        elective_subject: elective_subject || null,
        plan_type: 'free',
        role: 'student',
        password_hash: '', // Google login does not use a password
        coins: initialCoins,
        welcome_reward_claimed: isClaimed,
        free_plan_claimed: isClaimed,
        terms_accepted_at: new Date().toISOString()
      });
    }

    // Generate Session Token
    const token = generateSessionToken(profile.id);

    // Device Tracking & Multi-Device Limit Enforcement (Max 3 Devices)
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                      req.headers.get('cf-connecting-ip') ||
                      req.headers.get('x-real-ip') ||
                      'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const clientDeviceId = device_id || req.headers.get('x-device-id') || undefined;
    const clientFingerprint = browser_fingerprint || req.headers.get('x-browser-fingerprint') || undefined;
    const platform = (clientDeviceId && clientDeviceId.startsWith('mobile_')) ? 'mobile' : 'web';
    const { deviceName } = parseDeviceMetadata(userAgent, clientDeviceId, platform);

    const deviceResult = await db.registerUserDevice({
      userId: profile.id,
      deviceId: clientDeviceId,
      sessionToken: token,
      userAgent,
      ipAddress: (ipAddress !== 'unknown' && ipAddress.length > 3) ? ipAddress : undefined,
      browserFingerprint: clientFingerprint,
      platform,
      deviceName
    });

    return NextResponse.json({
      success: true,
      token,
      is_new_user: isNewUser || profile.grade_level === 'unselected',
      device_id: deviceResult.device.device_id,
      active_devices_count: deviceResult.activeCount,
      devices_revoked: deviceResult.devicesRevoked,
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        grade_level: profile.grade_level,
        track_id: profile.track_id || null,
        elective_subject: profile.elective_subject || null,
        plan_type: profile.plan_type,
        subscription_status: profile.subscription_status || (profile.plan_type && profile.plan_type !== 'free' ? 'active' : 'inactive'),
        subscription_start_date: profile.subscription_start_date || null,
        subscription_end_date: profile.subscription_end_date || null,
        subscription_plan_id: profile.subscription_plan_id || null,
        role: profile.role,
        coins: profile.coins === undefined ? 20.0 : profile.coins,
        points: profile.points || 0,
        study_streak: profile.study_streak || 1,
        welcome_reward_claimed: !!profile.welcome_reward_claimed,
        free_plan_claimed: !!profile.free_plan_claimed,
        apology_compensation_claimed: !!profile.apology_compensation_claimed,
        apology_dismissed: !!profile.apology_dismissed,
        created_at: profile.created_at,
        improve_ai_opt_in: profile.improve_ai_opt_in !== undefined ? profile.improve_ai_opt_in : true
      }
    });

  } catch (error: any) {
    console.error('Google Login API Error:', error);
    return NextResponse.json(
      { error: error?.message || 'حدث خطأ أثناء تسجيل الدخول بواسطة Google.' },
      { status: 500 }
    );
  }
}
