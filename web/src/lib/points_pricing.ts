import { KASHIER_PLANS, type KashierPlan } from './plans';

// deepseek-flash list prices in USD per 1M tokens (api-docs.deepseek.com/quick_start/pricing, checked 2026-09-27).
export const DEEPSEEK_FLASH_USD = {
  peak: { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 },
  offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 }
} as const;
// DeepSeek bills peak rates 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday.
export const PEAK_WINDOWS_UTC: ReadonlyArray<readonly [number, number]> = [[1, 4], [6, 10]];

export const DEFAULT_USD_EGP_RATE = 55;
export const PAYMENT_FEE_RATE = 0.035;
export const WORST_CASE_MARGIN = 0.1;
// Covers the one message that may overshoot a budget before the next charge is checked.
export const OVERDRAFT_RESERVE_EGP = 5;
export const FAIR_USE_MULTIPLIER = 2;
export const PACE_LEAD_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface TokenUsage {
  cacheHit: number;
  cacheMiss: number;
  output: number;
}

// Only DeepSeek calls are metered. Alibaba Cloud embeddings, reranking and speech recognition run on the
// platform's free tier and are not charged to students.
// Metered on top of every curriculum-grounded chat reply: query analysis (its instructions and lesson map are
// usually a cache hit) and the engagement check.
export const RAG_OVERHEAD_USAGE: TokenUsage = { cacheHit: 3000, cacheMiss: 800, output: 650 };
export const VISION_USAGE: TokenUsage = { cacheHit: 0, cacheMiss: 4900, output: 1800 };
export const TRANSCRIPT_REFINE_USAGE: TokenUsage = { cacheHit: 0, cacheMiss: 900, output: 500 };

// Typical request sizes, used only to show estimates to students.
const TYPICAL_USAGE: Record<string, TokenUsage> = {
  chat: { cacheHit: 3500, cacheMiss: 3000, output: 1300 },
  thinking: { cacheHit: 3500, cacheMiss: 3000, output: 3800 },
  exam: { cacheHit: 0, cacheMiss: 7000, output: 4000 },
  grading: { cacheHit: 0, cacheMiss: 5000, output: 1500 },
  flashcards: { cacheHit: 0, cacheMiss: 5000, output: 2500 }
};

export function isPeakTime(at: Date = new Date()): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = at.getUTCHours();
  return PEAK_WINDOWS_UTC.some(([start, end]) => hour >= start && hour < end);
}

export function sumUsage(...usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, u) => ({ cacheHit: acc.cacheHit + u.cacheHit, cacheMiss: acc.cacheMiss + u.cacheMiss, output: acc.output + u.output }),
    { cacheHit: 0, cacheMiss: 0, output: 0 }
  );
}

export function tokenCostUsd(usage: TokenUsage, peak: boolean): number {
  const r = peak ? DEEPSEEK_FLASH_USD.peak : DEEPSEEK_FLASH_USD.offPeak;
  return (usage.cacheHit * r.cacheHit + usage.cacheMiss * r.cacheMiss + usage.output * r.output) / 1_000_000;
}

// Real cost a plan may spend over its whole term while keeping WORST_CASE_MARGIN after gateway fees.
export function planBudgetEgp(plan: KashierPlan): number {
  return plan.amount * (1 - PAYMENT_FEE_RATE - WORST_CASE_MARGIN) - OVERDRAFT_RESERVE_EGP;
}

// Activation grant plus one refill per Cairo midnight.
const refillsPerTerm = (plan: KashierPlan) => plan.durationDays + 1;

// Real cost (EGP) one point buys at the standard rate. Fair-use charges are FAIR_USE_MULTIPLIER times higher,
// which caps every plan at its budget even if the student spends every point every day.
export const POINT_VALUE_EGP = FAIR_USE_MULTIPLIER * Math.min(
  ...Object.values(KASHIER_PLANS).map(p => planBudgetEgp(p) / (p.dailyCoins * refillsPerTerm(p)))
);

export function costToPoints(costEgp: number, fairUse = false): number {
  const points = (costEgp / POINT_VALUE_EGP) * (fairUse ? FAIR_USE_MULTIPLIER : 1);
  return Math.ceil(points * 100) / 100;
}

// Budget a subscriber may have spent by `nowMs`, released evenly over the term with a small head start.
export function fairUseAllowanceEgp(plan: KashierPlan, startMs: number, endMs: number, nowMs: number): number {
  const span = endMs - startMs;
  if (!(span > 0)) return 0;
  const fraction = (nowMs - startMs + PACE_LEAD_DAYS * DAY_MS) / span;
  return planBudgetEgp(plan) * Math.min(1, Math.max(0, fraction));
}

export interface PointRange {
  offPeak: number;
  peak: number;
}

export interface PricingSnapshot {
  usdEgpRate: number;
  fairUseMultiplier: number;
  actions: {
    chat: PointRange;
    thinking: PointRange;
    image: PointRange;
    voiceMinute: PointRange;
    exam: PointRange;
    grading: PointRange;
    flashcards: PointRange;
  };
  plans: Record<string, { dailyPoints: number; chatsPerDay: PointRange; thinkingPerDay: PointRange }>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildPricingSnapshot(usdEgpRate: number = DEFAULT_USD_EGP_RATE): PricingSnapshot {
  const range = (usage: TokenUsage): PointRange => ({
    offPeak: round1(costToPoints(tokenCostUsd(usage, false) * usdEgpRate)),
    peak: round1(costToPoints(tokenCostUsd(usage, true) * usdEgpRate))
  });
  const actions = {
    chat: range(sumUsage(TYPICAL_USAGE.chat, RAG_OVERHEAD_USAGE)),
    thinking: range(sumUsage(TYPICAL_USAGE.thinking, RAG_OVERHEAD_USAGE)),
    image: range(VISION_USAGE),
    voiceMinute: range(TRANSCRIPT_REFINE_USAGE),
    exam: range(TYPICAL_USAGE.exam),
    grading: range(TYPICAL_USAGE.grading),
    flashcards: range(TYPICAL_USAGE.flashcards)
  };
  const perDay = (daily: number, cost: PointRange): PointRange => ({
    offPeak: Math.floor(daily / cost.offPeak),
    peak: Math.floor(daily / cost.peak)
  });
  const plans = Object.fromEntries(
    Object.values(KASHIER_PLANS).map(p => [
      p.id,
      { dailyPoints: p.dailyCoins, chatsPerDay: perDay(p.dailyCoins, actions.chat), thinkingPerDay: perDay(p.dailyCoins, actions.thinking) }
    ])
  );
  return { usdEgpRate, fairUseMultiplier: FAIR_USE_MULTIPLIER, actions, plans };
}

// Peak windows rendered as Cairo local hours for the given day, e.g. "9 ص - 1 م".
export function peakWindowsLabel(on: Date = new Date()): string[] {
  const fmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: 'numeric', hour12: true, timeZone: 'Africa/Cairo' });
  const base = Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate());
  return PEAK_WINDOWS_UTC.map(([s, e]) => `${fmt.format(new Date(base + s * 3600000))} - ${fmt.format(new Date(base + e * 3600000))}`);
}
