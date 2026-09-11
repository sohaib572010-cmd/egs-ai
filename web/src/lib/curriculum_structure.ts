import { db } from './db';

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

const structureCache = new Map<string, { result: CurriculumStructureResult; time: number }>();
const STRUCTURE_CACHE_TTL_MS = 300000; // 5 minutes (curriculums are static)

export function invalidateStructureCache() {
  structureCache.clear();
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
    const curriculums = await db.getCurriculums();
    let targetCurr = curriculums.find(
      c => c.grade_level === cleanGrade && c.subject_name === cleanSubject
    );

    // Dynamic alias fallback for 2_high History
    if (!targetCurr && cleanGrade === '2_high' && (cleanSubject === 'التاريخ' || cleanSubject === 'تاريخ' || cleanSubject === 'التاريخ المصري')) {
      targetCurr = curriculums.find(
        c => c.grade_level === '2_high' && (c.subject_name === 'التاريخ المصري' || c.subject_name === 'التاريخ')
      );
    }

    // Dynamic alias fallback for 2_high Physics
    if (!targetCurr && cleanGrade === '2_high' && (cleanSubject === 'الفيزياء' || cleanSubject === 'فيزياء')) {
      targetCurr = curriculums.find(
        c => c.grade_level === '2_high' && (c.subject_name === 'الفيزياء' || c.subject_name === 'فيزياء')
      );
    }

    // Dynamic alias fallback for 2_high Mathematics
    if (!targetCurr && cleanGrade === '2_high' && (cleanSubject === 'الرياضيات' || cleanSubject === 'رياضيات')) {
      targetCurr = curriculums.find(
        c => c.grade_level === '2_high' && (c.subject_name === 'الرياضيات' || c.subject_name === 'رياضيات')
      );
    }

    if (!targetCurr) {
      return {
        hasCurriculum: false,
        gradeLevel: cleanGrade,
        subjectName: cleanSubject,
        units: [],
        totalLessons: 0
      };
    }

    const rawUnits = Array.isArray(targetCurr.units) ? targetCurr.units : [];
    
    let units: CurriculumUnit[] = [];

    if (rawUnits.length > 0) {
      // Format and normalize units & lessons from rawUnits
      units = rawUnits.map((u, uIdx) => {
        const unitNumber = u.unitNumber || (uIdx + 1);
        const unitId = u.id || `unit_${unitNumber}`;
        const unitTitle = u.title || `الوحدة ${unitNumber}`;
        const rawLessons = Array.isArray(u.lessons) ? u.lessons : [];

        const lessons: CurriculumLesson[] = rawLessons.map((l, lIdx) => ({
          id: l.id || `lesson_${unitNumber}_${l.lessonNumber || (lIdx + 1)}`,
          title: l.title || `الدرس ${l.lessonNumber || (lIdx + 1)}`,
          lessonNumber: l.lessonNumber || (lIdx + 1),
          unitTitle: unitTitle,
          unitId: unitId,
          subtopics: Array.isArray(l.subtopics) ? l.subtopics : [],
          startPage: l.startPage
        }));

        return {
          id: unitId,
          title: unitTitle,
          unitNumber: unitNumber,
          startPage: u.startPage,
          lessons
        };
      });
    }

    // Dynamic fallback: If units array is empty, extract units and lessons from the curriculum detail markdown
    if (units.length === 0 || units.every(u => u.lessons.length === 0)) {
      try {
        const detail = await db.getCurriculumDetail(targetCurr.id);
        if (detail && detail.content) {
          const lines = detail.content.split('\n');
          let currentUnit: CurriculumUnit | null = null;
          let currentLesson: CurriculumLesson | null = null;
          let unitCounter = 0;
          let lessonCounter = 0;
          const parsedUnits: CurriculumUnit[] = [];

          for (const line of lines) {
            const trimmed = line.trim();
            const unitMatch = trimmed.match(/^#\s+(.+)$/);
            const lessonMatch = trimmed.match(/^##\s+(.+)$/);
            const subMatch = trimmed.match(/^###\s+(.+)$/);

            if (unitMatch) {
              const title = unitMatch[1].trim();
              if (!title.startsWith('__') && !title.startsWith('---') && !title.startsWith('منهج')) {
                unitCounter++;
                lessonCounter = 0;
                currentUnit = {
                  id: `unit_${unitCounter}`,
                  title: title,
                  unitNumber: unitCounter,
                  lessons: []
                };
                parsedUnits.push(currentUnit);
                currentLesson = null;
              }
            } else if (lessonMatch) {
              const title = lessonMatch[1].trim();
              if (!currentUnit) {
                unitCounter++;
                currentUnit = {
                  id: `unit_${unitCounter}`,
                  title: `الوحدة ${unitCounter}`,
                  unitNumber: unitCounter,
                  lessons: []
                };
                parsedUnits.push(currentUnit);
              }
              lessonCounter++;
              currentLesson = {
                id: `lesson_${currentUnit.unitNumber}_${lessonCounter}`,
                title: title,
                lessonNumber: lessonCounter,
                unitTitle: currentUnit.title,
                unitId: currentUnit.id,
                subtopics: []
              };
              currentUnit.lessons.push(currentLesson);
            } else if (subMatch && currentLesson) {
              const subTitle = subMatch[1].trim();
              if (subTitle && !currentLesson.subtopics?.includes(subTitle)) {
                currentLesson.subtopics?.push(subTitle);
              }
            }
          }

          if (parsedUnits.length > 0) {
            units = parsedUnits;
          }
        }
      } catch (parseErr) {
        console.warn('Dynamic curriculum structure parsing notice:', parseErr);
      }
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
  const queryWords = normQuery.split(/\s+/).filter(w => w.length > 2);

  // 1. Check relative unit & lesson numbers (e.g. "الدرس الأول في الوحدة الثانية", "الدرس الثاني", "اول درس", "للدرس الاول")
  const lessonNumMatch = normQuery.match(/(?:الدرس|للدرس|فدرس|درس|بدرس)\s+(الاول[يه]?|الثاني[ه]?|الثالث[ه]?|الرابع[ه]?|الخامس[ه]?|السادس[ه]?|السابع[ه]?|الثامن[ه]?|التاسع[ه]?|العاشر[ه]?|[0-9]+)/) ||
    normQuery.match(/(اول|أول|ثاني|ثالث|رابع|خامس)\s+درس/);
  const unitNumMatch = normQuery.match(/(?:الوحد[هة]|للوحد[هة]|بالوحد[هة]|وحد[هة])\s+(الاول[يه]?|الثاني[ه]?|الثالث[ه]?|الرابع[ه]?|الخامس[ه]?|السادس[ه]?|[0-9]+)/) ||
    normQuery.match(/(اول|أول|ثاني|ثالث|رابع|خامس)\s+وحد[هة]/);

  const numMap: Record<string, number> = {
    'الاول': 1, 'الاولى': 1, 'الاولي': 1, 'اول': 1, 'أول': 1, '1': 1, '١': 1,
    'الثاني': 2, 'الثانيه': 2, 'ثاني': 2, '2': 2, '٢': 2,
    'الثالث': 3, 'الثالثه': 3, 'ثالث': 3, '3': 3, '٣': 3,
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

  // 2. Direct string inclusion / keyword overlap against lesson titles and subtitles
  let bestMatch: { lesson: CurriculumLesson; unit: CurriculumUnit; score: number } | null = null;

  for (const unit of structure.units) {
    for (const lesson of unit.lessons) {
      const normTitle = normalize(lesson.title);
      const titleParts = lesson.title.split(/[:：\-]/);
      const subtitle = titleParts.length > 1 ? normalize(titleParts.slice(1).join(' ')) : '';
      let score = 0;

      if (normQuery.includes(normTitle) || normTitle.includes(normQuery)) {
        score += 50;
      }
      if (subtitle && (normQuery.includes(subtitle) || subtitle.includes(normQuery))) {
        score += 60;
      }

      const titleWords = normTitle.split(/\s+/).filter(w => w.length > 2);
      for (const word of queryWords) {
        if (titleWords.includes(word)) score += 10;
        else if (normTitle.includes(word)) score += 5;
      }

      // Check subtopics
      if (Array.isArray(lesson.subtopics)) {
        for (const sub of lesson.subtopics) {
          const normSub = normalize(sub);
          for (const word of queryWords) {
            if (normSub.includes(word)) score += 6;
          }
        }
      }

      if (score > 15 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { lesson, unit, score };
      }
    }
  }

  return bestMatch ? { lesson: bestMatch.lesson, unit: bestMatch.unit } : null;
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
    const curriculums = await db.getCurriculums();
    let targetCurr = curriculums.find(
      c => c.grade_level === cleanGrade && c.subject_name === cleanSubject
    );

    if (!targetCurr && cleanGrade === '2_high' && (cleanSubject === 'التاريخ' || cleanSubject === 'تاريخ' || cleanSubject === 'التاريخ المصري')) {
      targetCurr = curriculums.find(
        c => c.grade_level === '2_high' && (c.subject_name === 'التاريخ المصري' || c.subject_name === 'التاريخ')
      );
    }

    if (!targetCurr && cleanGrade === '2_high' && (cleanSubject === 'الفيزياء' || cleanSubject === 'فيزياء')) {
      targetCurr = curriculums.find(
        c => c.grade_level === '2_high' && (c.subject_name === 'الفيزياء' || c.subject_name === 'فيزياء')
      );
    }

    if (!targetCurr && cleanGrade === '2_high' && (cleanSubject === 'الرياضيات' || cleanSubject === 'رياضيات')) {
      targetCurr = curriculums.find(
        c => c.grade_level === '2_high' && (c.subject_name === 'الرياضيات' || c.subject_name === 'رياضيات')
      );
    }

    if (!targetCurr) {
      return { success: false, lessonTitle: query, unitTitle: '', subtopics: [], contextText: '' };
    }

    const matched = await findMatchingLessonInCurriculum(cleanGrade, cleanSubject, query);
    const resolvedLessonTitle = matched?.lesson?.title || query;
    const resolvedUnitTitle = matched?.unit?.title || '';
    const subtopics = matched?.lesson?.subtopics || [];

    const normTarget = normalize(resolvedLessonTitle);
    const normTargetWords = normTarget.split(/\s+/).filter(w => w.length > 2);

    let fullExtractedContent = '';
    const collectedSections: string[] = [];

    // Strategy 1: Extract complete continuous markdown block from curriculum detail (from ## Lesson to next ## Lesson)
    const detail = await db.getCurriculumDetail(targetCurr.id);
    if (detail && detail.content) {
      const rawContent = detail.content;
      // Split by Level 1 or Level 2 headings: # or ##
      const sections = rawContent.split(/\n(?=#{1,2}\s)/);
      let foundLessonSectionIndex = -1;

      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        const firstLine = normalize(sec.split('\n')[0] || '');
        if (
          firstLine.includes(normTarget) ||
          normTarget.includes(firstLine) ||
          (normTargetWords.length >= 2 && normTargetWords.filter(w => firstLine.includes(w)).length >= 2) ||
          (matched?.lesson?.lessonNumber && (
            firstLine.includes(`الدرس ${matched.lesson.lessonNumber}`) ||
            firstLine.includes(`الدرس ${matched.lesson.lessonNumber === 1 ? 'الاول' : matched.lesson.lessonNumber === 2 ? 'الثاني' : matched.lesson.lessonNumber === 3 ? 'الثالث' : ''}`)
          ))
        ) {
          foundLessonSectionIndex = i;
          break;
        }
      }

      if (foundLessonSectionIndex !== -1) {
        // Collect this section and all subsequent sections belonging to this lesson until the next distinct lesson or unit begins
        const lessonSections: string[] = [sections[foundLessonSectionIndex].trim()];
        for (let j = foundLessonSectionIndex + 1; j < sections.length; j++) {
          const nextSec = sections[j];
          const nextFirstLine = nextSec.split('\n')[0] || '';
          // Stop if a new unit or new distinct lesson begins
          if (/^#\s+(?:الوحدة|منهج|باب|الفصل)/i.test(nextFirstLine) ||
              /^##\s+(?:الدرس|الوحدة|الباب)/i.test(nextFirstLine)) {
            break;
          }
          lessonSections.push(nextSec.trim());
        }
        fullExtractedContent = lessonSections.join('\n\n').trim();
      }
    }

    // Strategy 2: Only collect parent chunks if Strategy 1 did not yield complete content
    if (!fullExtractedContent || fullExtractedContent.length < 300) {
      const allChunks = await db.getAllChunksForCurriculum(cleanGrade, cleanSubject).catch(() => []);
      const parentChunks = allChunks.filter(c => c.chunk_level === 'parent');

      const matchingParentChunks = parentChunks.filter(chunk => {
        const normHeading = normalize(chunk.heading);
        if (normHeading.includes(normTarget) || normTarget.includes(normHeading)) return true;
        if (normTargetWords.length >= 2) {
          const matchCount = normTargetWords.filter(w => normHeading.includes(w)).length;
          if (matchCount >= 2) return true;
        }
        return false;
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
      const graphData = await db.getCurriculumGraph(cleanGrade, cleanSubject);
      if (graphData && Array.isArray(graphData.entities) && graphData.entities.length > 0) {
        const relevantEntities = graphData.entities.filter(e => {
          const normName = normalize(e.name);
          const normDesc = normalize(e.description || '');
          return (
            normTarget.includes(normName) ||
            normName.includes(normTarget) ||
            normTargetWords.some(w => normName.includes(w) || normDesc.includes(w))
          );
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

    return {
      success: contextText.length > 50,
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

    const curriculums = await db.getCurriculums();
    let targetCurr = curriculums.find(
      c => c.grade_level === cleanGrade && c.subject_name === cleanSubject
    );

    if (!targetCurr && cleanGrade === '2_high' && (cleanSubject === 'التاريخ' || cleanSubject === 'تاريخ' || cleanSubject === 'التاريخ المصري')) {
      targetCurr = curriculums.find(
        c => c.grade_level === '2_high' && (c.subject_name === 'التاريخ المصري' || c.subject_name === 'التاريخ')
      );
    }

    if (!targetCurr && cleanGrade === '2_high' && (cleanSubject === 'الفيزياء' || cleanSubject === 'فيزياء')) {
      targetCurr = curriculums.find(
        c => c.grade_level === '2_high' && (c.subject_name === 'الفيزياء' || c.subject_name === 'فيزياء')
      );
    }

    if (!targetCurr && cleanGrade === '2_high' && (cleanSubject === 'الرياضيات' || cleanSubject === 'رياضيات')) {
      targetCurr = curriculums.find(
        c => c.grade_level === '2_high' && (c.subject_name === 'الرياضيات' || c.subject_name === 'رياضيات')
      );
    }

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
