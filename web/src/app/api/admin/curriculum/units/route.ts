import { NextRequest, NextResponse } from 'next/server';
import { db, CurriculumUnit } from '@/lib/db';
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

// POST/PUT: Update manual units and lessons for a curriculum
export async function POST(req: NextRequest) {
  try {
    const authResult = await authorizeAdmin(req);
    if (authResult instanceof NextResponse) return authResult;

    const body = await req.json();
    const { id, units } = body;

    if (!id) {
      return NextResponse.json({ error: 'معرف المنهج مطلوب' }, { status: 400 });
    }

    if (!Array.isArray(units)) {
      return NextResponse.json({ error: 'هيكل الوحدات يجب أن يكون مصفوفة صالحة' }, { status: 400 });
    }

    // Sanitize and structure units and lessons
    const formattedUnits: CurriculumUnit[] = units.map((u: any, uIdx: number) => {
      const unitNumber = typeof u.unitNumber === 'number' ? u.unitNumber : (uIdx + 1);
      const unitId = u.id || `unit_${unitNumber}`;
      const unitTitle = (u.title || '').trim() || `الوحدة ${unitNumber}`;
      const rawLessons = Array.isArray(u.lessons) ? u.lessons : [];

      const lessons = rawLessons.map((l: any, lIdx: number) => ({
        id: l.id || `lesson_${unitNumber}_${l.lessonNumber || (lIdx + 1)}`,
        title: (l.title || '').trim() || `الدرس ${l.lessonNumber || (lIdx + 1)}`,
        lessonNumber: typeof l.lessonNumber === 'number' ? l.lessonNumber : (lIdx + 1),
        unitTitle: unitTitle,
        unitId: unitId,
        subtopics: Array.isArray(l.subtopics) ? l.subtopics.map((s: any) => String(s).trim()).filter(Boolean) : [],
        startPage: l.startPage ? parseInt(String(l.startPage), 10) : undefined
      }));

      return {
        id: unitId,
        title: unitTitle,
        unitNumber: unitNumber,
        startPage: u.startPage ? parseInt(String(u.startPage), 10) : undefined,
        lessons
      };
    });

    const success = await db.updateCurriculumUnits(id, formattedUnits);
    if (!success) {
      return NextResponse.json({ error: 'فشل حفظ وتحديث وحدات المنهج' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم تحديث فهرس الوحدات والدروس للمنهج بنجاح',
      units: formattedUnits
    });
  } catch (error: any) {
    console.error('Update curriculum units error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تحديث وحدات المنهج الدراسي.' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}
