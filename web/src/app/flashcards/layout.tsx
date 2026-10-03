import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'البطاقات التعليمية الذكية والمراجعة السريعة | EGS AI',
  description: 'راجع دروسك ومفاهيم المنهج المصري بأسلوب التكرار المتباعد والبطاقات التعليمية التفاعلية المولدة بالذكاء الاصطناعي للمرحلتين الإعدادية والثانوية.',
  keywords: [
    'بطاقات تعليمية ذكية',
    'فلاش كاردز المناهج المصرية',
    'مراجعة سريعة للمذاكرة',
    'تكرار متباعد للدروس',
    'EGS AI flashcards'
  ],
  alternates: {
    canonical: '/flashcards',
  },
  openGraph: {
    title: 'البطاقات التعليمية الذكية والمراجعة السريعة | EGS AI',
    description: 'تثبيت المعلومات ومراجعة المصطلحات والقوانين الهامة ببطاقات ذكية تفاعلية.',
    url: 'https://egsaiedu.com/flashcards',
  }
};

export default function FlashcardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
