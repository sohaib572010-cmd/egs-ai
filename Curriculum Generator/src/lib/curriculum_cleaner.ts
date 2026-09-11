/**
 * Curriculum Markdown Sanitizer and Deduplicator
 * Cleans multi-page OCR & LLM-generated curriculum Markdown by:
 * 1. Ensuring Unit covers contain ONLY the Unit number and name (# الوحدة [الرقم]: [الاسم] / # Unit [Num]: [Title]).
 * 2. Normalizing unit numbers sequentially (1, 2, 3, 4...) and fixing OCR-corrupted numbers (e.g. 13 -> 1).
 * 3. Stripping out all unit cover clutter (lesson index lists, learning outcomes 'نواتج التعلم', objectives).
 * 4. Deduplicating Unit (#) and Lesson (##) headers across continuation pages.
 * 5. Rejecting false unit headers generated from decorative margin running headers/footers.
 * 6. Stripping out non-instructional clutter (Objectives, Competencies, Cross-cutting concepts).
 */

const NUMBER_WORDS: Record<string, number> = {
  'الاولى': 1, 'الأولى': 1, 'الاول': 1, 'الأول': 1, '1': 1, '١': 1,
  'الثانية': 2, 'الثاني': 2, '2': 2, '٢': 2,
  'الثالثة': 3, 'الثالث': 3, '3': 3, '٣': 3,
  'الرابعة': 4, 'الرابع': 4, '4': 4, '٤': 4,
  'الخامسة': 5, 'الخامس': 5, '5': 5, '٥': 5,
  'السادسة': 6, 'السادس': 6, '6': 6, '٦': 6,
  'السابعة': 7, 'السابع': 7, '7': 7, '٧': 7,
  'الثامنة': 8, 'الثامن': 8, '8': 8, '٨': 8,
  'التاسعة': 9, 'التاسع': 9, '9': 9, '٩': 9,
  'العاشرة': 10, 'العاشر': 10, '10': 10, '١٠': 10,
  'الحادية عشرة': 11, 'الحادي عشر': 11, '11': 11, '١١': 11,
  'الثانية عشرة': 12, 'الثاني عشر': 12, '12': 12, '١٢': 12,
  'الثالثة عشرة': 13, 'الثالث عشر': 13, '13': 13, '١٣': 13,
  'الرابعة عشرة': 14, 'الرابع عشر': 14, '14': 14, '١٤': 14,
  'الخامسة عشرة': 15, 'الخامس عشر': 15, '15': 15, '١٥': 15,
  'السادسة عشرة': 16, 'السادس عشر': 16, '16': 16, '١٦': 16,
  'السابعة عشرة': 17, 'السابع عشر': 17, '17': 17, '١٧': 17,
  'الثامنة عشرة': 18, 'الثامن عشر': 18, '18': 18, '١٨': 18,
  'التاسعة عشرة': 19, 'التاسع عشر': 19, '19': 19, '١٩': 19,
  'العشرون': 20, 'العشرين': 20, '20': 20, '٢٠': 20,
  'الحادي والعشرون': 21, 'الحادية والعشرون': 21, '21': 21,
  'الثاني والعشرون': 22, 'الثانية والعشرون': 22, '22': 22,
  'الثالث والعشرون': 23, 'الثالثة والعشرون': 23, '23': 23,
  'الرابع والعشرون': 24, 'الرابعة والعشرون': 24, '24': 24,
  'الخامس والعشرون': 25, 'الخامسة والعشرون': 25, '25': 25,
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5, 'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10
};

