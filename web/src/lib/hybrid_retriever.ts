/**
 * Hybrid Tri-Fusion Retrieval Engine (Vector Search + Okapi BM25 + GraphRAG)
 * Implements Weighted Reciprocal Rank Fusion (W-RRF), Parent Chunk Expansion,
 * and Knowledge Subgraph Context Injection for the Egyptian Curriculum AI Tutor.
 */

import { CurriculumChunk, db } from './db';
import { BM25Index, BM25SearchResult } from './bm25';
import { KnowledgeGraphEngine, KnowledgeSubgraph } from './graph_rag';

export interface HybridRetrievalOptions {
  topK?: number;
  rrfK?: number;
  weightVector?: number;
  weightBM25?: number;
  weightGraph?: number;
}

export interface HybridRetrievalResult {
  parentChunks: CurriculumChunk[];
  childChunks: CurriculumChunk[];
  subgraph: KnowledgeSubgraph;
  formattedContext: string;
  metrics: {
    vectorCandidateCount: number;
    bm25CandidateCount: number;
    graphEntityCount: number;
    fusedCandidateCount: number;
  };
}

/**
 * Weighted Reciprocal Rank Fusion (W-RRF) across Vector, BM25, and Graph signals.
 */
export function fuseRRF(
  vectorResults: CurriculumChunk[],
  bm25Results: BM25SearchResult[],
  graphChunkIds: string[],
  allCandidateChunksMap: Map<string, CurriculumChunk>,
  options: HybridRetrievalOptions = {}
): { chunk: CurriculumChunk; score: number }[] {
  const k = options.rrfK ?? 60;
  const wVec = options.weightVector ?? 1.0;
  const wBM25 = options.weightBM25 ?? 1.0;
  const wGraph = options.weightGraph ?? 0.85;

  const scoreMap = new Map<string, { chunk: CurriculumChunk; score: number }>();

  // 1. Vector Search ranks
  vectorResults.forEach((chunk, index) => {
    const rank = index + 1;
    const addedScore = wVec * (1.0 / (k + rank));
    scoreMap.set(chunk.id, { chunk, score: addedScore });
    allCandidateChunksMap.set(chunk.id, chunk);
  });

  // 2. BM25 Search ranks
  bm25Results.forEach((res) => {
    const rank = res.rank;
    const addedScore = wBM25 * (1.0 / (k + rank));
    const existing = scoreMap.get(res.doc.id);
    if (existing) {
      existing.score += addedScore;
    } else {
      const chunk = allCandidateChunksMap.get(res.doc.id) || (res.doc as unknown as CurriculumChunk);
      scoreMap.set(res.doc.id, { chunk, score: addedScore });
    }
  });

  // 3. GraphRAG Traversal chunk ranks
  graphChunkIds.forEach((chunkId, index) => {
    const rank = index + 1;
    const addedScore = wGraph * (1.0 / (k + rank));
    const existing = scoreMap.get(chunkId);
    if (existing) {
      existing.score += addedScore;
    } else {
      const chunk = allCandidateChunksMap.get(chunkId);
      if (chunk) {
        scoreMap.set(chunkId, { chunk, score: addedScore });
      }
    }
  });

  const sorted = Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);
  return sorted;
}

/**
 * Executes the complete Hybrid Tri-Fusion Retrieval Pipeline:
 * Vector Search + Okapi BM25 + GraphRAG Traversal + Parent Breadcrumb Expansion.
 */
