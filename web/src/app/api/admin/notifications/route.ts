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

const VALID_TYPES = ['info', 'success', 'warning', 'maintenance'];
const VALID_TARGETS = ['both', 'web', 'phone'];

// GET list all notifications (Admin only)
export async function GET(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const notifications = await db.getAllNotifications();
    return NextResponse.json({ success: true, notifications });
  } catch (error: any) {
    console.error('Get notifications error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحميل الإشعارات.' }, { status: 500 });
  }
}

// POST create a new notification (Admin only)
export async function POST(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { title, body, type, target, user_id } = await req.json();

    if (!title || !body) {
      return NextResponse.json({ error: 'عنوان الإشعار ونصه مطلوبان' }, { status: 400 });
    }

    const notification = await db.createNotification({
      user_id: user_id ? String(user_id).trim() : null,
      title: title.trim().slice(0, 200),
      body: body.trim().slice(0, 2000),
      type: VALID_TYPES.includes(type) ? type : 'info',
      target: VALID_TARGETS.includes(target) ? target : 'both'
    });

    return NextResponse.json({ success: true, message: 'تم إنشاء الإشعار بنجاح.', notification });
  } catch (error: any) {
    console.error('Create notification error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء إنشاء الإشعار.' }, { status: 500 });
  }
}

// PATCH toggle a notification's active state (Admin only)
export async function PATCH(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id, active } = await req.json();
    if (!id || typeof active !== 'boolean') {
      return NextResponse.json({ error: 'معرف الإشعار وحالة التفعيل مطلوبان' }, { status: 400 });
    }

    const success = await db.setNotificationActive(id, active);
    if (!success) {
      return NextResponse.json({ error: 'فشل تحديث الإشعار' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update notification error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث الإشعار.' }, { status: 500 });
  }
}

// DELETE a notification (Admin only)
export async function DELETE(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'معرف الإشعار مطلوب للحذف' }, { status: 400 });
    }

    const success = await db.deleteNotification(id);
    if (!success) {
      return NextResponse.json({ error: 'فشل حذف الإشعار' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'تم حذف الإشعار بنجاح.' });
  } catch (error: any) {
    console.error('Delete notification error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف الإشعار.' }, { status: 500 });
  }
}
