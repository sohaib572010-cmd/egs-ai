/**
 * Re-chunks every uploaded curriculum with the current chunker (curriculum_processor.ts), embeds all children,
 * rebuilds the knowledge graph, and replaces the stored chunks. A curriculum is only replaced once all of its
 * children are embedded, so a failed run never leaves it half-indexed.
 *
 *   npx tsx --env-file=.env.local scripts/reindex_curricula.mts            dry run (counts only)
 *   npx tsx --env-file=.env.local scripts/reindex_curricula.mts --apply    write to the database
 *   ... --apply --only=<curriculum id>                                       one curriculum
 *   ... --apply --shard=0/4                                                  every 4th curriculum (run 4 in parallel)
 * Curricula whose stored chunks already match the current chunker are skipped unless --force is given.
 */
import { db, supabaseAdmin } from '../src/lib/db';
import { chunkMarkdownHierarchical, processCurriculumChunks } from '../src/lib/curriculum_processor';
import { generateEmbeddingBatch } from '../src/lib/gemini';

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const [shard, shards] = (process.argv.find(a => a.startsWith('--shard='))?.slice(8) || '0/1').split('/').map(Number);
const curricula = (await db.getCurriculums())
  .filter(c => !c.is_placeholder && (!only || c.id === only))
  .filter((_, i) => i % shards === shard);

async function storedCounts(curriculumId: string): Promise<{ parents: number; children: number; embedded: number } | null> {
  if (!supabaseAdmin) return null;
  const count = async (level: 'parent' | 'child', embeddedOnly = false) => {
    let q = supabaseAdmin!.from('curriculum_chunks').select('id', { count: 'exact', head: true })
      .eq('curriculum_id', curriculumId).eq('chunk_level', level).gte('position_index', 0);
    if (embeddedOnly) q = q.not('embedding', 'is', null);
    return (await q).count ?? -1;
  };
  const [parents, children, embedded] = await Promise.all([count('parent'), count('child'), count('child', true)]);
  return { parents, children, embedded };
}

let failed = 0;
for (const c of curricula) {
  const label = `${c.grade_level} / ${c.subject_name}`;
  const detail = await db.getCurriculumDetail(c.id);
  if (!detail?.content?.trim()) {
    console.log(`SKIP ${label}: no stored Markdown`);
    continue;
  }
  if (apply && !force) {
    const { parents, children } = chunkMarkdownHierarchical(detail.content);
    const stored = await storedCounts(c.id);
    if (stored && stored.parents === parents.length && stored.children === children.length && stored.embedded === children.length) {
      console.log(`CURRENT ${label}: already indexed with the current chunker`);
      continue;
    }
  }
  const result = await processCurriculumChunks(detail.content, c.id, { skipEmbeddings: !apply });
  const children = result.allChunks.filter(ch => ch.chunk_level === 'child');
  if (!apply) {
    console.log(`DRY ${label}: ${result.parents.length} parents, ${children.length} children, ${result.entities.length} entities, ${result.relations.length} relations`);
    continue;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const missing = children.filter(ch => !ch.embedding);
    if (missing.length === 0) break;
    const vectors = await generateEmbeddingBatch(missing.map(ch => `${ch.heading}\n${ch.content}`));
    missing.forEach((ch, i) => { if (vectors[i]?.length) ch.embedding = vectors[i]; });
  }
  const unembedded = children.filter(ch => !ch.embedding).length;
  if (unembedded > 0) {
    failed++;
    console.log(`FAIL ${label}: ${unembedded} children could not be embedded; stored chunks left unchanged`);
    continue;
  }
  const ok = await db.updateCurriculumContent(c.id, c.grade_level, c.subject_name, result.allChunks, detail.content);
  if (!ok) {
    failed++;
    console.log(`FAIL ${label}: database update failed`);
    continue;
  }
  if (result.entities.length > 0) await db.saveCurriculumGraph(c.id, result.entities, result.relations);
  console.log(`OK ${label}: ${result.parents.length} parents, ${children.length} embedded children, ${result.entities.length} entities`);
}
console.log(failed ? `${failed} curricula failed` : 'done');
process.exit(failed ? 1 : 0);
