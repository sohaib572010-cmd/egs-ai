import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { sanitizeCatalog, type EducationCatalog } from '@/lib/education_catalog';

async function authorizeAdmin(req: NextRequest): Promise<string | NextResponse> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'غير مصرح للقيام بهذه العملية' }, { status: 401 });
  }
  const userId = verifySessionToken(authHeader.substring(7));
  if (!userId) {
    return NextResponse.json({ error: 'جلسة العمل منتهية أو غير صالحة' }, { status: 401 });
  }
  const profile = await db.getProfile(userId);
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'صلاحيات غير كافية. هذه العملية للمسؤولين فقط.' }, { status: 403 });
  }
  return userId;
}

async function usage() {
  const [counts, curricula] = await Promise.all([db.getStudentPathCounts(), db.getCurriculums()]);
  const stageCurricula: Record<string, number> = {};
  const trackCurricula: Record<string, number> = {};
  for (const c of curricula) {
    stageCurricula[c.grade_level] = (stageCurricula[c.grade_level] || 0) + 1;
    if (c.track_id) trackCurricula[c.track_id] = (trackCurricula[c.track_id] || 0) + 1;
  }
  return { studentsByStage: counts.stages, studentsByTrack: counts.tracks, curriculaByStage: stageCurricula, curriculaByTrack: trackCurricula };
}

export async function GET(req: NextRequest) {
  const auth = await authorizeAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const [catalog, stats] = await Promise.all([db.getEducationCatalog(), usage()]);
    return NextResponse.json({ success: true, catalog, usage: stats }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('Education catalog GET error:', err);
    return NextResponse.json({ error: 'تعذر تحميل الأنظمة والمراحل التعليمية.' }, { status: 500 });
  }
}

/**
 * Replaces the whole catalog. Removing a stage or track that still has students or curricula is
 * refused so no data is orphaned; the admin deactivates it instead.
 */
export async function PUT(req: NextRequest) {
  const auth = await authorizeAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const raw = await req.text();
    if (raw.length > 200_000) {
      return NextResponse.json({ error: 'حجم البيانات أكبر من المسموح.' }, { status: 413 });
    }
    const { catalog, errors } = sanitizeCatalog(JSON.parse(raw)?.catalog);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const [previous, stats, curricula] = await Promise.all([db.getEducationCatalog(), usage(), db.getCurriculums()]);
    const blocked: string[] = [];
    const newStageIds = new Set(catalog.stages.map((s) => s.id));
    const newTrackIds = new Set(catalog.tracks.map((t) => t.id));
    for (const s of previous.stages) {
      if (newStageIds.has(s.id)) continue;
      const students = stats.studentsByStage[s.id] || 0;
      const currs = stats.curriculaByStage[s.id] || 0;
      if (students || currs) blocked.push(`لا يمكن حذف المرحلة "${s.name}" لوجود ${students} طالب و${currs} منهج مرتبطين بها. يمكنك إيقاف تفعيلها بدلاً من الحذف.`);
    }
    for (const t of previous.tracks) {
      if (newTrackIds.has(t.id)) continue;
      const students = stats.studentsByTrack[t.id] || 0;
      const currs = stats.curriculaByTrack[t.id] || 0;
      if (students || currs) blocked.push(`لا يمكن حذف المسار "${t.name}" لوجود ${students} طالب و${currs} منهج مرتبطين به. يمكنك إيقاف تفعيله بدلاً من الحذف.`);
    }
    for (const c of curricula) {
      if (!newStageIds.has(c.grade_level)) blocked.push(`المنهج "${c.subject_name}" مرتبط بمرحلة غير موجودة (${c.grade_level}).`);
    }
    if (blocked.length > 0) {
      return NextResponse.json({ error: blocked[0], errors: blocked }, { status: 409 });
    }

    const existingIds = new Set(curricula.map((c) => c.id));
    const cleaned: EducationCatalog = {
      ...catalog,
      subjectLinks: Object.fromEntries(Object.entries(catalog.subjectLinks).filter(([id]) => existingIds.has(id))),
    };
    await db.saveEducationCatalog(cleaned);
    return NextResponse.json({ success: true, catalog: cleaned, usage: stats });
  } catch (err) {
    console.error('Education catalog PUT error:', err);
    return NextResponse.json({ error: 'تعذر حفظ الأنظمة والمراحل التعليمية.' }, { status: 500 });
  }
}
