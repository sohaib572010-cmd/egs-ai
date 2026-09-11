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
}

export function chunkMarkdownHierarchical(markdownText: string): {
  parents: ParentChunk[];
  children: ChildChunk[];
} {
  const lines = markdownText.split('\n');
  const rawSections: { heading: string; contentLines: string[] }[] = [];

  let currentUnit = '';
  let currentLesson = '';
  let currentHeading = 'مقدمة المنهج';
  let currentLines: string[] = [];

  const buildBreadcrumb = (unit: string, lesson: string, heading: string) => {
    const raw = [unit, lesson, heading].map(s => (s || '').trim()).filter(Boolean);
    const parts = raw.filter((v, i, a) => i === 0 || v !== a[i - 1]);
    return parts.join(' > ') || heading || 'مقدمة المنهج';
  };

  for (const line of lines) {
    const unitMatch = line.match(/^#\s+(.+)$/);
    const lessonMatch = line.match(/^##\s+(.+)$/);
    const subMatch = line.match(/^###\s+(.+)$/);
    const genericHeadingMatch = line.match(/^(#{4,6})\s+(.+)$/);

    if (unitMatch) {
      if (currentLines.join('\n').trim().length > 10) {
        rawSections.push({ heading: buildBreadcrumb(currentUnit, currentLesson, currentHeading), contentLines: [...currentLines] });
      }
      currentUnit = unitMatch[1].trim();
      currentLesson = '';
      currentHeading = currentUnit;
      currentLines = [];
    } else if (lessonMatch) {
      if (currentLines.join('\n').trim().length > 10) {
        rawSections.push({ heading: buildBreadcrumb(currentUnit, currentLesson, currentHeading), contentLines: [...currentLines] });
      }
      currentLesson = lessonMatch[1].trim();
      currentHeading = currentLesson;
      currentLines = [];
    } else if (subMatch) {
      if (currentLines.join('\n').trim().length > 10) {
        rawSections.push({ heading: buildBreadcrumb(currentUnit, currentLesson, currentHeading), contentLines: [...currentLines] });
      }
      currentHeading = subMatch[1].trim();
      currentLines = [];
    } else if (genericHeadingMatch) {
      if (currentLines.join('\n').trim().length > 10) {
        rawSections.push({ heading: buildBreadcrumb(currentUnit, currentLesson, currentHeading), contentLines: [...currentLines] });
      }
      currentHeading = genericHeadingMatch[2].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.join('\n').trim().length > 10) {
    rawSections.push({ heading: buildBreadcrumb(currentUnit, currentLesson, currentHeading), contentLines: currentLines });
  }

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

  for (const parent of parents) {
    const childChunks = createSlidingWindowChunks(
      parent.content,
      parent.heading,
      CHILD_MAX_TOKENS,
      CHILD_OVERLAP_TOKENS
    );
    children.push(...childChunks);
  }

  return { parents, children };
}

function createSlidingWindowChunks(
  text: string,
  parentHeading: string,
  maxTokens: number,
  overlapTokens: number
): ChildChunk[] {
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

  const chunks: ChildChunk[] = [];
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
    const parentId = parentWithIds.find(p => p.heading === child.parentHeading)?.id || null;
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

  // Extract Knowledge Graph entities & relationships
  const allEntities: CurriculumEntity[] = [];
  const allRelations: CurriculumRelation[] = [];
  const entityMap = new Map<string, CurriculumEntity>();

  for (const parent of parentWithIds) {
    const { entities, relations } = extractEntitiesAndRelationsFromChunk(
      parent.content,
      parent.heading,
      parent.id,
      curriculumId
    );

    for (const ent of entities) {
      if (!entityMap.has(ent.normalized_name)) {
        entityMap.set(ent.normalized_name, ent);
        allEntities.push(ent);
      } else {
        const existing = entityMap.get(ent.normalized_name)!;
        if (!existing.chunk_ids.includes(parent.id)) {
          existing.chunk_ids.push(parent.id);
        }
      }
    }

    allRelations.push(...relations);
  }

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
