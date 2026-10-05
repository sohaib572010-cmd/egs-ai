import { supabaseAdmin } from './db';

const BUCKET = 'chat-media';
const REF_PREFIX = 'media:';
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
const IMAGE_RE = /\[IMAGE_MESSAGE:([^;\]]+);([^;\]]+)/;
const VOICE_RE = /(VOICE_MESSAGE:duration=[0-9.]+;mime=[\s\S]*?;audio=)([^\]]*)\]/;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3',
  'audio/wav': 'wav', 'audio/aac': 'aac'
};

function baseMime(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase();
}

async function upload(userId: string, mime: string, base64: string): Promise<string | null> {
  if (!supabaseAdmin || !base64 || base64.startsWith(REF_PREFIX) || base64.startsWith('http')) return null;
  const type = baseMime(mime);
  const ext = EXTENSIONS[type];
  if (!ext) return null;
  const path = `${userId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(base64, 'base64'), { contentType: type, cacheControl: '31536000', upsert: false });
  if (error) {
    console.error('chat media upload failed:', error.message);
    return null;
  }
  return `${REF_PREFIX}${path}`;
}

// Moves inline base64 photos and voice notes into private storage and returns the message with
// `media:<path>` references. On any storage failure the original payload is kept, so nothing is lost.
export async function offloadInlineMedia(message: string, userId: string): Promise<string> {
  let out = message;
  const img = out.match(IMAGE_RE);
  if (img) {
    const ref = await upload(userId, img[1], img[2]);
    if (ref) out = out.replace(img[0], `[IMAGE_MESSAGE:${img[1]};${ref}`);
  }
  const voice = out.match(VOICE_RE);
  if (voice) {
    const mime = voice[1].match(/mime=([\s\S]*?);audio=/)?.[1] || 'audio/webm';
    const ref = await upload(userId, mime, voice[2]);
    if (ref) out = out.replace(voice[0], `${voice[1]}${ref}]`);
  }
  return out;
}

const REF_GLOBAL_RE = /media:([A-Za-z0-9_\-/.]+)/g;

// Replaces `media:<path>` references with short-lived signed URLs (one batched call per request).
export async function resolveMediaRefs<T extends { message: string }>(rows: T[]): Promise<T[]> {
  if (!supabaseAdmin) return rows;
  const paths = new Set<string>();
  for (const r of rows) {
    if (!r.message || !r.message.includes(REF_PREFIX)) continue;
    for (const m of r.message.matchAll(REF_GLOBAL_RE)) paths.add(m[1]);
  }
  if (paths.size === 0) return rows;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS);
  if (error || !data) return rows;
  const urls = new Map<string, string>();
  for (const d of data) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  return rows.map(r =>
    r.message && r.message.includes(REF_PREFIX)
      ? { ...r, message: r.message.replace(REF_GLOBAL_RE, (all, p: string) => urls.get(p) || all) }
      : r
  );
}
