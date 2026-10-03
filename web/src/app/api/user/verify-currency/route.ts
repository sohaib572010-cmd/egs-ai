import { NextRequest, NextResponse } from 'next/server';
import { db, DAILY_COIN_CAPS } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { verifyUserCurrencyState } from '@/lib/currency_verifier';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'يرجى تسجيل الدخول أولاً للتحقق من الرصيد والاشتراك' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة العمل منتهية أو غير صالحة' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    const verifiedState = verifyUserCurrencyState(profile, DAILY_COIN_CAPS);

    return NextResponse.json({
      success: true,
      message: 'تم التحقق من رصيد العملات والاشتراك بنجاح',
      data: verifiedState
    });

  } catch (error: any) {
    console.error('Verify Currency Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء فحص وتأكيد رصيد العملة والاشتراك.' },
      { status: 500 }
    );
  }
}
