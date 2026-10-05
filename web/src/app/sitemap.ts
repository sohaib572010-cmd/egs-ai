import type { MetadataRoute } from 'next';
import { FEATURES, SITE_URL } from '@/lib/seo';

type Entry = [path: string, priority: number, changeFrequency: 'daily' | 'weekly' | 'monthly'];

const PAGES: Entry[] = [
  ['/', 1.0, 'daily'],
  ['/chat', 0.95, 'daily'],
  ['/voice', 0.95, 'weekly'],
  ['/exams', 0.95, 'weekly'],
  ['/flashcards', 0.9, 'weekly'],
  ['/subscriptions', 0.9, 'weekly'],
  ['/features', 0.9, 'weekly'],
  ['/tasks', 0.75, 'weekly'],
  ['/leaderboard', 0.75, 'daily'],
  ['/download', 0.8, 'monthly'],
  ['/sponsor', 0.7, 'monthly'],
  ['/contact', 0.6, 'monthly'],
  ['/privacy', 0.4, 'monthly'],
  ['/terms', 0.4, 'monthly'],
  ['/delete-account', 0.3, 'monthly']
];

const LAST_CONTENT_UPDATE = new Date('2026-10-05');

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = PAGES.map(([path, priority, changeFrequency]) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    lastModified: LAST_CONTENT_UPDATE,
    changeFrequency,
    priority
  }));
  const features = FEATURES.map(f => ({
    url: `${SITE_URL}/features/${f.slug}`,
    lastModified: LAST_CONTENT_UPDATE,
    changeFrequency: 'monthly' as const,
    priority: 0.85
  }));
  return [...pages, ...features];
}
