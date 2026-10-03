import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'تسجيل الدخول مطلوب' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة غير صالحة', code: 'invalid_token' }, { status: 401 });
    }

    const questData = await db.getDailyQuests(userId);

    return NextResponse.json({
      success: true,
      ...questData
    });
  } catch (error: any) {
    console.error('Daily quests GET error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب مهام المذاكرة اليومية' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'تسجيل الدخول مطلوب' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة غير صالحة', code: 'invalid_token' }, { status: 401 });
    }

    const body = await req.json();
    const { quest_id } = body;

    if (!quest_id) {
      return NextResponse.json({ error: 'معرف المهمة مطلوب' }, { status: 400 });
    }

    const result = await db.claimDailyQuestReward(userId, quest_id);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Daily quests claim error:', error);
    return NextResponse.json({ error: error.message || 'حدث خطأ أثناء استلام مكافأة المهمة' }, { status: 400 });
  }
}
