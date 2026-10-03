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

// GET list reports, optionally filtered by status (Admin only)
export async function GET(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const status = req.nextUrl.searchParams.get('status') || undefined;
    const reports = await db.getReports(status);
    return NextResponse.json({ success: true, reports });
  } catch (error: any) {
    console.error('Get reports error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحميل البلاغات.' }, { status: 500 });
  }
}

// PATCH update a report's status (Admin only)
export async function PATCH(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id, status, action_taken, admin_notes } = await req.json();
    if (!id || !['pending', 'reviewed', 'dismissed', 'action_taken'].includes(status)) {
      return NextResponse.json({ error: 'معرف البلاغ وحالة صالحة مطلوبان' }, { status: 400 });
    }

    const success = await db.updateReportStatus(id, status, action_taken, admin_notes);
    if (!success) {
      return NextResponse.json({ error: 'فشل تحديث حالة البلاغ' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'تم تحديث حالة البلاغ بنجاح.' });
  } catch (error: any) {
    console.error('Update report error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث البلاغ.' }, { status: 500 });
  }
}

// DELETE a report (Admin only)
export async function DELETE(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'معرف البلاغ مطلوب للحذف' }, { status: 400 });
    }

    const success = await db.deleteReport(id);
    if (!success) {
      return NextResponse.json({ error: 'فشل حذف البلاغ' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'تم حذف البلاغ بنجاح.' });
  } catch (error: any) {
    console.error('Delete report error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف البلاغ.' }, { status: 500 });
  }
}
