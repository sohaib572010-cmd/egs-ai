import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

// Helper: Authorize admin
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

// GET dashboard statistics
export async function GET(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const stats = await db.getDashboardStats();
    return NextResponse.json({
      success: true,
      stats
    });
  } catch (error: any) {
    console.error('Get dashboard stats error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحميل إحصائيات لوحة التحكم.' }, { status: 500 });
  }
}
