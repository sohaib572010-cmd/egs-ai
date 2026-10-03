import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'تسجيل الدخول مطلوب' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة غير صالحة', code: 'invalid_token' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const subjectName = searchParams.get('subject_name') || undefined;
    const gradeLevel = searchParams.get('grade_level') || undefined;

    const progressList = await db.getUserLessonProgress(userId, subjectName, gradeLevel);

    return NextResponse.json({
      success: true,
      progress: progressList,
      completedCount: progressList.filter(p => p.status === 'completed').length
    });
  } catch (error: any) {
    console.error('Curriculum progress GET error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب تقدم المنهج' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'تسجيل الدخول مطلوب' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة غير صالحة', code: 'invalid_token' }, { status: 401 });
    }

    const body = await req.json();
    const { grade_level, subject_name, unit_id, lesson_id, completed, quiz_score } = body;

    if (!grade_level || !subject_name || !unit_id || !lesson_id) {
      return NextResponse.json({ error: 'البيانات المطلوبة غير مكتملة' }, { status: 400 });
    }

    const isCompleted = completed !== false;
    await db.toggleLessonCompletion({
      userId,
      gradeLevel: grade_level,
      subjectName: subject_name,
      unitId: unit_id,
      lessonId: lesson_id,
      completed: isCompleted,
      quizScore: quiz_score
    });

    const updatedList = await db.getUserLessonProgress(userId, subject_name, grade_level);

    return NextResponse.json({
      success: true,
      completed: isCompleted,
      progress: updatedList,
      completedCount: updatedList.filter(p => p.status === 'completed').length
    });
  } catch (error: any) {
    console.error('Curriculum progress POST error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحديث تقدم المنهج' }, { status: 500 });
  }
}
