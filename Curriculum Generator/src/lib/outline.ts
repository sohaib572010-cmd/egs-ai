export type OutlineKind = "intro" | "unit" | "chapter" | "lesson";

export interface OutlineNode {
  kind: OutlineKind;
  number: number | null;
  title: string;
  children: OutlineNode[];
  /** False when the book prints the entry without a unit/lesson label (e.g. a story in a collection). */
  labeled?: boolean;
}

export interface AlignmentReport {
  matched: number;
  missing: string[];
  demoted: number;
  dropped: number;
}

const ORDINALS: Record<string, number> = {
  "الاول": 1, "الاولي": 1, "اول": 1, "الثاني": 2, "الثانيه": 2, "ثاني": 2, "الثالث": 3, "الثالثه": 3, "ثالث": 3,
  "الرابع": 4, "الرابعه": 4, "رابع": 4, "الخامس": 5, "الخامسه": 5, "خامس": 5, "السادس": 6, "السادسه": 6, "سادس": 6,
  "السابع": 7, "السابعه": 7, "سابع": 7, "الثامن": 8, "الثامنه": 8, "ثامن": 8, "التاسع": 9, "التاسعه": 9, "تاسع": 9,
  "العاشر": 10, "العاشره": 10, "عاشر": 10, "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6,
  "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
};

const KIND_WORDS: Array<[RegExp, OutlineKind]> = [
  [/^(?:الوحده|الباب|unit)$/, "unit"],
  [/^(?:الفصل|chapter)$/, "chapter"],
  [/^(?:الدرس|الدروس|الموضوع|lesson|lessons)$/, "lesson"],
  [/^(?:مقدمه|تمهيد|intro|introduction)$/, "intro"],
];

const STOP_WORDS = new Set(["و", "في", "فى", "على", "علي", "من", "الى", "الي", "عن", "عند", "مع", "او", "ثم", "the", "of", "and", "a", "an", "to", "in"]);

export function normalizeArabic(text: string): string {
  return (text || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىيی]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[چگ]/g, "ج")
    .replace(/[کك]/g, "ك")
    .replace(/ڤ/g, "ف")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function cleanTitle(title: string): string {
  return (title || "")
    .replace(/\u0640/g, "")
    .replace(/[•·●▪]/g, " و ")
    .replace(/^(?:[\s:\-–—.،,]|و(?=\s))+/, "")
    .replace(/(?:[\s:\-–—.،,]|(?<=\s)و)+$/, "")
    .replace(/\s+و\s+و\s+/g, " و ")
    .replace(/\s+و\s+/g, " و")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberToken(token: string): number | null {
  const t = normalizeArabic(token);
  const compound = t.match(/^(\d{1,2})\s+(\d{1,2})$/);
  if (compound) return parseInt(compound[2], 10);
  if (/^\d{1,2}$/.test(t)) return parseInt(t, 10);
  return ORDINALS[t] ?? null;
}

/** Splits "الدرس 2: العجلة", "1 الدرس العجلة", "الفصل الثالث - القوة" into kind, number and bare title. */
export function parseHeadingLabel(raw: string): { kind: OutlineKind | null; number: number | null; title: string } {
  let text = (raw || "").replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
  let leadingNumber: number | null = null;
  const lead = text.match(/^(\d{1,2})\s+(?=\S)/);
  if (lead) {
    leadingNumber = parseInt(lead[1], 10);
    text = text.slice(lead[0].length);
  }
  const m = text.match(/^(\S+)(?:\s+(\d{1,2}\s*[-–—]\s*\d{1,2}|\d{1,2}|[٠-٩]{1,2}|\S+))?\s*[:：\-–—.]?\s*([\s\S]*)$/);
  if (!m) return { kind: null, number: null, title: cleanTitle(text) };
  const word = normalizeArabic(m[1]);
  const kind = KIND_WORDS.find(([re]) => re.test(word))?.[1] ?? null;
  if (!kind) return { kind: null, number: leadingNumber, title: cleanTitle(text) };
  if (kind === "intro") {
    const afterColon = text.match(/^\S+\s*[:：\-–—]\s*([\s\S]+)$/);
    return { kind, number: null, title: cleanTitle(afterColon ? afterColon[1] : text) };
  }
  const num = m[2] ? parseNumberToken(m[2].replace(/[-–—]/g, " ")) : null;
  const title = num !== null || !m[2] ? m[3] : `${m[2]} ${m[3]}`;
  return { kind, number: num ?? leadingNumber, title: cleanTitle(title) };
}

function stem(word: string): string {
  return word.replace(/^(?:وال|بال|فال|كال|لل|ال)(?=\S{2,})/, "").replace(/^و(?=\S{3,})/, "");
}

export function titleWords(title: string): string[] {
  return normalizeArabic(title)
    .split(" ")
    .map(stem)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Same word up to one scanning error (غبرات / عبرات, صخب / صح); very short words must match exactly. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length < 3 || /\d/.test(a + b)) return false;
  return (short.length >= 3 || long.startsWith(short)) && editDistanceAtMostOne(a, b);
}

