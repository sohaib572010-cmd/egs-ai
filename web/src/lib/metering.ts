import { db, type Profile } from './db';
import { KASHIER_PLANS } from './plans';
import {
  DEFAULT_USD_EGP_RATE,
  costToPoints,
  fairUseAllowanceEgp,
  isPeakTime,
  sumUsage,
  tokenCostUsd,
  type TokenUsage
} from './points_pricing';

const AI_SLOT_TTL_SECONDS = 240;
const AI_SLOT_WAIT_MS = 8000;

export interface ChargeResult {
  points: number;
  costEgp: number;
  remaining: number;
  fairUse: boolean;
  peak: boolean;
}

export function getUsdEgpRate(): number {
  const rate = Number(process.env.USD_EGP_RATE);
  return Number.isFinite(rate) && rate >= 30 && rate <= 1000 ? rate : DEFAULT_USD_EGP_RATE;
}

export function isMeteringExempt(profile: Profile): boolean {
  return profile.role === 'admin' || !!profile.unlimited_credit;
}

interface ProviderUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

// Reads the OpenAI-compatible usage block DeepSeek returns, including its prompt-cache split.
export function usageFromProvider(usage: ProviderUsage | null | undefined): TokenUsage | null {
  if (!usage || typeof usage.prompt_tokens !== 'number') return null;
  const hit = Math.max(0, Number(usage.prompt_cache_hit_tokens) || 0);
  const miss = Number.isFinite(usage.prompt_cache_miss_tokens)
    ? Math.max(0, Number(usage.prompt_cache_miss_tokens))
    : Math.max(0, usage.prompt_tokens - hit);
  return { cacheHit: hit, cacheMiss: miss, output: Math.max(0, Number(usage.completion_tokens) || 0) };
}

// Conservative token estimate for requests whose usage never arrived (client aborted, stream cut).
export function estimateUsage(inputChars: number, outputChars: number): TokenUsage {
  return { cacheHit: 0, cacheMiss: Math.ceil(inputChars / 4), output: Math.ceil(outputChars / 3) };
}

// A subscriber whose real cost runs ahead of the plan's evenly released budget pays the fair-use rate.
function isOverFairUse(profile: Profile, nowMs: number): boolean {
  const isActive = profile.plan_type !== 'free' && profile.subscription_status === 'active';
  if (!isActive) return false;
  if (profile.sub_cost_egp === undefined) return true;
  const plan = KASHIER_PLANS[profile.subscription_plan_id || profile.plan_type] ??
    (profile.plan_type === 'max' ? KASHIER_PLANS.pro_3m : KASHIER_PLANS.pro_1m);
  const startMs = new Date(profile.subscription_start_date || '').getTime();
  const endMs = new Date(profile.subscription_end_date || '').getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return true;
  return Number(profile.sub_cost_egp) > fairUseAllowanceEgp(plan, startMs, endMs, nowMs);
}

export function quoteCharge(profile: Profile, usages: TokenUsage[], at: Date = new Date()) {
  const peak = isPeakTime(at);
  const costEgp = tokenCostUsd(sumUsage(...usages), peak) * getUsdEgpRate();
  const fairUse = isOverFairUse(profile, at.getTime());
  return { costEgp, peak, fairUse, points: costToPoints(costEgp, fairUse) };
}

export async function chargeForUsage(profile: Profile, usages: TokenUsage[], at: Date = new Date()): Promise<ChargeResult> {
  const balance = profile.coins ?? 0;
  if (isMeteringExempt(profile)) return { points: 0, costEgp: 0, remaining: balance, fairUse: false, peak: isPeakTime(at) };
  const quote = quoteCharge(profile, usages, at);
  if (quote.points <= 0) return { ...quote, points: 0, remaining: balance };
  const remaining = await db.chargeUsage(profile.id, quote.points, quote.costEgp);
  return { ...quote, remaining };
}

// Serializes paid AI work per account so parallel requests cannot overdraw a balance.
export async function acquireAiSlot(userId: string): Promise<boolean> {
  const deadline = Date.now() + AI_SLOT_WAIT_MS;
  while (true) {
    if (await db.tryAcquireAiSlot(userId, AI_SLOT_TTL_SECONDS)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

export const releaseAiSlot = (userId: string) => db.releaseAiSlot(userId).catch(err => console.error('releaseAiSlot failed:', err));

const AI_BUSY_MESSAGE = 'يوجد طلب آخر قيد التنفيذ على حسابك. انتظر حتى يكتمل ثم حاول مرة أخرى.';
export const AI_BUSY_RESPONSE = { error: AI_BUSY_MESSAGE, code: 'ai_busy', message: AI_BUSY_MESSAGE };
