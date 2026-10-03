/**
 * GraphRAG Engine: Knowledge Graph Extraction, Relational Indexing, and Subgraph Traversal
 * Tailored for the Egyptian National Curriculum (Preparatory & Secondary Stages).
 * Pure TypeScript, Edge & Node runtime compatible.
 */

import { normalizeArabic, tokenizeArabic } from './bm25';

// ─── Entity & Relation Types ──────────────────────────────────────────────────

export type EntityCategory =
  | 'law'        // قانون علمي أو قاعدة
  | 'concept'    // مفهوم أكاديمي
  | 'definition' // تعريف مصطلح
  | 'formula'    // معادلة رياضية/فيزيائية/كيميائية
  | 'rule'       // قاعدة لغوية أو نحوية
  | 'person'     // شخصية تاريخية أو عالم
  | 'event';     // حدث تاريخي أو ظاهرة

export type RelationType =
  | 'requires'       // متطلب قبلي لفهم المفهوم
  | 'part_of'        // جزء من وحدة أو تصنيف
  | 'leads_to'       // يترتب عليه أو يسبب
  | 'contrasts_with' // يقارن بـ أو عكس
  | 'exemplifies'    // مثال توضيحي عليه
  | 'applies_to';    // تطبيق عملي أو مسألة

export interface CurriculumEntity {
  id: string;
  curriculum_id: string;
  name: string;
  normalized_name: string;
  category: EntityCategory;
  description: string;
  aliases: string[];
  chunk_ids: string[];
  importance_score: number; // 0.0 to 1.0 (centrality)
}

export interface CurriculumRelation {
  id: string;
  curriculum_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: RelationType;
  description: string;
  weight: number; // 0.0 to 1.0
}

export interface KnowledgeSubgraph {
  entities: CurriculumEntity[];
  relations: CurriculumRelation[];
  connectedChunkIds: string[];
  relevanceScore: number;
  synthesizedContext: string;
}

// ─── Deterministic Curriculum Pattern Extractor ────────────────────────────────

const RELATION_KEYWORDS: Record<RelationType, RegExp[]> = {
  requires: [
    /(?:يعتمد\s+على|يتطلب\s+فهم|شرط\s+أساسي\s+لـ|مبني\s+على)/u,
    /(?:أساس\s+لـ|تمهيد\s+لـ|ضروري\s+لـ)/u
  ],
  part_of: [
    /(?:ينقسم\s+إلى|تتكون\s+من|أحد\s+فروع|جزء\s+من|يندرج\s+تحت|من\s+أنواعه)/u,
    /(?:تصنيفات|أقسام|عناصر\s+الـ)/u
  ],
  leads_to: [
    /(?:يؤدي\s+إلى|ينتج\s+عنه|يتسبب\s+في|يترتب\s+على|علاقة\s+طردية|علاقة\s+عكسية)/u,
    /(?:تأثير\s+مباشر\s+على|يحدث\s+عندما)/u
  ],
  contrasts_with: [
    /(?:الفرق\s+بين|مقارنة\s+بين|على\s+عكس|بخلاف|يختلف\s+عن|عكس)/u,
    /(?:بينما|في\s+حين\s+أن)/u
  ],
  exemplifies: [
    /(?:مثال\s+على\s+ذلك|من\s+أمثلته|كمثال|تطبيقاً\s+لذلك)/u,
    /(?:مثل|نحو)/u
  ],
  applies_to: [
    /(?:يُستخدم\s+في|تطبيقات\s+حياتية|تطبيقات\s+عملية|يُطبق\s+في)/u,
    /(?:فائدة\s+الـ|أهمية\s+الـ)/u
  ]
};

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts entities and structural relationships from a curriculum markdown chunk.
 */
