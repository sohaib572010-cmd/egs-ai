import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth_helpers';
import { db } from '@/lib/db';
import { checkRateLimitAsync } from '@/lib/rate_limiter';
import { findCurriculumFor, getCurriculumStructure, getExhaustiveLessonContext } from '@/lib/curriculum_structure';
import { retrieveCurriculumContext } from '@/lib/hybrid_retriever';

export const maxDuration = 30;

const SEARCH_RESULT_CHARS = 9000;
const LESSON_RESULT_CHARS = 14000;

const cleanText = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const userId = authHeader?.startsWith('Bearer ') ? verifySessionToken(authHeader.substring(7)) : null;
  if (!userId) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 });
  }

  const limit = await checkRateLimitAsync(`voice_tool:${userId}`, 40, 300);
  if (!limit.allowed) {
    return NextResponse.json({ result: 'Search limit reached for now. Answer from the conversation so far and suggest a short break.' }, { status: 429 });
  }

  try {
    const body = (await req.json().catch(() => null)) || {};
    const name = body.name;
    const subjectName = cleanText(body.subject_name, 120);
    const args = body.args && typeof body.args === 'object' ? body.args : {};
    if (!subjectName || (name !== 'search_curriculum' && name !== 'get_lesson')) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const profile = await db.getProfile(userId);
    if (!profile?.grade_level) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 401 });
    }
    const grade = profile.grade_level;

    if (name === 'get_lesson') {
      const lessonTitle = cleanText(args.lesson_title, 200);
      if (!lessonTitle) return NextResponse.json({ result: 'No lesson title was given.' });
      const lesson = await getExhaustiveLessonContext(grade, subjectName, lessonTitle);
      if (!lesson.success) {
        return NextResponse.json({ result: `No lesson matching "${lessonTitle}" was found. Use search_curriculum instead.`, label: lessonTitle });
      }
      return NextResponse.json({
        result: `Lesson: ${lesson.lessonTitle}${lesson.unitTitle ? ` (${lesson.unitTitle})` : ''}\n\n${lesson.contextText.slice(0, LESSON_RESULT_CHARS)}`,
        label: lesson.lessonTitle,
        sources: [lesson.lessonTitle]
      });
    }

    const query = cleanText(args.query, 500);
    if (!query) return NextResponse.json({ result: 'The search query was empty.' });
    const keywords = Array.isArray(args.keywords) ? args.keywords.map((k: unknown) => cleanText(k, 60)).filter(Boolean).slice(0, 8) : [];

    const curriculum = await findCurriculumFor(grade, subjectName);
    if (!curriculum) return NextResponse.json({ result: 'This subject has no textbook available.' });
    const { units } = await getCurriculumStructure(grade, subjectName);
    const retrieval = await retrieveCurriculumContext({
      curriculumId: curriculum.id,
      question: query,
      queries: [query, keywords.join(' ')],
      hydePassage: query,
      keywords,
      units: []
    });

    const sources = [...new Set(retrieval.sections.map(s => (s.chunk.heading || '').split('>').slice(-2).map(p => p.trim()).join(' · ')).filter(Boolean))].slice(0, 4);
    const relevanceNote = retrieval.topRelevance !== null && retrieval.topRelevance < 0.45
      ? '[Note: these excerpts are only loosely related; the point may be beyond the curriculum.]\n\n'
      : '';
    return NextResponse.json({
      result: retrieval.sections.length
        ? `${relevanceNote}${retrieval.formattedContext.slice(0, SEARCH_RESULT_CHARS)}`
        : `No textbook excerpt matched. Lesson titles:\n${(units || []).flatMap(u => u.lessons.map(l => l.title)).join('\n').slice(0, 3000)}`,
      label: query,
      sources
    });
  } catch (error) {
    console.error('Voice tool error:', error);
    return NextResponse.json({ result: 'The textbook search failed this time. Answer carefully from general curriculum knowledge and say you could not check the book.' }, { status: 200 });
  }
}
