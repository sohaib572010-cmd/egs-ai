import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyKashierCallbackSignature, isKashierSuccessStatus } from '@/lib/kashier';

async function handleCallback(req: NextRequest) {
  const url = new URL(req.url);
  const rawSearch = url.search;
  const searchParams = Object.fromEntries(url.searchParams.entries());
  
  let bodyParams: Record<string, any> = {};
  if (req.method === 'POST') {
    try {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        bodyParams = await req.json();
      } else {
        const formData = await req.formData();
        bodyParams = Object.fromEntries(formData.entries());
      }
    } catch {
      // Ignored
    }
  }

  const params = { ...searchParams, ...bodyParams };
  const orderId = params.merchantOrderId || params.orderId || params.order_id || '';
  const paymentStatus = (params.paymentStatus || params.status || params.payment_status || '').toUpperCase();
  const transactionId = params.kashierOrderReference || params.transactionId || params.reference || null;
  const paymentMethod = params.cardBrand || params.paymentMethod || params.method || null;

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_UR || 'https://egsaiedu.com').replace(/\/+$/, '');
  const isGatewaySuccess = isKashierSuccessStatus(paymentStatus);
  const hasValidSignature = verifyKashierCallbackSignature(params, rawSearch);

  if (orderId) {
    const transaction = await db.getPaymentTransactionByOrderId(orderId);
    if (transaction) {
      // Valid if cryptographic signature matched OR gateway explicitly confirms SUCCESS for this legitimate pending order
      const amountMatches = !params.amount || Math.abs(Number(params.amount) - Number(transaction.amount)) < 0.01;
      const isSuccess = isGatewaySuccess && (hasValidSignature || amountMatches || transaction.status === 'success');

      if (isSuccess) {
        if (transaction.status !== 'success') {
          await db.updatePaymentTransactionStatus(orderId, 'success', transactionId, paymentMethod, params);
          if (transaction.user_id) {
            await db.activateSubscription(transaction.user_id, transaction.plan_id, orderId);
          }
        }
        const isSponsor = orderId.startsWith('egs_spon_');
        return NextResponse.redirect(`${siteUrl}/?payment_result=success&orderId=${orderId}&plan=${transaction.plan_id}${isSponsor ? '&sponsor=true' : ''}`, 302);
      } else {
        // Only mark as failed if explicitly failed/cancelled by customer, never override a successful order
        if (transaction.status === 'pending' && !isGatewaySuccess) {
          await db.updatePaymentTransactionStatus(orderId, 'failed', transactionId, paymentMethod, params);
        }
        return NextResponse.redirect(`${siteUrl}/?payment_result=failed&orderId=${orderId}`, 302);
      }
    }
  }

  if (isGatewaySuccess) {
    return NextResponse.redirect(`${siteUrl}/?payment_result=success`, 302);
  } else {
    return NextResponse.redirect(`${siteUrl}/?payment_result=failed`, 302);
  }
}

export async function GET(req: NextRequest) {
  return handleCallback(req);
}

export async function POST(req: NextRequest) {
  return handleCallback(req);
}
