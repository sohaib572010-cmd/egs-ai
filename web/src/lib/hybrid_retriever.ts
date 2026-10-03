/**
 * Curriculum retrieval engine: multi-query dense search (pgvector) + Arabic BM25 over the whole book +
 * knowledge-graph links, fused with weighted Reciprocal Rank Fusion at the section (parent) level, then
 * reranked by a cross-encoder and expanded with adjacent parts of split sections.
 */

import { CurriculumChunk, db, getCurriculumCorpus, type CurriculumCorpus } from './db';
import { BM25Index } from './bm25';
import { generateEmbeddingBatch, rerankDocuments } from './gemini';

export interface RetrievalRequest {
  curriculumId: string;
  /** Self-contained question used for reranking. */
  question: string;
  /** Search phrasings (standalone question, sub-queries, the raw message). */
  queries: string[];
  hydePassage: string;
  keywords: string[];
  units: unknown;
}

export interface RetrievedSection {
  chunk: CurriculumChunk;
  fusion: number;
  relevance: number | null;
}

export interface RetrievalResult {
  sections: RetrievedSection[];
  formattedContext: string;
  /** Best cross-encoder relevance (0..1), or null when reranking was unavailable. */
  topRelevance: number | null;
  entityCount: number;
}

const RRF_K = 60;
const CANDIDATES_TO_RERANK = 20;
const MAX_SECTIONS = 8;
const MIN_SECTIONS = 3;
const CONTEXT_CHAR_BUDGET = 18000;
const RELATIVE_CUTOFF = 0.22;
const ABSOLUTE_FLOOR = 0.3;

/**
 * Renders the unit/lesson map. The tutor uses it to decide whether a topic is part of the student's
 * curriculum and which lesson teaches it.
 */
type MapUnit = { title?: string; groupTitle?: string; lessons?: { title?: string }[] };

export function formatCurriculumMap(units: unknown): string {
  if (!Array.isArray(units) || units.length === 0) return '';
  const unitMap = (units as MapUnit[]).map((u, uIdx) => {
    const lessons = Array.isArray(u.lessons) ? u.lessons : [];
    const lessonTitles = lessons.map((l, lIdx) => `      - ${l.title || `الدرس ${lIdx + 1}`}`).join('\n');
    const title = u.title || `الوحدة ${uIdx + 1}`;
    return `  * ${u.groupTitle ? `${u.groupTitle} > ${title}` : title}:\n${lessonTitles}`;
  }).join('\n');
  return `خريطة وحدات ودروس المنهج الدراسي:\n${unitMap}`;
}

type RankedList = { ids: string[]; weight: number };

/** Weighted RRF over ranked lists of section ids; each list counts a section once, at its best rank. */
function fuseSections(lists: RankedList[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const { ids, weight } of lists) {
    const seen = new Set<string>();
    let rank = 0;
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      rank++;
      scores.set(id, (scores.get(id) || 0) + weight / (RRF_K + rank));
    }
  }
  return scores;
}

const baseHeading = (heading: string) => heading.replace(/\s*\(\d+\)$/, '');

function sectionOf(corpus: CurriculumCorpus, chunk: { id: string; parent_id?: string | null }): string | null {
  if (corpus.parents.has(chunk.id)) return chunk.id;
  const parentId = corpus.children.get(chunk.id)?.parent_id ?? chunk.parent_id;
  return parentId && corpus.parents.has(parentId) ? parentId : null;
}

/** Split sections ("heading (1)", "heading (2)") are retrieved with their adjacent parts. */
function adjacentParts(corpus: CurriculumCorpus, section: CurriculumChunk): CurriculumChunk[] {
  const list = corpus.parentsByPosition;
  const idx = list.findIndex(p => p.id === section.id);
  if (idx < 0) return [];
  const base = baseHeading(section.heading);
  const isSplit = base !== section.heading;
  return [list[idx - 1], list[idx + 1]].filter((p): p is CurriculumChunk =>
    !!p && (isSplit || baseHeading(p.heading) !== p.heading) && baseHeading(p.heading) === base
  );
}

async function markdownFallback(curriculumId: string, request: RetrievalRequest): Promise<CurriculumChunk[]> {
  const detail = await db.getCurriculumDetail(curriculumId).catch(() => null);
  if (!detail?.content) return [];
  const sections = detail.content.split(/\n(?=#{1,4}\s)/).map((text, i) => ({
    id: `md_${i}`,
    heading: (text.split('\n')[0] || '').replace(/^#+\s*/, '').trim() || 'قسم دراسي',
    content: text.trim(),
    position_index: i
  })).filter(s => s.content.length > 30);
  const index = new BM25Index(sections);
  const hits = new Map<string, number>();
  for (const q of [request.keywords.join(' '), ...request.queries]) {
    index.search(q, 6).forEach(h => hits.set(h.doc.id, (hits.get(h.doc.id) || 0) + 1 / (RRF_K + h.rank)));
  }
  return [...hits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => {
      const s = sections.find(x => x.id === id)!;
      return { ...s, curriculum_id: curriculumId, chunk_level: 'parent' as const };
    });
}

