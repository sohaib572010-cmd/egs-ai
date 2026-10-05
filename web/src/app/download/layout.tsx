import { pageMetadata } from '@/lib/seo_metadata';

export const metadata = pageMetadata({
  title: 'تحميل تطبيق EGS AI على أندرويد وآيفون والكمبيوتر',
  description: 'ثبّت تطبيق EGS AI على هاتفك الأندرويد أو الآيفون أو الكمبيوتر في ثوانٍ بدون متجر تطبيقات، وذاكر منهجك المصري مع المعلم الذكي والمعلم الصوتي والامتحانات والبطاقات الذكية.',
  path: '/download',
  keywords: ['تحميل تطبيق EGS AI', 'تنزيل تطبيق EGS AI', 'تطبيق ذكاء اصطناعي للمذاكرة', 'تطبيق المنهج المصري', 'EGS AI app']
});

export default function DownloadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
