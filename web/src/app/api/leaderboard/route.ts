import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول لعرض المتصدرين' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة العمل غير صالحة' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    const url = new URL(req.url);
    const filter = url.searchParams.get('grade_level') || 'all'; // 'all' or 'my'
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 10) : 10;

    let gradeFilter: string | undefined = undefined;
    if (filter === 'my') {
      gradeFilter = profile.grade_level;
    }

    const leaderboard = await db.getLeaderboard(gradeFilter, limit);
    const userRank = await db.getUserLeaderboardRank(userId, gradeFilter);

    return NextResponse.json({ 
      success: true, 
      leaderboard,
      user_rank: userRank
    });
  } catch (error: any) {
    console.error('Leaderboard GET error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحميل لوحة المتصدرين' }, { status: 500 });
  }
}