export function formatSections(sections: CurriculumChunk[]): string {
  if (sections.length === 0) return '';
  const body = sections.map((s, i) => `--- مقتطف ${i + 1}: [${s.heading}] ---\n${s.content.trim()}`).join('\n\n');
  return `=== مقتطفات الكتاب المدرسي ذات الصلة بالسؤال (الأعلى صلة أولاً) ===\n${body}`;
}

export async function retrieveCurriculumContext(request: RetrievalRequest): Promise<RetrievalResult> {
  const { curriculumId } = request;
  const queries = [...new Set(request.queries.map(q => q.trim()).filter(q => q.length > 2))].slice(0, 4);
  const keywordQuery = request.keywords.map(k => k.trim()).filter(Boolean).join(' ');
  const denseTexts = [...new Set([request.hydePassage, ...queries].map(t => t.trim()).filter(Boolean))].slice(0, 4);

  const [corpus, embeddings] = await Promise.all([
    getCurriculumCorpus(curriculumId).catch(err => {
      console.error('Curriculum corpus load failed:', err);
      return null;
    }),
    generateEmbeddingBatch(denseTexts).catch(() => denseTexts.map(() => [] as number[]))
  ]);

  const mapText = formatCurriculumMap(request.units);
  if (!corpus || corpus.parents.size === 0) {
    const fallback = await markdownFallback(curriculumId, request);
    return {
      sections: fallback.map(chunk => ({ chunk, fusion: 0, relevance: null })),
      formattedContext: [mapText, formatSections(fallback)].filter(Boolean).join('\n\n'),
      topRelevance: null,
      entityCount: 0
    };
  }

  const denseResults = await Promise.all(
    embeddings.map(vec => vec.length ? db.vectorSearchChunks(curriculumId, vec, 30) : Promise.resolve([]))
  );
  const lists: RankedList[] = [];
  const toSections = (chunks: { id: string; parent_id?: string | null }[]) =>
    chunks.map(c => sectionOf(corpus, c)).filter((id): id is string => !!id);

  denseResults.forEach((chunks, i) => lists.push({ ids: toSections(chunks), weight: i === 0 ? 1.0 : 0.9 }));
  if (keywordQuery) lists.push({ ids: toSections(corpus.index.search(keywordQuery, 30).map(h => h.doc)), weight: 1.0 });
  for (const q of queries) {
    lists.push({ ids: toSections(corpus.index.search(q, 30).map(h => h.doc)), weight: 0.8 });
  }
  const subgraph = corpus.graph.retrieveKnowledgeGraph(request.question, request.keywords);
  lists.push({ ids: subgraph.connectedChunkIds.filter(id => corpus.parents.has(id)).slice(0, 20), weight: 0.5 });

  const fused = [...fuseSections(lists).entries()].sort((a, b) => b[1] - a[1]).slice(0, CANDIDATES_TO_RERANK);
  if (fused.length === 0) {
    const fallback = await markdownFallback(curriculumId, request);
    return {
      sections: fallback.map(chunk => ({ chunk, fusion: 0, relevance: null })),
      formattedContext: [mapText, formatSections(fallback)].filter(Boolean).join('\n\n'),
      topRelevance: null,
      entityCount: subgraph.entities.length
    };
  }

  const candidates = fused.map(([id, fusion]) => ({ chunk: corpus.parents.get(id)!, fusion }));
  const relevance = await rerankDocuments(
    request.question,
    candidates.map(c => `${c.chunk.heading}\n${c.chunk.content}`)
  );

  let ranked: RetrievedSection[];
  let selected: RetrievedSection[];
  if (relevance) {
    const maxFusion = candidates[0].fusion || 1;
    ranked = candidates
      .map((c, i) => ({ ...c, relevance: relevance[i] }))
      .sort((a, b) => (b.relevance + 0.03 * b.fusion / maxFusion) - (a.relevance + 0.03 * a.fusion / maxFusion));
    const top = ranked[0].relevance ?? 0;
    const cutoff = Math.max(ABSOLUTE_FLOOR, top - RELATIVE_CUTOFF);
    selected = ranked.filter((s, i) => i < MIN_SECTIONS || (s.relevance ?? 0) >= cutoff).slice(0, MAX_SECTIONS);
  } else {
    ranked = candidates.map(c => ({ ...c, relevance: null }));
    selected = ranked.slice(0, MAX_SECTIONS - 1);
  }

  const ordered: CurriculumChunk[] = [];
  const included = new Set<string>();
  let used = 0;
  const add = (chunk: CurriculumChunk) => {
    if (included.has(chunk.id) || used + chunk.content.length > CONTEXT_CHAR_BUDGET) return false;
    included.add(chunk.id);
    ordered.push(chunk);
    used += chunk.content.length;
    return true;
  };
  selected.forEach((s, i) => {
    const group = i < 3 ? [s.chunk, ...adjacentParts(corpus, s.chunk)] : [s.chunk];
    group.sort((a, b) => (a.position_index ?? 0) - (b.position_index ?? 0)).forEach(add);
  });

  return {
    sections: selected,
    formattedContext: [mapText, formatSections(ordered)].filter(Boolean).join('\n\n'),
    topRelevance: relevance ? (ranked[0].relevance ?? 0) : null,
    entityCount: subgraph.entities.length
  };
}
