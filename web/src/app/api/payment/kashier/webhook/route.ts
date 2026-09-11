import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyKashierWebhookSignature, isKashierSuccessStatus } from '@/lib/kashier';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let body: any = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      // Fallback for form-encoded payloads
      const params = new URLSearchParams(rawBody);
      body = Object.fromEntries(params.entries());
    }

    const signature = req.headers.get('x-kashier-signature') || req.headers.get('signature') || body.signature || body.hash || '';
    
    // Strict cryptographic signature validation
    if (!signature) {
      return NextResponse.json({ error: 'Missing webhook signature header' }, { status: 401 });
    }

    const isValid = verifyKashierWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.warn('Kashier Webhook signature verification failed.');
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    // Extract transaction payload
    const data = body.data || body;
    const orderId = data.merchantOrderId || data.orderId || data.order_id || body.merchantOrderId || body.orderId;
    const paymentStatus = (data.status || data.paymentStatus || body.status || body.paymentStatus || '').toUpperCase();
    const transactionId = data.kashierOrderReference || data.transactionId || data.reference || body.transactionId || null;
    const paymentMethod = data.cardBrand || data.method || data.paymentMethod || body.cardBrand || body.method || null;

    if (!orderId) {
      return NextResponse.json({ error: 'Missing order ID' }, { status: 400 });
    }

    const isSuccess = isKashierSuccessStatus(paymentStatus);

    const transaction = await db.getPaymentTransactionByOrderId(orderId);
    if (transaction) {
      if (isSuccess && transaction.status !== 'success') {
        await db.updatePaymentTransactionStatus(orderId, 'success', transactionId, paymentMethod, body);
        if (transaction.user_id) {
          await db.activateSubscription(transaction.user_id, transaction.plan_id, orderId);
        }
      } else if (!isSuccess && transaction.status === 'pending') {
        await db.updatePaymentTransactionStatus(orderId, 'failed', transactionId, paymentMethod, body);
      }
    }

    return NextResponse.json({ received: true, status: 'ok' });

  } catch (error: any) {
    console.error('Kashier Webhook Error:', error);
    return NextResponse.json(
      { error: 'Webhook processing error' },
      { status: 500 }
    );
  }
}
