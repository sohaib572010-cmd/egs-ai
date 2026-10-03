// Re-embeds every child chunk with the runtime query model (Alibaba text-embedding-v4, 768 dims).
// Vectors produced by any other model live in a different space and make pgvector search return
// unrelated sections, so run this after changing EMBEDDING_MODEL in src/lib/gemini.ts.
// Usage: node scripts/reembed_curricula.mjs [--curriculum <uuid>] [--dry-run]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = {};
for (const line of fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.trim().match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) config[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const supabase = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const ALIBABA_KEY = config.ALIBABA_API_KEY || config.DASHSCOPE_API_KEY;
const ENDPOINT = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/embeddings';
const args = process.argv.slice(2);
const onlyId = args.includes('--curriculum') ? args[args.indexOf('--curriculum') + 1] : null;
const dryRun = args.includes('--dry-run');

if (!ALIBABA_KEY) throw new Error('ALIBABA_API_KEY is not set');

async function embedBatch(texts, attempt = 1) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ALIBABA_KEY}` },
    body: JSON.stringify({ model: 'text-embedding-v4', input: texts.map(t => t.slice(0, 8000)), dimensions: 768 }),
    signal: AbortSignal.timeout(20000)
  }).catch(err => ({ ok: false, status: 0, text: async () => String(err) }));
  if (!res.ok) {
    if (attempt < 4) {
      await new Promise(r => setTimeout(r, 1500 * attempt));
      return embedBatch(texts, attempt + 1);
    }
    throw new Error(`Embedding failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const out = new Array(texts.length).fill(null);
  for (const item of data.data || []) out[item.index] = item.embedding;
  return out;
}

async function fetchChildren(curriculumId) {
  const rows = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('curriculum_chunks')
      .select('id, heading, content')
      .eq('curriculum_id', curriculumId)
      .eq('chunk_level', 'child')
      .order('position_index', { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

let query = supabase.from('curriculums').select('id, grade_level, subject_name, is_placeholder');
if (onlyId) query = query.eq('id', onlyId);
const { data: curriculums, error } = await query;
if (error) throw error;

let total = 0;
for (const c of curriculums.filter(c => !c.is_placeholder)) {
  const children = await fetchChildren(c.id);
  const batches = [];
  for (let i = 0; i < children.length; i += 10) batches.push(children.slice(i, i + 10));
  let saved = 0;
  if (!dryRun) {
    await pool(batches, 3, async batch => {
      const vectors = await embedBatch(batch.map(ch => `${ch.heading}\n${ch.content}`));
      await pool(batch.map((ch, idx) => ({ ch, vec: vectors[idx] })), 5, async ({ ch, vec }) => {
        if (!vec || vec.length !== 768) return;
        for (let attempt = 1; attempt <= 3; attempt++) {
          const { error: upErr } = await supabase.from('curriculum_chunks').update({ embedding: vec }).eq('id', ch.id);
          if (!upErr) { saved++; return; }
          if (attempt === 3) console.error(`Update failed for ${ch.id}: ${upErr.message}`);
          else await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      });
    });
  }
  total += saved;
  console.log(`${c.grade_level} | ${c.subject_name}: ${dryRun ? children.length + ' children (dry run)' : `${saved}/${children.length} re-embedded`}`);
}

if (!dryRun) {
  await supabase.from('system_settings').upsert({ key: 'curriculum_version', value: Date.now().toString() });
}
console.log(`Done. ${total} chunks re-embedded.`);
