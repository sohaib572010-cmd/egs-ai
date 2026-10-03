import dns from "dns";
import type { OutlineKind } from "./outline";

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

export interface TocEntry {
  kind: OutlineKind;
  number: number | null;
  title: string;
}

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-flash";
const REQUEST_TIMEOUT_MS = 90000;

export const DEEPSEEK_RAG_SYSTEM_PROMPT = `You convert one page of an Egyptian school textbook (page image plus optional PDF text) into clean Markdown that will be chunked for a retrieval-augmented AI tutor. Accuracy and faithful structure matter more than anything else.

HEADING HIERARCHY (the tutor's lesson map is built from these, so never invent structure):
- "# الوحدة N: title" / "# الفصل N: title" / "# الباب N: title": ONLY on the page where that unit/chapter opens (its cover or title page).
- "## الدرس N: title": ONLY on the page where that lesson opens. Egyptian books mark a lesson opening with a large banner or badge such as "الدرس الأول" / "الدرس الثاني" next to "الفصل 5" and a big title. Convert ordinal words to digits (الأول=1, الثاني=2, ...). Compound labels "1-3" or "2-1" mean lesson 3 / lesson 1 of that chapter; never merge them into 13 or 21.
- A title made of bullet items (• خصائص المواد في الحالة الغازية • قانون بويل) is ONE lesson title joined with " و": "## الدرس 1: خصائص المواد في الحالة الغازية وقانون بويل".
- "###" for sections inside a lesson (e.g. "أولاً: الأواني المستطرقة", "مثال 1", "ملاحظات"), "####" for sub-sections. A colored section bar that repeats or resembles the lesson name is still "###" unless the page is the lesson's opening banner.
- A number printed in a badge or box before a section title is its item number, not part of the words: read the title letters exactly (e.g. a "5" badge before "الخاصية الفلزية واللافلزية" gives "### 5. الخاصية الفلزية واللافلزية").
- A unit or chapter cover page that lists the lessons it contains: output only the unit/chapter heading (and any real explanatory text), never the listed lessons as headings.
- Running headers/footers in the margins ("الدرس الثاني 195", "176 الفصل 5", "الامتحان فيزياء") are NOT headings: omit them entirely.
- Continuation pages start directly with "###" or body text. Never repeat "#" or "##" headings of the ongoing unit or lesson.

CONTENT:
- Transcribe ALL instructional text verbatim: definitions, laws, explanations, reasoning (علل / ماذا يحدث / ماذا لو), notes, tables, enrichment boxes, activities and experiments. Do not summarize, shorten or paraphrase.
- A unit/lesson opening page may also contain lesson text below its banner: output the heading, then transcribe that text. Drop only learning-outcome / objectives boxes (نواتج التعلم، أهداف الدرس) and decorative captions.
- Keep solved examples ("مثال" with "الحل"), including their choices and full solution steps. Omit practice drills without solutions (اختبر نفسك، تدرب، أسئلة الدرس، تمارين) and exam sheets.
- Figures: ignore decorative photos. For a graph or diagram that carries information, write one short line "(شكل: ...)" stating what it shows (axes, relation, labels) in the book's language.
- Math and science: every equation, symbol, unit and number in LaTeX ($...$ inline, $$...$$ display), written exactly as in the book (Latin symbols and Western digits for physics/chemistry formulas).
- Keep the book's language and spelling; fix only obvious OCR noise.

PAGE TYPES THAT PRODUCE AN EMPTY OUTPUT: the book cover, copyright/credits/authors, the book introduction, "how to use this book", the table of contents, answer keys, and pages that are only practice questions or exams.

OUTPUT: pure Markdown only. No code fences, no emojis, no notes about the page, no greetings, no labels like "نوع المحتوى".`;

const TOC_SYSTEM_PROMPT = `You inspect one page of an Egyptian school textbook and decide whether it is the WHOLE BOOK's table of contents (فهرس / محتويات الكتاب), which lists several units or chapters with page numbers. A unit or chapter cover page that only lists its own lessons is NOT the table of contents (is_toc: false). Respond with JSON only:
{"is_toc": boolean, "entries": [{"kind": "intro" | "unit" | "chapter" | "lesson", "number": integer or null, "title": string, "topics": [string]}]}
Rules for entries (only when is_toc is true), in the order printed:
- Create exactly ONE entry per printed label: "unit" = الوحدة/الباب, "chapter" = الفصل, "lesson" = الدرس, "intro" = a section listed before the first unit (e.g. مقدمة رياضية). Never create an entry for a bullet point.
- number: the number printed with that label (ordinal words to digits, e.g. الدرس الثاني = 2); null for intro.
- title: the text printed for that label, without the "الوحدة/الفصل/الدرس N" words and without page numbers.
- topics: when one lesson row lists several bullet items (• A • B), put each item in topics and leave title as "" (they are the same lesson). Otherwise topics is [].
- Exclude page numbers, exam model sections (نماذج امتحانات), answer keys (إجابات), and indexes.`;

