import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'لوحة الشرف وتصنيف الطلاب المتفوقين | EGS AI',
  description: 'لوحة الشرف والتصنيف التنافسي لطلاب منصة EGS AI في جميع محافظات مصر. تنافس مع زملائك، اجمع نقاط المذاكرة، وحقق أعلى المراتب في الاختبارات وحل المسائل.',
  keywords: [
    'لوحة الشرف للطلاب',
    'تصنيف الطلاب المتفوقين',
    'أوائل المذاكرة بالذكاء الاصطناعي',
    'مسابقات تعليمية مصرية',
    'EGS AI leaderboard'
  ],
  alternates: {
    canonical: '/leaderboard',
  },
  openGraph: {
    title: 'لوحة الشرف وتصنيف الطلاب المتفوقين | EGS AI',
    description: 'ترتيب الطلاب المتفوقين والأكثر نشاطاً في المذاكرة والاختبارات على منصة EGS AI.',
    url: 'https://egsaiedu.com/leaderboard',
  }
};

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
