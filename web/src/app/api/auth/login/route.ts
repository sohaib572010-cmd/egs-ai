export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, hashPasswordSecure, generateSessionToken, parseDeviceMetadata } from '@/lib/auth_helpers';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate_limiter';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const body = await req.json();
    const { email, password, device_id, browser_fingerprint, platform: clientPlatform, is_pwa } = body;

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    // 1. Per-Account rate limit: Max 5 login attempts per minute per email
    if (cleanEmail) {
      const emailRateLimit = await checkRateLimitAsync(`login_email_${cleanEmail}`, 5, 60);
      if (!emailRateLimit.allowed) {
        return NextResponse.json(
          { error: `تم تجاوز الحد المسموح من محاولات الدخول لهذا الحساب. يرجى المحاولة بعد ${emailRateLimit.resetSeconds} ثانية.` },
          { status: 429 }
        );
      }
    }

    // 2. Network IP rate limit: Max 60 login attempts per minute per IP
    const ipRateLimit = await checkRateLimitAsync(`login_ip_${ip}`, 60, 60);
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        { error: `تم تجاوز الحد المسموح من محاولات الدخول من هذه الشبكة. يرجى المحاولة بعد ${ipRateLimit.resetSeconds} ثانية.` },
        { status: 429 }
      );
    }

    if (!cleanEmail || !password) {
      return NextResponse.json(
        { error: 'البريد الإلكتروني وكلمة المرور مطلوبان' },
        { status: 400 }
      );
    }

    // Get user profile
    const profile = await db.getProfileByEmail(cleanEmail);
    if (!profile) {
      return NextResponse.json(
        { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
        { status: 401 }
      );
    }

    // Verify Password (supports legacy sha256 hashes; upgrades them on success)
    const { valid, needsRehash } = await verifyPassword(password, profile.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
        { status: 401 }
      );
    }
    if (needsRehash) {
      await db.updateProfilePassword(profile.id, await hashPasswordSecure(password));
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
    const platform = clientPlatform || ((clientDeviceId && clientDeviceId.startsWith('mobile_')) ? 'mobile' : 'web');
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

    if (is_pwa || req.headers.get('x-is-pwa') === 'true') {
      const pwaPlat = /iPhone|iPad|iPod/i.test(userAgent) ? 'ios' : /Android/i.test(userAgent) ? 'android' : 'desktop';
      await db.recordPwaInstall(profile.id, pwaPlat);
    }

    return NextResponse.json({
      success: true,
      token,
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
        subscription_start_date: profile.subscription_start_date,
        subscription_end_date: profile.subscription_end_date,
        subscription_plan_id: profile.subscription_plan_id,
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
    console.error('Login API Error:', error);
    return NextResponse.json(
      { error: error?.message || 'حدث خطأ أثناء تسجيل الدخول.' },
      { status: 500 }
    );
  }
}