function cleanKey(key?: string): string {
  return (key || process.env.DEEPSEEK_API_KEY || "").replace(/^Bearer\s+/i, "").trim();
}

type UserContent = Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;

async function callDeepSeek(
  apiKey: string,
  system: string,
  userContent: UserContent,
  extra: Record<string, unknown> = {}
): Promise<string> {
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
        temperature: 0.1,
        stream: false,
        ...extra,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`API error (${response.status}): ${(await response.text()).slice(0, 300)}`);
    }
    const data = await response.json();
    const msg = data?.choices?.[0]?.message;
    return String(msg?.content || msg?.reasoning_content || "").trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRetryable(error: any): boolean {
  const message = String(error?.message || "");
  return !/\((400|401|402|403)\)/.test(message);
}

async function withRetries<T>(
  task: () => Promise<T>,
  maxRetries: number,
  onWait?: (attempt: number, max: number, delayMs: number) => void
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await task();
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

function imagePart(imageBuffer: Buffer): { type: "image_url"; image_url: { url: string } } {
  return { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBuffer.toString("base64")}` } };
}

function stripFences(text: string): string {
  return text.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function organizePageWithDeepSeek(
  imageBuffer: Buffer | null | undefined,
  extractedText: string | undefined,
  options: DeepSeekOrganizerOptions
): Promise<string> {
  const apiKey = cleanKey(options.apiKey);
  const hasImage = !!(imageBuffer && imageBuffer.length > 0);
  const text = (extractedText || "").trim();
  if (!hasImage && !text) return "";
  if (!apiKey) throw new Error("لم يتم إدخال مفتاح DeepSeek");

  const lines = [`Subject: ${options.subjectName}`, `Stage: ${options.gradeLevel}`];
  if (options.pageNumber) lines.push(`PDF page: ${options.pageNumber}`);
  if (options.outlineContext) {
    lines.push(
      "",
      "Official book outline (from its table of contents). When this page opens one of these entries, use its exact title in the '#' or '##' heading. Never create a '#' or '##' heading for anything that is not in this outline:",
      options.outlineContext
    );
  }
  if (text) lines.push("", "PDF text layer (may be out of order or noisy; the image is authoritative):", "---", text.slice(0, 12000), "---");
  lines.push("", "Convert this page following the system rules.");

  const content: UserContent = [{ type: "text", text: lines.join("\n") }];
  if (hasImage) content.push(imagePart(imageBuffer!));

  try {
    const result = await withRetries(
      () => callDeepSeek(apiKey, DEEPSEEK_RAG_SYSTEM_PROMPT, content),
      options.maxRetries ?? 4,
      options.onNetworkWait
    );
    return stripFences(result);
  } catch (error: any) {
    if (!hasImage && text) return text;
    throw new Error(`فشل استجابة DeepSeek (${error?.message || "خطأ غير معروف"})`);
  }
}

/** Reads a table-of-contents page into outline entries; returns null when the page is not a TOC. */
export async function detectTocPage(
  imageBuffer: Buffer | null | undefined,
  extractedText: string | undefined,
  options: Pick<DeepSeekOrganizerOptions, "apiKey" | "maxRetries">
): Promise<TocEntry[] | null> {
  const apiKey = cleanKey(options.apiKey);
  const text = (extractedText || "").trim();
  if (!apiKey || (!imageBuffer?.length && !text)) return null;

  const content: UserContent = [{ type: "text", text: text ? `PDF text layer:\n${text.slice(0, 6000)}` : "Inspect this page." }];
  if (imageBuffer?.length) content.push(imagePart(imageBuffer));

  const raw = await withRetries(
    () => callDeepSeek(apiKey, TOC_SYSTEM_PROMPT, content, { response_format: { type: "json_object" }, max_tokens: 2500 }),
    options.maxRetries ?? 3
  );
  try {
    const parsed = JSON.parse(stripFences(raw));
    if (!parsed?.is_toc || !Array.isArray(parsed.entries)) return null;
    const kinds: OutlineKind[] = ["intro", "unit", "chapter", "lesson"];
    const entries: TocEntry[] = parsed.entries
      .filter((e: any) => e && kinds.includes(e.kind))
      .map((e: any) => {
        const topics = Array.isArray(e.topics) ? e.topics.filter((t: unknown) => typeof t === "string" && t.trim()).map((t: string) => t.trim()) : [];
        const title = typeof e.title === "string" && e.title.trim() ? e.title.trim() : topics.join(" و");
        return { kind: e.kind, number: Number.isInteger(e.number) ? e.number : null, title };
      })
      .filter((e: TocEntry) => e.title);
    return entries.length >= 2 ? entries : null;
  } catch {
    return null;
  }
}
