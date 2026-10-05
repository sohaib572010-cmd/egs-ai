import { featureRouteMetadata } from '@/lib/seo_metadata';

export const metadata = featureRouteMetadata('study-planner');

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
