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

export function chunkMarkdownHierarchical(markdownText: string): {
  parents: ParentChunk[];
  children: ChildChunk[];
} {
  const lines = markdownText.split('\n').filter(l => !/^\s*<!--.*-->\s*$/.test(l));
  const rawSections: { heading: string; contentLines: string[] }[] = [];

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
  let currentHeading = 'مقدمة المنهج';
  let currentLines: string[] = [];

  const buildBreadcrumb = () => {
    const raw = [currentGroup, currentUnit, currentLesson, currentHeading].map(s => (s || '').trim()).filter(Boolean);
    const parts = raw.filter((v, i, a) => i === 0 || v !== a[i - 1]);
    return parts.join(' > ') || 'مقدمة المنهج';
  };
  const flush = () => {
    if (currentLines.join('\n').trim().length > 10) {
      rawSections.push({ heading: buildBreadcrumb(), contentLines: [...currentLines] });
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
    if (level >= 3 && /^مثال/.test(currentHeading) && EXAMPLE_PARTS.test(title)) {
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
      currentHeading = '';
    } else if (level === 2) {
      currentLesson = title;
      currentHeading = '';
    } else {
      currentHeading = title;
    }
  });
  flush();

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

function createSlidingWindowChunks(
  text: string,
  parentHeading: string,
  maxTokens: number,
  overlapTokens: number
): Omit<ChildChunk, 'parentIndex'>[] {
  const sentences = text
    .split(/(?<=[.!?؟\n])\s+|(?<=[\n])\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length === 0) return [];

  if (countTokens(text) <= maxTokens) {
    return [{
      heading: parentHeading,
      content: text.trim(),
      parentHeading
    }];
  }

  const sentencesWithTokens = sentences.map(s => ({
    text: s,
    tokens: countTokens(s)
  }));

  const chunks: Omit<ChildChunk, 'parentIndex'>[] = [];
  let buffer: { text: string; tokens: number }[] = [];
  let bufferTokens = 0;

  for (const item of sentencesWithTokens) {
    if (bufferTokens + item.tokens > maxTokens && buffer.length > 0) {
      chunks.push({
        heading: parentHeading,
        content: buffer.map(b => b.text).join(' ').trim(),
        parentHeading
      });

      while (buffer.length > 0 && bufferTokens > overlapTokens) {
        const removed = buffer.shift()!;
        bufferTokens -= removed.tokens;
      }
    }

    buffer.push(item);
    bufferTokens += item.tokens;
  }

  if (buffer.length > 0 && buffer.map(b => b.text).join(' ').trim().length > 5) {
    chunks.push({
      heading: parentHeading,
      content: buffer.map(b => b.text).join(' ').trim(),
      parentHeading
    });
  }

  return chunks.length > 0 ? chunks : [{
    heading: parentHeading,
    content: text.trim(),
    parentHeading
  }];
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
