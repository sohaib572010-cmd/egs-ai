export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateSessionToken, parseDeviceMetadata } from '@/lib/auth_helpers';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate_limiter';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const body = await req.json();
    const { email, otp, has_registered_before, browser_fingerprint, device_id } = body;

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanOtp = typeof otp === 'string' ? otp.trim() : '';

    if (!cleanEmail || !cleanOtp) {
      return NextResponse.json(
        { error: 'البريد الإلكتروني ورمز التحقق مطلوبان' },
        { status: 400 }
      );
    }

    const rateLimit = await checkRateLimitAsync(`otp_${ip}_${cleanEmail}`, 5, 600);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `تم تجاوز الحد المسموح لمحاولات التحقق. يرجى الانتظار ${rateLimit.resetSeconds} ثانية.` },
        { status: 429 }
      );
    }

    // Get pending registration
    const pending = await db.getPendingRegistration(cleanEmail);
    if (!pending) {
      return NextResponse.json(
        { error: 'لم يتم العثور على طلب تسجيل معلق لهذا البريد الإلكتروني. يرجى التسجيل أولاً.' },
        { status: 404 }
      );
    }

    // Verify OTP with expiry (10 min TTL)
    const expiresAt = pending.expires_at || (pending.created_at ? new Date(new Date(pending.created_at).getTime() + 10 * 60 * 1000).toISOString() : null);
    if (expiresAt && Date.now() > new Date(expiresAt).getTime()) {
      await db.deletePendingRegistration(cleanEmail);
      return NextResponse.json(
        { error: 'انتهت صلاحية رمز التحقق. يرجى التسجيل مرة أخرى للحصول على رمز جديد.' },
        { status: 400 }
      );
    }
    if (cleanOtp !== pending.otp?.trim()) {
      return NextResponse.json(
        { error: 'رمز التحقق غير صحيح.' },
        { status: 400 }
      );
    }

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

    // Create profile
    const profile = await db.createProfile({
      id: userId,
      email: pending.email,
      name: pending.name || 'طالب جديد',
      grade_level: pending.grade_level || 'unselected',
      track_id: pending.track_id || null,
      elective_subject: pending.elective_subject || null,
      plan_type: 'free',
      role: 'student',
      password_hash: pending.password_hash,
      coins: initialCoins,
      welcome_reward_claimed: isClaimed,
      free_plan_claimed: isClaimed,
      terms_accepted_at: pending.terms_accepted_at || new Date().toISOString()
    });

    // Delete pending registration
    await db.deletePendingRegistration(email);

    // Generate Session Token
    const token = generateSessionToken(userId);

    // Device Tracking & Multi-Device Limit Enforcement (Max 3 Devices)
    const { deviceName } = parseDeviceMetadata(userAgent, clientDeviceId, platform);
    const deviceResult = await db.registerUserDevice({
      userId,
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
      is_new_user: true,
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
        subscription_status: profile.subscription_status || 'inactive',
        subscription_start_date: profile.subscription_start_date || null,
        subscription_end_date: profile.subscription_end_date || null,
        subscription_plan_id: profile.subscription_plan_id || null,
        role: profile.role,
        coins: profile.coins === undefined ? initialCoins : profile.coins,
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
    console.error('OTP API Error:', error);
    return NextResponse.json(
      { error: error?.message || 'حدث خطأ أثناء تأكيد رمز التحقق.' },
      { status: 500 }
    );
  }
}

