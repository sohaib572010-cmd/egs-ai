import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'يرجى تسجيل الدخول أولاً' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة العمل منتهية أو غير صالحة' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'المستخدم غير موجود', code: 'user_not_found' }, { status: 401 });
    }

    let { points } = await req.json().catch(() => ({ points: 2 }));
    const pointsToAdd = Math.min(Math.max(Number(points) || 2, 1), 5);

    const totalPoints = await db.addPoints(userId, pointsToAdd);

    return NextResponse.json({
      success: true,
      points_awarded: pointsToAdd,
      total_points: totalPoints
    });
  } catch (error: any) {
    console.error('Quiz Points Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تسجيل نقاط الاختبار.' },
      { status: 500 }
    );
  }
}
