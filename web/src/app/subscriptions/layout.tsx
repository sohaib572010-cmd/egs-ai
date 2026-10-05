import { featureRouteMetadata } from '@/lib/seo_metadata';

export const metadata = featureRouteMetadata('pricing');

export default function SubscriptionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
