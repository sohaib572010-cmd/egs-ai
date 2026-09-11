import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { KASHIER_PLANS, generateKashierOrderHash, getKashierCredentials } from '@/lib/kashier';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'يرجى تسجيل الدخول أولاً لإتمام عملية الاشتراك' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة العمل منتهية. يرجى إعادة تسجيل الدخول.' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم' }, { status: 404 });
    }

    // Prevent duplicate subscriptions while user has an active, unexpired subscription
    const isSubscribed = (profile.subscription_status === 'active' || (profile.plan_type && profile.plan_type !== 'free')) && 
      (!profile.subscription_end_date || new Date(profile.subscription_end_date).getTime() > Date.now());

    if (isSubscribed) {
      const endDateFormatted = profile.subscription_end_date 
        ? new Date(profile.subscription_end_date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'نهاية الفترة الحالية';
      return NextResponse.json({
        error: `لديك اشتراك سارٍ ونشط بالفعل حتى ${endDateFormatted}. لا يمكنك الاشتراك في باقة جديدة حتى انتهاء فترة اشتراكك الحالية.`
      }, { status: 400 });
    }

    const body = await req.json();
    const planId = body.plan_id || 'pro_1m';
    const plan = KASHIER_PLANS[planId];
    if (!plan) {
      return NextResponse.json({ error: 'باقة الاشتراك المحددة غير صالحة' }, { status: 400 });
    }

    const { merchantId, mode } = getKashierCredentials();
    const orderId = `egs_sub_${userId.replace(/-/g, '').slice(0, 8)}_${Date.now()}`;
    const hash = generateKashierOrderHash(orderId, plan.amount, plan.currency);

    // Save pending transaction
    await db.createPaymentTransaction({
      user_id: userId,
      order_id: orderId,
      plan_id: plan.id,
      amount: plan.amount,
      currency: plan.currency,
      status: 'pending',
      provider: 'kashier'
    });

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_UR || 'https://egsaiedu.com').replace(/\/+$/, '');
    const merchantRedirect = `${siteUrl}/api/payment/kashier/callback`;
    const serverWebhook = `${siteUrl}/api/payment/kashier/webhook`;

    return NextResponse.json({
      success: true,
      order: {
        orderId,
        merchantId,
        amount: plan.amount,
        currency: plan.currency,
        hash,
        mode,
        planTitle: plan.name,
        allowedMethods: 'card,wallet,bank_installments',
        merchantRedirect,
        serverWebhook,
        customer: {
          name: profile.name,
          email: profile.email || '',
          phone: profile.phone || ''
        }
      }
    });

  } catch (error: any) {
    console.error('Kashier Init Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تجهيز عملية الدفع عبر كاشير.' },
      { status: 500 }
    );
  }
}
