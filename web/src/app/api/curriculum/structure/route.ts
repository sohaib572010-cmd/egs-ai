export const runtime = 'edge';
export const revalidate = 3600;
import { NextRequest, NextResponse } from 'next/server';
import { getCurriculumStructure } from '@/lib/curriculum_structure';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const gradeLevel = searchParams.get('grade_level');
    const subjectName = searchParams.get('subject_name');

    if (!gradeLevel || !subjectName) {
      return NextResponse.json(
        { error: 'السنة الدراسية واسم المادة مطلوبان' },
        { status: 400 }
      );
    }

    const structure = await getCurriculumStructure(gradeLevel, subjectName);

    return NextResponse.json(
      {
        success: true,
        ...structure
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
          'CDN-Cache-Control': 'max-age=3600',
          'Vary': 'Accept-Encoding'
        }
      }
    );
  } catch (error: any) {
    console.error('Curriculum structure API error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء جلب هيكل المنهج الدراسي.' },
      { status: 500 }
    );
  }
}
