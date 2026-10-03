import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sanitizeInitialPath } from '@/lib/education_catalog';
import { hashPasswordSecure, generateOtp, OTP_TTL_MS } from '@/lib/auth_helpers';
import { sendOtpEmail } from '@/lib/email';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate_limiter';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { email, password, terms_accepted, name, grade_level, track_id, elective_subject } = await req.json();

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    // 1. Per-Email rate limit: Max 5 registration attempts per 10 minutes per email
    if (cleanEmail) {
      const emailRateLimit = await checkRateLimitAsync(`register_email_${cleanEmail}`, 5, 600);
      if (!emailRateLimit.allowed) {
        return NextResponse.json(
          { error: 'تم تجاوز الحد المسموح لطلبات التسجيل لهذا البريد. يرجى الانتظار قليلاً قبل المحاولة مجدداً.' },
          { status: 429 }
        );
      }
    }

    // 2. Network IP rate limit: Max 60 registration attempts per 10 minutes per IP (allowing classroom NATs & concurrent loads)
    const ipRateLimit = await checkRateLimitAsync(`register_ip_${ip}`, 60, 600);
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        { error: 'تم تجاوز الحد المسموح لطلبات التسجيل من هذه الشبكة. يرجى الانتظار قليلاً قبل المحاولة مجدداً.' },
        { status: 429 }
      );
    }

    if (!cleanEmail || !password) {
      return NextResponse.json(
        { error: 'اكتب إيميلك وكلمة السر عشان تقدر تعمل حسابك.' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'كلمة السر لازم تكون 6 خانات على الأقل.' },
        { status: 400 }
      );
    }

    if (!terms_accepted) {
      return NextResponse.json(
        { error: 'لازم توافق على سياسة الخصوصية وشروط الاستخدام عشان تكمل التسجيل.' },
        { status: 400 }
      );
    }

    const cleanName = typeof name === 'string' && name.trim() ? name.trim() : (cleanEmail.split('@')[0] || 'طالب جديد');
    const initialPath = sanitizeInitialPath(await db.getEducationCatalog(), grade_level, track_id, elective_subject);
    const cleanGradeLevel = initialPath.gradeLevel;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json(
        { error: 'الرجاء إدخال بريد إلكتروني صحيح' },
        { status: 400 }
      );
    }

    const existingUser = await db.getProfileByEmail(cleanEmail);
    if (existingUser) {
      return NextResponse.json(
        { error: 'البريد الإلكتروني هذا مسجل بالفعل. يرجى تسجيل الدخول.' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPasswordSecure(password);
    const otpCode = generateOtp();

    const sent = await sendOtpEmail(cleanEmail, otpCode, 'register');
    if (!sent.ok) {
      return NextResponse.json(
        { error: 'تعذر إرسال رمز التحقق إلى بريدك الإلكتروني. يرجى المحاولة مرة أخرى بعد قليل.' },
        { status: 502 }
      );
    }

    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    await db.createPendingRegistration(
      cleanEmail,
      cleanName,
      cleanGradeLevel,
      passwordHash,
      otpCode,
      new Date().toISOString(),
      undefined,
      expiresAt,
      initialPath.trackId,
      initialPath.electiveSubject
    );

    return NextResponse.json({
      success: true,
      message: 'بعتنا رمز التحقق (OTP) لإيميلك بنجاح.',
      email: cleanEmail
    });

  } catch (error: any) {
    console.error('Registration API Error:', error);
    return NextResponse.json(
      { error: error?.message || 'حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}