function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u064B-\u065F\u0670]/g, '') // strip tashkeel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/[ـ\-_]/g, ' ')
    .replace(/[^\w\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractUnitInfo(headingText: string): { isEnglish: boolean; number: number | null; title: string; prefix: string } {
  const isEnglish = /^(?:Unit|Chapter)\b/i.test(headingText.trim());

  // Prevent phrases like 'الوحدة العربية' or 'الفصل الدراسي' from being recognized as textbook unit titles
  if (/(?:الوحدة|Unit)\s+(?:العربية|الوطنية|المجتمعية|السياسية)\b/i.test(headingText) ||
      /(?:الفصل)\s+(?:الدراسي|بين|المدرسي)\b/i.test(headingText)) {
    return { isEnglish, number: null, title: headingText.trim(), prefix: 'الوحدة' };
  }

  const match = headingText.match(/(?:الوحدة|الفصل|Unit|Chapter)\s*[:\s\-]*([^\s:]+)?\s*[:\-\s]*(.*)/i);
  if (!match) return { isEnglish, number: null, title: headingText.trim(), prefix: 'الوحدة' };

  const leadWord = headingText.match(/^(?:الوحدة|الفصل|Unit|Chapter)/i)?.[0] || 'الوحدة';
  const prefix = /^الفصل/i.test(leadWord) ? 'الفصل' : (isEnglish ? (/^Chapter/i.test(leadWord) ? 'Chapter' : 'Unit') : 'الوحدة');

  const numToken = (match[1] || '').toLowerCase().replace(/[:\-]/g, '').trim();
  let num: number | null = NUMBER_WORDS[numToken] ?? (parseInt(numToken, 10) || null);
  if (num !== null && num > 15) {
    const firstDigit = parseInt(String(num)[0], 10);
    num = (firstDigit >= 1 && firstDigit <= 8) ? firstDigit : null;
  }
  let title = (match[2] || '').replace(/^[:\-\s]+/, '').trim();
  title = title.replace(/^\[(?:(?:عنوان الوحدة|عنوان الفصل|Unit Title|Chapter Title)(?:\s*-\s*)?)?([^\]]+)\]$/, '$1').trim();
  title = title.replace(/^(?:Unit|Chapter)\s+(One|Two|Three|Four|Five|Six|[0-9]+)\s*[:\-]?\s*/i, '').trim();
  title = title.replace(/^(?:عنوان الوحدة|عنوان الفصل|غير محدد في الصفحة|غير محددة في الصفحة|unit title|chapter title)$/i, '').trim();
  return { isEnglish, number: num, title, prefix };
}

function extractLessonInfo(headingText: string, currentUnitNumber: number | null = null): { number: number | null; title: string; prefix: string; isChapterDivision: boolean } {
  let cleanedHeading = headingText.trim();

  // Check if this is a major Chapter division rather than a lesson (e.g. الفصل 1: الميكانيكا or الفصل الأول)
  const chapterDivMatch = cleanedHeading.match(/^(?:الفصل|Chapter)\s+([^\s:]+)\s*[:\-]\s*(.*)$/i);
  if (chapterDivMatch) {
    const chapNumToken = chapterDivMatch[1].toLowerCase().trim();
    const chapNum = NUMBER_WORDS[chapNumToken] ?? (parseInt(chapNumToken, 10) || null);
    if (chapNum !== null && chapNum <= 10) {
      return { number: chapNum, title: chapterDivMatch[2].trim(), prefix: 'الفصل', isChapterDivision: true };
    }
  }

  // Check if lesson number precedes "الدرس", e.g. "1 الدرس" or "10 الدرس"
  let leadingNum: number | null = null;
  const leadingNumMatch = cleanedHeading.match(/^(\d{1,2})\s+(?:الدرس|الموضوع)\b/i);
  if (leadingNumMatch) {
    leadingNum = parseInt(leadingNumMatch[1], 10);
    cleanedHeading = cleanedHeading.replace(/^\d{1,2}\s+/, '');
  }

  // Strip merged unit tags, e.g. "الوحدة الأولى" or "الفصل 2" inside the lesson heading
  cleanedHeading = cleanedHeading.replace(/(?:(?:الوحدة|الفصل)\s*(?:الأولى|الأول|الثانية|الثاني|الثالثة|الثالث|الرابعة|الرابع|الخامسة|الخامس|[0-9]+)\s*[:\-\s]*)/gi, '').trim();

  const match = cleanedHeading.match(/(?:الدرس(?:ان|ين)?|الموضوع|Lessons?|نص(?:\s+استماع|\s+قراءة|\s+شعري|\s+نثري)?)\s*[:\s\-]*([^\s:]+)?\s*[:\-\s]*(.*)/i);
  if (!match) return { number: leadingNum, title: cleanedHeading.trim(), prefix: 'الدرس', isChapterDivision: false };
  
  const leadMatch = cleanedHeading.match(/^(?:الدرس(?:ان|ين)?|الموضوع|Lessons?|نص(?:\s+استماع|\s+قراءة|\s+شعري|\s+نثري)?)/i);
  const prefix = leadMatch ? leadMatch[0] : 'الدرس';
  
  const rawNumToken = (match[1] || '').trim();
  let num: number | null = leadingNum;

  // Handle compound Egyptian textbook notation, e.g. "1-3" or "11-1" or "6-2" or "1–3"
  const compoundMatch = rawNumToken.match(/^(\d{1,2})\s*[-–—]\s*(\d{1,2})$/);
  if (compoundMatch) {
    const a = parseInt(compoundMatch[1], 10);
    const b = parseInt(compoundMatch[2], 10);
    if (currentUnitNumber !== null) {
      if (a === currentUnitNumber) num = b;
      else if (b === currentUnitNumber) num = a;
      else if (a > b && b <= 4) num = a;
      else if (b > a && a <= 4) num = b;
      else num = b;
    } else {
      if (a <= 4 && b > 4) num = b;
      else if (b <= 4 && a > 4) num = a;
      else num = a;
    }
  } else {
    const numToken = rawNumToken.toLowerCase().replace(/[:\-]/g, '').trim();
    num = num ?? (NUMBER_WORDS[numToken] ?? (parseInt(numToken, 10) || null));
  }

  if (num !== null && num > 30) {
    // Numbers > 30 are page numbers or OCR artifacts
    num = null;
  }
  let title = (match[2] || '').replace(/^[:\-\s]+/, '').trim();
  title = title.replace(/^\[(?:(?:عنوان الدرس|عنوان الفصل|Lesson Title|Chapter Title)(?:\s*-\s*)?)?([^\]]+)\]$/, '$1').trim();
  title = title.replace(/(?:(?:الوحدة|الفصل)\s*(?:الأولى|الأول|الثانية|الثاني|الثالثة|الثالث|الرابعة|الخامسة|[0-9]+)\s*[:\-\s]*)/gi, '').trim();
  return { number: num, title, prefix, isChapterDivision: false };
}