export async function runHybridTriFusionRetrieval(
  gradeLevel: string,
  subjectName: string,
  query: string,
  queryEmbedding: number[],
  keywords: string[],
  options: HybridRetrievalOptions = {},
  hydePassage?: string
): Promise<HybridRetrievalResult> {
  const cleanGrade = gradeLevel.trim();
  const cleanSubject = subjectName.trim();
  const topK = options.topK ?? 8;

  // 1. Retrieve curriculum record & graph data for this curriculum
  const [curriculumRecord, graphData] = await Promise.all([
    db.getCurriculumRecord(cleanGrade, cleanSubject).catch(err => {
      console.warn('getCurriculumRecord notice:', err);
      return null;
    }),
    db.getCurriculumGraph(cleanGrade, cleanSubject).catch(err => {
      console.warn('getCurriculumGraph notice:', err);
      return { entities: [], relations: [] };
    })
  ]);

  const candidateChunksMap = new Map<string, CurriculumChunk>();

  // 2. Parallel Channel Execution: Vector + BM25 (via database RPC) + GraphRAG
  const vectorPromise = (async () => {
    if (!queryEmbedding || queryEmbedding.length === 0) return [];
    try {
      const vecChunks = await db.vectorSearchCurriculum(cleanGrade, cleanSubject, queryEmbedding);
      vecChunks.forEach(c => candidateChunksMap.set(c.id, c));
      return vecChunks;
    } catch (err) {
      console.warn('Vector search notice (falling back):', err);
      return [];
    }
  })();

  const bm25Promise = (async () => {
    try {
      const searchKeywords = (keywords && keywords.length > 0)
        ? keywords
        : query.replace(/[؟?!.،,;:]/g, ' ').split(/\s+/).filter(w => w.length > 2);
      
      const bm25Chunks = await db.hybridSearchCurriculum(
        cleanGrade,
        cleanSubject,
        queryEmbedding || [],
        searchKeywords,
        []
      );
      bm25Chunks.forEach(c => candidateChunksMap.set(c.id, c));
      return bm25Chunks.map((c, idx) => ({ doc: c, rank: idx + 1, score: 1.0 / (idx + 1) }));
    } catch (err) {
      console.warn('BM25 hybrid RPC notice (falling back):', err);
      return [];
    }
  })();

  const graphPromise = (async () => {
    try {
      if (!graphData || graphData.entities.length === 0) {
        return {
          entities: [],
          relations: [],
          connectedChunkIds: [],
          relevanceScore: 0,
          synthesizedContext: ''
        } as KnowledgeSubgraph;
      }

      const engine = new KnowledgeGraphEngine(graphData.entities, graphData.relations);
      return engine.retrieveKnowledgeGraph(query, keywords);
    } catch (err) {
      console.warn('Graph traversal notice (falling back):', err);
      return {
        entities: [],
        relations: [],
        connectedChunkIds: [],
        relevanceScore: 0,
        synthesizedContext: ''
      } as KnowledgeSubgraph;
    }
  })();

  const [vectorCandidates, bm25Candidates, subgraph] = await Promise.all([
    vectorPromise,
    bm25Promise,
    graphPromise
  ]);

  // 3. Weighted Reciprocal Rank Fusion over candidate pools
  const fusedScores = fuseRRF(
    vectorCandidates,
    bm25Candidates as any,
    subgraph.connectedChunkIds,
    candidateChunksMap,
    options
  );

  const topChildChunks = fusedScores.slice(0, topK).map(s => s.chunk);

  // 4. Parent Expansion with Hierarchical Breadcrumbs
  const parentIds = [...new Set(
    topChildChunks
      .map(c => c.parent_id)
      .filter((id): id is string => !!id)
  )];

  let parentChunks: CurriculumChunk[] = [];
  if (parentIds.length > 0) {
    parentChunks = await db.getParentChunks(parentIds).catch(err => {
      console.warn('getParentChunks notice:', err);
      return [] as CurriculumChunk[];
    });
  }

  // Fallback if no parents or child chunks are already parent sections
  if (parentChunks.length === 0 && topChildChunks.length > 0) {
    parentChunks = topChildChunks;
  }

  // Resilient fallback: If Tri-Fusion yields 0 parent chunks, directly extract from raw markdown content
  if (parentChunks.length === 0 && curriculumRecord) {
    try {
      const detail = await db.getCurriculumDetail(curriculumRecord.id);
      if (detail && detail.content) {
        const queryTerms = [...new Set([
          ...query.replace(/[؟?!.،,;:\-_\/]/g, ' ').split(/\s+/).filter(w => w.length > 2),
          ...(keywords || [])
        ])].filter(w => w.length > 2);

        const rawSections = detail.content.split(/\n(?=#{1,3}\s)/);
        const scored = rawSections.map((sec, idx) => {
          const firstLine = (sec.split('\n')[0] || '').toLowerCase();
          const body = sec.toLowerCase();
          let score = 0;
          for (const t of queryTerms) {
            const term = t.toLowerCase();
            if (firstLine.includes(term)) score += 15;
            else if (body.includes(term)) score += 3;
          }
          return { sec, score, idx };
        }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
          parentChunks = scored.slice(0, 4).map(s => ({
            id: `fallback_${s.idx}`,
            curriculum_id: curriculumRecord.id,
            heading: s.sec.split('\n')[0]?.replace(/^#+\s*/, '') || 'قسم دراسي',
            content: s.sec,
            chunk_level: 'parent' as const,
            position_index: s.idx
          }));
        }
      }
    } catch (fallbackErr) {
      console.warn('Raw markdown section fallback notice in hybrid_retriever:', fallbackErr);
    }
  }

  // 5. Build Formatted Context Block
  let contextParts: string[] = [];

  // A. Syllabus Outline if present
  if (curriculumRecord?.units && Array.isArray(curriculumRecord.units) && curriculumRecord.units.length > 0) {
    const unitMap = curriculumRecord.units.map((u: any, uIdx: number) => {
      const lessons = Array.isArray(u.lessons) ? u.lessons : [];
      const lessonTitles = lessons.map((l: any, lIdx: number) => `      - ${l.title || `الدرس ${lIdx + 1}`}`).join('\n');
      return `  * ${u.title || `الوحدة ${uIdx + 1}`}:\n${lessonTitles}`;
    }).join('\n');
    contextParts.push(`خريطة وحدات ودروس المنهج الدراسي:\n${unitMap}`);
  }

  // B. Knowledge Graph Subgraph Block
  if (subgraph.synthesizedContext) {
    contextParts.push(subgraph.synthesizedContext);
  }

  // C. Textbook Parent Sections
  if (parentChunks.length > 0) {
    const textbookText = parentChunks.map((parent, index) => {
      return `--- القسم ${index + 1}: [${parent.heading}] ---\n` +
             `محتوى الدرس المقرر:\n${parent.content}\n` +
             `-----------------------------------------`;
    }).join('\n\n');
    contextParts.push(textbookText);
  }

  const formattedContext = contextParts.join('\n\n');

  return {
    parentChunks,
    childChunks: topChildChunks,
    subgraph,
    formattedContext,
    metrics: {
      vectorCandidateCount: vectorCandidates.length,
      bm25CandidateCount: bm25Candidates.length,
      graphEntityCount: subgraph.entities.length,
      fusedCandidateCount: fusedScores.length
    }
  };
}
