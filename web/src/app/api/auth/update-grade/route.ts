import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { validateStudentPath } from '@/lib/education_catalog';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'غير مصرح للقيام بهذه العملية' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة العمل منتهية أو غير صالحة. يرجى تسجيل الدخول مجدداً.' }, { status: 401 });
    }

    const { grade_level, track_id, elective_subject } = await req.json();

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    const [catalog, curricula] = await Promise.all([db.getEducationCatalog(), db.getCurriculums()]);
    const path = validateStudentPath(
      catalog,
      curricula,
      { stageId: grade_level, trackId: track_id, electiveSubject: elective_subject },
      { stageId: profile.grade_level, trackId: profile.track_id }
    );
    if (!path.ok) {
      return NextResponse.json({ error: path.error }, { status: 400 });
    }

    const updatedProfile = await db.updateProfileGradeLevel(userId, grade_level, path.trackId, path.electiveSubject);
    if (!updatedProfile) {
      return NextResponse.json({ error: 'فشل تحديث السنة الدراسية' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: updatedProfile.id,
        phone: updatedProfile.phone,
        email: updatedProfile.email,
        name: updatedProfile.name,
        grade_level: updatedProfile.grade_level,
        track_id: updatedProfile.track_id || null,
        elective_subject: updatedProfile.elective_subject || null,
        plan_type: updatedProfile.plan_type,
        subscription_status: updatedProfile.subscription_status || (updatedProfile.plan_type && updatedProfile.plan_type !== 'free' ? 'active' : 'inactive'),
        subscription_start_date: updatedProfile.subscription_start_date,
        subscription_end_date: updatedProfile.subscription_end_date,
        subscription_plan_id: updatedProfile.subscription_plan_id,
        role: updatedProfile.role,
        coins: updatedProfile.coins === undefined ? 20.0 : updatedProfile.coins,
        points: updatedProfile.points || 0,
        study_streak: updatedProfile.study_streak || 1
      }
    });

  } catch (error: any) {
    console.error('Update Grade API Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تحديث السنة الدراسية.' },
      { status: 500 }
    );
  }
}
