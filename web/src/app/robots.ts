import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// /_next/ must stay crawlable: Google needs the JS and CSS bundles to render the app.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/pay'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL
  };
}
