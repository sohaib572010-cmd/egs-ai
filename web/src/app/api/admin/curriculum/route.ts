export const runtime = 'nodejs';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { db, invalidateCurriculumsCache } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { processCurriculumChunks } from '@/lib/curriculum_processor';

// ─── Helper: Authorize admin ──────────────────────────────────────────────────
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

// GET list all curriculums (Admin only)
export async function GET(req: NextRequest) {
  try {
    const authResult = await authorizeAdmin(req);
    if (authResult instanceof NextResponse) return authResult;

    const curriculums = await db.getCurriculums();
    return NextResponse.json({ success: true, curriculums }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (error: any) {
    console.error('Get curriculums error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحميل المناهج الدراسية.' }, { status: 500 });
  }
}

// POST upload, chunk curriculum, or create placeholder (Admin only)
export async function POST(req: NextRequest) {
  try {
    const authResult = await authorizeAdmin(req);
    if (authResult instanceof NextResponse) return authResult;

    const contentType = req.headers.get('content-type') || '';

    // Case 1: JSON body (e.g. creating placeholder subject without file)
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const { grade_level, subject_name, track_id, is_elective, is_placeholder } = body;

      if (!grade_level || !subject_name || !subject_name.trim()) {
        return NextResponse.json({ error: 'السنة الدراسية واسم المادة مطلوبان' }, { status: 400 });
      }

      const cleanGrade = grade_level.trim();
      const cleanSubject = subject_name.trim();

      const curriculum = await db.createPlaceholderCurriculum(cleanGrade, cleanSubject, track_id || null, !!is_elective);
      return NextResponse.json({
        success: true,
        message: `تمت إضافة مادة "${cleanSubject}" كمنهج قيد الإعداد بنجاح. ستظهر للطلاب كمنهج قادم.`,
        curriculum
      });
    }

    // Case 2: FormData multipart (file upload or attaching file to placeholder)
    const formData = await req.formData();
    const curriculumId = (formData.get('curriculum_id') as string | null)?.trim();
    const isPlaceholder = formData.get('is_placeholder') === 'true';
    const gradeLevel = (formData.get('grade_level') as string | null)?.trim();
    const subjectName = (formData.get('subject_name') as string | null)?.trim();
    const trackId = (formData.get('track_id') as string | null)?.trim() || null;
    const isElective = formData.get('is_elective') === 'true';
    const file = formData.get('file') as File | null;

    if (isPlaceholder && !file) {
      if (!gradeLevel || !subjectName) {
        return NextResponse.json({ error: 'السنة الدراسية واسم المادة مطلوبان' }, { status: 400 });
      }
      const curriculum = await db.createPlaceholderCurriculum(gradeLevel, subjectName, trackId, isElective);
      return NextResponse.json({
        success: true,
        message: `تمت إضافة مادة "${subjectName}" كمنهج قيد الإعداد بنجاح.`,
        curriculum
      });
    }

    if (!file) {
      return NextResponse.json({ error: 'ملف المنهج مطلوب بصيغة Markdown (.md)' }, { status: 400 });
    }

    const fileContent = await file.text();
    if (!fileContent.trim()) {
      return NextResponse.json({ error: 'ملف المنهج فارغ!' }, { status: 400 });
    }

    console.log(`[Curriculum Upload] Starting fast hierarchical chunking for ${subjectName || curriculumId}...`);

    // Process hierarchical parent-child chunks and GraphRAG knowledge graph rapidly
    const { parents, children, allChunks, summaryContent, entities, relations } = await processCurriculumChunks(
      fileContent,
      curriculumId || 'curriculum_pending',
      { skipEmbeddings: true }
    );

    if (parents.length === 0) {
      return NextResponse.json({ error: 'تعذر تجزئة الملف. يرجى التأكد من احتوائه على نص صالح.' }, { status: 400 });
    }

    console.log(`[Curriculum Upload] Created ${parents.length} parent chunks, ${children.length} child chunks, ${entities.length} graph entities`);

    let curriculum;
    if (curriculumId) {
      // Attach file to existing placeholder curriculum
      curriculum = await db.attachFileToCurriculum(curriculumId, file.name, allChunks, [], fileContent);
      if (!curriculum) {
        return NextResponse.json({ error: 'لم يتم العثور على المنهج المطلوب لتحديثه' }, { status: 404 });
      }
    } else {
      if (!gradeLevel || !subjectName) {
        return NextResponse.json({ error: 'السنة الدراسية واسم المادة مطلوبان' }, { status: 400 });
      }
      // Save new full curriculum
      curriculum = await db.createCurriculum(gradeLevel, subjectName, file.name, allChunks, [], trackId, isElective, fileContent);
    }

    if (curriculum && curriculum.id && entities.length > 0) {
      try {
        await db.saveCurriculumGraph(curriculum.id, entities, relations);
      } catch (graphErr) {
        console.warn('Graph save notice:', graphErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `تم رفع ومعالجة فصول المنهج بنجاح: ${parents.length} قسماً رئيسياً، ${children.length} وحدة بحث، و ${entities.length} مفهوماً في شبكة المعرفة.`,
      curriculum,
      stats: {
        parentChunks: parents.length,
        childChunks: children.length,
        embeddingsGenerated: 0,
        pendingEmbeddingCount: children.length,
        hasSummary: !!summaryContent,
        entitiesCount: entities.length,
        relationsCount: relations.length
      }
    });

  } catch (error: any) {
    console.error('Curriculum upload error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء رفع ومعالجة ملف المنهج.' },
      { status: 500 }
    );
  }
}

// PATCH rename curriculum subject/file name (Admin only)
export async function PATCH(req: NextRequest) {
  try {
    const authResult = await authorizeAdmin(req);
    if (authResult instanceof NextResponse) return authResult;

    const { id, subject_name, file_name } = await req.json();
    if (!id || !subject_name || !subject_name.trim()) {
      return NextResponse.json({ error: 'معرف المنهج واسم المادة الجديد مطلوبان' }, { status: 400 });
    }

    const updated = await db.renameCurriculum(id, subject_name, file_name);
    if (!updated) {
      return NextResponse.json({ error: 'فشلت إعادة تسمية المنهج' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'تم تحديث اسم المنهج بنجاح', curriculum: updated });

  } catch (error: any) {
    console.error('Rename curriculum error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء إعادة تسمية المنهج.' }, { status: 500 });
  }
}

// DELETE curriculum (Admin only)
export async function DELETE(req: NextRequest) {
  try {
    const authResult = await authorizeAdmin(req);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'معرف المنهج مطلوب للحذف' }, { status: 400 });
    }

    const success = await db.deleteCurriculum(id);
    if (!success) {
      return NextResponse.json({ error: 'فشل حذف المنهج' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'تم حذف المنهج الدراسي بنجاح' });

  } catch (error: any) {
    console.error('Delete curriculum error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف المنهج.' }, { status: 500 });
  }
}
