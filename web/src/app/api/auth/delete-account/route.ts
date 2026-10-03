import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken, generateOtp, OTP_TTL_MS } from '@/lib/auth_helpers';
import { sendOtpEmail } from '@/lib/email';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate_limiter';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateLimit = await checkRateLimitAsync(`delete_account_${ip}`, 5, 600);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'تم تجاوز الحد المسموح لطلبات حذف الحساب. يرجى الانتظار والمحاولة لاحقاً.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { action, email, otp } = body;

    if (!action) {
      return NextResponse.json({ error: 'حقل الإجراء مطلوب.' }, { status: 400 });
    }

    // 1. Authenticated Direct Deletion (Mobile / Logged-in Web)
    if (action === 'delete-current') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'جلسة العمل منتهية أو غير صالحة. يرجى تسجيل الدخول.' }, { status: 401 });
      }

      const token = authHeader.substring(7);
      const userId = verifySessionToken(token);
      if (!userId) {
        return NextResponse.json({ error: 'جلسة العمل غير صالحة أو منتهية.' }, { status: 401 });
      }

      const profile = await db.getProfile(userId);
      if (!profile) {
        return NextResponse.json({ error: 'المستخدم غير موجود.' }, { status: 404 });
      }

      const deleted = await db.deleteUser(userId);
      if (!deleted) {
        return NextResponse.json({ error: 'فشل حذف الحساب. يرجى المحاولة مرة أخرى.' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'تم حذف حسابك وكافة البيانات والاشتراكات المرتبطة به نهائياً وبنجاح.'
      });
    }

    // 2. Public Flow: Send Deletion OTP
    if (action === 'send-otp') {
      if (!email || !email.trim()) {
        return NextResponse.json({ error: 'البريد الإلكتروني مطلوب.' }, { status: 400 });
      }

      const cleanEmail = email.trim().toLowerCase();
      if (!EMAIL_REGEX.test(cleanEmail)) {
        return NextResponse.json({ error: 'صيغة البريد الإلكتروني غير صحيحة.' }, { status: 400 });
      }

      const profile = await db.getProfileByEmail(cleanEmail);
      if (!profile) {
        return NextResponse.json({ error: 'لا يوجد حساب مسجل بهذا البريد الإلكتروني.' }, { status: 404 });
      }

      const otpCode = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

      const sent = await sendOtpEmail(cleanEmail, otpCode, 'delete_account');
      if (!sent.ok) {
        return NextResponse.json(
          { error: 'تعذر إرسال رمز التحقق إلى بريدك الإلكتروني. يرجى التأكد من صحة البريد والمحاولة لاحقاً.' },
          { status: 502 }
        );
      }

      await db.createAccountDeletion(profile.id, cleanEmail, otpCode, expiresAt);

      return NextResponse.json({
        success: true,
        message: 'تم إرسال رمز تأكيد حذف الحساب إلى بريدك الإلكتروني.'
      });
    }

    // 3. Public Flow: Verify OTP & Execute Permanent Deletion
    if (action === 'verify-otp') {
      if (!email || !email.trim() || !otp || !otp.trim()) {
        return NextResponse.json({ error: 'البريد الإلكتروني ورمز التحقق مطلوبان.' }, { status: 400 });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanOtp = otp.trim();

      const profile = await db.getProfileByEmail(cleanEmail);
      if (!profile) {
        return NextResponse.json({ error: 'الحساب المطلوب غير موجود.' }, { status: 404 });
      }

      const deletionRecord = await db.getAccountDeletion(profile.id);
      if (!deletionRecord || Date.now() > new Date(deletionRecord.expires_at).getTime()) {
        if (deletionRecord) await db.deleteAccountDeletion(profile.id);
        return NextResponse.json({ error: 'انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد.' }, { status: 400 });
      }

      if (deletionRecord.otp !== cleanOtp) {
        return NextResponse.json({ error: 'رمز التحقق غير صحيح.' }, { status: 400 });
      }

      await db.deleteAccountDeletion(profile.id);
      const deleted = await db.deleteUser(profile.id);
      if (!deleted) {
        return NextResponse.json({ error: 'فشل حذف الحساب. يرجى المحاولة مرة أخرى.' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: 'تم حذف حسابك وكافة البيانات والاشتراكات المرتبطة به نهائياً وبنجاح.'
      });
    }

    return NextResponse.json({ error: 'إجراء غير معروف.' }, { status: 400 });

  } catch (error: any) {
    console.error('Delete Account API Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء معالجة طلب حذف الحساب.' },
      { status: 500 }
    );
  }
}
