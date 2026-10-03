// Repairs RAG chunk links in Supabase.
// 1. Re-points every child chunk to the parent section whose text actually contains it (older uploads linked
//    children to the first parent that shared their breadcrumb heading).
// 2. Creates and embeds child chunks for parent sections that have none, so dense search can reach them.
// Dry run by default; pass --apply to write. Usage: node scripts/repair_chunk_links.mjs [--apply]
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
);
const APPLY = process.argv.includes('--apply');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ALIBABA_KEY = env.ALIBABA_API_KEY || env.DASHSCOPE_API_KEY;
const EMBED_URL = `${env.ALIBABA_API_BASE || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'}/embeddings`;

const flat = s => s.replace(/\s+/g, ' ').trim();

async function fetchAll(curriculumId) {
  const rows = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('curriculum_chunks')
      .select('id, heading, content, chunk_level, parent_id, position_index')
      .eq('curriculum_id', curriculumId)
      .gte('position_index', 0)
      .order('position_index')
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function embed(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 10) {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ALIBABA_KEY}` },
      body: JSON.stringify({ model: 'text-embedding-v4', input: texts.slice(i, i + 10).map(t => t.slice(0, 8000)), dimensions: 768 }),
      signal: AbortSignal.timeout(30000)
    });
    if (!res.ok) throw new Error(`Embedding error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const batch = new Array(Math.min(10, texts.length - i)).fill(null);
    for (const item of data.data) batch[item.index] = item.embedding;
    out.push(...batch);
  }
  return out;
}

const { data: curricula, error } = await supabase.from('curriculums').select('id, grade_level, subject_name, is_placeholder');
if (error) throw error;

let totalRelinked = 0;
let totalOrphans = 0;
for (const c of curricula.filter(x => !x.is_placeholder)) {
  const rows = (await fetchAll(c.id)).filter(r => !r.heading.startsWith('__'));
  const parents = rows.filter(r => r.chunk_level === 'parent');
  const children = rows.filter(r => r.chunk_level === 'child');
  const flatParent = new Map(parents.map(p => [p.id, flat(p.content)]));
  const byHeading = new Map();
  for (const p of parents) byHeading.set(p.heading, [...(byHeading.get(p.heading) || []), p]);

  const relinks = [];
  for (const child of children) {
    const probe = flat(child.content).slice(0, 80);
    if (!probe || flatParent.get(child.parent_id)?.includes(probe)) continue;
    const owner = (byHeading.get(child.heading) || []).find(p => flatParent.get(p.id).includes(probe))
      || parents.find(p => flatParent.get(p.id).includes(probe));
    if (owner) relinks.push({ id: child.id, parent_id: owner.id });
  }

  const linked = new Set(children.map(ch => relinks.find(r => r.id === ch.id)?.parent_id ?? ch.parent_id));
  const orphans = parents.filter(p => !linked.has(p.id) && flat(p.content).length > 20);
  totalRelinked += relinks.length;
  totalOrphans += orphans.length;
  console.log(`${c.grade_level} | ${c.subject_name}: ${relinks.length} children to relink, ${orphans.length} sections without chunks`);
  if (!APPLY) continue;

  for (let i = 0; i < relinks.length; i += 25) {
    await Promise.all(relinks.slice(i, i + 25).map(async r => {
      const { error: upErr } = await supabase.from('curriculum_chunks').update({ parent_id: r.parent_id }).eq('id', r.id);
      if (upErr) throw upErr;
    }));
  }

  if (orphans.length) {
    const vectors = await embed(orphans.map(p => `${p.heading}\n${p.content}`));
    const maxPos = Math.max(0, ...rows.map(r => r.position_index ?? 0));
    const inserts = orphans.map((p, i) => ({
      id: crypto.randomUUID(),
      curriculum_id: c.id,
      heading: p.heading,
      content: p.content,
      chunk_level: 'child',
      parent_id: p.id,
      position_index: maxPos + 1 + i,
      embedding: vectors[i]
    }));
    for (let i = 0; i < inserts.length; i += 50) {
      const { error: insErr } = await supabase.from('curriculum_chunks').insert(inserts.slice(i, i + 50));
      if (insErr) throw insErr;
    }
  }
  console.log('  applied');
}
console.log(`\n${APPLY ? 'Applied' : 'Dry run'}: ${totalRelinked} children relinked, ${totalOrphans} sections given searchable chunks.`);
if (!APPLY) console.log('Run again with --apply to write these changes.');
