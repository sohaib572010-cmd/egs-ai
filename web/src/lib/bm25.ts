/**
 * Okapi BM25 lexical retrieval with an Arabic light stemmer (Light10) for the Egyptian curriculum.
 * Pure TypeScript, no native dependencies.
 */

export interface BM25Document {
  id: string;
  heading: string;
  content: string;
  parent_id?: string | null;
  position_index?: number;
}

export interface BM25SearchResult {
  doc: BM25Document;
  score: number;
  rank: number;
  matchedTerms: string[];
}

const ARABIC_DIACRITICS_REGEX = /[ً-ٰٟ]/g;
const ARABIC_TATWEEL_REGEX = /ـ/g;

/**
 * Character normalization shared with the knowledge graph (entity `normalized_name` values in the
 * database were produced by this exact function, so it must not change).
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .replace(ARABIC_DIACRITICS_REGEX, '')
    .replace(ARABIC_TATWEEL_REGEX, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ؤئ]/g, 'ء')
    .trim();
}

const STOP_WORDS = new Set([
  'في', 'من', 'الى', 'على', 'علي', 'عن', 'مع', 'هذا', 'هذه', 'هذان', 'هاتان', 'هؤلاء', 'ذلك', 'تلك', 'اولءك',
  'الذي', 'التي', 'الذين', 'اللذان', 'اللتان', 'اللاتي', 'اللواتي', 'هو', 'هي', 'هم', 'هن', 'هما', 'انا', 'نحن',
  'انت', 'انتم', 'كان', 'كانت', 'يكون', 'تكون', 'اصبح', 'صار', 'ليس', 'ما', 'ماذا', 'لماذا', 'كيف', 'متي',
  'اين', 'كم', 'اي', 'هل', 'لو', 'ان', 'اذا', 'ثم', 'او', 'ام', 'بل', 'لكن', 'حتي', 'كل', 'بعض', 'غير', 'سوي',
  'فقط', 'جدا', 'ايضا', 'يا', 'قد', 'لقد', 'لم', 'لن', 'لا', 'نعم', 'عند', 'عندما', 'بين', 'بعد', 'قبل', 'حيث',
  'التي', 'منها', 'منه', 'فيه', 'فيها', 'عليه', 'عليها', 'به', 'بها', 'له', 'لها', 'الا', 'اما', 'كما', 'لان',
  'ده', 'دي', 'دا', 'دول', 'ايه', 'ازاي', 'ليه', 'مين', 'امتي', 'فين', 'عايز', 'عاوز', 'عايزه', 'ممكن', 'يعني',
  'بتاع', 'بتاعه', 'بس', 'طب', 'طيب', 'كده', 'اللي', 'مش', 'لسه', 'قولي', 'اعرف', 'اشرح', 'اشرحلي', 'وضح',
  'وضحلي', 'فهمني', 'سمحت', 'فضلك', 'بطل', 'مستر', 'استاذ', 'دكتور',
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'is', 'are', 'was', 'were', 'and', 'or', 'for', 'with', 'what', 'why',
  'how', 'when', 'which', 'who', 'does', 'do', 'did', 'be', 'it', 'this', 'that', 'by', 'as', 'at', 'from'
]);

const DEFINITE_PREFIXES = ['وال', 'بال', 'كال', 'فال', 'ال', 'لل'];
const LIGHT_SUFFIXES = ['ها', 'ان', 'ات', 'ون', 'ين', 'يه', 'ه', 'ي'];
const EASTERN_DIGITS = /[٠-٩]/g;

/** Light10 Arabic stemmer (Larkey et al.): strips the conjunction, definite-article clitics and common suffixes. */
export function stemArabicWord(word: string): string {
  let w = word;
  if (w.length >= 4 && w.startsWith('و')) w = w.slice(1);
  for (const p of DEFINITE_PREFIXES) {
    if (w.startsWith(p) && w.length - p.length >= 2) {
      w = w.slice(p.length);
      break;
    }
  }
  if (w.length > 3) {
    for (const s of LIGHT_SUFFIXES) {
      if (w.length - s.length >= 2 && w.endsWith(s)) w = w.slice(0, -s.length);
    }
  }
  return w;
}

