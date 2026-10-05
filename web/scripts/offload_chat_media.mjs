// Moves base64 photos and voice notes stored inside chat_history.message into the private `chat-media`
// storage bucket and replaces them with `media:<path>` references (same format as lib/chat_media.ts).
// Each object is uploaded and read back (size check) before its row is rewritten, so no data can be lost.
// Dry run by default; pass --apply to write. Usage: node scripts/offload_chat_media.mjs [--apply]
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])
);
const APPLY = process.argv.includes('--apply');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BUCKET = 'chat-media';

const IMAGE_RE = /\[IMAGE_MESSAGE:([^;\]]+);([^;\]]+)/;
const VOICE_RE = /(VOICE_MESSAGE:duration=[0-9.]+;mime=[\s\S]*?;audio=)([^\]]*)\]/;
const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3',
  'audio/wav': 'wav', 'audio/aac': 'aac'
};

// Pattern filters on the message column force a detoast of every large row and time out, so list the
// user message ids (index-only) and inspect each row individually.
async function candidateIds() {
  const ids = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('chat_history').select('id').eq('sender', 'user').order('id').range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    ids.push(...data.map(r => r.id));
    if (data.length < 1000) return ids;
  }
}

async function store(row, mime, base64, createdAt) {
  const type = mime.split(';')[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext || !base64 || base64.startsWith('media:') || base64.startsWith('http')) return null;
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 64) return null;
  const path = `${row.user_id || 'unknown'}/${createdAt.slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  if (!APPLY) return { ref: `media:${path}`, bytes: bytes.length };
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error(`upload ${row.id}: ${error.message}`);
  const { data: back, error: readErr } = await supabase.storage.from(BUCKET).download(path);
  if (readErr || !back || back.size !== bytes.length) throw new Error(`verify ${row.id}: size mismatch`);
  return { ref: `media:${path}`, bytes: bytes.length };
}

const ids = await candidateIds();
console.log(`${ids.length} user messages to inspect${APPLY ? '' : ' (dry run)'}`);
let moved = 0, bytesMoved = 0, failed = 0;
for (const id of ids) {
  const { data: row, error } = await supabase.from('chat_history').select('id, user_id, message, created_at').eq('id', id).single();
  if (error || !row) { failed++; continue; }
  try {
    let message = row.message;
    const created = String(row.created_at || new Date().toISOString());
    const img = message.match(IMAGE_RE);
    if (img) {
      const r = await store(row, img[1], img[2], created);
      if (r) { message = message.replace(img[0], `[IMAGE_MESSAGE:${img[1]};${r.ref}`); bytesMoved += r.bytes; }
    }
    const voice = message.match(VOICE_RE);
    if (voice) {
      const mime = voice[1].match(/mime=([\s\S]*?);audio=/)?.[1] || 'audio/webm';
      const r = await store(row, mime, voice[2], created);
      if (r) { message = message.replace(voice[0], `${voice[1]}${r.ref}]`); bytesMoved += r.bytes; }
    }
    if (message === row.message) continue;
    if (APPLY) {
      const { error: upErr } = await supabase.from('chat_history').update({ message }).eq('id', row.id);
      if (upErr) throw new Error(`update ${row.id}: ${upErr.message}`);
    }
    moved++;
  } catch (e) {
    failed++;
    console.error(e.message);
  }
}
console.log(`${APPLY ? 'moved' : 'would move'} ${moved} rows, ${(bytesMoved / 1048576).toFixed(1)} MB of media; ${failed} failed`);
