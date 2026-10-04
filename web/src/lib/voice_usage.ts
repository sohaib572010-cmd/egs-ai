import { db, type Profile, type VoiceUsageRow } from './db';
import { getCairoDateString } from './currency_verifier';
import { VOICE_LIMITS, voiceTier, type VoiceUsageSummary } from './voice_policy';

export const HEARTBEAT_SECONDS = 30;
const MIN_CALL_SECONDS = 30;
const TOKEN_GRACE_SECONDS = 20;

const now = () => Date.now();
const secondsSince = (iso: string | null) => (iso ? Math.max(0, Math.round((now() - new Date(iso).getTime()) / 1000)) : 0);

function emptyRow(userId: string, date: string): VoiceUsageRow {
  return { user_id: userId, date, seconds_used: 0, calls: 0, active_call_id: null, call_started_at: null, call_reserved: 0, last_beat_at: null, key_slot: null };
}

// Refunds the unused part of a call's reservation. Without a clean end, the call is charged up to its last
// heartbeat plus one interval, so a crashed tab costs little while skipping heartbeats never saves time.
function settle(row: VoiceUsageRow, endedCleanly: boolean): VoiceUsageRow {
  if (!row.active_call_id) return row;
  const reserved = row.call_reserved;
  const elapsed = secondsSince(row.call_started_at);
  const lastBeat = row.last_beat_at ? Math.round((new Date(row.last_beat_at).getTime() - new Date(row.call_started_at || row.last_beat_at).getTime()) / 1000) : 0;
  const actual = Math.min(reserved, endedCleanly ? elapsed : Math.min(elapsed, lastBeat + HEARTBEAT_SECONDS));
  return { ...row, seconds_used: Math.max(0, row.seconds_used - (reserved - actual)), active_call_id: null, call_started_at: null, call_reserved: 0, last_beat_at: null };
}

function isExpired(row: VoiceUsageRow) {
  return !!row.active_call_id && secondsSince(row.call_started_at) > row.call_reserved + TOKEN_GRACE_SECONDS;
}

async function loadRow(profile: Profile): Promise<VoiceUsageRow> {
  const date = getCairoDateString();
  const row = (await db.getVoiceUsage(profile.id, date)) || emptyRow(profile.id, date);
  if (isExpired(row)) {
    const settled = settle(row, false);
    await db.saveVoiceUsage(settled);
    return settled;
  }
  return row;
}

function summarize(profile: Profile, row: VoiceUsageRow): VoiceUsageSummary {
  const tier = voiceTier(profile);
  const { dailyMinutes, callMinutes } = VOICE_LIMITS[tier];
  const limit = dailyMinutes * 60;
  return {
    tier,
    limit_seconds: limit,
    used_seconds: Math.min(limit, row.seconds_used),
    remaining_seconds: Math.max(0, limit - row.seconds_used),
    call_max_seconds: callMinutes * 60
  };
}

export async function getVoiceUsageSummary(profile: Profile): Promise<VoiceUsageSummary> {
  return summarize(profile, await loadRow(profile));
}

export type CallGrant =
  | { ok: true; callId: string; seconds: number; slot: number | null; summary: VoiceUsageSummary }
  | { ok: false; summary: VoiceUsageSummary };

export async function startVoiceCall(profile: Profile): Promise<CallGrant> {
  let row = await loadRow(profile);
  if (row.active_call_id) row = settle(row, true);
  const summary = summarize(profile, row);
  const seconds = Math.min(summary.remaining_seconds, summary.call_max_seconds);
  if (seconds < MIN_CALL_SECONDS) {
    await db.saveVoiceUsage(row);
    return { ok: false, summary };
  }
  const callId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  row = { ...row, seconds_used: row.seconds_used + seconds, calls: row.calls + 1, active_call_id: callId, call_started_at: startedAt, call_reserved: seconds, last_beat_at: startedAt };
  await db.saveVoiceUsage(row);
  return { ok: true, callId, seconds, slot: null, summary: summarize(profile, row) };
}

// Seconds left in the reservation of an active call, used to mint a resumption token for the same call.
export async function resumeVoiceCall(profile: Profile, callId: string): Promise<CallGrant> {
  const row = await loadRow(profile);
  const summary = summarize(profile, row);
  if (row.active_call_id !== callId) return { ok: false, summary };
  const seconds = row.call_reserved - secondsSince(row.call_started_at);
  if (seconds < 10) return { ok: false, summary };
  return { ok: true, callId, seconds, slot: row.key_slot ?? null, summary };
}

export async function setVoiceCallKeySlot(profile: Profile, callId: string, slot: number) {
  const row = await loadRow(profile);
  if (row.active_call_id === callId && row.key_slot !== slot) await db.saveVoiceUsage({ ...row, key_slot: slot });
}

export async function recordVoiceHeartbeat(profile: Profile, callId: string, ended: boolean): Promise<{ active: boolean; summary: VoiceUsageSummary; durationSeconds?: number }> {
  const row = await loadRow(profile);
  if (row.active_call_id !== callId) return { active: false, summary: summarize(profile, row) };
  const next = ended ? settle(row, true) : { ...row, last_beat_at: new Date().toISOString() };
  await db.saveVoiceUsage(next);
  const durationSeconds = ended ? row.call_reserved - (row.seconds_used - next.seconds_used) : undefined;
  return { active: !ended, summary: summarize(profile, next), durationSeconds };
}

