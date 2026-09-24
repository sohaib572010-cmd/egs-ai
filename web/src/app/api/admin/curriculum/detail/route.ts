export const runtime = 'nodejs';
export const maxDuration = 60;
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

// GET curriculum details & reconstructed content
export async function GET(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'معرف المنهج مطلوب' }, { status: 400 });
    }

    const detail = await db.getCurriculumDetail(id);
    if (!detail) {
      return NextResponse.json({ error: 'المنهج غير موجود' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      curriculum: detail.curriculum,
      content: detail.content
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });

  } catch (error: any) {
    console.error('Get curriculum detail error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء تحميل تفاصيل المنهج الدراسي.' }, { status: 500 });
  }
}

import { processCurriculumChunks } from '@/lib/curriculum_processor';

// POST update curriculum Markdown content
export async function POST(req: NextRequest) {
  const authResult = await authorizeAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id, grade_level, subject_name, content } = await req.json();

    if (!id || !grade_level || !subject_name || content === undefined) {
      return NextResponse.json(
        { error: 'جميع الحقول مطلوبة (المعرف، السنة الدراسية، اسم المادة، المحتوى)' },
        { status: 400 }
      );
    }

    if (!content.trim()) {
      return NextResponse.json({ error: 'المحتوى لا يمكن أن يكون فارغاً' }, { status: 400 });
    }

    // Process hierarchical chunks and extract GraphRAG knowledge graph rapidly
    const { parents, children, allChunks, summaryContent, entities, relations } = await processCurriculumChunks(
      content,
      id,
      { skipEmbeddings: true }
    );

    if (parents.length === 0) {
      return NextResponse.json({ error: 'تعذر تجزئة الملف. يرجى التأكد من احتوائه على نص صالح.' }, { status: 400 });
    }

    // Update in DB
    const success = await db.updateCurriculumContent(id, grade_level, subject_name, allChunks, content);

    if (!success) {
      return NextResponse.json({ error: 'فشل تحديث محتوى المنهج' }, { status: 500 });
    }

    if (entities.length > 0) {
      try {
        await db.saveCurriculumGraph(id, entities, relations);
      } catch (graphErr) {
        console.warn('Graph save notice in detail route:', graphErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `تم تحديث المنهج الدراسي بنجاح: ${parents.length} قسم رئيسي، ${children.length} وحدة بحث، و ${entities.length} مفهوم في شبكة المعرفة.`,
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
    console.error('Update curriculum content error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تحديث ومعالجة المنهج الدراسي.' },
      { status: 500 }
    );
  }
}
