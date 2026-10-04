// Server-side Gemini key pool: least-recently-used selection across healthy keys, cooldowns per failure
// kind and automatic failover. State is per server instance.

export type KeyFailure = 'quota' | 'auth' | 'transient';

interface KeyState {
  key: string;
  coolUntil: number;
  failures: number;
  lastUsed: number;
}

const COOLDOWN_MS: Record<KeyFailure, (failures: number) => number> = {
  quota: f => Math.min(15 * 60_000, 60_000 * 2 ** Math.min(f - 1, 4)),
  auth: () => 6 * 60 * 60_000,
  transient: () => 20_000
};

let pool: KeyState[] | null = null;

function keys(): KeyState[] {
  if (!pool) {
    const raw = [process.env.GEMINI_API_KEYS || '', process.env.GEMINI_API_KEY || ''].join(',');
    pool = [...new Set(raw.split(/[\s,]+/).map(k => k.trim()).filter(Boolean))].map(key => ({ key, coolUntil: 0, failures: 0, lastUsed: 0 }));
  }
  return pool;
}

export const keyCount = () => keys().length;

export function classifyKeyError(error: unknown): KeyFailure {
  const e = error as { status?: number; code?: number; message?: string };
  const status = e?.status ?? e?.code;
  const text = String(e?.message || error || '');
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit|exhausted/i.test(text)) return 'quota';
  if (status === 401 || status === 403 || /API key|PERMISSION_DENIED|UNAUTHENTICATED|not valid|leaked/i.test(text)) return 'auth';
  return 'transient';
}

export function classifyDropReason(reason: unknown): KeyFailure | null {
  if (typeof reason !== 'string' || !reason.trim() || /expired/i.test(reason)) return null;
  return classifyKeyError(new Error(reason.slice(0, 300)));
}

export function reportKeyFailure(slot: number, kind: KeyFailure) {
  const state = keys()[slot];
  if (!state) return;
  state.failures += 1;
  state.coolUntil = Date.now() + COOLDOWN_MS[kind](state.failures);
}

function reportKeySuccess(slot: number) {
  const state = keys()[slot];
  if (state) state.failures = 0;
}

// Healthy keys first (the preferred one, then least recently used), cooling keys last as a fallback.
function orderedSlots(preferred?: number, avoid?: number): number[] {
  const now = Date.now();
  const all = keys().map((s, slot) => ({ ...s, slot })).filter(s => s.slot !== avoid || keys().length === 1);
  const healthy = all.filter(s => s.coolUntil <= now).sort((a, b) => a.lastUsed - b.lastUsed);
  const cooling = all.filter(s => s.coolUntil > now).sort((a, b) => a.coolUntil - b.coolUntil);
  const order = [...healthy, ...cooling].map(s => s.slot);
  return preferred !== undefined && healthy.some(s => s.slot === preferred) ? [preferred, ...order.filter(s => s !== preferred)] : order;
}

export async function withGeminiKey<T>(
  task: (key: string, slot: number) => Promise<T>,
  opts: { preferred?: number; avoid?: number; maxAttempts?: number } = {}
): Promise<{ result: T; slot: number }> {
  const slots = orderedSlots(opts.preferred, opts.avoid).slice(0, opts.maxAttempts ?? 4);
  if (!slots.length) throw new Error('No Gemini API key is configured');
  let lastError: unknown;
  for (const slot of slots) {
    keys()[slot].lastUsed = Date.now();
    try {
      const result = await task(keys()[slot].key, slot);
      reportKeySuccess(slot);
      return { result, slot };
    } catch (error) {
      lastError = error;
      reportKeyFailure(slot, classifyKeyError(error));
    }
  }
  throw lastError;
}
