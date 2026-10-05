import { featureRouteMetadata } from '@/lib/seo_metadata';

export const metadata = featureRouteMetadata('quizzes-exams');

export default function ExamsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
