import assert from 'node:assert';
import katex from 'katex';
import { determineMathNotationContext } from '../src/lib/subject_helpers.ts';

console.log('====================================================');
console.log('   EGS AI — Comprehensive Math Symbols Test Suite   ');
console.log('====================================================\n');

export function cleanFormula(raw, isEnglish = false) {
  if (!raw) return '';
  let f = raw.trim();

  // 1. Strip delimiters and stray dollar signs / escaped brackets
  f = f.replace(/\\?\$+/g, ' ').replace(/\\[\[\]\(\)]/g, ' ');
  // Strip leaked markdown bold / strikethrough tokens
  f = f.replace(/\*\*/g, '').replace(/~~/g, '');

  // 2. Normalize combinations and permutations from legacy forms
  f = f.replace(/(?:\{\s*\}|\{)?\s*\^\{?(?:\\text\{)?([٠-٩0-9\u0600-\u06FF]+)\}?\}?\s*\\text\{(ق|ل)\}_\{?(?:\\text\{)?([٠-٩0-9\u0600-\u06FF]+)\}?\}?/g,
    (m, n, op, r) => `${n} \\text{ ${op} } ${r}`
  );

  // 3. Fix AI Latin letter 'V' or 'v' erroneously used for Arabic digit '٧'
  f = f.replace(/\\text\{\s*([Vv])\s*\}/g, '\\text{٧}')
       .replace(/\b([Vv])\s*(?=\\text\{\s*ق\s*\})/g, '٧ ')
       .replace(/(?<=\\text\{\s*ق\s*\}\s*)([Vv])\b/g, ' ٧');

  // 4. Fix malformed binomial term double exponents (e.g. \text{أ}^\text{ب3}^\text{2})
  f = f.replace(/(?:\\text\{([^\}]+)\}|([أ-ي]))\s*\^\s*(?:\\text\{)?([أ-ي])\s*([٠-٩0-9]+)\}?\s*\^\s*(?:\\text\{)?([٠-٩0-9]+)\}?/g,
    '\\text{$1$2}^{\\text{$5}}\\,\\text{$3}^{\\text{$4}}'
  );
  f = f.replace(/(?:\\text\{([^\}]+)\}|([أ-ي]))\s*\^\s*(?:\\text\{)?([أ-ي])\s*([٠-٩0-9]+)\}?/g,
    '\\text{$1$2}^{\\text{$4}}\\,\\text{$3}'
  );

  // 5. Ensure all superscripts and subscripts are enclosed in braces
  f = f.replace(/\^\s*(\\text\{[^\}]*\})/g, '^{$1}')
       .replace(/\_\s*(\\text\{[^\}]*\})/g, '_{$1}');

  const cleanForCheck = f.replace(/\\(?:text|mathrm|mathbf|mathit|degree|celsius|alpha|beta|gamma|delta|Delta|theta|Theta|pi|Pi|Omega|omega|sigma|Sigma|lambda|Lambda|mu|micro|phi|Phi|psi|Psi|rho|tau|eta|epsilon|zeta|kappa|xi|frac|sqrt|times|div|pm|approx|le|ge|neq|sum|int|lim|to|leftarrow|rightarrow|Rightarrow|Leftarrow)\b/g, '');

  const hasArabicSymbols = /[\u0600-\u06FF]/.test(cleanForCheck);
  const hasLatinVariables = /[a-zA-Z]/.test(cleanForCheck);
  const isArabicFormula = hasArabicSymbols && !hasLatinVariables;

  // 6. Normalize Unicode superscripts
  const SUPERSCRIPT_MAP = {
    '⁰': isArabicFormula ? '٠' : '0',
    '¹': isArabicFormula ? '١' : '1',
    '²': isArabicFormula ? '٢' : '2',
    '³': isArabicFormula ? '٣' : '3',
    '⁴': isArabicFormula ? '٤' : '4',
    '⁵': isArabicFormula ? '٥' : '5',
    '⁶': isArabicFormula ? '٦' : '6',
    '⁷': isArabicFormula ? '٧' : '7',
    '⁸': isArabicFormula ? '٨' : '8',
    '⁹': isArabicFormula ? '٩' : '9',
    '⁺': '+', '⁻': '-'
  };
  f = f.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, (match) => {
    const inner = match.split('').map(c => SUPERSCRIPT_MAP[c] || c).join('');
    return `^{${inner}}`;
  });

  // 7. Normalize Unicode operators
  f = f.replace(/×/g, ' \\times ')
       .replace(/÷/g, ' \\div ')
       .replace(/−/g, '-')
       .replace(/·/g, ' \\cdot ')
       .replace(/≤/g, ' \\le ')
       .replace(/≥/g, ' \\ge ')
       .replace(/≠/g, ' \\neq ')
       .replace(/≈/g, ' \\approx ')
       .replace(/±/g, ' \\pm ')
       .replace(/∞/g, ' \\infty ');

  // 8. In Arabic formulas, normalize standalone Western digits into Arabic numerals
  if (isArabicFormula) {
    const ARABIC_DIGIT_CONV = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    f = f.replace(/(?<![\\A-Za-z_])\b([0-9]+)\b(?![A-Za-z_])/g, (match) => {
      return match.replace(/[0-9]/g, d => ARABIC_DIGIT_CONV[+d]);
    });
  }

  // 9. Wrap bare Arabic variables, words, and Arabic digits in \text{...}
  if (hasArabicSymbols) {
    f = f.replace(/\\(?:text|mathrm|mathbf|mathit)\{[^\}]*\}|([\u0600-\u06FF]+)/g, (match, arabic) => {
      if (arabic) {
        return `\\text{${arabic}}`;
      }
      return match;
    });
  }

  // 10. Guarantee all newly created \text{...} in exponents are enclosed in braces
  f = f.replace(/\^\s*(\\text\{[^\}]*\})/g, '^{$1}')
       .replace(/\_\s*(\\text\{[^\}]*\})/g, '_{$1}')
       .replace(/\^\s*([٠-٩\u0600-\u06FF])/g, '^{$1}')
       .replace(/\_\s*([٠-٩\u0600-\u06FF])/g, '_{$1}');

  // 11. Fix consecutive double superscripts on the same base without matching across operations
  f = f.replace(/\^(\{[^{}\s\+\-\*=,]+\}|[^\s\{\}\+\-\*=,]+)\s*\^(\{[^{}\s\+\-\*=,]+\}|[^\s\{\}\+\-\*=,]+)/g, '^{$1}\\,^{$2}');

  f = f.replace(/\\\s*$/, '');
  f = f.replace(/\\(approx|times|pm|div|le|ge|leq|geq|neq|sim|simeq|equiv|to|leftarrow|rightarrow|Rightarrow|Leftarrow)\\(frac|sqrt|text|mathbf|mathit|mathrm|sum|int|lim)/g, '\\$1 \\$2');
  return f.replace(/\s+/g, ' ').trim();
}

