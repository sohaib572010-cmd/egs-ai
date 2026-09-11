export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'غير مصرح للقيام بهذه العملية' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة العمل منتهية أو غير صالحة' }, { status: 401 });
    }

    let platform: string | undefined = undefined;
    try {
      const body = await req.json();
      if (body && typeof body.platform === 'string') {
        platform = body.platform;
      }
    } catch (_) {
      // Body is optional
    }

    if (!platform) {
      const ua = req.headers.get('user-agent') || '';
      if (/iPhone|iPad|iPod/i.test(ua)) {
        platform = 'ios';
      } else if (/Android/i.test(ua)) {
        platform = 'android';
      } else {
        platform = 'desktop';
      }
    }

    const recorded = await db.recordPwaInstall(userId, platform);

    return NextResponse.json({
      success: recorded,
      message: recorded ? 'تم تسجيل تثبيت التطبيق بنجاح' : 'فشل تسجيل تثبيت التطبيق'
    });
  } catch (error: any) {
    console.error('Record PWA install error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تسجيل تثبيت التطبيق' }, { status: 500 });
  }
}
