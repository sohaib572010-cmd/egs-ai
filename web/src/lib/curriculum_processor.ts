import { CurriculumChunk } from './db';
import { generateEmbeddingBatch, generateCurriculumSummary } from './gemini';
import {
  extractEntitiesAndRelationsFromChunk,
  CurriculumEntity,
  CurriculumRelation
} from './graph_rag';

export function countTokens(text: string): number {
  if (!text) return 0;
  const wordCount = text.trim().split(/\s+/).length;
  return Math.ceil(wordCount * 1.4);
}

export const PARENT_MAX_TOKENS = 500;
export const CHILD_MAX_TOKENS = 120;
export const CHILD_OVERLAP_TOKENS = 24;

export interface ParentChunk {
  heading: string;
  content: string;
}

export interface ChildChunk {
  heading: string;
  content: string;
  parentHeading: string;
  parentIndex: number;
}

const EXAMPLE_PARTS = /^(?:الحل|الإجابة|وسيلة مساعدة|ماذا لو|فكرة الحل|خطوات الحل)(?![\p{L}\p{N}])/u;

/** Sections at most this long carry little meaning alone: a lead-in before sub-sections, or one list entry. */
const SHORT_SECTION_CHARS = 150;

type RawSection = { base: string[]; path: string[]; contentLines: string[]; merged?: boolean };

const sectionHeading = (base: string[], path: string[]) => {
  const parts = [...base, ...path].map(p => p.trim()).filter(Boolean).filter((v, i, a) => i === 0 || v !== a[i - 1]);
  return parts.join(' > ') || 'مقدمة المنهج';
};
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const sectionText = (s: RawSection) => s.contentLines.join('\n').trim();

/**
 * Short sections are never dropped: a lead-in ("تتمثل في:") moves into the sub-section that follows it, and
 * consecutive short siblings (vocabulary entries, short definitions) become one section under their parent
 * heading, one "**title**: content" line each.
 */
function consolidateShortSections(sections: RawSection[]): RawSection[] {
  const out: RawSection[] = [];
  let carry: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    const sec: RawSection = { ...sections[i], contentLines: [...carry, ...sections[i].contentLines] };
    carry = [];
    const text = sectionText(sec);
    if (!text) continue;
    const next = sections[i + 1];
    const short = text.length <= SHORT_SECTION_CHARS;
    if (short && next && sameList(next.base, sec.base) && next.path.length > sec.path.length &&
        sameList(next.path.slice(0, sec.path.length), sec.path)) {
      carry = sec.contentLines;
      continue;
    }
    const prev = out[out.length - 1];
    const parentPath = sec.path.slice(0, -1);
    const title = sec.path[sec.path.length - 1];
    if (short && title && prev?.merged &&
        sameList(prev.base, sec.base) && sameList(prev.path, parentPath) && sectionText(prev).length + text.length < 1500) {
      prev.contentLines.push(`**${title}**: ${text.replace(/\n+/g, ' ')}`);
      continue;
    }
    const nextIsShortSibling = !!next && !!title && sameList(next.base, sec.base) && sameList(next.path.slice(0, -1), parentPath) &&
      next.path.length === sec.path.length && sectionText(next).length > 0 && sectionText(next).length <= SHORT_SECTION_CHARS;
    if (short && nextIsShortSibling) {
      out.push({ base: sec.base, path: parentPath, contentLines: [`**${title}**: ${text.replace(/\n+/g, ' ')}`], merged: true });
      continue;
    }
    out.push(sec);
  }
  return out.map(({ base, path, contentLines }) => ({ base, path, contentLines }));
}