export function renderKaTeXStrict(formula) {
  const cleaned = cleanFormula(formula);
  const res = katex.renderToString(cleaned, {
    displayMode: true,
    throwOnError: false,
    strict: false,
    trust: false,
    macros: {
      '\\RR': '\\mathbb{R}',
      '\\NN': '\\mathbb{N}',
      '\\ZZ': '\\mathbb{Z}',
      '\\QQ': '\\mathbb{Q}',
      '\\CC': '\\mathbb{C}',
      '\\degree': '^\\circ',
      '\\degreeC': '^\\circ\\text{C}',
      '\\celsius': '^\\circ\\text{C}',
      '\\ohm': '\\Omega',
      '\\micro': '\\mu',
      '\\ga': '\\text{جا}',
      '\\gta': '\\text{جتا}',
      '\\za': '\\text{ظا}',
      '\\zota': '\\text{ظتا}',
      '\\qaf': '\\text{ق}',
      '\\lam': '\\text{ل}',
      '\\naha': '\\text{نها}',
      '\\logar': '\\text{لو}',
      '\\defe': '\\text{د}',
      '\\had': '\\text{ح}',
    }
  });

  const hasError = res.includes('class="katex-error"');
  return { html: res, hasError, cleaned };
}

let passedCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
  }
}

// ─── SUITE 1: Subject & Query Math Notation Classification ───
console.log('--- Suite 1: Math Notation Mode Classification ---');

