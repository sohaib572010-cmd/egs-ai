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

// GET full AI conversation history for a student (Admin only, respecting opt-out)
export async function GET(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'معرف الطالب مطلوب لعرض المحادثات.' }, { status: 400 });
    }

    const student = await db.getProfile(userId);
    if (!student) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب الطالب.' }, { status: 404 });
    }

    // STRICT PRIVACY CHECK:
    // If the student has opted out (improve_ai_opt_in === false), refuse to return any conversation history.
    if (student.improve_ai_opt_in === false) {
      return NextResponse.json(
        {
          success: false,
          opted_out: true,
          error: 'قام هذا الطالب بإلغاء تفعيل خيار المساعدة في تحسين استجابات الذكاء الاصطناعي (Opted Out). تم حجب سجل المحادثات بالكامل احتراماً لخصوصية الطالب.',
          student: {
            id: student.id,
            name: student.name,
            grade_level: student.grade_level,
            improve_ai_opt_in: false
          }
        },
        { status: 403 }
      );
    }

    // Student is opted-in: fetch full conversation history and sessions
    const [sessions, messages] = await Promise.all([
      db.getChatSessions(userId),
      db.getChatHistory(userId)
    ]);

    return NextResponse.json({
      success: true,
      opted_out: false,
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        phone: student.phone,
        grade_level: student.grade_level,
        improve_ai_opt_in: true
      },
      sessions: sessions || [],
      messages: messages || [],
      totalSessions: (sessions || []).length,
      totalMessages: (messages || []).length
    });
  } catch (error: any) {
    console.error('Admin student conversations error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء استرجاع سجل محادثات الطالب.' },
      { status: 500 }
    );
  }
}
