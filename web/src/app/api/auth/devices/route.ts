import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'غير مصرح به - تسجيل الدخول مطلوب' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً', code: 'session_expired' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    const currentDeviceId = req.headers.get('x-device-id') || req.nextUrl.searchParams.get('device_id') || undefined;

    const activeDevices = await db.getUserActiveDevices(userId);

    const formattedDevices = activeDevices.map(d => ({
      id: d.id,
      device_id: d.device_id,
      device_name: d.device_name,
      device_type: d.device_type,
      ip_address: d.ip_address,
      last_active_at: d.last_active_at,
      created_at: d.created_at,
      is_current_device: (currentDeviceId && d.device_id === currentDeviceId) || (d.session_token === token)
    }));

    return NextResponse.json({
      success: true,
      devices: formattedDevices,
      max_devices: 3,
      active_count: formattedDevices.length
    });

  } catch (error: any) {
    console.error('Get Devices Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب قائمة الأجهزة' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'غير مصرح به - تسجيل الدخول مطلوب' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً', code: 'session_expired' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    const currentDeviceId = req.headers.get('x-device-id') || req.nextUrl.searchParams.get('current_device_id') || undefined;
    const targetDeviceId = req.nextUrl.searchParams.get('device_id');
    const action = req.nextUrl.searchParams.get('action');

    if (action === 'logout_all_others' && currentDeviceId) {
      await db.deactivateAllOtherDevices(userId, currentDeviceId);
      const remaining = await db.getUserActiveDevices(userId);
      return NextResponse.json({
        success: true,
        message: 'تم تسجيل الخروج من جميع الأجهزة الأخرى بنجاح',
        active_count: remaining.length
      });
    }

    if (action === 'logout_all') {
      await db.deactivateAllUserDevices(userId);
      return NextResponse.json({
        success: true,
        message: 'تم تسجيل الخروج من جميع الأجهزة بنجاح',
        active_count: 0
      });
    }

    if (targetDeviceId) {
      await db.deactivateUserDevice(userId, targetDeviceId);
      const remaining = await db.getUserActiveDevices(userId);
      return NextResponse.json({
        success: true,
        message: 'تم تسجيل الخروج من الجهاز المحدد بنجاح',
        active_count: remaining.length
      });
    }

    return NextResponse.json({ error: 'معرّف الجهاز أو الإجراء مطلوب' }, { status: 400 });

  } catch (error: any) {
    console.error('Delete Device Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء إلغاء تفعيل الجهاز' }, { status: 500 });
  }
}