function similarity(a: string[], b: string[]): { jaccard: number; containment: number; exact: boolean } {
  if (a.length === 0 || b.length === 0) return { jaccard: 0, containment: 0, exact: false };
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const w of A) if (B.has(w) || [...B].some((x) => sameWord(w, x))) inter++;
  const union = A.size + B.size - inter;
  const exact = inter === A.size && inter === B.size;
  return { jaccard: inter / union, containment: inter / Math.min(A.size, B.size), exact };
}

const SECTION_LINE = /^(?:قسم|section|part)\s*[:：\-–—]\s*(.+)$/i;
const AUTHOR_SUFFIX = /\s+(?:لـ?|للكاتب|للأديب|تأليف)\s*:?\s*[«"(][^»")]+[»")]\s*$/;
const BACK_MATTER_ENTRY =/^(?:ال)?(?:اجابات|اجابه|اجابات النموذجيه|نماذج الاجابه|نماذج الاجابات|فهرس|محتويات|مراجع|answers|answer key|index|contents)$/;

/**
 * Parses an outline: one entry per line, e.g. "الوحدة 1: ...", "الفصل 2: ...", "الدرس 1: ...", "مقدمة: ...".
 * "قسم: title" is a part the book prints without a unit label, and a bare title is an item the book prints
 * without a lesson label (a story, text or poem); both keep their printed title with no invented number.
 * An unlabelled answer-key or index line is not an entry.
 */
export function parseOutlineText(text: string): OutlineNode[] {
  const roots: OutlineNode[] = [];
  let unit: OutlineNode | null = null;
  let chapter: OutlineNode | null = null;
  for (const rawLine of (text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/^[\s\-*•#>]+/, "").trim();
    if (!line) continue;
    const section = line.match(SECTION_LINE);
    const parsed = section ? { kind: "unit" as const, number: null, title: cleanTitle(section[1]) } : parseHeadingLabel(line);
    parsed.title = parsed.title.replace(AUTHOR_SUFFIX, "").trim();
    if (!parsed.title || (!parsed.kind && BACK_MATTER_ENTRY.test(normalizeArabic(parsed.title)))) continue;
    const kind: OutlineKind = parsed.kind ?? "lesson";
    const node: OutlineNode = { kind, number: parsed.number, title: parsed.title, children: [] };
    if (section || !parsed.kind) node.labeled = false;
    if (kind === "intro") {
      roots.push(node);
    } else if (kind === "unit") {
      roots.push(node);
      unit = node;
      chapter = null;
    } else if (kind === "chapter") {
      (unit ? unit.children : roots).push(node);
      chapter = node;
    } else {
      const parent = chapter ?? unit;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  const firstLabeled = roots.findIndex((n) => n.labeled !== false && n.kind !== "intro");
  for (let i = 0; i < firstLabeled; i++) {
    if (roots[i].kind === "lesson" && roots[i].labeled === false) roots[i] = { kind: "intro", number: null, title: roots[i].title, children: [] };
  }
  numberSiblings(roots);
  return roots;
}

function numberSiblings(nodes: OutlineNode[]) {
  const counters: Partial<Record<OutlineKind, number>> = {};
  for (const n of nodes) {
    if (n.kind !== "intro") {
      counters[n.kind] = n.number ?? (counters[n.kind] ?? 0) + 1;
      n.number = counters[n.kind]!;
    }
    numberSiblings(n.children);
  }
}

function entryLabel(n: OutlineNode): string {
  if (n.kind === "intro") return `مقدمة: ${n.title}`;
  if (n.labeled === false) return n.kind === "lesson" ? n.title : `قسم: ${n.title}`;
  return `${KIND_LABEL[n.kind]} ${n.number}: ${n.title}`;
}

export function outlineToText(nodes: OutlineNode[]): string {
  const lines: string[] = [];
  const walk = (list: OutlineNode[]) => {
    for (const n of list) {
      lines.push(entryLabel(n));
      walk(n.children);
    }
  };
  walk(nodes);
  return lines.join("\n");
}

const KIND_LABEL: Record<Exclude<OutlineKind, "intro">, string> = { unit: "الوحدة", chapter: "الفصل", lesson: "الدرس" };

export function countOutlineLessons(nodes: OutlineNode[]): number {
  return flatten(nodes).filter((a) => a.node.kind === "lesson" || a.node.kind === "intro" || isLeafContainer(a.node)).length;
}

interface Anchor {
  node: OutlineNode;
  ancestors: OutlineNode[];
  words: string[];
}

function flatten(nodes: OutlineNode[], ancestors: OutlineNode[] = [], out: Anchor[] = []): Anchor[] {
  for (const n of nodes) {
    out.push({ node: n, ancestors, words: titleWords(n.title) });
    flatten(n.children, [...ancestors, n], out);
  }
  return out;
}

function isLeafContainer(n: OutlineNode): boolean {
  return (n.kind === "unit" || n.kind === "chapter") && n.children.length === 0;
}

const INTRO_BLOCK = "# مقدمات أساسية";

function headingsFor(anchor: Anchor, introOpen: boolean): string[] {
  const n = anchor.node;
  if (n.kind === "intro") return introOpen ? [`## ${n.title}`] : [INTRO_BLOCK, `## ${n.title}`];
  const unlabeled = n.labeled === false;
  if (n.kind === "lesson") return [unlabeled ? `## ${n.title}` : `## الدرس ${n.number}: ${n.title}`];
  const heading = unlabeled ? `# ${n.title}` : `# ${KIND_LABEL[n.kind]} ${n.number}: ${n.title}`;
  return isLeafContainer(n) ? [heading, unlabeled ? `## ${n.title}` : `## الدرس 1: ${n.title}`] : [heading];
}

/** Whether the outline keeps the book's answer section as an entry of its own. */
export function outlineHasAnswers(nodes: OutlineNode[]): boolean {
  return flatten(nodes).some((a) => BACK_MATTER_ENTRY.test(normalizeArabic(a.node.title)));
}

/** Lessons listed at the top level (a book without units) are grouped into one block named after the book. */
export function wrapLooseLessons(nodes: OutlineNode[], title: string): OutlineNode[] {
  const out: OutlineNode[] = [];
  let block: OutlineNode | null = null;
  for (const n of nodes) {
    if (n.kind !== "lesson") {
      out.push(n);
      block = null;
      continue;
    }
    if (!block) {
      block = { kind: "unit", number: null, title, children: [], labeled: false };
      out.push(block);
    }
    block.children.push(n);
  }
  return out;
}

/**
 * A contents page read by the vision model gets "الدرس N" labels even when the book prints its works
 * without them. When the opening headings in the body rarely carry the outline's own lesson numbers,
 * the labels were invented, so the lessons keep their printed titles only.
 */
export function markUnlabeledLessons(nodes: OutlineNode[], markdown: string): OutlineNode[] {
  const lessons = flatten(nodes).filter((a) => a.node.kind === "lesson" && a.node.labeled !== false);
  if (lessons.length < 3) return nodes;
  const headings = markdown
    .split("\n")
    .map((l) => l.match(/^#{1,2}\s+(.+?)\s*$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => parseHeadingLabel(m[1]))
    .map((label) => ({ label, words: titleWords(label.title) }));
  let found = 0;
  let numbered = 0;
  for (const a of lessons) {
    const hits = headings.filter((h) => {
      const s = similarity(h.words, a.words);
      return s.exact || s.jaccard >= 0.5 || s.containment === 1;
    });
    if (hits.length === 0) continue;
    found++;
    if (hits.some((h) => h.label.kind === "lesson" && h.label.number === a.node.number)) numbered++;
  }
  if (found < 3 || numbered * 2 >= found) return nodes;
  const strip = (list: OutlineNode[]): OutlineNode[] =>
    list.map((n) => ({ ...n, labeled: n.kind === "lesson" ? false : n.labeled, children: strip(n.children) }));
  return strip(nodes);
}

/**
 * A table of contents often prints one lesson as bullet topics (• الحركة • السرعة) that a
 * vision model reads as separate lessons. The lesson opening pages are the ground truth: when an
 * explicit lesson heading in the body covers several consecutive outline lessons, they are merged
 * into one lesson titled like that heading, and lessons are renumbered within their parent.
 */
export function reconcileOutlineWithBody(nodes: OutlineNode[], markdown: string): OutlineNode[] {
  const headings = markdown
    .split("\n")
    .map((l) => l.match(/^(#{1,6})\s+(.+?)\s*$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ level: m[1].length, label: parseHeadingLabel(m[2]) }))
    .filter((h) => h.label.kind === "lesson" || (h.level <= 2 && h.label.title))
    .map((h) => ({ title: h.label.title, number: h.label.kind === "lesson" ? h.label.number : null, words: new Set(titleWords(h.label.title)) }));

  const covers = (h: { words: Set<string> }, n: OutlineNode) => {
    const w = titleWords(n.title);
    return w.length > 0 && w.every((x) => h.words.has(x));
  };
  const isExactUnion = (h: { words: Set<string> }, group: OutlineNode[]) => {
    const union = new Set(group.flatMap((n) => titleWords(n.title)));
    const strictParts = group.every((n) => new Set(titleWords(n.title)).size < h.words.size);
    return strictParts && union.size === h.words.size && [...h.words].every((w) => union.has(w));
  };

  const mergeChildren = (children: OutlineNode[]): OutlineNode[] => {
    const out: OutlineNode[] = [];
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.kind !== "lesson") {
        out.push({ ...node, children: mergeChildren(node.children) });
        continue;
      }
      let best: { end: number; title: string } | null = null;
      for (const h of headings) {
        if (!covers(h, node)) continue;
        let end = i;
        while (end + 1 < children.length && children[end + 1].kind === "lesson" && covers(h, children[end + 1])) end++;
        while (end > i && !isExactUnion(h, children.slice(i, end + 1))) end--;
        if (end > i && (!best || end > best.end)) best = { end, title: h.title };
      }
      if (best) {
        out.push({ kind: "lesson", number: null, title: best.title, children: [], labeled: node.labeled });
        i = best.end;
      } else {
        out.push({ ...node, children: [] });
      }
    }
    let n = 0;
    for (const node of out) if (node.kind === "lesson") node.number = ++n;
    for (const node of out) {
      if (node.kind !== "lesson") continue;
      const words = new Set(titleWords(node.title));
      const fuller = headings.find(
        (h) =>
          h.number === node.number &&
          h.words.size > words.size &&
          [...words].every((w) => h.words.has(w)) &&
          !out.some((o) => o !== node && titleWords(o.title).every((w) => h.words.has(w)) && new Set(titleWords(o.title)).size === h.words.size)
      );
      if (fuller) node.title = fuller.title;
    }
    return out;
  };

  return mergeChildren(nodes);
}

/**
 * An outline is incomplete (e.g. read from one chapter's cover instead of the book's contents)
 * when the body opens several units/chapters that the outline does not know.
 */
export function isOutlineIncomplete(nodes: OutlineNode[], markdown: string): boolean {
  const containers = flatten(nodes).filter((a) => a.node.kind === "unit" || a.node.kind === "chapter");
  const unknown = new Set<string>();
  for (const line of markdown.split("\n")) {
    const m = line.match(/^#{1,2}\s+(.+?)\s*$/);
    if (!m) continue;
    const label = parseHeadingLabel(m[1]);
    if ((label.kind !== "unit" && label.kind !== "chapter") || !label.title) continue;
    const words = titleWords(label.title);
    if (words.length === 0) continue;
    const known = containers.some((a) => {
      const s = similarity(words, a.words);
      return s.exact || s.jaccard >= 0.5;
    });
    if (!known) unknown.add(normalizeArabic(label.title));
  }
  return unknown.size >= 2;
}

/** The book outline as a compact list for the page-extraction prompt. */
export function outlineToPromptContext(nodes: OutlineNode[]): string {
  return flatten(nodes)
    .map((a) => {
      const pad = "  ".repeat(a.ancestors.length);
      return `${pad}- ${entryLabel(a.node)}`;
    })
    .join("\n");
}

/**
 * Pages whose headings mostly restate the outline with little body text are the table of contents
 * or unit/chapter cover pages listing their lessons; they are removed before alignment so they
 * cannot claim the lessons they list.
 */
export function isTocPage(pageMarkdown: string, nodes: OutlineNode[]): boolean {
  const anchors = flatten(nodes);
  if (anchors.length < 4) return false;
  const lines = pageMarkdown.split("\n").map((l) => l.trim()).filter(Boolean);
  const entryLines = lines.filter((l) => /^(?:#{1,6}\s|[-*•]\s|\|)/.test(l) || l.length < 90);
  let hits = 0;
  const seen = new Set<number>();
  for (const l of entryLines) {
    const words = titleWords(parseHeadingLabel(l.replace(/^[-*•|\s]+/, "")).title);
    const idx = anchors.findIndex((a, i) => !seen.has(i) && similarity(words, a.words).exact);
    if (idx >= 0) {
      seen.add(idx);
      hits++;
    }
  }
  const bodyChars = lines.filter((l) => !/^#{1,6}\s/.test(l)).join(" ").length;
  return hits >= Math.min(3, anchors.length) && bodyChars < hits * 160;
}

const PAGE_START = /^<!-- (?:بداية الصفحة|page) \d+ -->$/;
const COVER_MAX_CHARS = 200;

/**
 * Rewrites the heading structure of an assembled book to match its outline. Headings that name
 * the next outline entries become canonical unit/chapter/lesson headings (missing parents are
 * emitted first); repeats of the active entry are dropped; any other level 1-2 heading is demoted
 * to a section heading so page-level extraction mistakes cannot create phantom units or lessons.
 */
export function alignMarkdownToOutline(markdown: string, nodes: OutlineNode[]): { markdown: string; report: AlignmentReport } {
  const anchors = flatten(nodes);
  const report: AlignmentReport = { matched: 0, missing: [], demoted: 0, dropped: 0 };
  if (anchors.length === 0) return { markdown, report };

  const emitted = new Set<OutlineNode>();
  const out: string[] = [];
  let pointer = 0;
  let introOpen = false;
  let active: Anchor[] = [];
  let cover: { at: number; chars: number } | null = null;
  let pageStart = false;

  const emitAnchor = (index: number) => {
    const anchor = anchors[index];
    for (let k = pointer; k < index; k++) {
      const skipped = anchors[k].node;
      if (!emitted.has(skipped) && !anchor.ancestors.includes(skipped) && (skipped.kind === "lesson" || skipped.kind === "intro" || isLeafContainer(skipped))) {
        report.missing.push(skipped.title);
      }
    }
    const opening: string[] = [];
    for (const parent of anchor.ancestors) {
      if (emitted.has(parent)) continue;
      const parentAnchor = anchors.find((a) => a.node === parent)!;
      opening.push("", ...headingsFor(parentAnchor, introOpen), "");
      emitted.add(parent);
    }
    opening.push("", ...headingsFor(anchor, introOpen), "");
    // A cover page that prints only the title (often misspelled by the scan) opens the entry.
    if (cover) out.splice(cover.at, 1, ...opening);
    else out.push(...opening);
    cover = null;
    introOpen = anchor.node.kind === "intro";
    emitted.add(anchor.node);
    active = [...anchor.ancestors.map((p) => anchors.find((a) => a.node === p)!), anchor];
    pointer = index + 1;
    report.matched++;
  };

  const lines = markdown.split("\n");
  const parsed = lines.map((line) => {
    const hm = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!hm) return null;
    const level = hm[1].length;
    const label = parseHeadingLabel(hm[2]);
    return { level, label, words: titleWords(label.title), structural: level <= 2 || label.kind !== null };
  });

  // A section heading that merely shares an entry's title must not claim it when an explicit
  // unit/chapter/lesson heading for that entry appears later (the real opening page).
  const lastStrongLine = new Map<number, number>();
  parsed.forEach((h, i) => {
    if (!h?.structural || h.words.length === 0) return;
    anchors.forEach((a, j) => {
      const s = similarity(h.words, a.words);
      if (s.exact || s.jaccard >= 0.5) lastStrongLine.set(j, i);
    });
  });

  // Words that tell a lesson apart from its neighbours: "المنصوبات" in "مراجعة على ما سبق دراسته: المنصوبات".
  const distinctive = anchors.map((a, j) => {
    if (a.node.kind !== "lesson") return [];
    const parent = a.ancestors[a.ancestors.length - 1];
    const near = [anchors[j - 1], anchors[j + 1]].filter((b) => b && b.node.kind === "lesson" && b.ancestors[b.ancestors.length - 1] === parent);
    return a.words.filter((w) => !near.some((b) => b.words.some((x) => sameWord(w, x))));
  });
  // A lesson opening printed as a plain section title at the top of its page.
  const opensAsSection = (words: string[], j: number) => {
    const a = anchors[j];
    if (a.node.kind !== "lesson") return false;
    const d = distinctive[j];
    if (d.length > 0 && d.length < a.words.length && similarity(words, d).exact) return true;
    return words.length > a.words.length && a.words.every((w, k) => sameWord(words[k], w));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = parsed[i];
    const atPageStart = pageStart;
    if (PAGE_START.test(line.trim())) pageStart = true;
    else if (line.trim()) pageStart = false;
    if (!h) {
      if (cover && (cover.chars += line.trim().length) > COVER_MAX_CHARS) cover = null;
      out.push(line);
      continue;
    }
    const { level, label, words, structural } = h;
    if (level >= 3) cover = null;
    if (words.length === 0) {
      if (level <= 2) {
        report.dropped++;
        continue;
      }
      out.push(line);
      continue;
    }

    const window = structural ? 8 : 3;
    let best = -1;
    let bestScore = 0;
    let bestExact = false;
    for (let j = pointer; j < Math.min(anchors.length, pointer + window); j++) {
      const s = similarity(words, anchors[j].words);
      const accepted = structural
        ? s.exact || s.jaccard >= 0.5 || s.containment === 1
        : (s.exact || (atPageStart && j === pointer && opensAsSection(words, j))) && (lastStrongLine.get(j) ?? -1) < i;
      if (!accepted) continue;
      const node = anchors[j].node;
      const numberBonus = node.labeled !== false && label.number !== null && label.number === node.number && label.kind === node.kind ? 0.4 : 0;
      const score = s.jaccard + 0.25 * s.containment + (s.exact ? 0.5 : 0) + numberBonus - 0.05 * (j - pointer);
      if (score > bestScore) {
        bestScore = score;
        best = j;
        bestExact = s.exact;
      }
    }

    const repeatsActive = active.some((a) => {
      const s = similarity(words, a.words);
      return structural ? s.exact || s.jaccard >= 0.5 || s.containment === 1 : s.exact;
    });
    // "التحليل الأدبي لرواية «الأرض»" inside the lesson الأرض is a section, not a repeat of its title.
    const addsWords = !active.some((a) => similarity(words, a.words).containment === 1 && words.length <= a.words.length);

    if (best >= 0 && (!repeatsActive || bestExact)) {
      emitAnchor(best);
    } else if (repeatsActive && level <= 3 && !addsWords) {
      report.dropped++;
    } else if (level <= 2) {
      cover = atPageStart ? { at: out.length, chars: 0 } : null;
      out.push(`### ${label.title}`);
      report.demoted++;
    } else {
      out.push(line);
    }
  }

  for (let k = pointer; k < anchors.length; k++) {
    const n = anchors[k].node;
    if (!emitted.has(n) && (n.kind === "lesson" || n.kind === "intro" || isLeafContainer(n))) report.missing.push(n.title);
  }

  return { markdown: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), report };
}

export interface TocPageText {
  pageNumber: number;
  tocText: string;
}

export interface DerivedOutline {
  outline: OutlineNode[] | null;
  tocPages: number[];
  /** Markdown for pages the model labelled "toc" that are not part of the accepted contents. */
  fallbacks: Map<number, string>;
}

export const TOC_SCAN_PAGES = 15;

function containerCount(nodes: OutlineNode[]): number {
  return flatten(nodes).filter((a) => a.node.kind === "unit" || a.node.kind === "chapter").length;
}

/**
 * Builds the book outline from the pages classified as a table of contents during extraction.
 * Only pages near the start of the book that together list 2+ units/chapters (or 3+ top-level items for
 * a book without units, such as a collection of stories) are accepted; any other
 * "toc" page is usually a unit cover listing its lessons, so it keeps just its single unit heading.
 */
export function deriveOutlineFromTocPages(pages: TocPageText[]): DerivedOutline {
  const sorted = pages.filter((p) => p.tocText.trim()).sort((a, b) => a.pageNumber - b.pageNumber);
  const front = sorted.filter((p) => p.pageNumber <= TOC_SCAN_PAGES);
  const combined = front.length ? parseOutlineText(front.map((p) => p.tocText).join("\n")) : [];
  const containers = containerCount(combined);
  const accepted = containers >= 2 || (containers === 0 && combined.filter((n) => n.kind === "lesson").length >= 3);
  const tocPages = accepted ? front.map((p) => p.pageNumber) : [];
  const fallbacks = new Map<number, string>();
  for (const p of sorted) {
    if (tocPages.includes(p.pageNumber)) continue;
    const containers = flatten(parseOutlineText(p.tocText)).filter((a) => a.node.kind === "unit" || a.node.kind === "chapter");
    fallbacks.set(p.pageNumber, containers.length === 1 ? headingsFor(containers[0], false)[0] : "");
  }
  return { outline: accepted ? combined : null, tocPages, fallbacks };
}
