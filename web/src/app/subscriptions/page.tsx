'use client';

import App from '../page';

export default function SubscriptionsPage() {
  return (
    <>
      <section className="sr-only" aria-label="باقات واشتراكات منصة EGS AI">
        <h2>خطط الأسعار وباقات الاشتراك في منصة EGS AI</h2>
        <p>
          توفر منصة EGS AI باقات اشتراك مرنة واقتصادية مصممة خصيصاً للطلاب المصريين:
        </p>
        <ul>
          <li>باقة الشهر الواحد (Pro 1 Month): 60 جنيهاً مصرياً لمدة 30 يوماً، مع رصيد يومي 80 نقطة وميزة التفكير العميق.</li>
          <li>باقة الشهرين (Pro 2 Months): 110 جنيهات مصرية لمدة 60 يوماً، مع رصيد يومي 90 نقطة.</li>
          <li>باقة الثلاثة أشهر (Pro 3 Months): 140 جنيهاً مصرياً لمدة 90 يوماً، مع رصيد يومي 120 نقطة.</li>
        </ul>
        <p>
          طرق دفع آمنة 100% عبر بوابة كاشير (Kashier): فيزا، ماستركارد، ميزة، فودافون كاش، أورنج كاش، اتصالات كاش، وي باي، وإنستاباي (InstaPay).
        </p>
      </section>
      <App initialTab="subscriptions" />
    </>
  );
}
