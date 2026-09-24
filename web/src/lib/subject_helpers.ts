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
  const g = (gradeLevel || '').trim().toLowerCase();
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

  // Secondary Science subjects in Egyptian curriculum strictly use English/Latin notation & Western digits (0-9)
  const isSecondaryScience =
    s.includes('فيزياء') || s.includes('physics') ||
    s.includes('كيمياء') || s.includes('chemistry') ||
    s.includes('علوم متكاملة') || s.includes('integrated science') ||
    s.includes('أحياء') || s.includes('biology') ||
    (s.includes('علوم') && (g === '1_high' || g === '2_high' || g === '3_high'));

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
        isScienceSubject: isSecondaryScience,
        isLanguageSchool: isLanguageSubject,
        digitType: 'western_latin',
        variableScript: 'latin',
        direction: 'ltr',
      };
    }

    if (hasArabicMathEquation && !isSecondaryScience) {
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
  if (isExplicitEnglishMath || isLanguageSubject || isSecondaryScience) {
    return {
      mode: 'english',
      reason: isSecondaryScience
        ? 'Secondary Physics, Chemistry, and Integrated Sciences in the Egyptian curriculum strictly use English/Latin notation and Western digits'
        : 'Subject is English language or English-track STEM curriculum',
      isScienceSubject: isSecondaryScience,
      isLanguageSchool: isLanguageSubject,
      digitType: 'western_latin',
      variableScript: 'latin',
      direction: 'ltr',
    };
  }

  // 4. General Arabic Mathematics & Middle School Science
  return {
    mode: 'arabic',
    reason: 'Official Arabic National Curriculum for General Mathematics / Preparatory Science',
    isScienceSubject: s.includes('علوم'),
    isLanguageSchool: false,
    digitType: 'eastern_arabic',
    variableScript: 'arabic',
    direction: 'rtl',
  };
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

export function getGradeDisplayName(gradeLevel?: string, isEnglish: boolean = false): string {
  if (!gradeLevel) return isEnglish ? 'Unspecified Grade' : 'غير محدد';
  const clean = gradeLevel.trim();
  if (isEnglish) {
    return ENGLISH_GRADE_NAMES[clean] || clean;
  }
  return ARABIC_GRADE_NAMES[clean] || clean;
}

export function getCurriculumDisplayName(subjectName?: string, gradeLevel?: string, isEnglish: boolean = false): string {
  const grade = getGradeDisplayName(gradeLevel, isEnglish);
  const subj = subjectName ? subjectName.trim() : (isEnglish ? 'Unspecified Subject' : 'المادة الحالية');
  if (isEnglish) {
    return `${subj} Curriculum (${grade})`;
  }
  return `منهج ${subj} (${grade})`;
}
