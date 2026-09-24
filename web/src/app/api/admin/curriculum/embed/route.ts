export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { db, invalidateCurriculumsCache } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { generateEmbeddingBatch } from '@/lib/gemini';

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

// GET embedding status for a curriculum
export async function GET(req: NextRequest) {
  try {
    const authResult = await authorizeAdmin(req);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(req.url);
    const curriculumId = searchParams.get('curriculumId');

    if (!curriculumId) {
      return NextResponse.json({ error: 'معرف المنهج مطلوب' }, { status: 400 });
    }

    const stats = await db.getCurriculumEmbeddingStats(curriculumId);
    const percentage = stats.totalChildren > 0
      ? Math.round((stats.embeddedCount / stats.totalChildren) * 100)
      : 100;

    return NextResponse.json({
      success: true,
      stats: {
        ...stats,
        percentage,
        isComplete: stats.pendingCount === 0
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (error: any) {
    console.error('Curriculum embedding stats error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء فحص حالة المتجهات.' }, { status: 500 });
  }
}

// POST generate next batch of embeddings
export async function POST(req: NextRequest) {
  try {
    const authResult = await authorizeAdmin(req);
    if (authResult instanceof NextResponse) return authResult;

    const body = await req.json();
    const { curriculumId, limit = 30 } = body;

    if (!curriculumId) {
      return NextResponse.json({ error: 'معرف المنهج مطلوب' }, { status: 400 });
    }

    const safeLimit = Math.min(Math.max(1, Number(limit) || 30), 50);

    const { chunks, totalRemaining, totalChildren } = await db.getPendingEmbeddingChunks(curriculumId, safeLimit);

    if (chunks.length === 0) {
      invalidateCurriculumsCache();
      await db.setSystemSetting('curriculum_version', Date.now().toString()).catch(() => {});
      return NextResponse.json({
        success: true,
        complete: true,
        embeddedInBatch: 0,
        remaining: 0,
        totalChildren,
        percentage: 100
      });
    }

    const texts = chunks.map(c => `${c.heading}\n${c.content}`);
    const vectors = await generateEmbeddingBatch(texts);

    const payload = chunks.map((c, idx) => ({
      id: c.id,
      embedding: vectors[idx] || []
    }));

    const savedCount = await db.saveChunkEmbeddings(payload);
    const newRemaining = Math.max(0, totalRemaining - savedCount);
    const percentage = totalChildren > 0
      ? Math.round(((totalChildren - newRemaining) / totalChildren) * 100)
      : 100;

    if (newRemaining === 0) {
      invalidateCurriculumsCache();
      await db.setSystemSetting('curriculum_version', Date.now().toString()).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      complete: newRemaining === 0,
      embeddedInBatch: savedCount,
      remaining: newRemaining,
      totalChildren,
      percentage
    });

  } catch (error: any) {
    console.error('Curriculum batch embedding error:', error);
    return NextResponse.json({ error: error.message || 'حدث خطأ أثناء معالجة المتجهات' }, { status: 500 });
  }
}
