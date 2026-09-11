export const runtime = 'edge';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('student_id');

    if (!studentId || typeof studentId !== 'string' || studentId.trim().length < 5) {
      return NextResponse.json(
        { error: 'معرف الطالب غير صالح أو مفقود.' },
        { status: 400 }
      );
    }

    const profile = await db.getProfile(studentId.trim());
    if (!profile) {
      return NextResponse.json(
        { error: 'لم يتم العثور على حساب الطالب المحدد.' },
        { status: 404 }
      );
    }

    // Return safe public metadata for the parent
    return NextResponse.json({
      success: true,
      student: {
        id: profile.id,
        name: profile.name || 'طالب متميز',
        grade_level: profile.grade_level || 'unselected',
        track_id: profile.track_id || null,
        elective_subject: profile.elective_subject || null,
        study_streak: profile.study_streak || 1,
        points: profile.points || 0,
        plan_type: profile.plan_type || 'free',
        subscription_status: profile.subscription_status || (profile.plan_type && profile.plan_type !== 'free' ? 'active' : 'inactive')
      }
    });

  } catch (error: any) {
    console.error('Sponsor Info Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء استرجاع بيانات الطالب.' },
      { status: 500 }
    );
  }
}
