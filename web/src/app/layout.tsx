import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Readex_Pro } from 'next/font/google';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, FEATURES, SITE_URL } from '@/lib/seo';
import { OG_IMAGE } from '@/lib/seo_metadata';
import './globals.css';

const siteUrl = SITE_URL;

const readex = Readex_Pro({ subsets: ['arabic', 'latin'], display: 'swap', variable: '--font-readex' });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: DEFAULT_TITLE,
    template: '%s | EGS AI'
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    // Brand, Exact Names & Common Typos / Spelling Mistakes
    'EGS AI',
    'EGSAI',
    'egsai',
    'EGS-AI',
    'egs-ai',
    'EGS',
    'egs',
    'egsa',
    'egsedu',
    'egsaiapp',
    'egz ai',
    'egz',
    'egas ai',
    'egs a.i',
    'egsai edu',
    'EGA AI',
    'EGA-AI',
    'ega ai',
    'egsaiedu',
    'egsaiedu.com',
    'منصة EGS AI',
    'تطبيق EGS AI',
    'موقع EGS AI',
    'اي جي اس',
    'إي جي إس',
    'ايجيس',
    'ايجس',
    'إيجيس',
    'اي جي اس اي',
    'إي جي أس',
    'اي جى اس',
    'اى جى اس',
    'اي جيس',
    'ايجى اس',
    'منصه اي جي اس',
    'برنامج اي جي اس',
    'تطبيق اي جي اس',
    'موقع اي جي اس',
    'اي جي اس للتعليم',
    'اي جي اس ذكاء اصطناعي',

    // Generic Student AI & Study Search Terms (Without Brand or Curriculum)
    'ذكاء اصطناعي للطلاب',
    'الذكاء الاصطناعي للطلاب',
    'ذكاء اصطناعي للطلبة',
    'الذكاء الاصطناعي للطلبة',
    'ذكاء اصطناعي للمذاكرة',
    'الذكاء الاصطناعي في المذاكرة',
    'ذكاء اصطناعي للدراسة',
    'ذكاء اصطناعي يساعد في المذاكرة',
    'ذكاء اصطناعي يشرح الدروس',
    'ذكاء اصطناعي يحل المسائل',
    'ذكاء اصطناعي يحل الواجب',
    'ذكاء اصطناعي للامتحانات',
    'ذكاء اصطناعي يحل الامتحانات',
    'ذكاء اصطناعي يحل الاسئلة',
    'ذكاء اصطناعي للمدارس',
    'ذكاء اصطناعي للمدرسة',
    'موقع ذكاء اصطناعي للمذاكرة',
    'موقع ذكاء اصطناعي للدراسة',
    'موقع ذكاء اصطناعي يحل مسائل',
    'موقع ذكاء اصطناعي يشرح دروس',
    'احسن موقع ذكاء اصطناعي للمذاكرة',
    'افضل موقع ذكاء اصطناعي للطلاب',
    'تطبيق ذكاء اصطناعي للمذاكرة',
    'برنامج ذكاء اصطناعي للمذاكرة',
    'بوت ذكاء اصطناعي للمذاكرة',
    'روبوت ذكاء اصطناعي للمذاكرة',
    'مدرس ذكاء اصطناعي',
    'معلم ذكاء اصطناعي',
    'مدرس خصوصي ذكاء اصطناعي',
    'شات للمذاكرة',
    'بوت مذاكرة',
    'مساعد دراسي بالذكاء الاصطناعي',
    'مساعد مذاكرة ذكي',

    // Egyptian Artificial Intelligence (Broad & Non-Curriculum Specific)
    'Egyptian artificial intelligence',
    'Egyptian AI',
    'Egypt AI',
    'AI in Egypt',
    'الذكاء الاصطناعي المصري',
    'ذكاء اصطناعي مصري',
    'اول ذكاء اصطناعي مصري',
    'الذكاء الاصطناعي في مصر',
    'موقع ذكاء اصطناعي مصري',
    'تطبيق ذكاء اصطناعي مصري',
    'منصة ذكاء اصطناعي مصرية',
    'شات جي بي تي مصري',
    'شات جي بي تي في مصر',
    'بديل شات جي بي تي في مصر',
    'ذكاء اصطناعي مصري مجاني',
    'ذكاء اصطناعي عربي للطلاب',

    // Phonetic & Common Arabic Spelling Mistakes (Spelling error tolerance)
    'زكاء اصطناعي',
    'زكاء اصطناعى',
    'ذكاء اصطناعى',
    'ذكاء اصتناعي',
    'زكاء اصتناعي',
    'ذكاء صطناعي',
    'زكاء صطناعي',
    'ذكاء استطناعي',
    'استطناعي للتعليم',
    'ذكاء اصطناعى للطلاب',
    'زكاء اصطناعي للمذاكرة',

    // Curriculum AI keywords (Primary user focus)
    'ذكاء اصطناعي خاص بالمناهج',
    'ذكاء اصطناعي للمناهج',
    'ذكاء اصطناعي للمناهج الدراسية',
    'ذكاء اصطناعي للمناهج المصرية',
    'الذكاء الاصطناعي في المناهج',
    'ذكاء اصطناعي يشرح المنهج',
    'مساعد المنهج الدراسي المصري',
    'مساعد ذكي للمناهج',
    'مساعد تعليمي ذكي',
    'معلم ذكي للمنهج المصري',
    'الذكاء الاصطناعي في التعليم المصري',
    'بوت تعليمي مصري',
    'شات بوت للمناهج المصرية',

    // Egyptian School Grades & Stages
    'ذكاء اصطناعي للثانوية العامة',
    'مذاكرة الثانوية العامة بالذكاء الاصطناعي',
    'شرح مناهج الثانوية العامة',
    'حل امتحانات الثانوية العامة',
    'بنك أسئلة الثانوية العامة',
    'الشهادة الإعدادية',
    'تالتة إعدادي بالذكاء الاصطناعي',
    'مناهج الصف الأول الثانوي',
    'الصف الثاني الثانوي',
    'الصف الثالث الثانوي',
    'الصف الأول الإعدادي',
    'الصف الثاني الإعدادي',
    'الصف الثالث الإعدادي',
    'علمي علوم',
    'علمي رياضة',
    'أدبي',
    'مناهج وزارة التربية والتعليم المصرية',

    // Subjects & Problem Solving
    'حل مسائل الرياضيات بالذكاء الاصطناعي',
    'حل مسائل الفيزياء والكيمياء بالذكاء الاصطناعي',
    'شرح قواعد النحو واللغة العربية',
    'حل الواجبات المدرسية بالذكاء الاصطناعي',
    'حل المسائل بالصور',
    'توليد امتحانات إلكترونية',
    'تصحيح الامتحانات بالذكاء الاصطناعي',
    'تلخيص دروس المنهج المصري',

    // Egyptian Colloquial & Natural Dialect Queries
    'ذكاء اصطناعي يشرحلي المنهج',
    'ازاي اذاكر بالذكاء الاصطناعي في مصر',
    'موقع ذكاء اصطناعي للمذاكرة في مصر',
    'احسن موقع ذكاء اصطناعي للثانوية العامة',
    'مدرس ذكاء اصطناعي يحل معايا',
    'تطبيق يحل مسائل المنهج المصري بالصورة',
    'بوت يذاكر معايا المنهج',
    'شرح دروس المنهج المصري مجانا بالذكاء الاصطناعي',
    'موقع يساعدني في مذاكرة تالتة ثانوي',
    'حل مسائل بالذكاء الاصطناعي في مصر',
    'عايز ذكاء اصطناعي يحل الواجب',
    'ذكاء اصطناعي يفهمني الدروس',

    // English Generic & Educational Discovery Keywords
    'artificial intelligence for students',
    'AI for students',
    'student AI',
    'AI study assistant',
    'AI homework solver',
    'AI for school students',
    'AI tutor Egypt',
    'study AI platform',
    'free student AI',
    'Arabic AI for students',
    'Egyptian AI platform',
    'AI learning assistant',
    'AI study bot',
    'Egyptian curriculum AI',
    'Egypt curriculum AI assistant',
    'AI related to the curriculum',
    'curriculum AI Egypt',
    'Egyptian national curriculum AI',
    'Egyptian AI tutor',
    'AI for Egyptian schools',
    'Thanaweya Amma AI',
    'Egyptian preparatory curriculum AI',
    'Egyptian secondary curriculum AI',
    'Egyptian educational AI platform',
    'Egyptian AI teacher',
    'Egypt school AI',
    'EGS AI education'
  ],
  authors: [{ name: 'EGS AI Team', url: siteUrl }],
  creator: 'EGS AI',
  publisher: 'EGS AI',
  category: 'education',
  classification: 'Educational Technology & Artificial Intelligence',
  applicationName: 'EGS AI',
  alternates: {
    canonical: '/',
    languages: {
      'ar-EG': '/',
    },
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'EGS AI',
  },
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: siteUrl,
    siteName: 'EGS AI',
    locale: 'ar_EG',
    type: 'website',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' }
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        'url': siteUrl,
        'name': 'EGS AI',
        'alternateName': [
          'EGSAI',
          'egsai',
          'EGS AI',
          'EGA AI',
          'اي جي اس',
          'إي جي إس',
          'ايجيس',
          'ايجس',
          'منصة EGS AI',
          'ذكاء اصطناعي للمناهج المصرية',
          'الذكاء الاصطناعي المصري',
          'ذكاء اصطناعي للطلاب',
          'الذكاء الاصطناعي للمذاكرة',
          'Egyptian Artificial Intelligence',
          'Artificial Intelligence for Students',
          'Egyptian Curriculum AI',
          'Egypt AI'
        ],
        'description': 'أول منصة ذكاء اصطناعي مصري لشرح المناهج الدراسية وحل المسائل لطلاب الإعدادية والثانوية العامة في مصر.',
        'inLanguage': ['ar-EG', 'en'],
        'potentialAction': {
          '@type': 'SearchAction',
          'target': {
            '@type': 'EntryPoint',
            'urlTemplate': `${siteUrl}/?q={search_term_string}`
          },
          'query-input': 'required name=search_term_string'
        }
      },
      {
        '@type': 'EducationalOrganization',
        '@id': `${siteUrl}/#organization`,
        'name': 'EGS AI',
        'url': siteUrl,
        'logo': {
          '@type': 'ImageObject',
          'url': `${siteUrl}/icon.png`,
          'width': 512,
          'height': 512
        },
        'description': 'المنصة المصرية الرائدة للذكاء الاصطناعي التعليمي المخصص لمناهج وزارة التربية والتعليم والتعليم الفني في مصر.',
        'areaServed': {
          '@type': 'Country',
          'name': 'Egypt'
        },
        'knowsAbout': [
          'المنهج الدراسي المصري',
          'الثانوية العامة',
          'الشهادة الإعدادية',
          'الذكاء الاصطناعي في التعليم',
          'شرح المناهج الدراسية المصرية',
          'Egyptian National Curriculum',
          'STEM Education Egypt'
        ],
        'contactPoint': {
          '@type': 'ContactPoint',
          'telephone': '+201037220587',
          'contactType': 'customer support',
          'email': 'business@egsaiedu.com',
          'areaServed': 'EG',
          'availableLanguage': ['Arabic', 'English']
        }
      },
      {
        '@type': ['WebApplication', 'EducationalApplication'],
        '@id': `${siteUrl}/#application`,
        'name': 'EGS AI',
        'alternateName': 'EGS AI - المعلم الذكي للمنهج المصري',
        'operatingSystem': 'Web, Android, iOS, Windows, macOS',
        'applicationCategory': 'EducationalApplication',
        'browserRequirements': 'Requires JavaScript and a modern browser',
        'url': siteUrl,
        'inLanguage': 'ar-EG',
        'publisher': { '@id': `${siteUrl}/#organization` },
        'description': DEFAULT_DESCRIPTION,
        'educationalLevel': ['المرحلة الإعدادية', 'المرحلة الثانوية', 'البكالوريا المصرية'],
        'audience': { '@type': 'EducationalAudience', 'educationalRole': 'student', 'audienceType': 'طلاب الإعدادية والثانوية في مصر' },
        'offers': [
          { '@type': 'Offer', 'name': 'الحساب المجاني', 'price': '0', 'priceCurrency': 'EGP', 'availability': 'https://schema.org/InStock' },
          { '@type': 'AggregateOffer', 'name': 'باقات الاشتراك', 'lowPrice': '60', 'highPrice': '140', 'offerCount': 3, 'priceCurrency': 'EGP', 'url': `${siteUrl}/subscriptions` }
        ],
        'featureList': FEATURES.map(f => f.navLabel),
        'hasPart': FEATURES.map(f => ({ '@type': 'WebPage', 'name': f.title, 'url': `${siteUrl}/features/${f.slug}` }))
      },
      {
        '@type': 'FAQPage',
        '@id': `${siteUrl}/#faq`,
        'mainEntity': [
          {
            '@type': 'Question',
            'name': 'ما هو EGS AI؟',
            'acceptedAnswer': { '@type': 'Answer', 'text': 'EGS AI معلم ذكي بالذكاء الاصطناعي لطلاب الإعدادية والثانوية والبكالوريا المصرية، مرتبط بكتب المنهج المصري: يشرح الدروس، يحل المسائل من الصور، يولّد امتحانات وكويزات ويصححها، ينشئ بطاقات مراجعة ذكية، ويذاكر معك صوتياً.' }
          },
          {
            '@type': 'Question',
            'name': 'هل يجيب EGS AI من المنهج المصري؟',
            'acceptedAnswer': { '@type': 'Answer', 'text': 'نعم، يبحث في كتاب مادتك لصفك الدراسي قبل الإجابة، ويوضح إذا كانت نقطة ما خارج المطلوب في الامتحان.' }
          },
          {
            '@type': 'Question',
            'name': 'هل يوجد مساعد صوتي للمذاكرة في EGS AI؟',
            'acceptedAnswer': { '@type': 'Answer', 'text': 'نعم، المعلم الصوتي يتيح مكالمة صوتية مباشرة بالعامية المصرية أو الفصحى المبسطة مع معلم ذكي يبحث في كتابك أثناء المكالمة، ويمكنك مقاطعته في أي وقت.' }
          },
          {
            '@type': 'Question',
            'name': 'هل يمكنني عمل امتحانات وكويزات على المنهج؟',
            'acceptedAnswer': { '@type': 'Answer', 'text': 'نعم، ولّد امتحاناً من أي درس بأسئلة اختيار من متعدد وصح وخطأ ومقالية، واستلم تصحيحاً فورياً مع شرح كل خطأ وامتحاناً علاجياً لنقاط ضعفك.' }
          },
          {
            '@type': 'Question',
            'name': 'هل يوجد فلاش كارد للمراجعة؟',
            'acceptedAnswer': { '@type': 'Answer', 'text': 'نعم، يولّد EGS AI بطاقات مراجعة من دروسك ويجدولها بنظام التكرار المتباعد.' }
          },
          {
            '@type': 'Question',
            'name': 'هل يمكن حل المسائل بتصويرها؟',
            'acceptedAnswer': { '@type': 'Answer', 'text': 'نعم، صوّر المسألة بكاميرا الموقع أو ارفع صورتها، وقصها، ويشرح المعلم الذكي الحل خطوة بخطوة.' }
          },
          {
            '@type': 'Question',
            'name': 'كم سعر الاشتراك في EGS AI؟',
            'acceptedAnswer': { '@type': 'Answer', 'text': 'تبدأ مجاناً بنقاط تجريبية، والباقات: شهر 60 جنيه، شهرين 110 جنيه، 3 أشهر 140 جنيه، والدفع بالفيزا والمحافظ الإلكترونية وإنستاباي.' }
          }
        ]
      }
    ]
  };

  return (
    <html lang="ar" dir="rtl" className={readex.variable} suppressHydrationWarning>
      <head>
        <script src="https://accounts.google.com/gsi/client" async defer></script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Suppress and isolate third-party browser extension errors from triggering Next.js dev overlay
                if (typeof window !== 'undefined') {
                  const isExtensionError = (filename, error, reason) => {
                    const src = (filename || '') + ' ' + ((error && error.stack) || '') + ' ' + ((reason && reason.stack) || '');
                    return src.includes('chrome-extension://') || 
                           src.includes('moz-extension://') || 
                           src.includes('safari-extension://') || 
                           src.includes('extension://') ||
                           src.includes('almalgbpmcfpdaopimbdchdliminoign');
                  };

                  window.addEventListener('error', function(event) {
                    if (isExtensionError(event.filename, event.error, null)) {
                      event.stopImmediatePropagation();
                      event.preventDefault();
                      return true;
                    }
                  }, true);

                  window.addEventListener('unhandledrejection', function(event) {
                    if (isExtensionError(null, null, event.reason)) {
                      event.stopImmediatePropagation();
                      event.preventDefault();
                    }
                  }, true);
                }

                const attrs = ['bis_skin_checked', 'cz-shortcut-listen'];
                const removeAttrs = (el) => {
                  if (!el || !el.removeAttribute) return;
                  attrs.forEach(attr => {
                    if (el.hasAttribute && el.hasAttribute(attr)) el.removeAttribute(attr);
                  });
                };
                
                // Watch for mutations to remove injected attributes before React notices them
                const observer = new MutationObserver((mutations) => {
                  for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && attrs.includes(mutation.attributeName)) {
                      removeAttrs(mutation.target);
                    }
                    if (mutation.addedNodes) {
                      mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                          removeAttrs(node);
                          node.querySelectorAll('*').forEach(removeAttrs);
                        }
                      });
                    }
                  }
                });
                
                observer.observe(document.documentElement, {
                  attributes: true,
                  childList: true,
                  subtree: true,
                  attributeFilter: attrs
                });

                // Register PWA Service Worker
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').catch(function() {
                      // Non-critical background registration fallback
                    });
                  });
                }

                // Capture early PWA beforeinstallprompt event before React hydration
                window.__egsPwaPrompt = null;
                window.addEventListener('beforeinstallprompt', function(e) {
                  e.preventDefault();
                  window.__egsPwaPrompt = e;
                  if (typeof window.__onPwaPromptReady === 'function') {
                    window.__onPwaPromptReady(e);
                  }
                });
              })();
            `
          }}
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-touch-fullscreen" content="yes" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </head>
      <body suppressHydrationWarning>
        <nav className="sr-only" aria-label="مميزات EGS AI">
          <h1>EGS AI: معلم ذكاء اصطناعي للمنهج المصري</h1>
          <ul>
            {FEATURES.map(f => (
              <li key={f.slug}><Link href={`/features/${f.slug}`}>{f.navLabel}</Link></li>
            ))}
          </ul>
        </nav>
        {children}
      </body>
    </html>
  );
}
