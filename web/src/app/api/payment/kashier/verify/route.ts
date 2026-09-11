import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { verifyKashierCallbackSignature, isKashierSuccessStatus } from '@/lib/kashier';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'غير مصرح للقيام بهذه العملية' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة العمل منتهية أو غير صالحة' }, { status: 401 });
    }

    const body = await req.json();
    const { orderId, paymentStatus, rawData } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'معرف الطلب غير موجود' }, { status: 400 });
    }

    const transaction = await db.getPaymentTransactionByOrderId(orderId);
    if (!transaction) {
      return NextResponse.json({ error: 'لم يتم العثور على المعاملة المالية' }, { status: 404 });
    }

    if (transaction.user_id && transaction.user_id !== userId) {
      return NextResponse.json({ error: 'غير مصرح بالوصول إلى هذه المعاملة' }, { status: 403 });
    }

    const status = (paymentStatus || rawData?.paymentStatus || '').toUpperCase();
    const isGatewaySuccess = isKashierSuccessStatus(status);

    // If transaction was already verified server-side by webhook/callback, or gateway confirms success
    const hasValidSignature = rawData ? verifyKashierCallbackSignature(rawData) : false;
    const amountMatches = !rawData?.amount || Math.abs(Number(rawData.amount) - Number(transaction.amount)) < 0.01;
    const isVerifiedSuccess = transaction.status === 'success' || (isGatewaySuccess && (hasValidSignature || amountMatches));

    if (isVerifiedSuccess) {
      if (transaction.status !== 'success') {
        const transactionId = rawData?.kashierOrderReference || rawData?.transactionId || null;
        const paymentMethod = rawData?.cardBrand || rawData?.method || rawData?.paymentMethod || null;
        await db.updatePaymentTransactionStatus(orderId, 'success', transactionId, paymentMethod, rawData);
        await db.activateSubscription(userId, transaction.plan_id, orderId);
      }

      const updatedProfile = await db.getProfile(userId);
      return NextResponse.json({
        success: true,
        message: 'تم تفعيل وتأكيد الاشتراك بنجاح!',
        user: updatedProfile ? {
          id: updatedProfile.id,
          phone: updatedProfile.phone,
          email: updatedProfile.email,
          name: updatedProfile.name,
          grade_level: updatedProfile.grade_level,
          plan_type: updatedProfile.plan_type,
          subscription_status: updatedProfile.subscription_status || 'active',
          subscription_start_date: updatedProfile.subscription_start_date,
          subscription_end_date: updatedProfile.subscription_end_date,
          subscription_plan_id: updatedProfile.subscription_plan_id,
          role: updatedProfile.role,
          coins: updatedProfile.coins === undefined ? 0.0 : updatedProfile.coins
        } : null
      });
    } else {
      if (transaction.status === 'pending' && !isGatewaySuccess) {
        await db.updatePaymentTransactionStatus(orderId, 'failed', null, null, rawData);
      }
      return NextResponse.json({
        success: false,
        error: 'لم تكتمل عملية الدفع أو لم يتم التحقق من صحتها من قبل مزود الخدمة.'
      }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Kashier Verify Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء التحقق من عملية الدفع.' },
      { status: 500 }
    );
  }
}
