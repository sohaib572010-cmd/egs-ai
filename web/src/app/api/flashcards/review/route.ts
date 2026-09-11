import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول لعرض الكروت' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة العمل غير صالحة', code: 'session_expired' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    const url = new URL(req.url);
    const deckId = url.searchParams.get('deck_id');

    if (!deckId) {
      return NextResponse.json({ error: 'معرف مجموعة الكروت مطلوب' }, { status: 400 });
    }

    const cards = await db.getFlashcardsDue(deckId, userId);
    return NextResponse.json({ success: true, cards });
  } catch (error: any) {
    console.error('GET Flashcards Due Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحميل الكروت المستحقة للمراجعة' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول لمراجعة الكروت' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة العمل غير صالحة', code: 'session_expired' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    const body = await req.json();
    const { card_id, rating } = body;

    if (!card_id || rating === undefined || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'معرف الكارت والتقييم (من 1 إلى 5) مطلوبان' }, { status: 400 });
    }

    try {
      const updatedCard = await db.reviewFlashcard(card_id, rating, userId);
      return NextResponse.json({ success: true, card: updatedCard });
    } catch (dbError: any) {
      if (dbError.message === 'Flashcard not found') {
        return NextResponse.json({ error: 'لم يتم العثور على الكارت التعليمي' }, { status: 404 });
      }
      if (dbError.message === 'Unauthorized access to flashcard') {
        return NextResponse.json({ error: 'غير مصرح لك بمراجعة هذا الكارت' }, { status: 403 });
      }
      throw dbError;
    }
  } catch (error: any) {
    console.error('Review Flashcard Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء حفظ مراجعة الكارت التعليمي' }, { status: 500 });
  }
}
