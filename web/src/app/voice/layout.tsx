import { featureRouteMetadata } from '@/lib/seo_metadata';

export const metadata = featureRouteMetadata('voice-tutor');

export default function VoiceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
