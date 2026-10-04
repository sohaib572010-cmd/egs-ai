import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth_helpers';
import { db, type VoiceCallEntry } from '@/lib/db';
import { checkRateLimitAsync } from '@/lib/rate_limiter';
import { getVoiceUsageSummary, recordVoiceHeartbeat } from '@/lib/voice_usage';

const MAX_ENTRIES = 600;
const ROLES = ['student', 'teacher', 'search'];

function cleanEntries(raw: unknown): VoiceCallEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).flatMap((e): VoiceCallEntry[] => {
    if (!e || typeof e !== 'object') return [];
    const { role, text, at, interrupted, sources } = e as Record<string, unknown>;
    if (typeof role !== 'string' || !ROLES.includes(role) || typeof text !== 'string' || !text.trim()) return [];
    const time = typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString();
    return [{
      role: role as VoiceCallEntry['role'],
      text: text.trim().slice(0, 4000),
      at: time,
      ...(interrupted === true ? { interrupted: true } : {}),
      ...(Array.isArray(sources) ? { sources: sources.filter((x): x is string => typeof x === 'string').slice(0, 4).map(x => x.slice(0, 200)) } : {})
    }];
  });
}

async function authProfile(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const userId = authHeader?.startsWith('Bearer ') ? verifySessionToken(authHeader.substring(7)) : null;
  return userId ? db.getProfile(userId) : null;
}

export async function GET(req: NextRequest) {
  const profile = await authProfile(req);
  if (!profile) return NextResponse.json({ error: 'login_required' }, { status: 401 });
  try {
    return NextResponse.json({ success: true, usage: await getVoiceUsageSummary(profile) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Voice usage error:', error);
    return NextResponse.json({ error: 'usage_unavailable' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const profile = await authProfile(req);
  if (!profile) return NextResponse.json({ error: 'login_required' }, { status: 401 });
  const limit = await checkRateLimitAsync(`voice_usage:${profile.id}`, 30, 300);
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  try {
    const body = (await req.json().catch(() => null)) || {};
    const callId = typeof body.call_id === 'string' && /^[\w-]{1,64}$/.test(body.call_id) ? body.call_id : '';
    if (!callId) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const entries = cleanEntries(body.entries);
    const result = await recordVoiceHeartbeat(profile, callId, body.ended === true);
    if (entries.length || result.durationSeconds !== undefined) {
      await db.updateVoiceCall(callId, profile.id, call => ({
        transcript: [...(call.transcript || []), ...entries].slice(-MAX_ENTRIES),
        ...(result.durationSeconds !== undefined ? { ended_at: new Date().toISOString(), duration_seconds: result.durationSeconds } : {})
      })).catch(err => console.error('updateVoiceCall failed:', err));
    }
    return NextResponse.json({ success: true, active: result.active, summary: result.summary });
  } catch (error) {
    console.error('Voice heartbeat error:', error);
    return NextResponse.json({ error: 'usage_unavailable' }, { status: 500 });
  }
}
