import { NextRequest, NextResponse } from 'next/server';
import { db, type VoiceCallRow } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Voice Tutor calls are returned as sessions (kind 'voice') whose transcript entries are messages
function voiceCallsAsSessions(calls: VoiceCallRow[]) {
  const sessions = calls.map(c => ({
    id: `voice_${c.id}`,
    kind: 'voice',
    title: `مكالمة صوتية${c.duration_seconds ? ` · ${formatDuration(c.duration_seconds)}` : ''}`,
    subject_name: c.subject_name,
    grade_level: c.grade_level,
    created_at: c.started_at,
    duration_seconds: c.duration_seconds ?? null,
    rating: c.rating ?? null,
    dialect: c.dialect,
    teacher: c.teacher
  }));
  const messages = calls.flatMap(c => (c.transcript || []).map((e, i) => ({
    id: `voice_${c.id}_${i}`,
    session_id: `voice_${c.id}`,
    kind: e.role === 'search' ? 'search' : 'voice',
    sender: e.role === 'student' ? 'user' : 'ai',
    message: e.text,
    interrupted: !!e.interrupted,
    sources: e.sources || [],
    created_at: e.at
  })));
  return { sessions, messages };
}

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
    const [chatSessions, chatMessages, voiceCalls] = await Promise.all([
      db.getChatSessions(userId),
      db.getChatHistory(userId),
      db.getVoiceCalls(userId).catch(() => [] as VoiceCallRow[])
    ]);
    const voice = voiceCallsAsSessions(voiceCalls);
    const sessions = [...(chatSessions || []), ...voice.sessions]
      .sort((a: { created_at?: string }, b: { created_at?: string }) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const messages = [...(chatMessages || []), ...voice.messages];

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
      totalSessions: sessions.length,
      totalMessages: messages.length,
      totalVoiceCalls: voice.sessions.length
    });
  } catch (error) {
    console.error('Admin student conversations error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء استرجاع سجل محادثات الطالب.' },
      { status: 500 }
    );
  }
}
