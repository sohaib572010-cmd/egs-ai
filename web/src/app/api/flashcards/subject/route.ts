export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة غير صالحة', code: 'session_expired' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const subjectName = searchParams.get('subject_name');
    if (!subjectName) {
      return NextResponse.json({ error: 'اسم المادة مطلوب' }, { status: 400 });
    }

    const result = await db.getFlashcardsBySubject(userId, subjectName);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('GET Flashcards Subject Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب كروت المادة' }, { status: 500 });
  }
}
