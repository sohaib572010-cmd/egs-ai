import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'المحادثة الذكية وشرح المناهج الدراسية | EGS AI',
  description: 'تحدث مع أول معلم ذكي مصري متخصص في المناهج المصرية الإعدادية والثانوية. شرح الدروس، حل المسائل، إجابة الأسئلة الدراسية وحل الواجبات من الصور خطوة بخطوة.',
  keywords: [
    'شات ذكاء اصطناعي للمذاكرة',
    'معلم ذكي مصري',
    'شرح المناهج المصرية',
    'حل مسائل بالذكاء الاصطناعي',
    'EGS AI chat',
    'شات المذاكرة'
  ],
  alternates: {
    canonical: '/chat',
  },
  openGraph: {
    title: 'المحادثة الذكية وشرح المناهج الدراسية | EGS AI',
    description: 'مساعد دراسي ذكي يشرح المناهج المصرية ويحل المسائل فوراً بالذكاء الاصطناعي.',
    url: 'https://egsaiedu.com/chat',
  }
};

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
