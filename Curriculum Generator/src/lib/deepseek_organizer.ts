import dns from "dns";

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {}

export interface DeepSeekOrganizerOptions {
  apiKey?: string;
  subjectName: string;
  gradeLevel: string;
  pageNumber?: number;
  maxRetries?: number;
  outlineContext?: string;
  onNetworkWait?: (attempt: number, maxRetries: number, delayMs: number) => void;
}

export type PageType = "content" | "toc" | "front_matter" | "exercises" | "answer_key" | "blank";

export interface PageExtraction {
  pageType: PageType;
  /** Curriculum Markdown for content pages; empty otherwise. */
  markdown: string;
  /** Outline lines ("الوحدة 1: ...") when the page is a table of contents. */
  tocText: string;
  truncated: boolean;
}

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-flash";
const REQUEST_TIMEOUT_MS = 120000;
const MAX_TOKENS = 8192;
const MAX_TOKENS_LONG = 16384;
const PAGE_TYPES: PageType[] = ["content", "toc", "front_matter", "exercises", "answer_key", "blank"];

const SYSTEM_PROMPT = `You read one page of an Egyptian school textbook (a page image, sometimes with its PDF text layer) and, in a single pass, transcribe it, classify it and organize it as clean Markdown for a retrieval-augmented AI tutor. Faithful text and faithful structure matter more than anything else.

OUTPUT FORMAT (exactly this, nothing before it):
PAGE_TYPE: <one of: content | toc | front_matter | exercises | answer_key | blank>
---
<body>

PAGE TYPES:
- content: any page that teaches (explanations, rules, texts, solved examples, unit/lesson openings). Body = the Markdown below.
- toc: the WHOLE BOOK's table of contents (فهرس / المحتويات) listing several units, chapters, parts or works. Body = plain outline lines (no "#", no "-", no bullets), one per entry, in printed order, each starting with its label:
  "الوحدة N: title" (الوحدة/الباب/Unit/Module), "الفصل N: title" (الفصل/Chapter), "الدرس N: title" (الدرس/Lesson/Topic), "مقدمة: title" (a section listed before the first unit).
  Never invent a label the book does not print. A top-level part printed without a unit label (أولًا / ثانيًا ..., الجزء, المحور, or a group such as النصوص الشعرية) is a "قسم: title" line, and an item printed without a lesson label (a story, novel, text, poem or topic) is its title alone on its line, without any number or author.
  Example: "ثالثًا: النصوص الشعرية" followed by "1 العلم نور" gives "قسم: النصوص الشعرية" then "العلم نور"; a list of novels gives one title per line ("عودة الروح", "كفاح طيبة").
  Ordinal words become digits. Titles without page numbers. A lesson row printed as bullet topics (• A • B) is ONE line joined with " و". Skip learning outcomes (نواتج التعلم), exam models, listening scripts, answer keys and indexes.
  A unit or chapter cover that lists only its own lessons is NOT toc: it is content (output only its heading).
- front_matter: cover, copyright, authors, credits, book introduction, "how to use this book", app or publisher ads, "parts of the book" overviews, curriculum timetables or distribution plans (توزيع المنهج، الخطة الزمنية), national anthem or pledge pages. Body empty. A page that also teaches (definitions, skills, rules) is content: drop only its greeting or intro paragraph.
- exercises: the page holds only practice questions, tests or exam models WITHOUT worked answers. Body empty.
- answer_key: answers to the book's exercises. Body empty.
- blank: empty or purely decorative page. Body empty.

HEADINGS (the tutor's lesson map is built from them; never invent structure):
- "# الوحدة N: title" / "# الفصل N: title" / "# الباب N: title": ONLY on the page where that unit/chapter opens.
- "## الدرس N: title": ONLY on the page where that lesson opens (a big banner or badge such as "الدرس الثاني" / "Lesson 2" with the lesson title). Always use these Arabic label words; keep the title in the book's own language. Ordinals become digits; compound labels "1-3" mean lesson 3 of chapter 1 (never 13).
- A lesson title printed as bullet items (• A • B) is ONE title joined with " و".
- Books whose works are not labelled as units or lessons (a collection of stories, novels or texts): the page where a work opens gets "## <its printed title>" with no invented label or number, and a part printed without a unit label gets "# <part title>".
- "#" and "##" are reserved for those unit/chapter/lesson/work openings. Everything else is "###" (sections inside a lesson: أولاً / ثانيًا / ثالثًا ..., مثال 1, Vocabulary, Grammar, Reading) or "####" (sub-sections), however large its banner is. A section bar that repeats the lesson name is still "###" unless this is the lesson's opening page.
- A number in a badge before a section title is its item number: "### 5. title"; never fuse it into the words.
- A bare item label (1, ٢, أ, ب, س, Q1) is never a heading on its own: write it as a list item or a "س:" / "ج:" line followed by its text.
- Never drop a printed title: anything that is not a unit/chapter/lesson opening is kept as "###" or "####".
- Running headers/footers, page numbers, watermarks, website links, social-media handles and publisher ads are NOT content: omit them.
- Continuation pages start directly with "###" or body text. Never repeat the "#" or "##" heading of an ongoing unit or lesson.

CONTENT:
- Transcribe ALL instructional text verbatim and in reading order (right-to-left columns for Arabic pages, left-to-right for Latin pages): definitions, rules, laws, explanations, reasoning (علل / ماذا يحدث / ماذا لو), notes, tables, enrichment boxes, activities, experiments. Never summarize, shorten, paraphrase or add explanations of your own.
- Keep worked material: solved examples (مثال with الحل), applied models (نموذج تطبيقي), and questions printed WITH their answers (س / ج, Q / A), including choices and every solution step. Omit questions printed without answers.
- Drop learning-outcome / objectives boxes (نواتج التعلم، أهداف الدرس) and decorative captions.
- Tables become Markdown tables. Lists stay lists. Bold only what the book highlights as a key term.
- Figures: ignore decorative pictures. A diagram, graph, map or chart that carries information becomes one line "(شكل: ...)" saying what it shows, in the book's language.
- Keep the book's language, spelling and diacritics (tashkeel) exactly. Fix only obvious scanning noise.
{SUBJECT_RULES}
OUTPUT RULES: pure Markdown in the body; "#" and "##" only for unit/chapter/lesson/work openings. No code fences, no emojis, no comments about the page, no greetings.`;

