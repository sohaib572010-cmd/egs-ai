import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

// POST: report an AI response for admin review (logged-in users or guests)
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const deviceId = req.headers.get('x-device-id');

    let userId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      userId = verifySessionToken(authHeader.substring(7));
    }

    if (!userId && !deviceId) {
      return NextResponse.json(
        { error: 'يلزم تسجيل الدخول أو معرف جهاز لإرسال بلاغ.' },
        { status: 401 }
      );
    }

    const { reported_content, user_query, reason, message_id, session_id } = await req.json();

    if (!reported_content || typeof reported_content !== 'string' || !reported_content.trim()) {
      return NextResponse.json({ error: 'محتوى البلاغ مطلوب.' }, { status: 400 });
    }

    const report = await db.createReport({
      user_id: userId || undefined,
      device_id: userId ? undefined : (deviceId || undefined),
      message_id: typeof message_id === 'string' ? message_id.slice(0, 200) : undefined,
      session_id: typeof session_id === 'string' ? session_id : undefined,
      reported_content: reported_content.slice(0, 8000),
      user_query: typeof user_query === 'string' ? user_query.slice(0, 2000) : undefined,
      reason: typeof reason === 'string' && reason.trim() ? reason.slice(0, 500) : 'لم يحدد الطالب سبباً'
    });

    return NextResponse.json({ success: true, message: 'شكراً لك، تم إرسال بلاغك وسيتم مراجعته من قبل الإدارة.', report_id: report.id });

  } catch (error: any) {
    console.error('Report API Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء إرسال البلاغ.' }, { status: 500 });
  }
}
