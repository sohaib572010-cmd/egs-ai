import { pageMetadata } from '@/lib/seo_metadata';

export const metadata = pageMetadata({
  title: 'رعاية اشتراك طالب: ادفع اشتراك ابنك في EGS AI',
  description: 'ولي الأمر يمكنه دفع اشتراك الطالب في EGS AI من جهازه برابط الرعاية، ويتفعل الاشتراك فوراً على حساب الطالب. الدفع بالفيزا والمحافظ الإلكترونية وإنستاباي.',
  path: '/sponsor',
  keywords: ['اشتراك ولي الأمر', 'دفع اشتراك الطالب', 'رعاية طالب EGS AI']
});

export default function SponsorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
