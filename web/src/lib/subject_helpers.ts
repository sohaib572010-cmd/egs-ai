export function isEnglishSubject(subjectName?: string): boolean {
  if (!subjectName) return false;
  const s = subjectName.trim().toLowerCase();
  return s.includes('إنجليز') || s.includes('انجليز') || s.includes('english');
}

export type MathNotationMode = 'arabic' | 'english';

export interface MathNotationContext {
  mode: MathNotationMode;
  reason: string;
  isScienceSubject: boolean;
  isLanguageSchool: boolean;
  digitType: 'eastern_arabic' | 'western_latin';
  variableScript: 'arabic' | 'latin';
  direction: 'rtl' | 'ltr';
}

export function determineMathNotationContext(
  subjectName?: string,
  gradeLevel?: string,
  queryText?: string
): MathNotationContext {
  const s = (subjectName || '').trim().toLowerCase();
  const q = (queryText || '').trim();

  // 1. Language school / English track subjects
  const isLanguageSubject =
    s.includes('لغات') ||
    s.includes('language') ||
    s.includes('experimental') ||
    s.includes('تجريب') ||
    s.includes('english') ||
    s.includes('انجليز') ||
    s.includes('إنجليز');

  // Explicit English Math subject names
  const isExplicitEnglishMath =
    /^(math|mathematics|pure math|applied math|calculus|algebra|geometry|trigonometry|mechanics|statistics)$/i.test(s) ||
    s.includes('math') ||
    s.includes('calculus');

  // Science textbooks at every stage (including the reformed preparatory "العلوم") write symbols,
  // formulas, and units in Latin letters with Western digits (e.g. I = Q/t, V = W/Q, 100°C)
  const isScience =
    s.includes('فيزياء') || s.includes('physics') ||
    s.includes('كيمياء') || s.includes('chemistry') ||
    s.includes('علوم') || s.includes('science') ||
    s.includes('أحياء') || s.includes('biology');

  // 2. Query override detection:
  if (q) {
    const hasLatinMathEquation =
      /\b[a-zA-Z]\s*[²³\^=+\-*\/×÷≠±≤≥]\s*[\da-zA-Z]/.test(q) ||
      /\b[a-zA-Z][²³]/.test(q) ||
      /[√∛]\s*(?:\([^)]+\)|[a-zA-Z\d]+)/.test(q) ||
      /\b(sin|cos|tan|log|ln|lim|sqrt|frac|dy\/dx|f\(x\))\b/i.test(q) ||
      /(\$[a-zA-Z][^$]*\$)/.test(q);
    const hasArabicMathEquation =
      /[سصعنرقأب]\s*[²³\^=+\-*\/×÷≠±≤≥]\s*[٠-٩0-9سصعنرقأب]/.test(q) ||
      /[سصعنرقأب][²³]/.test(q) ||
      /[√∛]\s*(?:\([^)]+\)|[سصعنرقأب٠-٩0-9]+)/.test(q) ||
      /(جا|جتا|ظا|ظتا|نها|لو|د\(س\))/.test(q) ||
      /(\$[سصعنرقأب][^$]*\$)/.test(q);

    if (hasLatinMathEquation && !hasArabicMathEquation) {
      return {
        mode: 'english',
        reason: 'User query explicitly provided Latin/English mathematical variables or equations',
        isScienceSubject: isScience,
        isLanguageSchool: isLanguageSubject,
        digitType: 'western_latin',
        variableScript: 'latin',
        direction: 'ltr',
      };
    }

    if (hasArabicMathEquation && !isScience) {
      return {
        mode: 'arabic',
        reason: 'User query explicitly provided Arabic mathematical variables or equations',
        isScienceSubject: false,
        isLanguageSchool: false,
        digitType: 'eastern_arabic',
        variableScript: 'arabic',
        direction: 'rtl',
      };
    }
  }

  // 3. Subject-based determination
  if (isExplicitEnglishMath || isLanguageSubject || isScience) {
    return {
      mode: 'english',
      reason: isScience
        ? 'Egyptian science textbooks (preparatory and secondary) write symbols, formulas, and units in Latin letters with Western digits'
        : 'Subject is English language or English-track STEM curriculum',
      isScienceSubject: isScience,
      isLanguageSchool: isLanguageSubject,
      digitType: 'western_latin',
      variableScript: 'latin',
      direction: 'ltr',
    };
  }

  // 4. General Arabic Mathematics & Middle School Science
  return {
    mode: 'arabic',
    reason: 'Official Arabic National Curriculum for General Mathematics',
    isScienceSubject: false,
    isLanguageSchool: false,
    digitType: 'eastern_arabic',
    variableScript: 'arabic',
    direction: 'rtl',
  };
}

