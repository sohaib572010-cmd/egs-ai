import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'خطط وباقات الاشتراك والأسعار | EGS AI',
  description: 'تعرف على باقات الاشتراك الشهرية والموسمية لمنصة EGS AI للذكاء الاصطناعي التعليمي. باقة الشهر (60 ج.م)، باقة الشهرين (110 ج.م)، وباقة 3 أشهر (140 ج.م) مع ميزة التفكير العميق (Deep Thinking) والاشتراك عبر كاشير ومحافظ الدفع الإلكتروني.',
  keywords: [
    'اشتراكات EGS AI',
    'أسعار EGS AI',
    'باقات ذكاء اصطناعي للمذاكرة',
    'مدرس ذكاء اصطناعي بريميوم',
    'كاشير فودافون كاش للمذاكرة',
    'EGS AI subscriptions',
    'باقات المناهج المصرية'
  ],
  alternates: {
    canonical: '/subscriptions',
  },
  openGraph: {
    title: 'خطط وباقات الاشتراك والأسعار | EGS AI',
    description: 'اختر الباقة المناسبة لمذاكرتك وتفوقك الدراسي مع منصة EGS AI. تجديد يومي للنقاط وإتاحة ميزة التفكير العميق للذكاء الاصطناعي.',
    url: 'https://egsaiedu.com/subscriptions',
  }
};

export default function SubscriptionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
