// Client-safe Voice Tutor policy: usage tiers and launch date. Server enforcement lives in voice_usage.ts.

export type VoiceTier = 'free' | 'subscriber' | 'unlimited';

export const VOICE_LIMITS: Record<VoiceTier, { dailyMinutes: number; callMinutes: number }> = {
  free: { dailyMinutes: 10, callMinutes: 10 },
  subscriber: { dailyMinutes: 60, callMinutes: 30 },
  unlimited: { dailyMinutes: 600, callMinutes: 30 }
};

// Accounts created before the launch (Cairo midnight, 2026-10-03) are invited to try the feature once.
export const VOICE_LAUNCH_AT = '2026-10-02T21:00:00.000Z';

export const VOICE_FEEDBACK_CATEGORY = 'تقييم المعلم الصوتي';
export const VOICE_FEEDBACK_TAGS = {
  good: ['شرح واضح', 'فهم سؤالي', 'صوت طبيعي', 'رد سريع'],
  bad: ['الصوت بيتقطع', 'بطيء في الرد', 'مافهمش كلامي', 'خرج عن المنهج']
} as const;

export type VoiceForeignLanguage = { en: string; ar: string; code: string };

const FOREIGN_LANGUAGES: { test: RegExp; lang: VoiceForeignLanguage }[] = [
  { test: /إنجليز|انجليز|english/i, lang: { en: 'English', ar: 'الإنجليزي', code: 'en-US' } },
  { test: /فرنس|french/i, lang: { en: 'French', ar: 'الفرنساوي', code: 'fr-FR' } },
  { test: /ألمان|المان|german/i, lang: { en: 'German', ar: 'الألماني', code: 'de-DE' } },
  { test: /إيطالي|ايطالي|italian/i, lang: { en: 'Italian', ar: 'الإيطالي', code: 'it-IT' } },
  { test: /إسبان|اسبان|spanish/i, lang: { en: 'Spanish', ar: 'الإسباني', code: 'es-ES' } }
];

// The foreign language a subject teaches, if any (English, French, ...).
export function voiceForeignLanguage(subjectName?: string): VoiceForeignLanguage | null {
  if (!subjectName) return null;
  return FOREIGN_LANGUAGES.find(f => f.test.test(subjectName))?.lang || null;
}

export interface VoiceUsageSummary {
  tier: VoiceTier;
  limit_seconds: number;
  used_seconds: number;
  remaining_seconds: number;
  call_max_seconds: number;
}

type TierProfile = {
  role?: string;
  unlimited_credit?: boolean;
  plan_type?: string;
  subscription_status?: string | null;
  subscription_end_date?: string | null;
};

export function voiceTier(profile: TierProfile): VoiceTier {
  if (profile.role === 'admin' || profile.unlimited_credit) return 'unlimited';
  const active = !!profile.plan_type && profile.plan_type !== 'free'
    && profile.subscription_status === 'active'
    && (!profile.subscription_end_date || new Date(profile.subscription_end_date).getTime() > Date.now());
  return active ? 'subscriber' : 'free';
}

export function isVoiceInviteEligible(createdAt?: string | null): boolean {
  return !createdAt || new Date(createdAt).getTime() < new Date(VOICE_LAUNCH_AT).getTime();
}
