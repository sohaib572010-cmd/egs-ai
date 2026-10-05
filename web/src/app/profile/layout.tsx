import { pageMetadata } from '@/lib/seo_metadata';

export const metadata = pageMetadata({
  title: 'الملف الشخصي وإعدادات الحساب',
  description: 'إدارة حسابك الدراسي في EGS AI: الصف والمسار، الرصيد، الأجهزة المسجلة، وتفضيلات الخصوصية.',
  path: '/profile',
  index: false
});

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