export function chunkMarkdownHierarchical(markdownText: string): {
  parents: ParentChunk[];
  children: ChildChunk[];
} {
  const lines = markdownText.split('\n').filter(l => !/^\s*<!--.*-->\s*$/.test(l));
  const collected: RawSection[] = [];

  // A "#" heading followed directly by another "#" heading is a parent unit grouping chapters
  const isGroupHeading = (index: number) => {
    for (let j = index + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (!t) continue;
      return /^#\s/.test(t);
    }
    return false;
  };

  let currentGroup = '';
  let currentUnit = '';
  let currentLesson = '';
  // Headings below the lesson (### and deeper), so a sub-section keeps the topic it belongs to
  let headingStack: { level: number; title: string }[] = [];
  let currentLines: string[] = [];

  const flush = () => {
    if (currentLines.join('\n').trim()) {
      const path = headingStack.map(h => h.title);
      collected.push({
        base: [currentGroup, currentUnit, currentLesson],
        path: path.length || currentGroup || currentUnit || currentLesson ? path : ['مقدمة المنهج'],
        contentLines: [...currentLines]
      });
    }
    currentLines = [];
  };

  lines.forEach((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!heading) {
      currentLines.push(line);
      return;
    }
    const level = heading[1].length;
    const title = heading[2].trim();
    if (level === 1 && title.startsWith('منهج')) return;
    // A worked example's solution, hint and variation stay in the example's chunk so the question and its answer are retrieved together
    const currentTitle = headingStack[headingStack.length - 1]?.title || '';
    if (level >= 3 && /^مثال/.test(currentTitle) && EXAMPLE_PARTS.test(title)) {
      currentLines.push(`**${title}**`);
      return;
    }
    flush();
    if (level === 1) {
      if (isGroupHeading(index)) {
        currentGroup = title;
        currentUnit = '';
      } else {
        if (/^(?:الوحدة|الباب|Unit)(?![\p{L}\p{N}])/iu.test(title)) currentGroup = '';
        currentUnit = title;
      }
      currentLesson = '';
      headingStack = [];
    } else if (level === 2) {
      currentLesson = title;
      headingStack = [];
    } else {
      headingStack = [...headingStack.filter(h => h.level < level), { level, title }];
    }
  });
  flush();

  const rawSections = consolidateShortSections(collected).map(sec => ({
    heading: sectionHeading(sec.base, sec.path),
    contentLines: sec.contentLines
  }));

  const parents: ParentChunk[] = [];

  for (const section of rawSections) {
    const fullContent = section.contentLines.join('\n').trim();
    const tokenCount = countTokens(fullContent);

    if (tokenCount <= PARENT_MAX_TOKENS) {
      parents.push({ heading: section.heading, content: fullContent });
    } else {
      const paragraphs = fullContent.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      const paragraphsWithTokens = paragraphs.map(p => ({
        text: p,
        tokens: countTokens(p)
      }));

      let buffer = '';
      let bufferTokens = 0;
      let subIndex = 1;

      for (const { text, tokens } of paragraphsWithTokens) {
        const separatorTokens = buffer ? 2 : 0;
        if (bufferTokens + separatorTokens + tokens > PARENT_MAX_TOKENS && buffer.trim()) {
          parents.push({
            heading: `${section.heading} (${subIndex++})`,
            content: buffer.trim()
          });
          buffer = text;
          bufferTokens = tokens;
        } else {
          buffer = buffer ? `${buffer}\n\n${text}` : text;
          bufferTokens += separatorTokens + tokens;
        }
      }
      if (buffer.trim()) {
        parents.push({
          heading: subIndex > 1 ? `${section.heading} (${subIndex})` : section.heading,
          content: buffer.trim()
        });
      }
    }
  }

  const children: ChildChunk[] = [];

  parents.forEach((parent, parentIndex) => {
    const childChunks = createSlidingWindowChunks(parent.content, parent.heading, CHILD_MAX_TOKENS, CHILD_OVERLAP_TOKENS);
    children.push(...childChunks.map(c => ({ ...c, parentIndex })));
  });

  return { parents, children };
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}/;

/**
 * Sentence-aware sliding window. Markdown table rows are kept as whole lines, and a window that starts inside
 * a table repeats the table's header row, so every chunk of a table still says what its columns mean.
 */
function createSlidingWindowChunks(
  text: string,
  parentHeading: string,
  maxTokens: number,
  overlapTokens: number
): Omit<ChildChunk, 'parentIndex'>[] {
  if (!text.trim()) return [];
  if (countTokens(text) <= maxTokens) {
    return [{ heading: parentHeading, content: text.trim(), parentHeading }];
  }

  const items: { text: string; tokens: number; tableHeader: string | null; isRow: boolean }[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (TABLE_ROW.test(line)) {
      let header: string | null = null;
      for (let j = i - 1; j >= 0 && TABLE_ROW.test(lines[j].trim()); j--) {
        if (TABLE_SEPARATOR.test(lines[j].trim()) && j > 0) header = `${lines[j - 1].trim()}\n${lines[j].trim()}`;
      }
      const isHeaderPart = TABLE_SEPARATOR.test(line) || (i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1].trim()));
      items.push({ text: line, tokens: countTokens(line), tableHeader: header, isRow: !isHeaderPart });
      continue;
    }
    for (const sentence of line.split(/(?<=[.!?؟])\s+/)) {
      if (sentence.trim()) items.push({ text: sentence.trim(), tokens: countTokens(sentence), tableHeader: null, isRow: false });
    }
  }
  if (items.length === 0) return [];

  const chunks: Omit<ChildChunk, 'parentIndex'>[] = [];
  const emit = (buffer: typeof items) => {
    const first = buffer[0];
    const header = first.isRow && first.tableHeader ? `${first.tableHeader}\n` : '';
    const body = buffer.map((b, k) => (b.isRow || (k > 0 && buffer[k - 1].isRow) || TABLE_SEPARATOR.test(b.text) ? `\n${b.text}` : ` ${b.text}`)).join('').trim();
    chunks.push({ heading: parentHeading, content: `${header}${body}`.trim(), parentHeading });
  };

  const buffer: typeof items = [];
  let bufferTokens = 0;
  for (const item of items) {
    if (bufferTokens + item.tokens > maxTokens && buffer.length > 0) {
      emit(buffer);
      while (buffer.length > 0 && bufferTokens > overlapTokens) {
        bufferTokens -= buffer.shift()!.tokens;
      }
    }
    buffer.push(item);
    bufferTokens += item.tokens;
  }
  if (buffer.length > 0 && buffer.map(b => b.text).join(' ').trim().length > 5) emit(buffer);

  return chunks.length > 0 ? chunks : [{ heading: parentHeading, content: text.trim(), parentHeading }];
}