export function extractEntitiesAndRelationsFromChunk(
  content: string,
  heading: string,
  chunkId: string,
  curriculumId: string
): { entities: CurriculumEntity[]; relations: CurriculumRelation[] } {
  const entities: CurriculumEntity[] = [];
  const relations: CurriculumRelation[] = [];
  const entityNameMap = new Map<string, CurriculumEntity>();

  function registerEntity(
    name: string,
    category: EntityCategory,
    desc: string,
    importance: number = 0.5
  ): CurriculumEntity {
    const trimmed = name.trim();
    const normalized = normalizeArabic(trimmed);
    if (!normalized || normalized.length < 2) {
      return null as any;
    }

    if (entityNameMap.has(normalized)) {
      const existing = entityNameMap.get(normalized)!;
      if (!existing.chunk_ids.includes(chunkId)) {
        existing.chunk_ids.push(chunkId);
      }
      return existing;
    }

    const entity: CurriculumEntity = {
      id: crypto.randomUUID(),
      curriculum_id: curriculumId,
      name: trimmed,
      normalized_name: normalized,
      category,
      description: desc.trim().slice(0, 300),
      aliases: [trimmed],
      chunk_ids: [chunkId],
      importance_score: importance
    };

    entityNameMap.set(normalized, entity);
    entities.push(entity);
    return entity;
  }

  // 1. Extract from Breadcrumb / Heading (Major structural entities)
  const headingParts = heading.split('>').map(p => p.trim()).filter(Boolean);
  let previousEntity: CurriculumEntity | null = null;

  for (let i = 0; i < headingParts.length; i++) {
    const part = headingParts[i];
    const isLaw = /قانون|نظرية|مبدأ|قاعدة/u.test(part);
    const category: EntityCategory = isLaw ? 'law' : 'concept';
    const importance = i === headingParts.length - 1 ? 0.9 : 0.7;

    const ent = registerEntity(part, category, `عنوان ومحور دراسي: ${part}`, importance);
    if (ent && previousEntity && previousEntity.id !== ent.id) {
      relations.push({
        id: crypto.randomUUID(),
        curriculum_id: curriculumId,
        source_entity_id: ent.id,
        target_entity_id: previousEntity.id,
        relation_type: 'part_of',
        description: `المفهوم [${ent.name}] جزء من محور [${previousEntity.name}]`,
        weight: 0.9
      });
    }
    previousEntity = ent;
  }

  // 2. Extract Laws and Principles (قانون كذا ينص على كذا)
  const lawMatches = content.matchAll(/(?:قانون|نظرية|مبدأ|قاعدة)\s+([^\n:،.]{3,40})(?:[:\-–]|ينص\s+على)?\s*([^\n.]{10,200})/gu);
  for (const match of lawMatches) {
    const lawName = match[1].trim();
    const lawStatement = match[2]?.trim() || '';
    const fullName = `${match[0].split(/[:\-–]/)[0].trim()}`;
    const lawEnt = registerEntity(fullName, 'law', lawStatement, 0.95);

    if (previousEntity && lawEnt && previousEntity.id !== lawEnt.id) {
      relations.push({
        id: crypto.randomUUID(),
        curriculum_id: curriculumId,
        source_entity_id: lawEnt.id,
        target_entity_id: previousEntity.id,
        relation_type: 'part_of',
        description: `قانون ينتمي إلى درس [${previousEntity.name}]`,
        weight: 0.85
      });
    }
  }

  // 3. Extract Definitions (يُعرف ... بأنه / هو ...)
  const defMatches = content.matchAll(/(?:يُعرف|يُعرّف|المقصود\s+بـ|مفهوم)\s+([^\n:،.]{3,35})(?:\s+بأنه|\s+هو|\s*:)\s*([^\n.]{10,250})/gu);
  for (const match of defMatches) {
    const term = match[1].trim();
    const defText = match[2]?.trim() || '';
    registerEntity(term, 'definition', defText, 0.85);
  }

  // 4. Extract Mathematical / Physics / Chemistry Formulas
  const formulaMatches = content.matchAll(/(?:\$\$|\$)([^$]{3,80})(?:\$\$|\$)|(?:العلاقة\s+الرياضية|المعادلة)\s*[:\-–]\s*([^\n]{3,80})/gu);
  for (const match of formulaMatches) {
    const formulaStr = (match[1] || match[2] || '').trim();
    if (formulaStr.length >= 3) {
      const formulaEnt = registerEntity(
        `معادلة: ${formulaStr.slice(0, 30)}`,
        'formula',
        `صيغة رياضية/علمية: ${formulaStr}`,
        0.8
      );
      if (previousEntity && formulaEnt && previousEntity.id !== formulaEnt.id) {
        relations.push({
          id: crypto.randomUUID(),
          curriculum_id: curriculumId,
          source_entity_id: formulaEnt.id,
          target_entity_id: previousEntity.id,
          relation_type: 'applies_to',
          description: `صيغة رياضية مقررة في درس [${previousEntity.name}]`,
          weight: 0.8
        });
      }
    }
  }

  // 5. Connect Inter-Entity Relationships based on linguistic markers
  const entityList = Array.from(entityNameMap.values());
  if (entityList.length >= 2) {
    const normalizedContent = normalizeArabic(content);
    for (let i = 0; i < entityList.length; i++) {
      for (let j = i + 1; j < entityList.length; j++) {
        const entA = entityList[i];
        const entB = entityList[j];

        if (!normalizedContent.includes(entA.normalized_name) || !normalizedContent.includes(entB.normalized_name)) {
          continue;
        }

        const escA = escapeRegExp(entA.normalized_name);
        const escB = escapeRegExp(entB.normalized_name);

        // Check if both entities appear in the same paragraph/sentence with a relation marker
        for (const [relType, regexList] of Object.entries(RELATION_KEYWORDS) as [RelationType, RegExp[]][]) {
          let matched = false;
          for (const rx of regexList) {
            try {
              const pattern = new RegExp(`${escA}[\\s\\S]{1,60}${rx.source}[\\s\\S]{1,60}${escB}`, 'u');
              const reversePattern = new RegExp(`${escB}[\\s\\S]{1,60}${rx.source}[\\s\\S]{1,60}${escA}`, 'u');

              if (pattern.test(normalizedContent)) {
                relations.push({
                  id: crypto.randomUUID(),
                  curriculum_id: curriculumId,
                  source_entity_id: entA.id,
                  target_entity_id: entB.id,
                  relation_type: relType,
                  description: `علاقة [${relType}] بين ${entA.name} و ${entB.name}`,
                  weight: 0.75
                });
                matched = true;
                break;
              } else if (reversePattern.test(normalizedContent)) {
                relations.push({
                  id: crypto.randomUUID(),
                  curriculum_id: curriculumId,
                  source_entity_id: entB.id,
                  target_entity_id: entA.id,
                  relation_type: relType,
                  description: `علاقة [${relType}] بين ${entB.name} و ${entA.name}`,
                  weight: 0.75
                });
                matched = true;
                break;
              }
            } catch (rxErr) {
              // Ignore invalid regex combinations safely
            }
          }
          if (matched) break;
        }
      }
    }
  }

  return { entities, relations };
}

