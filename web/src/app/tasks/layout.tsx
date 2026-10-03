import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'سجل المذاكرة والمهام اليومية | EGS AI',
  description: 'تابع تقدمك في المنهج الدراسي، المهام اليومية، ملخصات الدروس، وسجل الاستذكار الذكي مع منصة EGS AI.',
  keywords: [
    'سجل المذاكرة',
    'المهام اليومية للطلاب',
    'متابعة المنهج المصري',
    'تنظيم وقت المذاكرة',
    'EGS AI tasks'
  ],
  alternates: {
    canonical: '/tasks',
  },
  openGraph: {
    title: 'سجل المذاكرة والمهام اليومية | EGS AI',
    description: 'تنظيم ومتابعة استذكار دروس المناهج المصرية والمهام اليومية للطلاب.',
    url: 'https://egsaiedu.com/tasks',
  }
};

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
