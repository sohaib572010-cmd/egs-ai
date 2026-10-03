import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'غير مصرح لك بالوصول' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة تسجيل الدخول غير صالحة أو منتهية' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'هذا الإجراء مخصص لمدير النظام فقط' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const gradeLevel = searchParams.get('grade_level');
    const subjectName = searchParams.get('subject_name');

    if (!gradeLevel || !subjectName) {
      return NextResponse.json({ error: 'السنة الدراسية واسم المادة مطلوبان' }, { status: 400 });
    }

    const graph = await db.getCurriculumGraph(gradeLevel, subjectName);

    return NextResponse.json({
      success: true,
      gradeLevel,
      subjectName,
      entityCount: graph.entities.length,
      relationCount: graph.relations.length,
      entities: graph.entities,
      relations: graph.relations
    });
  } catch (err: any) {
    console.error('Error fetching curriculum graph:', err);
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب شبكة المعرفة' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'غير مصرح لك بالوصول' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة تسجيل الدخول غير صالحة أو منتهية' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'هذا الإجراء مخصص لمدير النظام فقط' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, grade_level, subject_name } = body;

    if (action === 'rebuild_all') {
      const curriculums = await db.getCurriculums();
      const results = [];
      for (const curr of curriculums) {
        if (!curr.is_placeholder) {
          const graph = await db.getCurriculumGraph(curr.grade_level, curr.subject_name);
          results.push({
            gradeLevel: curr.grade_level,
            subjectName: curr.subject_name,
            entitiesCount: graph.entities.length,
            relationsCount: graph.relations.length
          });
        }
      }
      return NextResponse.json({
        success: true,
        message: `تم بناء وتحديث شبكات المعرفة لجميع المناهج الدراسية (${results.length} منهج).`,
        results
      });
    }

    if (!grade_level || !subject_name) {
      return NextResponse.json({ error: 'السنة الدراسية واسم المادة مطلوبان' }, { status: 400 });
    }

    const graph = await db.getCurriculumGraph(grade_level, subject_name);

    return NextResponse.json({
      success: true,
      message: `تم بناء شبكة المعرفة للمنهج بنجاح: ${graph.entities.length} مفهوم، ${graph.relations.length} علاقة.`,
      gradeLevel: grade_level,
      subjectName: subject_name,
      entityCount: graph.entities.length,
      relationCount: graph.relations.length,
      entities: graph.entities,
      relations: graph.relations
    });
  } catch (err: any) {
    console.error('Error rebuilding curriculum graph:', err);
    return NextResponse.json({ error: 'حدث خطأ أثناء بناء شبكة المعرفة' }, { status: 500 });
  }
}
