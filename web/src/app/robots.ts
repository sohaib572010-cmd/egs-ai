import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://egsaiedu.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/_next/', '/admin', '/profile', '/pay', '/delete-account'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/api/', '/_next/', '/admin', '/profile', '/pay', '/delete-account'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