// ─── Knowledge Graph Index & Traversal Engine ─────────────────────────────────

export class KnowledgeGraphEngine {
  private entities: Map<string, CurriculumEntity> = new Map(); // id -> Entity
  private normalizedNameToEntity: Map<string, CurriculumEntity> = new Map();
  private relations: CurriculumRelation[] = [];
  // Adjacency lists for graph traversal
  private outgoingEdges: Map<string, CurriculumRelation[]> = new Map();
  private incomingEdges: Map<string, CurriculumRelation[]> = new Map();

  constructor(entities: CurriculumEntity[] = [], relations: CurriculumRelation[] = []) {
    this.loadGraph(entities, relations);
  }

  public loadGraph(entities: CurriculumEntity[], relations: CurriculumRelation[]): void {
    this.entities.clear();
    this.normalizedNameToEntity.clear();
    this.relations = relations;
    this.outgoingEdges.clear();
    this.incomingEdges.clear();

    for (const ent of entities) {
      this.entities.set(ent.id, ent);
      this.normalizedNameToEntity.set(ent.normalized_name, ent);
      for (const alias of ent.aliases || []) {
        this.normalizedNameToEntity.set(normalizeArabic(alias), ent);
      }
    }

    for (const rel of relations) {
      if (!this.outgoingEdges.has(rel.source_entity_id)) {
        this.outgoingEdges.set(rel.source_entity_id, []);
      }
      this.outgoingEdges.get(rel.source_entity_id)!.push(rel);

      if (!this.incomingEdges.has(rel.target_entity_id)) {
        this.incomingEdges.set(rel.target_entity_id, []);
      }
      this.incomingEdges.get(rel.target_entity_id)!.push(rel);
    }
  }

