import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'المعلم الصوتي (تجريبي)',
  description: 'مكالمة صوتية تفاعلية مع معلم ذكي يشرح منهجك المصري بالعامية المصرية أو الفصحى المبسطة.',
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: '/voice',
  },
};

export default function VoiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
