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

// GET list/search users (Admin only)
export async function GET(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const search = req.nextUrl.searchParams.get('search') || undefined;
    const tier = (req.nextUrl.searchParams.get('tier') as any) || 'all';
    const grade_level = req.nextUrl.searchParams.get('grade_level') || undefined;

    const result = await db.getUsers(search, { tier, grade_level });
    const rawUsers = result.users || [];

    const devicesByUser = await db.getActiveDevicesByUser(rawUsers.map(u => u.id));
    const usersWithDevices = rawUsers.map((u) => {
        const devices = devicesByUser.get(u.id) || [];
        return {
          ...u,
          active_devices_count: devices.length,
          devices: devices.map(d => ({
            id: d.id,
            device_name: d.device_name,
            device_type: d.device_type,
            last_active_at: d.last_active_at,
            ip_address: d.ip_address
          }))
        };
      });

    return NextResponse.json({
      success: true,
      users: usersWithDevices,
      counts: result.counts
    });
  } catch (error: any) {
    console.error('Get users error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحميل قائمة المستخدمين.' }, { status: 500 });
  }
}

// PATCH update a user's unlimited_credit flag or reset devices (Admin only)
export async function PATCH(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await req.json();
    const { id, unlimited_credit, action } = body;

    if (!id) {
      return NextResponse.json({ error: 'معرف المستخدم مطلوب' }, { status: 400 });
    }

    if (action === 'reset_devices') {
      await db.deactivateAllUserDevices(id);
      return NextResponse.json({
        success: true,
        message: 'تم إعادة ضبط جميع أجهزة المستخدم وتسجيل الخروج منها بنجاح.'
      });
    }

    if (typeof unlimited_credit !== 'boolean') {
      return NextResponse.json({ error: 'معرف المستخدم وقيمة الرصيد غير المحدود مطلوبان' }, { status: 400 });
    }

    const updated = await db.setUserUnlimited(id, unlimited_credit);
    if (!updated) {
      return NextResponse.json({ error: 'فشل تحديث المستخدم' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: unlimited_credit ? 'تم منح رصيد غير محدود للمستخدم.' : 'تم إلغاء الرصيد غير المحدود للمستخدم.' });
  } catch (error: any) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث المستخدم.' }, { status: 500 });
  }
}

// DELETE a user (Admin only)
export async function DELETE(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'معرف المستخدم مطلوب للحذف' }, { status: 400 });
    }

    if (id === authResult) {
      return NextResponse.json({ error: 'لا يمكنك حذف حسابك الخاص.' }, { status: 400 });
    }

    const success = await db.deleteUser(id);
    if (!success) {
      return NextResponse.json({ error: 'فشل حذف المستخدم' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'تم حذف المستخدم بنجاح.' });
  } catch (error: any) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف المستخدم.' }, { status: 500 });
  }
}