  /**
   * Links query terms and tokens to entities in the knowledge graph.
   */
  public linkEntities(query: string, keywords: string[] = []): CurriculumEntity[] {
    const matched = new Map<string, CurriculumEntity>();
    const normQuery = normalizeArabic(query);
    const queryStems = new Set(tokenizeArabic(`${query} ${keywords.join(' ')}`));
    const normKeywords = keywords.map(k => normalizeArabic(k)).filter(k => k.length >= 4);

    for (const [normName, entity] of this.normalizedNameToEntity.entries()) {
      if (normName.length < 3) continue;
      const nameStems = this.nameStems(normName);
      const phraseHit = normQuery.includes(normName) ||
        normKeywords.some(k => k === normName || (normName.length >= 4 && k.includes(normName)));
      // Every stem of the entity name must occur in the question, so a shared common word alone never links
      const stemHit = nameStems.length > 0 && nameStems.every(s => queryStems.has(s)) &&
        (nameStems.length > 1 || nameStems[0].length >= 3);
      if (phraseHit || stemHit) matched.set(entity.id, entity);
    }

    return [...matched.values()]
      .sort((a, b) => (b.importance_score || 0) - (a.importance_score || 0))
      .slice(0, 12);
  }

  private readonly stemCache = new Map<string, string[]>();

  private nameStems(normName: string): string[] {
    let stems = this.stemCache.get(normName);
    if (!stems) this.stemCache.set(normName, (stems = tokenizeArabic(normName)));
    return stems;
  }

  /**
   * Traverses the graph from seed entities using Spreading Activation with decay.
   * Discovers 1-hop and 2-hop connected concepts, laws, formulas, and prerequisites.
   */
  public traverseSubgraph(
    seedEntities: CurriculumEntity[],
    maxHops: number = 2,
    decayFactor: number = 0.6
  ): {
    activatedEntities: { entity: CurriculumEntity; activation: number }[];
    activeRelations: CurriculumRelation[];
  } {
    if (seedEntities.length === 0) {
      return { activatedEntities: [], activeRelations: [] };
    }

    const activations = new Map<string, number>();
    const traversedEdges = new Map<string, CurriculumRelation>();

    // Initialize seeds
    for (const seed of seedEntities) {
      activations.set(seed.id, 1.0 * (seed.importance_score || 0.8));
    }

    let currentFrontier = seedEntities.map(s => s.id);

    for (let hop = 1; hop <= maxHops; hop++) {
      const nextFrontier: string[] = [];
      const currentDecay = Math.pow(decayFactor, hop);

      for (const nodeId of currentFrontier) {
        const currentScore = activations.get(nodeId) || 0;

        // Traverse outgoing
        const outgoing = this.outgoingEdges.get(nodeId) || [];
        for (const edge of outgoing) {
          traversedEdges.set(edge.id, edge);
          const targetId = edge.target_entity_id;
          const addedScore = currentScore * (edge.weight || 0.7) * currentDecay;
          const prev = activations.get(targetId) || 0;
          activations.set(targetId, Math.max(prev, prev + addedScore));
          if (!nextFrontier.includes(targetId) && !currentFrontier.includes(targetId)) {
            nextFrontier.push(targetId);
          }
        }

        // Traverse incoming
        const incoming = this.incomingEdges.get(nodeId) || [];
        for (const edge of incoming) {
          traversedEdges.set(edge.id, edge);
          const sourceId = edge.source_entity_id;
          const addedScore = currentScore * (edge.weight || 0.7) * currentDecay * 0.8;
          const prev = activations.get(sourceId) || 0;
          activations.set(sourceId, Math.max(prev, prev + addedScore));
          if (!nextFrontier.includes(sourceId) && !currentFrontier.includes(sourceId)) {
            nextFrontier.push(sourceId);
          }
        }
      }

      currentFrontier = nextFrontier;
    }

    const activatedEntities: { entity: CurriculumEntity; activation: number }[] = [];
    for (const [id, activation] of activations.entries()) {
      const ent = this.entities.get(id);
      if (ent) {
        activatedEntities.push({ entity: ent, activation });
      }
    }

    // Sort descending by activation
    activatedEntities.sort((a, b) => b.activation - a.activation);

    return {
      activatedEntities: activatedEntities.slice(0, 10),
      activeRelations: Array.from(traversedEdges.values()).slice(0, 15)
    };
  }