/**
 * Knowledge graph of a curriculum from its parent sections. Entities with the same normalized name
 * are merged, and relations are re-pointed to the surviving entity so none references a dropped id.
 */
export function buildKnowledgeGraph(
  parents: { id: string; heading: string; content: string }[],
  curriculumId: string
): { entities: CurriculumEntity[]; relations: CurriculumRelation[] } {
  const entities: CurriculumEntity[] = [];
  const byName = new Map<string, CurriculumEntity>();
  const remap = new Map<string, string>();
  const rawRelations: CurriculumRelation[] = [];

  for (const parent of parents) {
    const extracted = extractEntitiesAndRelationsFromChunk(parent.content, parent.heading, parent.id, curriculumId);
    for (const ent of extracted.entities) {
      const existing = byName.get(ent.normalized_name);
      if (!existing) {
        byName.set(ent.normalized_name, ent);
        entities.push(ent);
        remap.set(ent.id, ent.id);
      } else {
        remap.set(ent.id, existing.id);
        if (!existing.chunk_ids.includes(parent.id)) existing.chunk_ids.push(parent.id);
      }
    }
    rawRelations.push(...extracted.relations);
  }

  const seen = new Set<string>();
  const relations: CurriculumRelation[] = [];
  for (const rel of rawRelations) {
    const source = remap.get(rel.source_entity_id);
    const target = remap.get(rel.target_entity_id);
    if (!source || !target || source === target) continue;
    const key = `${source}|${target}|${rel.relation_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relations.push({ ...rel, source_entity_id: source, target_entity_id: target });
  }
  return { entities, relations };
}

export async function processCurriculumChunks(
  fileContent: string,
  curriculumId: string = 'curriculum_pending',
  options: { skipEmbeddings?: boolean } = {}
): Promise<{
  parents: ParentChunk[];
  children: ChildChunk[];
  allChunks: Omit<CurriculumChunk, 'curriculum_id'>[];
  summaryContent: string;
  embeddedCount: number;
  entities: CurriculumEntity[];
  relations: CurriculumRelation[];
}> {
  const { parents, children } = chunkMarkdownHierarchical(fileContent);

  let embeddings: number[][] = [];
  if (!options.skipEmbeddings) {
    try {
      const childTexts = children.map(c => `${c.heading}\n${c.content}`);
      embeddings = await generateEmbeddingBatch(childTexts);
    } catch (embErr) {
      console.error('Embedding generation failed:', embErr);
      embeddings = children.map(() => []);
    }
  } else {
    embeddings = children.map(() => []);
  }

  let summaryContent = '';
  try {
    summaryContent = await generateCurriculumSummary(fileContent);
  } catch (sumErr) {
    console.error('Summary generation failed:', sumErr);
  }

  const parentWithIds = parents.map((p, i) => ({
    ...p,
    id: crypto.randomUUID(),
    position_index: i
  }));

  const allChunks: Omit<CurriculumChunk, 'curriculum_id'>[] = [];

  for (const parent of parentWithIds) {
    allChunks.push({
      id: parent.id,
      content: parent.content,
      heading: parent.heading,
      chunk_level: 'parent',
      parent_id: null,
      position_index: parent.position_index,
      embedding: null
    });
  }

  let childGlobalIndex = parents.length;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const parentId = parentWithIds[child.parentIndex]?.id || null;
    allChunks.push({
      id: crypto.randomUUID(),
      content: child.content,
      heading: child.heading,
      chunk_level: 'child',
      parent_id: parentId,
      position_index: childGlobalIndex++,
      embedding: embeddings[i]?.length > 0 ? embeddings[i] : null
    });
  }

  if (summaryContent) {
    allChunks.push({
      id: crypto.randomUUID(),
      content: summaryContent,
      heading: '__CURRICULUM_SUMMARY__',
      chunk_level: 'parent',
      parent_id: null,
      position_index: -1,
      embedding: null
    });
  }

  if (fileContent && fileContent.trim().length > 0) {
    allChunks.push({
      id: crypto.randomUUID(),
      content: fileContent,
      heading: '__RAW_MARKDOWN__',
      chunk_level: 'parent',
      parent_id: null,
      position_index: -99,
      embedding: null
    });
  }

  const { entities: allEntities, relations: allRelations } = buildKnowledgeGraph(parentWithIds, curriculumId);

  const embeddedCount = embeddings.filter(e => e.length > 0).length;

  return {
    parents,
    children,
    allChunks,
    summaryContent,
    embeddedCount,
    entities: allEntities,
    relations: allRelations
  };
}