const SUBJECT_RULES: Array<{ test: RegExp; rules: string }> = [
  {
    test: /دين|ديني|إسلام|اسلام|مسيح|قرآن|قران|حديث|فقه|تفسير|توحيد|سيرة|عقيدة|تجويد|religio|islam/i,
    rules: `- Religious texts: Quran verses verbatim with full diacritics inside ﴿ ﴾ followed by the surah reference as printed; hadith verbatim with its narrator and source; keep rulings (الحكم), evidence (الدليل) and lessons learned (ما يستفاد) as separate "###" sections.`,
  },
  {
    test: /عرب|نحو|بلاغة|أدب|ادب|نصوص|قراءة|arabic/i,
    rules: `- Arabic language: keep tashkeel exactly as printed. Poetry: one بيت per line with its two hemistichs separated by " ... ", never merged into prose. Quran verses inside ﴿ ﴾. Grammar: keep the rule, every example and any إعراب table; reading passages and texts are transcribed in full with their explanations (معاني المفردات، الشرح، التذوق).`,
  },
  {
    test: /انجليز|إنجليز|english|فرنس|french|ألمان|الماني|german|إيطال|ايطال|italian|إسبان|اسبان|spanish|لغة أجنبية/i,
    rules: `- Foreign-language book: transcribe the text in its own language exactly (do not translate). Vocabulary lists stay as tables or lists with their meanings as printed; grammar rules keep every example sentence; reading passages and dialogues are transcribed in full with speaker names. Section headings stay in the book's language (### Vocabulary, ### Grammar: ...).`,
  },
  {
    test: /رياض|جبر|هندس|تفاضل|تكامل|حساب|إحصاء|احصاء|ميكانيكا|استاتيكا|ديناميكا|مثلثات|math|algebra|geometry|calculus|statistic/i,
    rules: `- Mathematics: every expression, equation, symbol and number inside LaTeX ($...$ inline, $$...$$ display), exactly as printed. Keep definitions, theorems, corollaries and proofs as "###" sections, and every step of solved examples. Geometric figures become "(شكل: ...)" naming points, angles and given lengths.`,
  },
  {
    test: /فيزياء|كيمياء|أحياء|احياء|علوم|جيولوجيا|بيئة|physics|chemistry|biology|science|geology/i,
    rules: `- Science: every equation, symbol, unit and number inside LaTeX ($...$ inline, $$...$$ display), written exactly as in the book (Latin symbols and Western digits for formulas). Chemical equations in LaTeX with \\rightarrow and states as printed. Keep laws, their units and conditions, and every step of solved problems.`,
  },
  {
    test: /تاريخ|جغرافي|دراسات|اجتماعي|مواطنة|history|geograph|social/i,
    rules: `- Social studies: keep every date, name, place and number exactly. Timelines become lists in date order; maps and charts become "(خريطة: ...)" or "(شكل: ...)" lines naming what they show; comparison boxes become Markdown tables.`,
  },
  {
    test: /فلسف|منطق|علم النفس|اجتماع|philosoph|psycholog|logic/i,
    rules: `- Philosophy, logic and psychology: keep each thinker's name with his view, quotations verbatim inside quotation marks, and arguments in their printed order; logic symbols and truth tables as Markdown tables.`,
  },
];

export function subjectRules(subjectName: string): string {
  const match = SUBJECT_RULES.find((r) => r.test.test(subjectName || ""));
  return match ? `\nSUBJECT RULES:\n${match.rules}\n` : "";
}

