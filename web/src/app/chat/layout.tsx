import { featureRouteMetadata } from '@/lib/seo_metadata';

export const metadata = featureRouteMetadata('ai-tutor');

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
