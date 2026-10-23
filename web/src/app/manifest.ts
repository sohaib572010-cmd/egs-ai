import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'EGS AI | ذكاء اصطناعي للمناهج المصرية',
    short_name: 'EGS AI',
    description: 'أول منصة وتطبيق ذكاء اصطناعي مصري مخصص للمناهج الدراسية المصرية لطلاب الإعدادية والثانوية العامة لشرح الدروس وحل المسائل وتوليد الامتحانات.',
    start_url: '/',
    id: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#000000',
    theme_color: '#FFB703',
    categories: ['education', 'productivity', 'books'],
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

