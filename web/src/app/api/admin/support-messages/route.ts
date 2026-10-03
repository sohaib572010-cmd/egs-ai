import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

// ─── Helper: Authorize admin ──────────────────────────────────────────────────
async function authorizeAdmin(req: NextRequest): Promise<string | NextResponse> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'غير مصرح للقيام بهذه العملية' }, { status: 401 });
  }

  const token = authHeader.substring(7);
  const userId = verifySessionToken(token);
  if (!userId) {
    return NextResponse.json({ error: 'جلسة العمل منتهية أو غير صالحة' }, { status: 401 });
  }

  const profile = await db.getProfile(userId);
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'صلاحيات غير كافية. هذه العملية للمسؤولين فقط.' }, { status: 403 });
  }

  return userId;
}

// GET list support messages, optionally filtered by status and category (Admin only)
export async function GET(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const status = req.nextUrl.searchParams.get('status') || undefined;
    const category = req.nextUrl.searchParams.get('category') || undefined;
    const messages = await db.getContactMessages(status, category);
    return NextResponse.json({ success: true, messages });
  } catch (error: any) {
    console.error('Get support messages error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحميل رسائل الدعم الفني.' }, { status: 500 });
  }
}

// PATCH update a support message's status or notes (Admin only)
export async function PATCH(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await req.json();
    const { id, status, admin_notes } = body;

    if (!id || !['pending', 'replied', 'resolved', 'dismissed'].includes(status)) {
      return NextResponse.json({ error: 'معرف الرسالة وحالة صالحة مطلوبان' }, { status: 400 });
    }

    const success = await db.updateContactMessageStatus(id, status, admin_notes);
    if (!success) {
      return NextResponse.json({ error: 'فشل تحديث حالة الرسالة' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'تم تحديث حالة الرسالة بنجاح.' });
  } catch (error: any) {
    console.error('Update support message error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث الرسالة.' }, { status: 500 });
  }
}

// DELETE a support message (Admin only)
export async function DELETE(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'معرف الرسالة مطلوب للحذف' }, { status: 400 });
    }

    const success = await db.deleteContactMessage(id);
    if (!success) {
      return NextResponse.json({ error: 'فشل حذف الرسالة' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'تم حذف الرسالة بنجاح.' });
  } catch (error: any) {
    console.error('Delete support message error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف الرسالة.' }, { status: 500 });
  }
}
