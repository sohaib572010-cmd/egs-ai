import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

// Model answers and explanations must never reach the client before submission.
// They are returned only by /api/exams/submit as per-question corrections.
function sanitizeExam(exam: any) {
  return {
    ...exam,
    questions: (exam.questions || []).map((q: any) => {
      const { correct_answer, explanation, ...rest } = q;
      return rest;
    })
  };
}

// GET /api/exams - Fetch available exams
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const deviceIdHeader = req.headers.get('x-device-id');
    const url = new URL(req.url);
    const subjectName = url.searchParams.get('subject_name') || undefined;

    let userId: string | null = null;
    let deviceId: string | null = deviceIdHeader || null;
    let gradeLevel: string | undefined = undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      userId = verifySessionToken(token);
    }

    if (!userId) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول لعرض الامتحانات', code: 'login_required' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }
    gradeLevel = profile.grade_level;

    const exams = await db.getExams(gradeLevel, subjectName, userId, deviceId || undefined);
    return NextResponse.json(exams.map(sanitizeExam));
  } catch (error: any) {
    console.error('GET Exams Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب الامتحانات' }, { status: 500 });
  }
}

// POST /api/exams - Save a new exam (e.g. intercepted from chat or admin-created)
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const deviceIdHeader = req.headers.get('x-device-id');
    const body = await req.json();
    const { title, subject_name, grade_level, questions, session_id } = body;

    if (!title || !subject_name || !grade_level || !questions || !Array.isArray(questions)) {
      return NextResponse.json({ error: 'المدخلات غير كاملة لإنشاء الامتحان' }, { status: 400 });
    }

    let userId: string | null = null;
    let deviceId: string | null = deviceIdHeader || null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      userId = verifySessionToken(token);
    }

    if (!userId) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول لحفظ الامتحان', code: 'login_required' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    const newExam = await db.createExam({
      title,
      subject_name,
      grade_level,
      questions,
      session_id: session_id || undefined,
      user_id: userId,
      device_id: deviceId || undefined
    });

    return NextResponse.json(sanitizeExam(newExam));
  } catch (error: any) {
    console.error('POST Exams Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء حفظ الامتحان' }, { status: 500 });
  }
}
