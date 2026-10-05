import { featureRouteMetadata } from '@/lib/seo_metadata';

export const metadata = featureRouteMetadata('leaderboard');

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
