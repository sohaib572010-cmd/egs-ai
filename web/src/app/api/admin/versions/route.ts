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

// GET list all app versions (Admin only)
export async function GET(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const versions = await db.getAllVersions();
    return NextResponse.json({ success: true, versions });
  } catch (error: any) {
    console.error('Get versions error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحميل الإصدارات.' }, { status: 500 });
  }
}

// POST create a new app version (Admin only)
export async function POST(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { platform, version_code, version_name, release_notes, download_url, mandatory } = await req.json();

    const versionCode = parseInt(version_code, 10);
    if (!version_name || isNaN(versionCode) || versionCode <= 0) {
      return NextResponse.json({ error: 'رقم الإصدار (version_code) واسم الإصدار مطلوبان' }, { status: 400 });
    }

    const version = await db.createVersion({
      platform: platform === 'ios' ? 'ios' : 'android',
      version_code: versionCode,
      version_name: version_name.trim().slice(0, 50),
      release_notes: typeof release_notes === 'string' ? release_notes.trim().slice(0, 4000) : '',
      download_url: typeof download_url === 'string' ? download_url.trim().slice(0, 500) : '',
      mandatory: mandatory !== false
    });

    return NextResponse.json({ success: true, message: 'تم إضافة الإصدار بنجاح.', version });
  } catch (error: any) {
    console.error('Create version error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء إضافة الإصدار.' }, { status: 500 });
  }
}

// DELETE an app version (Admin only)
export async function DELETE(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'معرف الإصدار مطلوب للحذف' }, { status: 400 });
    }

    const success = await db.deleteVersion(id);
    if (!success) {
      return NextResponse.json({ error: 'فشل حذف الإصدار' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'تم حذف الإصدار بنجاح.' });
  } catch (error: any) {
    console.error('Delete version error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف الإصدار.' }, { status: 500 });
  }
}
