export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول لعرض الكروت التعليمية' }, { status: 401 });
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

    const decks = await db.getFlashcardDecks(userId);
    return NextResponse.json({ success: true, decks });
  } catch (error: any) {
    console.error('GET Flashcards Decks Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحميل الكروت التعليمية' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول لإنشاء الكروت' }, { status: 401 });
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
    const { subject_name, grade_level, title, cards } = body;
    if (!subject_name || !grade_level || !title || !Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json({ error: 'جميع بيانات مجموعات الكروت مطلوبة' }, { status: 400 });
    }

    const deck = await db.createFlashcardDeck(userId, subject_name, grade_level, title, cards);
    return NextResponse.json({ success: true, deck });
  } catch (error: any) {
    console.error('POST Flashcards Deck Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء إنشاء مجموعة الكروت' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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

    const body = await req.json();
    const { id, title } = body;
    if (!id || !title) {
      return NextResponse.json({ error: 'معرف المجموعة والعنوان مطلوبان' }, { status: 400 });
    }

    const ok = await db.updateFlashcardDeck(id, userId, title);
    if (!ok) return NextResponse.json({ error: 'فشل تحديث المجموعة' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ أثناء التحديث' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'معرف المجموعة مطلوب' }, { status: 400 });
    }

    const ok = await db.deleteFlashcardDeck(id, userId);
    if (!ok) return NextResponse.json({ error: 'فشل حذف المجموعة' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'حدث خطأ أثناء الحذف' }, { status: 500 });
  }
}
