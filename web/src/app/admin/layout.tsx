import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'لوحة تحكم المسؤول | EGS AI',
  description: 'لوحة إدارة منصة EGS AI: إدارة المناهج والأنظمة التعليمية والمستخدمين والتقارير.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: '/admin',
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