// Families of neighboring disciplines. A question from a sibling discipline (civics or the constitution in a
// History chat, physics in a Science chat) is answered with the out-of-curriculum rules, never redirected.
const SUBJECT_FAMILIES: RegExp[] = [
  /تاريخ|جغرافي|دراسات|وطني|مواطن|مدني|دستور|فلسف|منطق|نفس|اجتماع|اقتصاد|سياس|history|geograph|social|civic|constitution|philosoph|logic|psycholog|sociolog|econom|politic/i,
  /علوم|فيزياء|كيمياء|أحياء|احياء|جيولوجيا|بيولوجي|ميكانيكا|استاتيكا|ديناميكا|science|physic|chemi|biolog|geolog|mechanic/i,
  /رياض|جبر|هندس|تفاضل|تكامل|مثلثات|إحصاء|احصاء|ميكانيكا|استاتيكا|ديناميكا|math|algebra|geometr|calculus|trigonometr|statistic|mechanic/i,
  /عربي|نحو|بلاغ|أدب|ادب|نصوص|قصة|إملاء|املاء|تعبير|arabic/i,
  /إنجليز|انجليز|english/i,
  /فرنس|ألمان|المان|إيطالي|ايطالي|إسبان|اسبان|french|german|italian|spanish/i,
  /دين|إسلام|اسلام|مسيحي|قرآن|قران|فقه|religio|islam|christian/i,
  /حاسب|حاسوب|برمج|تكنولوجيا|معلومات|computer|programming|ict/i
];

const subjectFamilies = (label: string) => SUBJECT_FAMILIES.filter(f => f.test(label));

/**
 * True only when the classifier's detected subject is recognizably a different school subject from an
 * unrelated family. Unknown labels, the active subject itself, its integrated branches, and sibling
 * disciplines all return false, so the fixed redirect is never served on a guess.
 */
export function isClearlyDifferentSubject(activeSubject: string, detectedSubject?: string): boolean {
  if (!detectedSubject) return false;
  const strip = (s: string) => s.trim().toLowerCase().replace(/^ال/, '').replace(/\s*-.*$/, '');
  const a = strip(activeSubject);
  const d = strip(detectedSubject);
  if (!a || !d || a.includes(d) || d.includes(a)) return false;
  const detected = subjectFamilies(detectedSubject);
  if (!detected.length) return false;
  const active = subjectFamilies(activeSubject);
  return !active.some(f => detected.includes(f));
}

export function isEnglishMathSubject(subjectName?: string, gradeLevel?: string): boolean {
  return determineMathNotationContext(subjectName, gradeLevel).mode === 'english';
}

/**
 * Strips structural markup, protocol tags, code fences, and LaTeX math formulas
 * before performing natural language classification.
 */