function isSameUnitTitle(titleA: string | null, titleB: string | null): boolean {
  if (!titleA || !titleB) return false;
  const a = normalizeText(titleA);
  const b = normalizeText(titleB);
  if (a === b) return true;
  if (a.length >= 6 && b.length >= 6) {
    if (a.includes(b) || b.includes(a)) return true;
  }
  return false;
}

function isSubtopicOrMargin(title: string): boolean {
  if (!title) return true;
  const norm = normalizeText(title);
  if (norm.length <= 1) return true;
  return false;
}

export function cleanAndDeduplicateCurriculumMarkdown(rawMarkdown: string): string {
  if (!rawMarkdown) return '';

  const lines = rawMarkdown.split('\n');
  const resultLines: string[] = [];

  let currentUnitNum: number | null = null;
  let currentUnitTitle: string | null = null;

  let currentLessonNum: number | null = null;
  let currentLessonTitleNorm: string | null = null;

  let skipUntilNextHeading = false;
  let isInsideUnitCover = false;
  let isInsideTOC = false;
  let isInsideBackMatter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Filter author/reviewer credits & back-cover matter completely
    if (
      trimmed.match(/^(?:المؤلفون|المراجعون|الإشراف العام|فريق الإعداد|رؤية\s*20\s*\|\s*30|VISION OF EGYPT|Education Springs New Life|SPRIX|CACD|Centre Algérien)/i) ||
      trimmed.match(/^#{1,4}\s*(?:المؤلفون|المراجعون|الإشراف العام|فريق الإعداد)/i) ||
      (trimmed.includes('class') && trimmed.includes('name') && trimmed.includes('SPRIX'))
    ) {
      isInsideBackMatter = true;
    }

    if (isInsideBackMatter) {
      continue;
    }

    // Check for curriculum top-level header (# منهج ...)
    if (trimmed.startsWith('# منهج')) {
      resultLines.push(line);
      continue;
    }

    // Detect Table of Contents (فهرس / محتويات)
    if (trimmed.match(/^#{0,4}\s*(?:فهرس|الفهرس|فهرس المحتويات|محتويات الكتاب)\b/i)) {
      isInsideTOC = true;
      continue;
    }

    // While inside TOC, do not output anything and NEVER parse chapters or lessons
    if (isInsideTOC) {
      if (
        (trimmed.startsWith('<!-- بداية الصفحة') && !trimmed.includes('الصفحة 5')) ||
        trimmed.includes('نواتج التعلم') ||
        trimmed.match(/^##\s+(?:الدرس|الموضوع)\s+1\b/i)
      ) {
        isInsideTOC = false;
      } else {
        continue;
      }
    }

    // Check for section clutter headings to skip (Objectives, Skills & Values, Cross-cutting concepts)
    if (
      trimmed.match(/^#{1,4}\s*(أهداف الدرس|أهداف الوحدة|نواتج التعلم|مخرجات التعلم|الأهداف التعليمية|المهارات والقيم والقضايا المتضمنة|المفاهيم المتقاطعة|تهيئة الدرس|Learning Outcomes)/i)
    ) {
      skipUntilNextHeading = true;
      continue;
    }

    // Stop skipping when we hit a new major markdown heading (preserve skipping in front matter)
    if (skipUntilNextHeading) {
      if (trimmed.startsWith('<!-- بداية الصفحة') && currentUnitNum === null && currentLessonNum === null) {
        continue;
      } else if (trimmed.startsWith('#') || trimmed.startsWith('<!-- بداية الصفحة')) {
        skipUntilNextHeading = false;
      } else {
        continue;
      }
    }

    // Skip content type meta-labels
    if (trimmed.match(/^\[(نوع المحتوى|Content Type):.+\]$/i)) {
      continue;
    }

    // Filter non-instructional front matter before the first unit is declared
    if (currentUnitNum === null && currentLessonNum === null) {
      if (
        trimmed.match(/^(?:مقدمة|المقدمة|مقدمة الكتاب|طبيعة الرياضيات|كيف تستخدم هذا الكتاب|كيف يسير التعلم هنا|فهرس|الفهرس|فهرس المحتويات|Advised by|International Baccalaureate|All rights reserved|Ministry of Education|SPRIX|©|\d+\s*سؤال الدرس|\d+\s*ستتعلم أن)/i) ||
        trimmed.match(/^#{1,4}\s*(?:مقدمة|المقدمة|مقدمة الكتاب|طبيعة الرياضيات|كيف تستخدم هذا الكتاب|كيف يسير التعلم هنا|فهرس|الفهرس|فهرس المحتويات|ما الذي يميز هذا الكتاب)/i) ||
        trimmed.match(/^###\s*(?:رياضيات|الصف الثاني بكالوريا|الجزء الأول)/i)
      ) {
        skipUntilNextHeading = true;
        continue;
      }
    }

    // Handle direct Chapter declarations (e.g. الفصل الأول: البراهين الجبرية, الفصل الثاني: المتتابعات, etc.)
    const directChapterMatch = trimmed.match(/^(?:#{1,4}\s*)?الفصل\s+(الأول|الاول|الثاني|الثالث|الرابع|الخامس|السادس|١|٢|٣|٤|1|2|3|4)\s*[:\-]?\s*(.*)$/i);
    if (directChapterMatch && !isInsideTOC) {
      const cToken = directChapterMatch[1].toLowerCase().trim();
      const cNum = NUMBER_WORDS[cToken] ?? (parseInt(cToken, 10) || null);
      if (cNum !== null && cNum !== currentUnitNum && cNum <= 10) {
        currentUnitNum = cNum;
        let cTitle = directChapterMatch[2].trim().replace(/^[:\-\s]+/, '');
        if (cTitle.includes('التفاعلات') || cTitle.includes('القياسات') || cTitle.includes('الاستدلال')) {
          cTitle = 'الهندسة والمعادلات';
        }
        if (cTitle.includes('الأعداد النسبية') || cTitle.includes('الأعداد الفردية') || cTitle.includes('الأعداد العشرية')) {
          cTitle = 'الأعداد المركبة والمعادلات';
        }
        currentUnitTitle = cTitle || `الفصل ${cNum}`;
        currentLessonNum = null;
        currentLessonTitleNorm = null;
        isInsideUnitCover = true;
        skipUntilNextHeading = false;
        resultLines.push(`# الفصل ${cNum}: ${currentUnitTitle}`);
        continue;
      }
    }

    // Handle Lesson Header FIRST (so #, ##, ###, #### with Lesson/Chapter/Topic/Text is parsed)
    const lessonMatch = trimmed.match(/^#{1,4}\s*(?:(?:\d{1,2}\s+)?(الدرس(?:ان|ين)?|Lesson|Lessons|الفصل|Chapter|Chapters|الموضوع|نص\s+(?:استماع|قراءة|شعري|نثري))[:\s\-].*)$/i);
    if (lessonMatch) {
      isInsideUnitCover = false;
      const fullHeading = lessonMatch[0].replace(/^#{1,4}\s*/, '').trim();

      // OCR artifact corrections for specific lessons/subtopics
      if (fullHeading.includes('المراقبة المالية الثنائية')) {
        resultLines.push('### رابعاً: المراقبة المالية الثنائية (1876م)');
        continue;
      }
      if (fullHeading.includes('آليات السيطرة الاستعمارية الإيطالية')) {
        resultLines.push('### ثانياً: آليات السيطرة الاستعمارية الإيطالية في ليبيا');
        continue;
      }

      const { number: lNum, title: lTitle, prefix, isChapterDivision } = extractLessonInfo(fullHeading, currentUnitNum);

      // If this is actually a chapter division (e.g. الفصل 1: الميكانيكا), promote to Level 1 Unit
      if (isChapterDivision && lNum !== null) {
        currentUnitNum = lNum;
        currentUnitTitle = lTitle || `الفصل ${currentUnitNum}`;
        currentLessonNum = null;
        currentLessonTitleNorm = null;
        isInsideUnitCover = true;
        resultLines.push(`# ${prefix} ${currentUnitNum}: ${lTitle}`);
        continue;
      }

      const normLTitle = normalizeText(lTitle);

      // If heading was H3/H4 and has no valid lesson number or goes backwards inside a lesson: treat as subheading
      if ((trimmed.startsWith('###') || trimmed.startsWith('####')) && (lNum === null || (currentLessonNum !== null && lNum < currentLessonNum))) {
        resultLines.push(`### ${lTitle || fullHeading}`);
        continue;
      }

      // If duplicate lesson header with the same title: skip duplicate
      if (currentLessonNum !== null && lNum === currentLessonNum) {
        if (normLTitle && currentLessonTitleNorm && (normLTitle === currentLessonTitleNorm || currentLessonTitleNorm.includes(normLTitle))) {
          continue;
        }
      }

      // Determine clean lesson number: use detected number or auto-increment sequentially
      const cleanNum: number = lNum !== null ? lNum : ((currentLessonNum || 0) + 1);
      currentLessonNum = cleanNum;
      currentLessonTitleNorm = normLTitle || `${prefix} ${cleanNum}`;

      const finalLessonHeading = lTitle ? `${prefix} ${cleanNum}: ${lTitle}` : `${prefix} ${cleanNum}`;
      resultLines.push(`## ${finalLessonHeading}`);
      continue;
    }

    // Handle Unit Header: # الوحدة ... OR # الفصل ... OR # Unit ... (any heading level promoted to #)
    const unitMatch = trimmed.match(/^#{1,4}\s*(?:(الوحدة|الفصل|Unit|Chapter)\s*[:\-\s].*)$/i);
    if (unitMatch) {
      const fullHeading = unitMatch[0].replace(/^#{1,4}\s*/, '').trim();

      // Check if it's Arab Unity / National Unity instead of a textbook unit
      if (fullHeading.includes('الوحدة العربية') || fullHeading.includes('الوحدة الوطنية')) {
        resultLines.push(`### ${fullHeading}`);
        continue;
      }

      const { isEnglish, number: uNum, title: uTitle, prefix } = extractUnitInfo(fullHeading);

      // If unit has no explicit number OR is grammar/subtopic: demote to H3
      if (uNum === null || isSubtopicOrMargin(uTitle)) {
        if (uTitle) resultLines.push(`### ${uTitle || fullHeading}`);
        continue;
      }

      if (currentUnitTitle && isSameUnitTitle(currentUnitTitle, uTitle)) {
        continue; // Duplicate margin of same unit
      }

      // If unit number is explicitly <= currentUnitNum:
      if (currentUnitNum !== null && uNum <= currentUnitNum) {
        // If the title is different and substantial, it is a lesson mislabeled as a unit header
        if (uTitle && !isSubtopicOrMargin(uTitle) && !isSameUnitTitle(currentUnitTitle, uTitle)) {
          const nextLessonNum: number = (currentLessonNum || 0) + 1;
          currentLessonNum = nextLessonNum;
          currentLessonTitleNorm = normalizeText(uTitle);
          resultLines.push(`## الدرس ${nextLessonNum}: ${uTitle}`);
        }
        continue;
      }

      // Valid new unit
      currentUnitNum = uNum;
      currentUnitTitle = uTitle || (isEnglish ? `Unit ${currentUnitNum}` : `${prefix} ${currentUnitNum}`);
      currentLessonNum = null;
      currentLessonTitleNorm = null;
      isInsideUnitCover = true;

      const prefixStr = isEnglish ? '# Unit ' : `# ${prefix} `;
      const cleanUnitHeading = uTitle ? `${prefixStr}${currentUnitNum}: ${uTitle}` : `${prefixStr}${currentUnitNum}`;
      resultLines.push(cleanUnitHeading);
      continue;
    }

    // Handle Major Curriculum Divisions (# قسم النحو والصرف / # القصة المقررة / # Grammar / # Story)
    const divisionMatch = trimmed.match(/^#{1,4}\s+((?:قسم|القصة|Story|Reader|Grammar)\b.*)$/i);
    if (divisionMatch) {
      isInsideUnitCover = false;
      currentLessonNum = null;
      currentLessonTitleNorm = null;
      const fullDiv = divisionMatch[0].replace(/^#{1,4}\s*/, '').trim();
      resultLines.push(`# ${fullDiv}`);
      continue;
    }

    // If inside unit cover, strip lesson index lines & learning outcome bullet items
    if (isInsideUnitCover) {
      if (trimmed.startsWith('#')) {
        isInsideUnitCover = false;
      } else if (
        trimmed.match(/^(?:الدرس\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|[0-9]+)|Lesson\s+[0-9]+|نواتج التعلم|أهداف|في نهاية هذه الوحدة|Learning Outcomes|[0-9]+\.\s+)/i)
      ) {
        continue;
      }
    }

    // Handle generic H2 that is not a lesson (demote to H3)
    const genericH2Match = trimmed.match(/^##\s+(.+)$/);
    if (genericH2Match) {
      isInsideUnitCover = false;
      const subHeading = genericH2Match[1].trim();
      const normSub = normalizeText(subHeading);

      if (currentLessonTitleNorm && normSub.length > 3 && (currentLessonTitleNorm === normSub || currentLessonTitleNorm.includes(normSub))) {
        continue;
      }

      resultLines.push(`### ${subHeading}`);
      continue;
    }

    // Handle stray single '#' that is not Unit or Curriculum (demote to H3)
    const genericH1Match = trimmed.match(/^#\s+(.+)$/);
    if (genericH1Match) {
      isInsideUnitCover = false;
      resultLines.push(`### ${genericH1Match[1].trim()}`);
      continue;
    }

    // Handle stray H3 that is just the unit title repeated as margin header
    const genericH3Match = trimmed.match(/^###\s+(.+)$/);
    if (genericH3Match) {
      const subHeading = genericH3Match[1].trim();
      if (
        (currentUnitTitle && isSameUnitTitle(currentUnitTitle, subHeading)) &&
        !subHeading.includes('نشاط') && !subHeading.includes('قانون') && !subHeading.includes('تجربة')
      ) {
        continue;
      }
    }

    resultLines.push(line);
  }

  // Clean up and autocorrect OCR glitches
  let cleaned = resultLines.join('\n');
  cleaned = cleaned.replace(/دقيقة أساسية/g, 'حقيقة أساسية');
  cleaned = cleaned.replace(/حقيبة أساسية/g, 'حقيقة أساسية');
  cleaned = cleaned.replace(/منطقة الحل/g, 'منطقية الحل');
  cleaned = cleaned.replace(/كنتب البيانات/g, 'كتيب البيانات');
  cleaned = cleaned.replace(/طبعة العلم/g, 'طبيعة العلم');
  cleaned = cleaned.replace(/طبيعة العالم:\s*النماذج/g, 'طبيعة العلم: النماذج');
  cleaned = cleaned.replace(/سؤال الدرس،\s*واجباته/g, 'سؤال الدرس، وإجابته');
  cleaned = cleaned.replace(/عيّارة النيل/g, 'عبّارة النيل');
  cleaned = cleaned.replace(/عيّارة/g, 'عبّارة');
  cleaned = cleaned.replace(/مطارين العرب/g, 'مطار برج العرب');
  cleaned = cleaned.replace(/الأعداد الفردية والمعادلات/g, 'الأعداد المركبة والمعادلات');
  cleaned = cleaned.replace(/الأعداد العشرية والمعادلات/g, 'الأعداد المركبة والمعادلات');
  cleaned = cleaned.replace(/الأعداد النسبية والمعادلات/g, 'الأعداد المركبة والمعادلات');
  cleaned = cleaned.replace(/الهندسة والتفاعلات/g, 'الهندسة والمعادلات');
  cleaned = cleaned.replace(/الهندسة والقياسات/g, 'الهندسة والمعادلات');
  cleaned = cleaned.replace(/الهندسة والاستدلال/g, 'الهندسة والمعادلات');
  cleaned = cleaned.replace(/المستقيامت/g, 'المستقيمات');
  cleaned = cleaned.replace(/المستفيم/g, 'المستقيم');

  // Strip all emojis per CODING_GUIDELINES.md rules 1 & 4
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}]/gu, '');
  cleaned = cleaned.replace(/[⚠️⭐💡🤔🔎👆®™©]/g, '');

  // Clean up excessive blank lines
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

  return cleaned.trim();
}

