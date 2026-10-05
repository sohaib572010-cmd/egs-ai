import { pageMetadata } from '@/lib/seo_metadata';

export const metadata = pageMetadata({
  title: 'حذف حساب EGS AI وبياناته نهائياً',
  description: 'اطلب حذف حسابك في EGS AI وكل بياناته نهائياً: المحادثات والصور والتسجيلات الصوتية والامتحانات والبطاقات والاشتراكات، بالتحقق عبر رمز يصل إلى بريدك.',
  path: '/delete-account'
});

export default function DeleteAccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
