import { featureRouteMetadata } from '@/lib/seo_metadata';

export const metadata = featureRouteMetadata('flashcards');

export default function FlashcardsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