export function extractReadableText(text: string): string {
  if (!text) return '';
  return text
    // Remove protocol tags and blocks like [QUIZ_QUESTION]...[/QUIZ_QUESTION], [CREATE_EXAM], etc.
    .replace(/\[[A-Z_]+(?::[^\]]*)?\][\s\S]*?\[\/[A-Z_]+\]/g, '')
    .replace(/\[[A-Z_]+(?::[^\]]*)?\]/g, '')
    .replace(/\[\/[A-Z_]+\]/g, '')
    // Remove markdown code fences and inline code
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    // Remove block and inline LaTeX formulas
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/\\\[[\s\S]*?\\\]/g, '')
    .replace(/\$[^$]+\$/g, '')
    .replace(/\\\([^)]+\\\)/g, '')
    .replace(/\\begin\{[a-z*]+\}[\s\S]*?\\end\{[a-z*]+\}/gi, '')
    // Remove markdown images and keep link text
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

export function isEnglishText(text?: string): boolean {
  if (!text) return false;
  const readable = extractReadableText(text);
  if (!readable) return false;

  const latinMatches = readable.match(/[A-Za-z]/g) || [];
  const arabicMatches = readable.match(/[\u0600-\u06FF]/g) || [];

  // If no Latin characters or fewer than 2, cannot be English
  if (latinMatches.length < 2) return false;

  // Pure Latin/English text (no Arabic characters)
  if (arabicMatches.length === 0) return true;

  // Mixed text: Latin must constitute the dominant majority (>= 65%)
  const totalLetters = latinMatches.length + arabicMatches.length;
  return (latinMatches.length / totalLetters) >= 0.65;
}


const ARABIC_GRADE_NAMES: Record<string, string> = {
  '1_middle': 'الصف الأول الإعدادي',
  '2_middle': 'الصف الثاني الإعدادي',
  '3_middle': 'الصف الثالث الإعدادي',
  '1_high': 'الصف الأول الثانوي',
  '2_high': 'الصف الثاني الثانوي',
};

const ENGLISH_GRADE_NAMES: Record<string, string> = {
  '1_middle': '1st Preparatory',
  '2_middle': '2nd Preparatory',
  '3_middle': '3rd Preparatory',
  '1_high': '1st Secondary',
  '2_high': '2nd Secondary',
};

let catalogStageNames: Record<string, string> = {};
let catalogStageLevels: Record<string, string> = {};

/** Stage names and levels from the admin-managed education catalog; names take precedence over the built-in ones. */
export function registerStageCatalog(stages: { id: string; name: string; level: string }[]) {
  catalogStageNames = Object.fromEntries(stages.map(s => [s.id, s.name]));
  catalogStageLevels = Object.fromEntries(stages.map(s => [s.id, s.level]));
}

export function getStageLevel(gradeLevel?: string): 'primary' | 'preparatory' | 'secondary' | 'other' {
  const clean = (gradeLevel || '').trim();
  const level = catalogStageLevels[clean];
  if (level === 'primary' || level === 'preparatory' || level === 'secondary') return level;
  if (clean.endsWith('_middle')) return 'preparatory';
  if (clean.endsWith('_high') || clean.includes('secondary')) return 'secondary';
  return 'other';
}

export function getGradeDisplayName(gradeLevel?: string, isEnglish: boolean = false): string {
  if (!gradeLevel) return isEnglish ? 'Unspecified Grade' : 'غير محدد';
  const clean = gradeLevel.trim();
  if (isEnglish) {
    return ENGLISH_GRADE_NAMES[clean] || catalogStageNames[clean] || clean;
  }
  return catalogStageNames[clean] || ARABIC_GRADE_NAMES[clean] || clean;
}

export function getCurriculumDisplayName(subjectName?: string, gradeLevel?: string, isEnglish: boolean = false): string {
  const grade = getGradeDisplayName(gradeLevel, isEnglish);
  const subj = subjectName ? subjectName.trim() : (isEnglish ? 'Unspecified Subject' : 'المادة الحالية');
  if (isEnglish) {
    return `${subj} Curriculum (${grade})`;
  }
  return `منهج ${subj} (${grade})`;
}
