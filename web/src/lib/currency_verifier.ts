import { Profile } from './db';
import { sha256 } from 'js-sha256';

export interface VerifiedCurrencyState {
  userId: string;
  coins: number;
  dailyCap: number;
  planType: string;
  isSubscribed: boolean;
  subscriptionStatus: 'active' | 'expired' | 'inactive';
  subscriptionPlanId: string | null;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  isExpired: boolean;
  remainingDuration: {
    totalSeconds: number;
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
  dailyRenewal: {
    cairoDate: string;
    lastActiveDate: string;
    isRenewedToday: boolean;
    nextRenewalIso: string;
    secondsUntilNextRenewal: number;
    formattedTimeUntilRenewal: string;
  };
  verification: {
    verifiedAt: string;
    serverTimeIso: string;
    signature: string;
  };
}

/**
 * Returns current date in Cairo timezone (Africa/Cairo) formatted as YYYY-MM-DD.
 */
export function getCairoDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

/**
 * Computes the exact UTC Date object representing the upcoming midnight (00:00:00) in Cairo.
 */
export function getNextCairoMidnight(baseDate: Date = new Date()): Date {
  const cairoDateStr = getCairoDateString(baseDate);
  const [year, month, day] = cairoDateStr.split('-').map(Number);
  
  // Create next calendar day in UTC
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  
  // Refine offset using Cairo hour formatter
  const cairoHourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    hour12: false
  });
  
  const cairoHourAtUtcMidnight = parseInt(cairoHourFormatter.format(nextDay), 10);
  const offsetHours = cairoHourAtUtcMidnight >= 24 ? cairoHourAtUtcMidnight - 24 : cairoHourAtUtcMidnight;
  
  // Cairo midnight in UTC is 00:00 minus Cairo UTC offset
  const exactMidnight = new Date(Date.UTC(year, month - 1, day + 1, 0 - offsetHours, 0, 0));
  return exactMidnight;
}

/**
 * Safely rounds coin balances to 2 decimal places to eliminate IEEE-754 precision drift.
 */
export function toPreciseCoins(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

/**
 * Generates an HMAC-SHA256 signature for the verified currency payload.
 */
export function signCurrencyPayload(userId: string, coins: number, planType: string, timestamp: number): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'egs_currency_verifier_secure_salt_2026';
  const data = `${userId}:${coins.toFixed(2)}:${planType}:${timestamp}`;
  return sha256.hmac(secret, data);
}

/**
 * Comprehensive verification of user currency, daily renewals, and subscription duration.
 */
export function verifyUserCurrencyState(profile: Profile, dailyCaps: Record<string, number>): VerifiedCurrencyState {
  const now = new Date();
  const nowMs = now.getTime();
  const cairoDate = getCairoDateString(now);
  const nextCairoMidnight = getNextCairoMidnight(now);
  
  const secondsUntilNextRenewal = Math.max(0, Math.floor((nextCairoMidnight.getTime() - nowMs) / 1000));
  const renewalHours = Math.floor(secondsUntilNextRenewal / 3600);
  const renewalMinutes = Math.floor((secondsUntilNextRenewal % 3600) / 60);
  const renewalSeconds = secondsUntilNextRenewal % 60;
  const formattedTimeUntilRenewal = `${renewalHours.toString().padStart(2, '0')}:${renewalMinutes.toString().padStart(2, '0')}:${renewalSeconds.toString().padStart(2, '0')}`;

  const planType = profile.plan_type || 'free';
  const dailyCap = dailyCaps[planType] ?? 0.0;
  const preciseCoins = toPreciseCoins(profile.coins ?? 0.0);

  // Subscription expiration verification
  let isExpired = false;
  let totalRemainingSeconds = 0;
  let remainingDays = 0;
  let remainingHours = 0;
  let remainingMinutes = 0;
  let remainingSecs = 0;

  let computedEndMs: number | null = null;
  const planDurationDays = (planType === 'pro_3m' || planType === 'max') ? 90 : (planType === 'pro_2m' ? 60 : 30);
  const startMs = profile.subscription_start_date ? new Date(profile.subscription_start_date).getTime() : (profile.created_at ? new Date(profile.created_at).getTime() : nowMs);

  if (profile.subscription_end_date) {
    const rawEndMs = new Date(profile.subscription_end_date).getTime();
    const spanDays = startMs > 0 ? Math.round((rawEndMs - startMs) / (24 * 60 * 60 * 1000)) : 0;
    if (planDurationDays > 30 && spanDays > 0 && spanDays <= 35) {
      computedEndMs = startMs + planDurationDays * 24 * 60 * 60 * 1000;
    } else {
      computedEndMs = rawEndMs;
    }
  } else if (planType !== 'free') {
    computedEndMs = startMs + planDurationDays * 24 * 60 * 60 * 1000;
  }

  if (computedEndMs) {
    if (computedEndMs <= nowMs) {
      isExpired = true;
    } else {
      totalRemainingSeconds = Math.max(0, Math.floor((computedEndMs - nowMs) / 1000));
      remainingDays = Math.floor(totalRemainingSeconds / (3600 * 24));
      remainingHours = Math.floor((totalRemainingSeconds % (3600 * 24)) / 3600);
      remainingMinutes = Math.floor((totalRemainingSeconds % 3600) / 60);
      remainingSecs = totalRemainingSeconds % 60;
    }
  }

  const effectiveStatus = isExpired ? 'expired' : (profile.subscription_status || (planType !== 'free' ? 'active' : 'inactive'));
  const isSubscribed = !isExpired && planType !== 'free' && effectiveStatus === 'active';
  const isRenewedToday = profile.last_active_date === cairoDate;

  const signature = signCurrencyPayload(profile.id, preciseCoins, planType, nowMs);

  return {
    userId: profile.id,
    coins: preciseCoins,
    dailyCap,
    planType,
    isSubscribed,
    subscriptionStatus: effectiveStatus,
    subscriptionPlanId: profile.subscription_plan_id || (planType !== 'free' ? planType : null),
    subscriptionStartDate: profile.subscription_start_date || (planType !== 'free' ? (profile.created_at || now.toISOString()) : null),
    subscriptionEndDate: profile.subscription_end_date || (computedEndMs && planType !== 'free' ? new Date(computedEndMs).toISOString() : null),
    isExpired,
    remainingDuration: {
      totalSeconds: totalRemainingSeconds,
      days: remainingDays,
      hours: remainingHours,
      minutes: remainingMinutes,
      seconds: remainingSecs
    },
    dailyRenewal: {
      cairoDate,
      lastActiveDate: profile.last_active_date || cairoDate,
      isRenewedToday,
      nextRenewalIso: nextCairoMidnight.toISOString(),
      secondsUntilNextRenewal,
      formattedTimeUntilRenewal
    },
    verification: {
      verifiedAt: now.toISOString(),
      serverTimeIso: now.toISOString(),
      signature
    }
  };
}
