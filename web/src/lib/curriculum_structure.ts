import { db, registerCurriculumInvalidator, type Curriculum } from './db';
import { resolveCurriculum } from './education_catalog';

export interface CurriculumLesson {
  id: string;
  title: string;
  lessonNumber: number;
  unitTitle?: string;
  unitId?: string;
  subtopics?: string[];
  startPage?: number;
}

export interface CurriculumUnit {
  id: string;
  title: string;
  unitNumber: number;
  /** Parent unit when the book nests chapters inside units (e.g. "الوحدة 2: الحركة الخطية"). */
  groupTitle?: string;
  startPage?: number;
  lessons: CurriculumLesson[];
}

export interface CurriculumStructureResult {
  hasCurriculum: boolean;
  curriculumId?: string;
  gradeLevel: string;
  subjectName: string;
  units: CurriculumUnit[];
  totalLessons: number;
}

function normalize(str: string): string {
  if (!str) return '';
  return str
    .replace(/<!--[\s\S]*?-->/g, ' ')       // strip HTML comments
    .replace(/[\u064B-\u065F\u0670]/g, '') // strip tashkeel
    .replace(/\u0640/g, '')                 // strip tatweel
    .replace(/[أإآٱ]/g, 'ا')                // unify alef variants (preserve standalone hamza 'ء')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[ـ\-_]/g, ' ')
    .replace(/[^\w\u0621-\u064A0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The curriculum a student of a stage means by a subject name, including curricula shared into the stage. */
export async function findCurriculumFor(gradeLevel: string, subjectName: string): Promise<Curriculum | undefined> {
  const [catalog, curricula] = await Promise.all([db.getEducationCatalog(), db.getCurriculums()]);
  return resolveCurriculum(catalog, curricula, gradeLevel.trim(), subjectName.trim());
}

const MAX_SUBTOPICS = 20;

/**
 * Lesson map of a curriculum Markdown file. "#" headings are units/chapters, "##" lessons and
 * "###" subtopics. A "#" heading directly followed by another "#" heading is a parent unit that
 * groups the chapters after it; it becomes their groupTitle instead of an empty unit.
 */
export function parseCurriculumOutline(markdown: string): CurriculumUnit[] {
  const lines = (markdown || '').split('\n').map((l) => l.trim());
  const units: CurriculumUnit[] = [];
  let unit: CurriculumUnit | null = null;
  let lesson: CurriculumLesson | null = null;
  let group = '';

  const nextHeading = (from: number) => {
    for (let j = from; j < lines.length; j++) {
      if (/^#{1,6}\s/.test(lines[j])) return lines[j];
      if (lines[j] && !lines[j].startsWith('<!--')) return null;
    }
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h1 = line.match(/^#\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    if (h1) {
      const title = h1[1].trim();
      if (title.startsWith('منهج') || title.startsWith('__')) continue;
      const next = nextHeading(i + 1);
      if (next && /^#\s/.test(next)) {
        group = title;
        continue;
      }
      unit = { id: `unit_${units.length + 1}`, title, unitNumber: units.length + 1, groupTitle: group || undefined, lessons: [] };
      units.push(unit);
      lesson = null;
    } else if (h2) {
      if (!unit) {
        unit = { id: `unit_${units.length + 1}`, title: `الوحدة ${units.length + 1}`, unitNumber: units.length + 1, lessons: [] };
        units.push(unit);
      }
      const n = unit.lessons.length + 1;
      lesson = { id: `lesson_${unit.unitNumber}_${n}`, title: h2[1].trim(), lessonNumber: n, unitTitle: unit.title, unitId: unit.id, subtopics: [] };
      unit.lessons.push(lesson);
    } else if (h3 && lesson && lesson.subtopics!.length < MAX_SUBTOPICS) {
      const sub = h3[1].trim();
      if (!lesson.subtopics!.includes(sub)) lesson.subtopics!.push(sub);
    }
  }
  return units.filter((u) => u.lessons.length > 0);
}

const structureCache = new Map<string, { result: CurriculumStructureResult; time: number }>();
const STRUCTURE_CACHE_TTL_MS = 30000; // 30 seconds fallback

export function invalidateStructureCache() {
  structureCache.clear();
}

const normalizedTextCache = new Map<string, string>();

registerCurriculumInvalidator(() => {
  structureCache.clear();
  normalizedTextCache.clear();
});

/**
 * Whether a concept phrase appears anywhere in the curriculum's textbook text. Used as a deterministic
 * scope check when the query classifier could not place a question in any lesson.
 */
export async function curriculumTextContains(curriculumId: string, phrase: string): Promise<boolean> {
  const target = normalize(phrase).replace(/^ال/, '');
  if (target.length < 3) return true;
  let text = normalizedTextCache.get(curriculumId);
  if (text === undefined) {
    const detail = await db.getCurriculumDetail(curriculumId);
    text = normalize(detail?.content || '');
    if (text) normalizedTextCache.set(curriculumId, text);
  }
  return !text || text.includes(target);
}

/**
 * Retrieves the manual curriculum structure for a given grade level and subject name
 */
export async function getCurriculumStructure(
  gradeLevel: string,
  subjectName: string
): Promise<CurriculumStructureResult> {
  const cleanGrade = gradeLevel.trim();
  const cleanSubject = subjectName.trim();
  const cacheKey = `${cleanGrade}_${cleanSubject}`;
  const cached = structureCache.get(cacheKey);
  if (cached && (Date.now() - cached.time < STRUCTURE_CACHE_TTL_MS)) {
    return cached.result;
  }

  try {
    const targetCurr = await findCurriculumFor(cleanGrade, cleanSubject);
    if (!targetCurr) {
      return { hasCurriculum: false, gradeLevel: cleanGrade, subjectName: cleanSubject, units: [], totalLessons: 0 };
    }

    const rawUnits = Array.isArray(targetCurr.units) ? targetCurr.units : [];
    let units: CurriculumUnit[] = rawUnits.map((u, uIdx) => {
      const unitNumber = u.unitNumber || (uIdx + 1);
      const unitId = u.id || `unit_${unitNumber}`;
      const unitTitle = u.title || `الوحدة ${unitNumber}`;
      const lessons: CurriculumLesson[] = (Array.isArray(u.lessons) ? u.lessons : []).map((l, lIdx) => ({
        id: l.id || `lesson_${unitNumber}_${l.lessonNumber || (lIdx + 1)}`,
        title: l.title || `الدرس ${l.lessonNumber || (lIdx + 1)}`,
        lessonNumber: l.lessonNumber || (lIdx + 1),
        unitTitle,
        unitId,
        subtopics: Array.isArray(l.subtopics) ? l.subtopics : [],
        startPage: l.startPage
      }));
      return { id: unitId, title: unitTitle, unitNumber, groupTitle: u.groupTitle, startPage: u.startPage, lessons };
    });

    // Curricula without an authored lesson map use the one encoded in their Markdown headings
    if (units.every(u => u.lessons.length === 0)) {
      const detail = await db.getCurriculumDetail(targetCurr.id).catch(() => null);
      units = parseCurriculumOutline(detail?.content || '');
    }

    const totalLessons = units.reduce((acc, u) => acc + u.lessons.length, 0);

    const result: CurriculumStructureResult = {
      hasCurriculum: true,
      curriculumId: targetCurr.id,
      gradeLevel: cleanGrade,
      subjectName: cleanSubject,
      units,
      totalLessons
    };

    structureCache.set(cacheKey, { result, time: Date.now() });
    return result;
  } catch (err) {
    console.error('getCurriculumStructure error:', err);
    return {
      hasCurriculum: false,
      gradeLevel: cleanGrade,
      subjectName: cleanSubject,
      units: [],
      totalLessons: 0
    };
  }
}

/**
 * Retrieves targeted textbook context for a selected lesson or topic to inject into AI prompt
 */
/**
 * Resolves a matching lesson from a user query against the curriculum units structure
 */
export async function findMatchingLessonInCurriculum(
  gradeLevel: string,
  subjectName: string,
  queryText: string
): Promise<{ lesson: CurriculumLesson; unit: CurriculumUnit } | null> {
  if (!queryText || !queryText.trim()) return null;

  const structure = await getCurriculumStructure(gradeLevel, subjectName);
  if (!structure.hasCurriculum || structure.units.length === 0) return null;

  const normQuery = normalize(queryText);

  // 1. Check relative unit & lesson numbers (e.g. "الدرس الأول في الوحدة الثانية", "الدرس الثاني", "اول درس", "للدرس الاول")
  const lessonNumMatch = normQuery.match(/(?:الدرس|للدرس|فدرس|درس|بدرس)\s+(الاول[يه]?|الثاني[ه]?|التاني[ه]?|الثالث[ه]?|التالت[ه]?|الرابع[ه]?|الخامس[ه]?|السادس[ه]?|السابع[ه]?|الثامن[ه]?|التاسع[ه]?|العاشر[ه]?|[0-9]+)/) ||
    normQuery.match(/(اول|أول|ثاني|تاني|ثالث|تالت|رابع|خامس)\s+درس/);
  const unitNumMatch = normQuery.match(/(?:الوحد[هة]|للوحد[هة]|بالوحد[هة]|وحد[هة]|الفصل|الباب)\s+(الاول[يه]?|الثاني[ه]?|التاني[ه]?|الثالث[ه]?|التالت[ه]?|الرابع[ه]?|الخامس[ه]?|السادس[ه]?|[0-9]+)/) ||
    normQuery.match(/(اول|أول|ثاني|تاني|ثالث|تالت|رابع|خامس)\s+وحد[هة]/);

  const numMap: Record<string, number> = {
    'الاول': 1, 'الاولى': 1, 'الاولي': 1, 'اول': 1, 'أول': 1, '1': 1, '١': 1,
    'الثاني': 2, 'الثانيه': 2, 'ثاني': 2, 'التاني': 2, 'التانيه': 2, 'تاني': 2, '2': 2, '٢': 2,
    'الثالث': 3, 'الثالثه': 3, 'ثالث': 3, 'التالت': 3, 'التالته': 3, 'تالت': 3, '3': 3, '٣': 3,
    'الرابع': 4, 'الرابعه': 4, 'رابع': 4, '4': 4, '٤': 4,
    'الخامس': 5, 'الخامسه': 5, 'خامس': 5, '5': 5, '٥': 5,
    'السادس': 6, 'السادسه': 6, 'سادس': 6, '6': 6, '٦': 6,
    'السابع': 7, 'السابعه': 7, 'سابع': 7, '7': 7, '٧': 7,
    'الثامن': 8, 'الثامنه': 8, 'ثامن': 8, '8': 8, '٨': 8,
    'التاسع': 9, 'التاسعه': 9, 'تاسع': 9, '9': 9, '٩': 9,
    'العاشر': 10, 'العاشره': 10, 'عاشر': 10, '10': 10, '١٠': 10
  };

  const targetLessonNum = lessonNumMatch ? numMap[lessonNumMatch[1]] : undefined;
  const targetUnitNum = unitNumMatch ? numMap[unitNumMatch[1]] : undefined;

  if (targetLessonNum !== undefined) {
    if (targetUnitNum !== undefined) {
      const u = structure.units.find(unit => unit.unitNumber === targetUnitNum);
      if (u) {
        const l = u.lessons.find(lesson => lesson.lessonNumber === targetLessonNum);
        if (l) return { lesson: l, unit: u };
      }
    } else {
      // Check first unit with this lesson number or single unit match
      for (const u of structure.units) {
        const l = u.lessons.find(lesson => lesson.lessonNumber === targetLessonNum);
        if (l) return { lesson: l, unit: u };
      }
    }
  }

  // 2. Title-word overlap. Only meaningful words count, so structural words such as "الدرس" or
  // ordinals ("الثاني") cannot pull an unrelated lesson into a query like "قانون نيوتن الثاني".
  const querySig = new Set(significantWords(queryText));
  if (querySig.size === 0) return null;
  let bestMatch: { lesson: CurriculumLesson; unit: CurriculumUnit; score: number } | null = null;

  for (const unit of structure.units) {
    for (const lesson of unit.lessons) {
      const subtitle = normalize(lessonSubtitle(lesson.title));
      const titleSig = significantWords(lessonSubtitle(lesson.title));
      const titleHits = titleSig.filter(w => querySig.has(w)).length;
      const included = subtitle.length > 3 && normQuery.includes(subtitle);
      const subtopicHits = [...querySig].filter(w =>
        (lesson.subtopics || []).some(sub => significantWords(sub).includes(w))
      ).length;

      if (!included && titleHits < 2 && !(titleHits === 1 && titleSig.length <= 2)) continue;
      const score = (included ? 50 : 0) + titleHits * 10 + subtopicHits * 3 - titleSig.length;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { lesson, unit, score };
      }
    }
  }

  return bestMatch ? { lesson: bestMatch.lesson, unit: bestMatch.unit } : null;
}

const ORDINALS: Record<string, number> = {
  'الاول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5, 'السادس': 6,
  'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10, 'الحادي عشر': 11, 'الثاني عشر': 12
};
const MAX_LESSON_CONTEXT_CHARS = 30000;

const NON_TOPIC_WORDS = new Set([
  'درس', 'دروس', 'وحده', 'فصل', 'باب', 'اول', 'اولي', 'ثاني', 'ثانيه', 'تاني', 'تانيه', 'ثالث', 'ثالثه',
  'تالت', 'تالته', 'رابع', 'رابعه', 'خامس', 'سادس', 'سابع', 'ثامن', 'تاسع', 'عاشر', 'شرح', 'اشرح',
  'اشرحلي', 'اشرحلنا', 'عايز', 'عاوز', 'ممكن', 'كامل', 'بالكامل', 'بالتفصيل', 'تفصيل', 'شامل', 'لو', 'سمحت',
  'فضلك', 'يعني', 'ايه', 'ازاي', 'ليه', 'لماذا', 'كيف', 'ما', 'هو', 'هي', 'في', 'من', 'عن', 'علي', 'الي'
]);

function significantWords(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .map(w => w.replace(/^(?:وال|بال|فال|كال|لل|ال|و)(?=.{3,})/, ''))
    .filter(w => w.length > 2 && !NON_TOPIC_WORDS.has(w) && !/^\d+$/.test(w));
}

function lessonSubtitle(heading: string): string {
  const idx = heading.search(/[:：]/);
  return idx >= 0 ? heading.slice(idx + 1) : heading.replace(/^#+\s*الدرس\s+\S+\s*/, '');
}

function parseLessonNumber(heading: string): number | undefined {
  const m = normalize(heading).match(/الدرس\s+(\d+|الحادي عشر|الثاني عشر|[^\s]+)/);
  if (!m) return undefined;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : ORDINALS[m[1]];
}

/**
 * Pulls every "## " block that belongs to a lesson out of the raw textbook markdown. Generated
 * curricula repeat a lesson heading across several blocks and do not always mark unit headings,
 * so blocks are matched by title-word overlap first and by (unit, lesson) numbering second.
 */
export function extractLessonBlocks(markdown: string, lessonTitle: string, unitNumber: number, lessonNumber: number): string {
  const lines = markdown.split('\n');
  const blocks: { heading: string; start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) {
      if (blocks.length) blocks[blocks.length - 1].end = i;
      blocks.push({ heading: lines[i], start: i, end: lines.length });
    }
  }
  const lessonBlocks = blocks.filter(b => /^##\s/.test(b.heading));
  const targetWords = new Set(significantWords(lessonSubtitle(lessonTitle)));

  const scored = lessonBlocks.map(b => {
    const words = significantWords(lessonSubtitle(b.heading.replace(/^#+\s*/, '')));
    const hits = words.filter(w => targetWords.has(w)).length;
    return { b, score: words.length ? hits / words.length : 0, hits };
  });
  const best = Math.max(0, ...scored.map(s => s.score));
  const selected = best >= 0.6 ? scored.filter(s => s.score >= best - 1e-9 && s.hits > 0).map(s => s.b) : [];

  if (selected.length === 0) {
    let unit = 0;
    let prev = Infinity;
    for (const b of lessonBlocks) {
      const n = parseLessonNumber(b.heading);
      if (n === undefined) continue;
      if (n <= prev) unit++;
      prev = n;
      const words = significantWords(lessonSubtitle(b.heading.replace(/^#+\s*/, '')));
      const related = words.length === 0 || words.some(w => targetWords.has(w));
      if (unit === unitNumber && n === lessonNumber && related) selected.push(b);
    }
  }

  return selected
    .map(b => lines.slice(b.start, b.end).join('\n').trim())
    .join('\n\n')
    .slice(0, MAX_LESSON_CONTEXT_CHARS);
}

/**
 * Retrieves the complete, exhaustive textbook context for a lesson without any omission or chunk truncation
 */
export async function getExhaustiveLessonContext(
  gradeLevel: string,
  subjectName: string,
  lessonQuery: string
): Promise<{
  success: boolean;
  lessonTitle: string;
  unitTitle: string;
  subtopics: string[];
  contextText: string;
}> {
  const cleanGrade = gradeLevel.trim();
  const cleanSubject = subjectName.trim();
  const query = lessonQuery.trim();

  try {
    const targetCurr = await findCurriculumFor(cleanGrade, cleanSubject);

    if (!targetCurr) {
      return { success: false, lessonTitle: query, unitTitle: '', subtopics: [], contextText: '' };
    }

    const matched = await findMatchingLessonInCurriculum(cleanGrade, cleanSubject, query);
    const resolvedLessonTitle = matched?.lesson?.title || query;
    const resolvedUnitTitle = matched?.unit?.title || '';
    const subtopics = matched?.lesson?.subtopics || [];

    const normTarget = normalize(lessonSubtitle(resolvedLessonTitle));
    const normTargetWords = significantWords(lessonSubtitle(resolvedLessonTitle));

    let fullExtractedContent = '';
    const collectedSections: string[] = [];

    // Strategy 1: Extract the lesson's own "## " blocks from the raw textbook markdown
    const detail = matched ? await db.getCurriculumDetail(targetCurr.id) : null;
    if (matched && detail?.content) {
      fullExtractedContent = extractLessonBlocks(detail.content, matched.lesson.title, matched.unit.unitNumber, matched.lesson.lessonNumber);
    }

    // Strategy 2: Only collect parent chunks if Strategy 1 did not yield complete content
    if (matched && (!fullExtractedContent || fullExtractedContent.length < 300)) {
      const allChunks = await db.getAllChunksForCurriculum(cleanGrade, cleanSubject).catch(() => []);
      const parentChunks = allChunks.filter(c => c.chunk_level === 'parent');

      const targetSig = significantWords(lessonSubtitle(resolvedLessonTitle));
      const matchingParentChunks = parentChunks.filter(chunk => {
        const headingSig = significantWords(chunk.heading);
        return targetSig.length > 0 && targetSig.filter(w => headingSig.includes(w)).length >= Math.min(2, targetSig.length);
      });

      if (matchingParentChunks.length > 0) {
        matchingParentChunks.sort((a, b) => (a.position_index ?? 0) - (b.position_index ?? 0));
        for (const chunk of matchingParentChunks) {
          collectedSections.push(`### [${chunk.heading}]\n${chunk.content}`);
        }
      }
    }

    // Strategy 3: Retrieve Knowledge Graph entities & laws
    let graphContext = '';
    try {
      const graphData = matched ? await db.getCurriculumGraph(cleanGrade, cleanSubject) : null;
      if (graphData && Array.isArray(graphData.entities) && graphData.entities.length > 0) {
        const relevantEntities = graphData.entities.filter(e => {
          const normName = normalize(e.name);
          const normDesc = normalize(e.description || '');
          const hits = normTargetWords.filter(w => normName.includes(w) || normDesc.includes(w)).length;
          return normTarget.includes(normName) || normName.includes(normTarget) || hits >= Math.min(2, normTargetWords.length);
        });

        if (relevantEntities.length > 0) {
          graphContext = relevantEntities.slice(0, 15).map(e => {
            return `* [${e.category.toUpperCase()}] **${e.name}**: ${e.description}`;
          }).join('\n');
        }
      }
    } catch (_) {}

    // Assemble comprehensive lesson context
    const parts: string[] = [];

    parts.push(`=== خريطة ومحاور الدرس الكاملة (لشرح شامل دون إغفال أي تفصيلة) ===
عنوان الدرس: ${resolvedLessonTitle}
${resolvedUnitTitle ? `الوحدة الدراسية: ${resolvedUnitTitle}` : ''}
${subtopics.length > 0 ? `المحاور والمفاهيم والعناصر الأساسية المقررة بالمنهج:\n${subtopics.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}` : ''}`);

    if (fullExtractedContent && collectedSections.length > 0) {
      parts.push(`=== النص الكامل للدرس من الكتاب المدرسي المعتمد (شامل كل القوانين، الأنشطة، والتعريفات) ===\n${fullExtractedContent}`);
      const extraChunks = collectedSections.filter(cs => !fullExtractedContent.includes(cs.slice(0, 50)));
      if (extraChunks.length > 0) {
        parts.push(`=== محاور وفقرات تكميلية إضافية خاصة بالدرس ===\n${extraChunks.join('\n\n')}`);
      }
    } else if (fullExtractedContent) {
      parts.push(`=== النص الكامل للدرس من الكتاب المدرسي المعتمد (شامل كل القوانين، الأنشطة، والتعريفات) ===\n${fullExtractedContent}`);
    } else if (collectedSections.length > 0) {
      parts.push(`=== النص الكامل للدرس من الكتاب المدرسي المعتمد (شامل كل القوانين، الأنشطة، والتعريفات) ===\n${collectedSections.join('\n\n')}`);
    }

    if (graphContext) {
      parts.push(`=== شبكة المفاهيم والقوانين والمصطلحات المرتبطة بالدرس (GraphRAG) ===\n${graphContext}`);
    }

    const contextText = parts.join('\n\n');
    const lessonTextLength = fullExtractedContent.length + collectedSections.join('').length;

    return {
      success: !!matched && lessonTextLength >= 300,
      lessonTitle: resolvedLessonTitle,
      unitTitle: resolvedUnitTitle,
      subtopics,
      contextText
    };
  } catch (err) {
    console.error('getExhaustiveLessonContext error:', err);
    return { success: false, lessonTitle: lessonQuery, unitTitle: '', subtopics: [], contextText: '' };
  }
}

/**
 * Retrieves targeted textbook context for a selected lesson or topic to inject into AI prompt
 */
export async function getCurriculumContextForLesson(
  gradeLevel: string,
  subjectName: string,
  lessonTitleOrTopic: string
): Promise<string> {
  if (!lessonTitleOrTopic || !lessonTitleOrTopic.trim()) return '';

  const cleanGrade = gradeLevel.trim();
  const cleanSubject = subjectName.trim();
  const query = lessonTitleOrTopic.trim();

  try {
    // 1. Try exhaustive lesson retrieval first
    const exhaustive = await getExhaustiveLessonContext(cleanGrade, cleanSubject, query);
    if (exhaustive.success && exhaustive.contextText.length > 100) {
      return exhaustive.contextText;
    }

    const targetCurr = await findCurriculumFor(cleanGrade, cleanSubject);

    if (!targetCurr) return '';

    // If query is broad (e.g. 'المنهج بالكامل'), return top summary and content outline
    if (query === 'المنهج بالكامل' || query === 'مراجعة المنهج بالكامل') {
      const summary = await db.getCurriculumSummary(cleanGrade, cleanSubject);
      const detail = await db.getCurriculumDetail(targetCurr.id);
      if (summary && detail?.content) {
        return `ملخص المنهج:\n${summary}\n\nمقتطفات من المنهج:\n${detail.content.slice(0, 8000)}`;
      }
      return detail?.content ? detail.content.slice(0, 9000) : '';
    }

    const normQuery = normalize(query);
    const queryWords = normQuery.split(' ').filter(w => w.length > 2);

    // 2. Try BM25 search over curriculum chunks for targeted sections
    const matchingChildChunks = await db.bm25SearchCurriculum(
      cleanGrade,
      cleanSubject,
      queryWords.length > 0 ? queryWords : [query],
      []
    );

    if (matchingChildChunks && matchingChildChunks.length > 0) {
      const parentIds = [...new Set(
        matchingChildChunks
          .map(c => c.parent_id)
          .filter((id): id is string => !!id)
      )];

      let parentSections: any[] = [];
      if (parentIds.length > 0) {
        parentSections = await db.getParentChunks(parentIds);
      }
      if (parentSections.length === 0) {
        parentSections = matchingChildChunks;
      }

      if (parentSections.length > 0) {
        return parentSections
          .map((p, idx) => `--- القسم ${idx + 1}: [${p.heading}] ---\n${p.content}`)
          .join('\n\n');
      }
    }

    // 3. Fallback to detail content section splitting
    const detail = await db.getCurriculumDetail(targetCurr.id);
    if (!detail || !detail.content) return '';

    const rawSections = detail.content.split(/\n(?=#+\s)/);
    
    // Direct section heading match
    const exactMatches = rawSections.filter(sec => {
      const firstLine = sec.split('\n')[0] || '';
      const normHeading = normalize(firstLine);
      return normHeading.includes(normQuery) || normQuery.includes(normHeading);
    });

    if (exactMatches.length > 0) {
      return exactMatches.join('\n\n');
    }

    // Keyword relevance match
    const scoredSections = rawSections.map(sec => {
      const firstLine = sec.split('\n')[0] || '';
      const normHeading = normalize(firstLine);
      const normBody = normalize(sec);
      let score = 0;

      for (const word of queryWords) {
        if (normHeading.includes(word)) score += 12;
        if (normBody.includes(word)) score += 3;
      }
      return { section: sec, score };
    });

    scoredSections.sort((a, b) => b.score - a.score);
    const topSections = scoredSections.filter(s => s.score > 0).slice(0, 8);

    if (topSections.length > 0) {
      return topSections.map(s => s.section).join('\n\n');
    }

    return detail.content.slice(0, 8000);
  } catch (err) {
    console.error('getCurriculumContextForLesson error:', err);
    return '';
  }
}
