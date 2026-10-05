import type { Metadata } from 'next';
import { SITE_NAME, SITE_URL, getFeature } from './seo';

export const OG_IMAGE = { url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'EGS AI' };

interface PageMetaInput {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  index?: boolean;
}

export function pageMetadata({ title, description, path, keywords, index = true }: PageMetaInput): Metadata {
  const url = `${SITE_URL}${path === '/' ? '' : path}`;
  return {
    title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'ar_EG',
      type: 'website',
      images: [OG_IMAGE]
    },
    twitter: { card: 'summary_large_image', title: `${title} | ${SITE_NAME}`, description, images: [OG_IMAGE.url] },
    robots: index ? { index: true, follow: true } : { index: false, follow: true }
  };
}

// Metadata for an app route that hosts a feature (e.g. /voice), keyed by the feature slug.
export function featureRouteMetadata(slug: string): Metadata {
  const f = getFeature(slug);
  if (!f) throw new Error(`Unknown feature: ${slug}`);
  return pageMetadata({ title: f.title, description: f.description, path: f.route, keywords: f.keywords });
}
