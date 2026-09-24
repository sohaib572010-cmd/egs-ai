import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth_helpers';
import { db } from '@/lib/db';
import { transcribeAudioWithAlibaba } from '@/lib/alibaba_asr';

export const runtime = 'edge';

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

    // Check coins balance (allow if subscriber or has > 0 coins)
    const isSubscribed = profile.plan_type !== 'free' && profile.subscription_status === 'active';
    if (!profile.unlimited_credit && profile.role !== 'admin' && !isSubscribed && (profile.coins ?? 0) <= 0) {
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

    // Deduct nominal fee (0.15 coin) for free users; 0 coins for subscribers/admins
    let coinsCost = 0;
    if (!profile.unlimited_credit && profile.role !== 'admin' && !isSubscribed) {
      coinsCost = 0.15;
      const deviceId = req.headers.get('x-device-id') || null;
      await db.deductCoins(userId, deviceId, coinsCost);
    }

    return NextResponse.json({
      success: true,
      transcript: result.transcript,
      coins_used: coinsCost,
      duration: durationSeconds
    });
  } catch (error: any) {
    console.error('ASR route error:', error);
    return NextResponse.json({ error: 'حدث خطأ في معالجة الصوت.' }, { status: 500 });
  }
}
