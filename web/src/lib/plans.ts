export interface KashierPlan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  durationDays: number;
  dailyCoins: number;
  bonusCoins: number;
  badge?: string;
  description: string;
}

export const KASHIER_PLANS: Record<string, KashierPlan> = {
  pro_1m: {
    id: 'pro_1m',
    name: 'باقة شهر (1 Month)',
    amount: 60,
    currency: 'EGP',
    durationDays: 30,
    dailyCoins: 80,
    bonusCoins: 80,
    badge: 'الباقة التمهيدية',
    description: 'تمنحك 80 نقطة يومياً تتجدد كل 24 ساعة طوال 30 يوماً مع وصول كامل لنموذج Pro والتفكير المستفيض (2 ج.م / اليوم)'
  },
  pro_2m: {
    id: 'pro_2m',
    name: 'باقة شهرين (2 Months)',
    amount: 110,
    currency: 'EGP',
    durationDays: 60,
    dailyCoins: 90,
    bonusCoins: 90,
    badge: 'الباقة المرنة',
    description: 'تمنحك 90 نقطة يومياً تتجدد كل 24 ساعة طوال 60 يوماً مع نموذج Pro والتفكير المستفيض (1.83 ج.م / اليوم)'
  },
  pro_3m: {
    id: 'pro_3m',
    name: 'باقة 3 أشهر (3 Months)',
    amount: 140,
    currency: 'EGP',
    durationDays: 90,
    dailyCoins: 120,
    bonusCoins: 120,
    badge: 'خيار 85% من الطلاب المتفوقين — باقة الترم الكامل',
    description: 'تمنحك 120 نقطة يومياً تتجدد كل 24 ساعة طوال 90 يوماً مع أعلى أولوية وتوفير 40 ج.م (فقط 1.5 ج.م / اليوم)'
  }
};