function cleanKey(key?: string): string {
  return (key || process.env.DEEPSEEK_API_KEY || "").replace(/^Bearer\s+/i, "").trim();
}

type UserContent = Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

interface Completion {
  text: string;
  truncated: boolean;
}

async function callDeepSeek(apiKey: string, system: string, userContent: UserContent, maxTokens: number): Promise<Completion> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        thinking: { type: "disabled" },
        temperature: 0,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`API error (${response.status}): ${(await response.text()).slice(0, 300)}`);
    }
    const data = await response.json();
    const choice = data?.choices?.[0];
    const text = String(choice?.message?.content || "").trim();
    if (!text) throw new Error("استجابة فارغة من النموذج");
    return { text, truncated: choice?.finish_reason === "length" };
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRetryable(error: any): boolean {
  return !/\((400|401|402|403)\)/.test(String(error?.message || ""));
}

async function withRetries<T>(
  task: (attempt: number) => Promise<T>,
  maxRetries: number,
  onWait?: (attempt: number, max: number, delayMs: number) => void
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await task(attempt);
    } catch (error: any) {
      lastError = error;
      if (!isRetryable(error) || attempt === maxRetries) break;
      const delayMs = Math.min(1500 * Math.pow(1.8, attempt - 1), 20000);
      onWait?.(attempt, maxRetries, delayMs);
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
  throw lastError;
}

function stripFences(text: string): string {
  return text.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim();
}

const NOISE_LINE = /^(?:[\d٠-٩]{1,4}|https?:\/\/\S+|t\.me\/\S+|www\.\S+|@\w{3,})$/i;

/** Splits "PAGE_TYPE: x\n---\nbody" and removes stray noise lines; a missing header means content. */
export function parseExtraction(raw: string): { pageType: PageType; body: string } {
  const text = stripFences(raw);
  const header = text.match(/^\s*PAGE_TYPE\s*:\s*([a-z_]+)\s*\n?(?:-{3,}\s*\n?)?/i);
  const type = header?.[1].toLowerCase() as PageType | undefined;
  const pageType: PageType = type && PAGE_TYPES.includes(type) ? type : "content";
  const body = stripFences(header ? text.slice(header[0].length) : text)
    .split("\n")
    .filter((l) => !NOISE_LINE.test(l.trim()))
    .join("\n")
    .trim();
  return { pageType, body };
}

/**
 * One request per page: the model reads the image (and the PDF text layer when it exists),
 * classifies the page and returns its organized Markdown or, for a table of contents, its outline.
 */
export async function extractPageWithDeepSeek(
  imageBuffer: Buffer | null | undefined,
  extractedText: string | undefined,
  options: DeepSeekOrganizerOptions
): Promise<PageExtraction> {
  const apiKey = cleanKey(options.apiKey);
  const hasImage = !!imageBuffer?.length;
  const text = (extractedText || "").trim();
  if (!hasImage && !text) throw new Error("تعذر قراءة الصفحة: لا توجد صورة ولا نص");
  if (!apiKey) throw new Error("لم يتم إدخال مفتاح DeepSeek");

  const lines = [`Subject: ${options.subjectName}`, `Stage: ${options.gradeLevel}`];
  if (options.pageNumber) lines.push(`PDF page: ${options.pageNumber}`);
  if (options.outlineContext) {
    lines.push(
      "",
      "Official book outline (from its table of contents). When this page opens one of these entries, write that entry's heading exactly as listed ('# الوحدة N: title' / '# الفصل N: title' for units and chapters, '## الدرس N: title' for lessons), even when the page prints it as an ordinal or numbered section title. Never create a '#' or '##' heading for anything that is not in this outline; keep such titles as '###':",
      options.outlineContext
    );
  }
  if (text) lines.push("", "PDF text layer (may be out of order or noisy; the image is authoritative):", "---", text.slice(0, 12000), "---");
  lines.push("", "Process this page following the system rules.");

  const content: UserContent = [{ type: "text", text: lines.join("\n") }];
  if (hasImage) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBuffer!.toString("base64")}` } });
  const system = SYSTEM_PROMPT.replace("{SUBJECT_RULES}", subjectRules(options.subjectName));

  try {
    return await withRetries(
      async () => {
        let completion = await callDeepSeek(apiKey, system, content, MAX_TOKENS);
        if (completion.truncated) completion = await callDeepSeek(apiKey, system, content, MAX_TOKENS_LONG);
        const { pageType, body } = parseExtraction(completion.text);
        if (pageType === "content" && !body) throw new Error("صُنفت الصفحة كمحتوى لكن النص المستخرج فارغ");
        return {
          pageType,
          markdown: pageType === "content" ? body : "",
          tocText: pageType === "toc" ? body : "",
          truncated: completion.truncated,
        };
      },
      options.maxRetries ?? 4,
      options.onNetworkWait
    );
  } catch (error: any) {
    throw new Error(`فشل استجابة DeepSeek (${error?.message || "خطأ غير معروف"})`);
  }
}