function stemLatinWord(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Analyzed token stream (with repeats, in order) used for indexing and querying. */
export function analyzeText(text: string): string[] {
  if (!text) return [];
  const normalized = normalizeArabic(text.toLowerCase())
    .replace(EASTERN_DIGITS, d => String(d.charCodeAt(0) - 0x0660));
  const tokens: string[] = [];
  for (const raw of normalized.split(/[^ء-يa-z0-9]+/)) {
    if (raw.length < 2 || STOP_WORDS.has(raw) || (raw[0] === 'و' && STOP_WORDS.has(raw.slice(1)))) continue;
    const stem = /^[a-z]/.test(raw) ? stemLatinWord(raw) : /^[0-9]/.test(raw) ? raw : stemArabicWord(raw);
    if (stem.length >= 2 && !STOP_WORDS.has(stem)) tokens.push(stem);
  }
  return tokens;
}

/** Unique analyzed terms of a text. */
export function tokenizeArabic(text: string): string[] {
  return [...new Set(analyzeText(text))];
}

export interface BM25Options {
  k1?: number;
  b?: number;
  headingWeight?: number;
  bigramBoost?: number;
}

/**
 * In-memory BM25 index over a whole curriculum. Scores use real term frequencies, a lightly weighted
 * breadcrumb heading, and a proximity bonus when two consecutive query terms appear consecutively
 * in the document (multi-word terms such as "فرق الجهد" or "الشحنة الكهربية").
 */
export class BM25Index {
  private readonly k1: number;
  private readonly b: number;
  private readonly headingWeight: number;
  private readonly bigramBoost: number;
  private readonly docs: BM25Document[];
  private readonly docLengths: Float64Array;
  private readonly postings = new Map<string, Map<number, number>>();
  private readonly bigrams: Set<string>[];
  private readonly avgDocLength: number;

  constructor(docs: BM25Document[], options: BM25Options = {}) {
    this.k1 = options.k1 ?? 1.2;
    this.b = options.b ?? 0.75;
    this.headingWeight = options.headingWeight ?? 0.5;
    this.bigramBoost = options.bigramBoost ?? 0.6;
    this.docs = docs;
    this.docLengths = new Float64Array(docs.length);
    this.bigrams = new Array(docs.length);

    let total = 0;
    const headingCache = new Map<string, string[]>();
    docs.forEach((doc, i) => {
      const body = analyzeText(doc.content);
      let heading = headingCache.get(doc.heading);
      if (!heading) {
        heading = analyzeText(doc.heading);
        headingCache.set(doc.heading, heading);
      }
      const tf = new Map<string, number>();
      for (const t of body) tf.set(t, (tf.get(t) || 0) + 1);
      for (const t of heading) tf.set(t, (tf.get(t) || 0) + this.headingWeight);
      for (const [term, freq] of tf) {
        let posting = this.postings.get(term);
        if (!posting) this.postings.set(term, (posting = new Map()));
        posting.set(i, freq);
      }
      const pairs = new Set<string>();
      for (let j = 1; j < body.length; j++) pairs.add(`${body[j - 1]} ${body[j]}`);
      this.bigrams[i] = pairs;
      this.docLengths[i] = body.length + heading.length * this.headingWeight;
      total += this.docLengths[i];
    });
    this.avgDocLength = docs.length ? total / docs.length : 0;
  }

  get size(): number {
    return this.docs.length;
  }

  idf(term: string): number {
    const n = this.postings.get(term)?.size || 0;
    return n === 0 ? 0 : Math.log(1 + (this.docs.length - n + 0.5) / (n + 0.5));
  }

  search(query: string, topK = 8): BM25SearchResult[] {
    if (this.docs.length === 0) return [];
    const queryTerms = analyzeText(query);
    const unique = [...new Set(queryTerms)];
    if (unique.length === 0) return [];

    const scores = new Map<number, number>();
    const matched = new Map<number, Set<string>>();
    for (const term of unique) {
      const idf = this.idf(term);
      const posting = this.postings.get(term);
      if (!posting || idf <= 0) continue;
      for (const [docIdx, tf] of posting) {
        const norm = 1 - this.b + this.b * (this.docLengths[docIdx] / (this.avgDocLength || 1));
        scores.set(docIdx, (scores.get(docIdx) || 0) + idf * ((tf * (this.k1 + 1)) / (tf + this.k1 * norm)));
        let m = matched.get(docIdx);
        if (!m) matched.set(docIdx, (m = new Set()));
        m.add(term);
      }
    }

    const queryBigrams: { key: string; weight: number }[] = [];
    for (let j = 1; j < queryTerms.length; j++) {
      queryBigrams.push({
        key: `${queryTerms[j - 1]} ${queryTerms[j]}`,
        weight: Math.min(this.idf(queryTerms[j - 1]), this.idf(queryTerms[j]))
      });
    }
    if (queryBigrams.length) {
      for (const [docIdx, score] of scores) {
        let bonus = 0;
        for (const { key, weight } of queryBigrams) if (this.bigrams[docIdx].has(key)) bonus += weight;
        if (bonus) scores.set(docIdx, score + this.bigramBoost * bonus);
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([docIdx, score], i) => ({
        doc: this.docs[docIdx],
        score,
        rank: i + 1,
        matchedTerms: [...(matched.get(docIdx) || [])]
      }));
  }
}
