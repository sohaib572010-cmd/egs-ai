import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: true });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ success: true });
    }

    let deviceId = req.headers.get('x-device-id') || undefined;
    try {
      const body = await req.json();
      if (body && body.device_id) deviceId = body.device_id;
    } catch (_) {}

    if (deviceId) {
      await db.deactivateUserDevice(userId, deviceId);
    }

    return NextResponse.json({
      success: true,
      message: 'تم تسجيل الخروج بنجاح'
    });

  } catch (error: any) {
    console.error('Logout API Error:', error);
    return NextResponse.json({ success: true });
  }
}
