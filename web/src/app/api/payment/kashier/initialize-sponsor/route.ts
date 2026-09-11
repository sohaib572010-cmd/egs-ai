import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { KASHIER_PLANS, generateKashierOrderHash, getKashierCredentials } from '@/lib/kashier';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { student_id, plan_id, payer_name, payer_phone } = body;

    if (!student_id || typeof student_id !== 'string') {
      return NextResponse.json({ error: 'معرف الطالب مطلوب لإتمام عملية الكفالة/الاشتراك.' }, { status: 400 });
    }

    const profile = await db.getProfile(student_id.trim());
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب الطالب المحدد.' }, { status: 404 });
    }

    // Check if student already has an active, unexpired subscription
    const isSubscribed = (profile.subscription_status === 'active' || (profile.plan_type && profile.plan_type !== 'free')) &&
      (!profile.subscription_end_date || new Date(profile.subscription_end_date).getTime() > Date.now());

    if (isSubscribed) {
      const endDateFormatted = profile.subscription_end_date
        ? new Date(profile.subscription_end_date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'نهاية الفترة الحالية';
      return NextResponse.json({
        error: `الطالب لديه اشتراك سارٍ ونشط بالفعل حتى ${endDateFormatted}.`
      }, { status: 400 });
    }

    const selectedPlanId = plan_id || 'pro_1m';
    const plan = KASHIER_PLANS[selectedPlanId];
    if (!plan) {
      return NextResponse.json({ error: 'باقة الاشتراك المحددة غير صالحة.' }, { status: 400 });
    }

    const { merchantId, mode } = getKashierCredentials();
    const orderId = `egs_spon_${student_id.replace(/-/g, '').slice(0, 8)}_${Date.now()}`;
    const hash = generateKashierOrderHash(orderId, plan.amount, plan.currency);

    // Save pending transaction with student_id as user_id so webhook/callback auto-activates student
    await db.createPaymentTransaction({
      user_id: student_id.trim(),
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
          name: payer_name || `ولي أمر الطالب ${profile.name}`,
          email: profile.email || '',
          phone: payer_phone || profile.phone || ''
        }
      }
    });

  } catch (error: any) {
    console.error('Kashier Sponsor Init Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تجهيز عملية الدفع عبر كاشير.' },
      { status: 500 }
    );
  }
}
