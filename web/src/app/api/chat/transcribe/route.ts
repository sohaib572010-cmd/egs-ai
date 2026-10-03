import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth_helpers';
import { db } from '@/lib/db';
import { transcribeAudioWithAlibaba } from '@/lib/alibaba_asr';
import { chargeForUsage, isMeteringExempt } from '@/lib/metering';
import { TRANSCRIPT_REFINE_USAGE } from '@/lib/points_pricing';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const userId = token ? verifySessionToken(token) : null;

    if (!userId) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول لاستخدام ميزة التسجيل الصوتي.', code: 'login_required' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'حساب المستخدم غير موجود.', code: 'user_not_found' }, { status: 401 });
    }

    if (!isMeteringExempt(profile) && (profile.coins ?? 0) <= 0) {
      return NextResponse.json({
        error: 'رصيد عملاتك اليومي انتهى. يمكنك الترقية إلى باقة Pro أو الانتظار حتى منتصف الليل للتجديد.',
        code: 'limit_reached'
      }, { status: 429 });
    }

    const body = await req.json();
    const { audioBase64, mimeType = 'audio/webm', durationSeconds = 0 } = body;

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return NextResponse.json({ error: 'البيانات الصوتية غير صالحة أو مفقودة.' }, { status: 400 });
    }

    // Cap payload size to ~10MB (base64 length ~14M chars)
    if (audioBase64.length > 14 * 1024 * 1024) {
      return NextResponse.json({ error: 'حجم التسجيل الصوتي كبير جداً (الحد الأقصى 10 ميجابايت).' }, { status: 413 });
    }

    // Transcribe with Alibaba DashScope ASR
    const result = await transcribeAudioWithAlibaba(audioBase64, mimeType);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'فشل تحويل الصوت إلى نص.' }, { status: 500 });
    }

    // Only the DeepSeek transcript refinement is metered; Alibaba speech recognition is not charged to students.
    const charge = await chargeForUsage(profile, [TRANSCRIPT_REFINE_USAGE]);

    return NextResponse.json({
      success: true,
      transcript: result.transcript,
      coins_used: charge.points,
      remaining_coins: charge.remaining,
      duration: durationSeconds
    });
  } catch (error) {
    console.error('ASR route error:', error);
    return NextResponse.json({ error: 'حدث خطأ في معالجة الصوت.' }, { status: 500 });
  }
}
