import { alignMarkdownToOutline, isOutlineIncomplete, isTocPage, normalizeArabic, parseHeadingLabel, reconcileOutlineWithBody, type AlignmentReport, type OutlineNode } from "./outline";

export interface PageMarkdown {
  pageNumber: number;
  markdown: string;
}

export interface BuildResult {
  markdown: string;
  report: AlignmentReport | null;
  droppedTocPages: number[];
  outline: OutlineNode[] | null;
}

const PAGE_MARKER = /^<!-- (?:بداية الصفحة|page) (\d+) -->$/;

const CLUTTER_HEADING = /^#{1,6}\s*(?:أهداف الدرس|أهداف الوحدة|نواتج التعلم|مخرجات التعلم|الأهداف التعليمية|المهارات والقيم والقضايا المتضمنة|المفاهيم المتقاطعة|تهيئة الدرس|التهيئة|تساؤلات تمهيدية(?: للدرس)?|سؤال الدرس|Learning Outcomes|Lesson Objectives)(?![\p{L}\p{N}])/iu;
const OUTCOME_BULLET = /^[-*•]\s*(?:يتوقع من الطالب|في نهاية هذا الدرس|مع نهاية الدرس|أن يتعرف|أن يستنتج|أن يحدد|أن يفسر|أن يوضح|أن يميز)/;
const BACK_MATTER = /^(?:#{1,4}\s*)?(?:المؤلفون|المراجعون|الإشراف العام|فريق الإعداد|جميع الحقوق محفوظة|All rights reserved)(?![\p{L}\p{N}])/iu;
const META_LABEL = /^\[(?:نوع المحتوى|Content Type):.+\]$/i;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}]/gu;

/** Removes non-instructional clutter without touching the heading structure. */
export function stripClutter(markdown: string): string {
  const out: string[] = [];
  let skipping = false;
  let backMatter = false;
  for (const line of markdown.split("\n")) {
    const t = line.trim();
    if (BACK_MATTER.test(t)) backMatter = true;
    if (backMatter) {
      if (PAGE_MARKER.test(t)) backMatter = false;
      else continue;
    }
    if (CLUTTER_HEADING.test(t)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (t.startsWith("#") || PAGE_MARKER.test(t)) skipping = false;
      else continue;
    }
    if (META_LABEL.test(t) || OUTCOME_BULLET.test(t)) continue;
    out.push(line);
  }
  return out.join("\n").replace(EMOJI, "");
}

/** Final formatting for RAG ingestion: no page markers, tidy headings, no runs of blank lines. */
export function finalizeMarkdown(markdown: string): string {
  return markdown
    .split("\n")
    .filter((l) => !/^<!--[\s\S]*-->$/.test(l.trim()))
    .map((l) => {
      const hm = l.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      return hm ? `${hm[1]} ${hm[2].replace(/ـ/g, "").replace(/\s+/g, " ").trim()}` : l.replace(/\s+$/, "");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([^\n])\n(#{1,6} )/g, "$1\n\n$2")
    .replace(/(^|\n)(#{1,6} [^\n]+)\n(?!\n|#)/g, "$1$2\n\n")
    .trim();
}

/**
 * Structure repair for books without a known outline. Keeps the first declaration of each
 * unit/chapter and lesson, drops repeats from continuation pages and demotes stray level-1/2
 * headings, so page-level extraction noise does not create phantom units or lessons.
 */
export function repairStructureHeuristically(markdown: string): string {
  const out: string[] = [];
  let unitNumber: number | null = null;
  let unitTitle = "";
  let lessonNumber: number | null = null;
  let lessonTitle = "";
  const same = (a: string, b: string) => {
    const x = normalizeArabic(a);
    const y = normalizeArabic(b);
    return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x))));
  };

  for (const line of markdown.split("\n")) {
    const hm = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!hm) {
      out.push(line);
      continue;
    }
    const level = hm[1].length;
    const text = hm[2].trim();
    if (level === 1 && text.startsWith("منهج")) {
      out.push(line);
      continue;
    }
    const label = parseHeadingLabel(text);

    if (label.kind === "unit" || label.kind === "chapter") {
      if (!label.title && label.number === null) continue;
      if (same(label.title, unitTitle) || (label.number !== null && label.number === unitNumber && !label.title)) continue;
      if (level <= 2 || label.number !== null) {
        unitNumber = label.number ?? (unitNumber ?? 0) + 1;
        unitTitle = label.title;
        lessonNumber = null;
        lessonTitle = "";
        const word = label.kind === "chapter" ? "الفصل" : /^الباب/.test(text) ? "الباب" : "الوحدة";
        out.push(`# ${word} ${unitNumber}${label.title ? `: ${label.title}` : ""}`);
        continue;
      }
    }

    if (label.kind === "lesson") {
      if (!label.title) continue;
      if (same(label.title, lessonTitle)) continue;
      if (level >= 3 && (label.number === null || (lessonNumber !== null && label.number <= lessonNumber))) {
        out.push(`### ${label.title}`);
        continue;
      }
      lessonNumber = (lessonNumber ?? 0) + 1;
      lessonTitle = label.title;
      out.push(`## الدرس ${lessonNumber}: ${label.title}`);
      continue;
    }

    if (level <= 2) {
      if (same(text, lessonTitle) || same(text, unitTitle)) continue;
      out.push(`### ${text}`);
      continue;
    }
    if (level === 3 && (same(text, unitTitle) || same(text, lessonTitle))) continue;
    out.push(line);
  }
  return out.join("\n");
}

/** Assembles extracted pages into the canonical curriculum Markdown consumed by the EGS AI site. */
export function buildCurriculumMarkdown(
  pages: PageMarkdown[],
  subjectName: string,
  outline: OutlineNode[] | null,
  tocPages: number[] = [],
  reconcile = false
): BuildResult {
  const sorted = [...pages]
    .filter((p) => p.markdown.trim().length > 0 && !tocPages.includes(p.pageNumber))
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const raw = sorted.map((p) => p.markdown).join("\n");
  if (outline && outline.length > 0 && reconcile) {
    outline = isOutlineIncomplete(outline, raw) ? null : reconcileOutlineWithBody(outline, raw);
  }
  const droppedTocPages = [...tocPages];
  const kept = sorted.filter((p) => {
    const isToc = !!outline && isTocPage(p.markdown, outline);
    if (isToc) droppedTocPages.push(p.pageNumber);
    return !isToc;
  });

  const body = stripClutter(kept.map((p) => `<!-- بداية الصفحة ${p.pageNumber} -->\n${p.markdown.trim()}`).join("\n\n"));
  let structured: string;
  let report: AlignmentReport | null = null;
  if (outline && outline.length > 0) {
    const aligned = alignMarkdownToOutline(body, outline);
    structured = aligned.markdown;
    report = aligned.report;
  } else {
    structured = repairStructureHeuristically(body);
  }

  const markdown = finalizeMarkdown(`# منهج ${subjectName}\n\n${structured.replace(/^# منهج[^\n]*\n/, "")}`);
  return { markdown, report, droppedTocPages, outline };
}
