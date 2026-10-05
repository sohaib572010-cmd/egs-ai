import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { resolveMediaRefs } from '@/lib/chat_media';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const deviceId = req.nextUrl.searchParams.get('device_id') || req.headers.get('x-device-id');
    const sessionId = req.nextUrl.searchParams.get('session_id');
    
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      userId = verifySessionToken(token);
    }

    // Website requires login, reject web guest requests
    if (!userId) {
      return NextResponse.json(
        { error: 'login_required', code: 'login_required', message: 'تسجيل الدخول مطلوب لعرض المحادثات.' },
        { status: 401 }
      );
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json(
        { error: 'user_not_found', code: 'user_not_found', message: 'لم يتم العثور على حساب المستخدم أو تم حذفه.' },
        { status: 401 }
      );
    }

    if (!sessionId && !userId && !deviceId) {
      return NextResponse.json(
        { error: 'bad_request', message: 'مطلوب معرف الجلسة أو تسجيل الدخول أو معرف جهاز لتحميل الرسائل.' },
        { status: 400 }
      );
    }

    // Ownership check: a session belongs to exactly one user, never trust the id alone
    let sessionData = null;
    if (sessionId) {
      const session = await db.getChatSession(sessionId);
      if (!session || session.user_id !== userId) {
        return NextResponse.json(
          { error: 'forbidden', message: 'ليس لديك صلاحية للوصول إلى هذه المحادثة.' },
          { status: 403 }
        );
      }
      let cleanTitle = session.title;
      if (cleanTitle && (cleanTitle.includes('VOICE_MESSAGE:') || cleanTitle.includes('IMAGE_MESSAGE:'))) {
        if (cleanTitle.includes('VOICE_MESSAGE:')) {
          const m = cleanTitle.match(/\[?VOICE_MESSAGE:[^\]]*\]([\s\S]*)/);
          cleanTitle = m && m[1]?.trim() ? m[1].trim() : 'تسجيل صوتي';
        } else if (cleanTitle.includes('IMAGE_MESSAGE:')) {
          const m = cleanTitle.match(/\[?IMAGE_MESSAGE:[^\]]*\]([\s\S]*)/);
          cleanTitle = m && m[1]?.trim() ? m[1].trim() : 'سؤال من صورة';
        }
        cleanTitle = cleanTitle.replace(/\[[A-Z_]+:[^\]]*\]/g, '').trim();
        cleanTitle = cleanTitle.replace(/^\[?VOICE_MESSAGE:[^\]]*\]?/g, '').trim();
        cleanTitle = cleanTitle.replace(/^\[?IMAGE_MESSAGE:[^\]]*\]?/g, '').trim();
        if (!cleanTitle) cleanTitle = 'تسجيل صوتي';
      }
      sessionData = {
        id: session.id,
        title: cleanTitle,
        subject_name: session.subject_name,
        grade_level: session.grade_level,
        mode: session.mode
      };
    }

    // Retrieve history
    const cappedHistory = await resolveMediaRefs(
      await db.getChatHistory(userId || undefined, deviceId || undefined, sessionId || undefined, 100)
    );

    return NextResponse.json({
      success: true,
      session: sessionData,
      history: cappedHistory.map(h => ({
        id: h.id,
        session_id: h.session_id,
        sender: h.sender,
        message: h.message,
        created_at: h.created_at
      }))
    });

  } catch (error: any) {
    console.error('Chat History API Error:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'حدث خطأ أثناء تحميل سجل المحادثة.' },
      { status: 500 }
    );
  }
}