  /**
   * Retrieves an augmented Knowledge Subgraph for a student query.
   * Generates a structured Arabic context block detailing laws, concepts, and dependencies.
   */
  public retrieveKnowledgeGraph(query: string, keywords: string[] = []): KnowledgeSubgraph {
    const seeds = this.linkEntities(query, keywords);
    if (seeds.length === 0) {
      return {
        entities: [],
        relations: [],
        connectedChunkIds: [],
        relevanceScore: 0,
        synthesizedContext: ''
      };
    }

    const { activatedEntities, activeRelations } = this.traverseSubgraph(seeds, 2, 0.65);
    const entities = activatedEntities.map(a => a.entity);

    // Collect all connected chunk IDs from the subgraph
    const chunkIdSet = new Set<string>();
    for (const ent of entities) {
      for (const cid of ent.chunk_ids || []) {
        chunkIdSet.add(cid);
      }
    }

    // Group entities by category for clear presentation
    const laws = entities.filter(e => e.category === 'law');
    const formulas = entities.filter(e => e.category === 'formula');
    const definitions = entities.filter(e => e.category === 'definition');
    const generalConcepts = entities.filter(e => !['law', 'formula', 'definition'].includes(e.category));

    // Synthesize structured markdown
    let block = `خريطة المفاهيم والعلاقات الأكاديمية (Knowledge Graph):\n`;

    if (laws.length > 0) {
      block += `* القوانين والنظريات المرتبطة:\n`;
      laws.forEach(l => {
        block += `  - [${l.name}]: ${l.description}\n`;
      });
    }

    if (formulas.length > 0) {
      block += `* الصيغ والمعادلات الرياضية/العلمية:\n`;
      formulas.forEach(f => {
        block += `  - ${f.name} (${f.description})\n`;
      });
    }

    if (definitions.length > 0) {
      block += `* المصطلحات والتعاريف الأساسية:\n`;
      definitions.forEach(d => {
        block += `  - [${d.name}]: ${d.description}\n`;
      });
    }

    if (generalConcepts.length > 0) {
      block += `* المفاهيم والمحاور المتصلة:\n`;
      generalConcepts.forEach(c => {
        block += `  - ${c.name}: ${c.description}\n`;
      });
    }

    if (activeRelations.length > 0) {
      block += `* العلاقات والروابط المنهجية:\n`;
      activeRelations.slice(0, 6).forEach(r => {
        const sourceEnt = this.entities.get(r.source_entity_id);
        const targetEnt = this.entities.get(r.target_entity_id);
        if (sourceEnt && targetEnt) {
          block += `  - ${sourceEnt.name} -> (${r.relation_type}: ${r.description}) -> ${targetEnt.name}\n`;
        }
      });
    }

    const topScore = activatedEntities[0]?.activation || 0;

    return {
      entities,
      relations: activeRelations,
      connectedChunkIds: Array.from(chunkIdSet),
      relevanceScore: topScore,
      synthesizedContext: block.trim()
    };
  }
}