runTest('Secondary Physics strictly classified as English STEM notation', () => {
  const res1 = determineMathNotationContext('فيزياء', '2_high');
  assert.strictEqual(res1.mode, 'english');
  assert.strictEqual(res1.variableScript, 'latin');
  assert.strictEqual(res1.digitType, 'western_latin');
  assert.strictEqual(res1.direction, 'ltr');

  const res2 = determineMathNotationContext('Physics', '1_high');
  assert.strictEqual(res2.mode, 'english');
});

runTest('Secondary Chemistry strictly classified as English STEM notation', () => {
  const res = determineMathNotationContext('كيمياء', '2_high');
  assert.strictEqual(res.mode, 'english');
  assert.strictEqual(res.digitType, 'western_latin');
});

runTest('Secondary Integrated Sciences strictly classified as English STEM notation', () => {
  const res = determineMathNotationContext('علوم متكاملة', '1_high');
  assert.strictEqual(res.mode, 'english');
});

runTest('General Mathematics in Arabic curriculum classified as Arabic Math notation', () => {
  const res1 = determineMathNotationContext('الرياضيات', '1_high');
  assert.strictEqual(res1.mode, 'arabic');
  assert.strictEqual(res1.variableScript, 'arabic');
  assert.strictEqual(res1.digitType, 'eastern_arabic');
  assert.strictEqual(res1.direction, 'rtl');

  const res2 = determineMathNotationContext('الجبر والهندسة الفراغية', '2_high');
  assert.strictEqual(res2.mode, 'arabic');
});

runTest('Preparatory Science classified as Arabic notation', () => {
  const res = determineMathNotationContext('العلوم', '2_middle');
  assert.strictEqual(res.mode, 'arabic');
  assert.strictEqual(res.digitType, 'eastern_arabic');
});

runTest('Language School Math classified as English notation', () => {
  const res1 = determineMathNotationContext('Math', '1_high');
  assert.strictEqual(res1.mode, 'english');
  const res2 = determineMathNotationContext('الرياضيات (لغات)', '2_high');
  assert.strictEqual(res2.mode, 'english');
});

runTest('User Query Override: Latin equation overrides Arabic subject default', () => {
  const res = determineMathNotationContext('الرياضيات', '1_high', 'أوجد حل المعادلة x^2 + 5x + 6 = 0');
  assert.strictEqual(res.mode, 'english');
  assert.strictEqual(res.variableScript, 'latin');
});

runTest('User Query Override: Arabic equation overrides general default', () => {
  const res = determineMathNotationContext('الرياضيات', '1_high', 'أوجد مفكوك (٣س - ٢)^٤');
  assert.strictEqual(res.mode, 'arabic');
  assert.strictEqual(res.variableScript, 'arabic');
});

// ─── SUITE 2: Formula Cleaning & Normalization (User Screenshot Reproduction) ───
console.log('\n--- Suite 2: Formula Cleaning & Normalization ---');

runTest('Screenshot Image 1 Line 1: Normalizes nested delimiters and V to ٧', () => {
  const raw = '\\text{الحد} = $\\text{V} \\text{ ق } \\text{3} \\cdot (\\text{س3})^\\text{4} \\cdot (-\\text{2})^\\text{3}$';
  const cleaned = cleanFormula(raw);
  assert(!cleaned.includes('$'), 'Stray dollar signs must be stripped');
  assert(cleaned.includes('٧'), 'Latin V must be normalized to Eastern Arabic ٧');
  assert(cleaned.includes('^{'), 'Exponents must be braced');
  
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Must render in KaTeX without error');
});

runTest('Screenshot Image 1 Line 2: Arabic equation with Eastern digits renders cleanly', () => {
  const raw = '= 35 \\cdot 81 س^4 \\cdot (-8) = -22680 س^4';
  const { hasError, cleaned } = renderKaTeXStrict(raw);
  assert(!hasError, 'Must render in KaTeX without error');
  assert(cleaned.includes('س'), 'Arabic variable must be preserved');
});

runTest('Screenshot Image 1 Line 3: Mixed bold and Arabic prose stripped of raw markdown', () => {
  const raw = '\\text{إذن} **\\text{معامل} س^4 = -22680**';
  const cleaned = cleanFormula(raw);
  assert(!cleaned.includes('**'), 'Markdown bold must be stripped');
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Must render in KaTeX without error');
});

