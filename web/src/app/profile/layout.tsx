import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'الملف الشخصي وإعدادات الحساب | EGS AI',
  description: 'إدارة الحساب الدراسي، تعديل المرحلة والشعبة الدراسية، متابعة رصيد النقاط، وتفضيلات المظهر في منصة EGS AI.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: '/profile',
  },
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