runTest('Screenshot Image 2 Line 1: Fractions, combinations, and braced exponents render cleanly', () => {
  const raw = '\\frac{\\text{5} \\times \\text{4}}{\\text{2}} \\times \\text{أ}^\\text{3}\\text{ب}^2';
  const { hasError, cleaned } = renderKaTeXStrict(raw);
  assert(!hasError, 'Fractions with Arabic terms must render without error');
  assert(cleaned.includes('\\frac'), 'Fraction must be preserved');
});

runTest('Screenshot Image 2 Malformed Double Exponents: Normalizes safely without crash', () => {
  const raw = '\\text{أ}^\\text{ب3}^\\text{2}';
  const cleaned = cleanFormula(raw);
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Double exponent must not crash KaTeX');
});

runTest('Binomial expansion term (أ + ب)^5 renders cleanly without KaTeX error', () => {
  const raw = '(\\text{أ} + \\text{ب})^5';
  const { hasError, cleaned } = renderKaTeXStrict(raw);
  assert(!hasError, 'Must render in KaTeX without error');
  assert(cleaned.includes('^{'), 'Power must be safely braced');
});

// ─── SUITE 3: Comprehensive Arabic Mathematical Symbols ───
console.log('\n--- Suite 3: Comprehensive Arabic Mathematical Symbols ---');

runTest('Arabic Combinations (التوافيق): ن ق ر notation', () => {
  const raw = '٦ \\text{ ق } ٣ = ٢٠';
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Combinations must render cleanly');
});

runTest('Arabic Permutations (التباديل): ن ل ر notation', () => {
  const raw = '٥ \\text{ ل } ٢ = ٢٠';
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Permutations must render cleanly');
});

runTest('Arabic Trigonometric functions: جا، جتا، ظا، ظتا', () => {
  const raw = '\\ga^٢(س) + \\gta^٢(س) = ١';
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Trig macros must render cleanly');
});

runTest('Arabic Limits (نها): limit notation', () => {
  const raw = '\\naha_{س \\to ٠} \\frac{\\ga(س)}{س} = ١';
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Limits must render cleanly');
});

runTest('Arabic Sequence term ranks (ح_ن)', () => {
  const raw = 'ح_١ = ٨١س^٤ , ح_{ر+١} = (ن \\text{ ق } ر)';
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Term ranks must render cleanly');
});

// ─── SUITE 4: Comprehensive English STEM Symbols ───
console.log('\n--- Suite 4: Comprehensive English STEM Symbols ---');

runTest('Physics vector magnitude and kinematic equations', () => {
  const raw = 'V = \\sqrt{V_x^2 + V_y^2} = \\sqrt{3.0^2 + 4.0^2} = 5.0 \\text{ m/s}';
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Physics kinematics must render cleanly');
});

runTest('Physics wave equation with Greek lambda, frequency, and scientific notation', () => {
  const raw = 'c = \\lambda \\cdot \\nu = (6.0 \\times 10^{-7}) \\times (5.0 \\times 10^{14}) = 3.0 \\times 10^8 \\text{ m/s}';
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Wave equation must render cleanly');
});

runTest('Chemistry balanced reaction and gas law', () => {
  const raw = '2\\text{H}_2 + \\text{O}_2 \\xrightarrow{\\Delta} 2\\text{H}_2\\text{O} \\quad PV = nRT';
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Chemistry reactions must render cleanly');
});

runTest('English Calculus: derivative, integral, and binomial theorem', () => {
  const raw = '\\frac{df}{dx} = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h} \\quad \\int_0^1 x^2 \\, dx = \\frac{1}{3}';
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Calculus must render cleanly');
});

runTest('English Combinations: standard Latin notation', () => {
  const raw = '(x + y)^n = \\sum_{k=0}^n \\binom{n}{k} x^{n-k} y^k';
  const { hasError } = renderKaTeXStrict(raw);
  assert(!hasError, 'Latin binomial must render cleanly');
});

// ─── SUITE 5: Markdown Line Categorization (Anti-Hijacking Check) ───
console.log('\n--- Suite 5: Markdown Line Categorization ---');

function isStandaloneFormulaLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('$$') || trimmed.startsWith('\\[') || trimmed.startsWith('\\begin{')) {
    return true;
  }
  // Exclude lines with markdown formatting (bold **, strikethrough ~~, links [)
  // Note: single underscore _ is widely used in LaTeX subscripts (V_x, a_1), so only check for __bold__ or isolated _italic_
  if (/\*\*|~~|__|^\[/.test(trimmed) || /(?<![a-zA-Z0-9\\])_[^_\s][^_]*_(?![a-zA-Z0-9])/.test(trimmed) || /(?<!\S)\*[^*\n]+\*(?!\S)/.test(trimmed)) {
    return false;
  }
  // Exclude lines with inline math delimiters ($ or \()
  if (/\$|\\\(/.test(trimmed)) {
    return false;
  }
  // Exclude lines starting with prose/intro words
  if (/^(إذن|إذاً|وبالتالي|حيث|وحيث أن|بما أن|نلاحظ أن|نعوض في|نعوض|خطوة|أولاً|ثانياً|ثالثاً|رابعاً|خامساً|الشرح|ملحوظة|تنبيه|المعطيات|المطلوب|القانون|الحل|الناتج|الحد|معامل|قيمة|أي أن)\b/i.test(trimmed)) {
    return false;
  }

  const isExistingLaTeXFormula = /^\s*(?:\\[a-zA-Z]+|[a-zA-Z0-9]|[=\+\-\*\/\(\)\{\}\^\._\s]|\\approx|\\times|\\div|\\pm|\\sqrt|\\frac)+\s*$/.test(trimmed) &&
    /\\(frac|sqrt|approx|times|pm|div|sum|int|cdot|alpha|beta|theta|pi)\b/.test(trimmed);
  const hasMathRelation = /[=≈≡≤≥≠]/.test(trimmed) || /\\(approx|equiv|le|ge|neq|sim|to)\b/.test(trimmed);
  const hasMathSymbols = /[⁰¹²³⁴⁵⁶⁷⁸⁹×÷\^]/.test(trimmed) || /\\(times|div|pm|frac|sqrt)\b/.test(trimmed);
  const arabicLettersCount = (trimmed.match(/[ء-ي]{2,}/g) || []).length;
  const hasMathOperands = /\d|[a-zA-Zسصعنرقأبج]/.test(trimmed);

  return isExistingLaTeXFormula || (
    arabicLettersCount === 0 &&
    (hasMathRelation || hasMathSymbols) &&
    hasMathOperands
  );
}

runTest('Line with markdown bold is NOT hijacked as standalone math block', () => {
  const line = '\\text{إذن} **\\text{معامل} س^4 = -22680**';
  assert(!isStandaloneFormulaLine(line), 'Must be false so it passes to parseInlineText');
});

runTest('Line with inline dollar signs is NOT hijacked as standalone math block', () => {
  const line = '\\text{الحد} = $\\text{V} \\text{ ق } \\text{3} \\cdot ...$';
  assert(!isStandaloneFormulaLine(line), 'Must be false so it passes to parseInlineText');
});

runTest('Line with Arabic prose word is NOT hijacked as standalone math block', () => {
  const line = 'إذن س = ٥';
  assert(!isStandaloneFormulaLine(line), 'Must be false so it passes to parseInlineText');
});

runTest('Pure equation line IS recognized as standalone math block', () => {
  const line = '(٣س - ٢)^٤ = ٨١س^٤ - ٢١٦س^٣ + ٢١٦س^٢ - ٩٦س + ١٦';
  assert(isStandaloneFormulaLine(line), 'Pure equation should be standalone math block');
});

runTest('Pure LaTeX equation line IS recognized as standalone math block', () => {
  const line = '\\frac{V_x^2 + V_y^2}{2} = 12.5';
  assert(isStandaloneFormulaLine(line), 'Pure LaTeX should be standalone math block');
});

console.log('\n====================================================');
console.log(`Test Results: ${passedCount} / ${totalCount} PASSED`);
console.log('====================================================');

if (import.meta.url === `file:///${process.argv[1].replace(/\\\\/g, '/')}`) {
  if (passedCount !== totalCount) {
    process.exit(1);
  }
}
