import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://egsaiedu.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'EGS AI | ذكاء اصطناعي للمناهج المصرية | أول مساعد ومعلم ذكي للمنهج المصري',
    template: '%s | EGS AI'
  },
  description: 'منصة EGS AI هي المنصة المصرية الأولى للذكاء الاصطناعي للطلاب (Egyptian Artificial Intelligence for Students). مساعد ومعلم ذكي للمذاكرة، شرح المناهج الدراسية، حل المسائل والواجبات من الصور، وتوليد امتحانات تفاعلية فوراً لجميع المراحل الإعدادية والثانوية.',
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
      'ar': '/',
      'en': '/',
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
    title: 'EGS AI | ذكاء اصطناعي للمناهج المصرية | أول مساعد ومعلم ذكي للمنهج المصري',
    description: 'منصة EGS AI هي أول منصة ذكاء اصطناعي مصري متخصصة في شرح المناهج الدراسية المصرية لطلاب الإعدادية والثانوية العامة. حل المسائل من الصور، تلخيص الدروس، وتوليد امتحانات تفاعلية فوراً.',
    url: siteUrl,
    siteName: 'EGS AI | ذكاء اصطناعي للمناهج المصرية',
    locale: 'ar_EG',
    alternateLocale: ['en_US'],
    type: 'website',
    images: [
      {
        url: '/icon.png',
        width: 512,
        height: 512,
        alt: 'EGS AI - أول ذكاء اصطناعي للمناهج المصرية',
      }
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EGS AI | ذكاء اصطناعي للمناهج المصرية | أول مساعد ومعلم ذكي للمنهج المصري',
    description: 'منصة EGS AI أول ذكاء اصطناعي مصري متخصص في شرح المناهج الدراسية المصرية وحل المسائل وتوليد امتحانات تفاعلية لطلاب الإعدادية والثانوية العامة.',
    images: ['/icon.png'],
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
  themeColor: '#0D1B2A',
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
        '@type': 'EducationalApplication',
        '@id': `${siteUrl}/#application`,
        'name': 'EGS AI - المساعد الذكي للمناهج المصرية',
        'operatingSystem': 'All (Web, Android, iOS, Windows, macOS)',
        'applicationCategory': 'EducationalApplication',
        'url': siteUrl,
        'description': 'تطبيق ووكيل ذكاء اصطناعي متطور لطلاب المدارس الإعدادية والثانوية في مصر لشرح الدروس وحل المسائل وتوليد الاختبارات من كتب الوزارة.',
        'offers': {
          '@type': 'Offer',
          'price': '0',
          'priceCurrency': 'EGP',
          'availability': 'https://schema.org/InStock'
        },
        'featureList': [
          'شرح المناهج الدراسية المصرية الرسمية بالذكاء الاصطناعي',
          'حل وتفسير مسائل الرياضيات والعلوم واللغات بالخطوات الكاملة والقوانين',
          'توليد اختبارات وامتحانات ذكية مطابقة لمواصفات وزارة التربية والتعليم',
          'مساعد بصري لتحليل أسئلة الكتب المدرسية والمسائل من الصور',
          'تدريب تفاعلي ومحاكاة لامتحانات الثانوية العامة والشهادة الإعدادية'
        ]
      },
      {
        '@type': 'FAQPage',
        '@id': `${siteUrl}/#faq`,
        'mainEntity': [
          {
            '@type': 'Question',
            'name': 'ما هو موقع ومنصة EGS AI (إي جي إس)؟',
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': 'منصة EGS AI هي أول منصة وتطبيق ذكاء اصطناعي مصري مخصص بالكامل لمناهج وزارة التربية والتعليم المصرية للمرحلتين الإعدادية والثانوية، يساعد الطلاب في فهم واستيعاب الدروس وحل المسائل خطوة بخطوة وتوليد امتحانات إلكترونية تقييمية.'
            }
          },
          {
            '@type': 'Question',
            'name': 'هل يقدم EGS AI ذكاء اصطناعي خاص بالمناهج المصرية حصراً؟',
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': 'نعم، يعتمد EGS AI على محرك بحث فائق التطور مرتبط بكتب ومقررات المناهج المصرية الرسمية المعتمدة، ويجيب بدقة من صلب المنهج الدراسي للشهادة الإعدادية وصفوف الثانوية العامة.'
            }
          },
          {
            '@type': 'Question',
            'name': 'كيف يساعد الذكاء الاصطناعي طلاب الثانوية العامة والشهادة الإعدادية في مصر؟',
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': 'يساعدهم كمدرس خصوصي ذكي متاح دائماً لشرح النقاط الصعبة، تبسيط القوانين والنظريات، حل الواجبات والمسائل المعقدة، تحليل الصور والرسوم البيانية، وتوليد امتحانات تفاعلية لقياس مستوى التحصيل قبل الامتحانات النهائية.'
            }
          },
          {
            '@type': 'Question',
            'name': 'هل يمكن حل مسائل الرياضيات والعلوم عن طريق تصويرها؟',
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': 'نعم، يتيح EGS AI ميزة المساعد البصري الذكي؛ حيث يمكنك التقاط أو رفع صورة للمسألة أو المعادلة أو الرسم البياني ليقوم الذكاء الاصطناعي بقراءتها وتفسير خطوات حلها النموذجية فوراً.'
            }
          },
          {
            '@type': 'Question',
            'name': 'ما هي الصفوف والمراحل الدراسية المدعومة في EGS AI؟',
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': 'يدعم EGS AI صفوف المرحلة الإعدادية (الأول، الثاني، والثالث الإعدادي) وصفوف المرحلة الثانوية (الصف الأول الثانوي، والصف الثاني الثانوي بمساراته التخصصية، بالإضافة للثانوية العامة).'
            }
          },
          {
            '@type': 'Question',
            'name': 'هل يمكن للطلاب استخدام EGS AI كذكاء اصطناعي عام للمذاكرة وحل الأسئلة؟',
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': 'نعم، يتيح EGS AI للطلاب استخدام الذكاء الاصطناعي كمعلم ومساعد عام للمذاكرة (Artificial Intelligence for Students)، لشرح وتبسيط أي مسألة أو مفهوم علمي، حل الواجبات المدرسية بالخطوات، وتلخيص الدروس بدقة فائقة دون الحاجة للتقيد بمادة معينة.'
            }
          },
          {
            '@type': 'Question',
            'name': 'ما هو أفضل موقع وتطبيق ذكاء اصطناعي مصري للمذاكرة والطلاب؟',
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': 'يعد EGS AI المنصة الرائدة في مصر كأول ذكاء اصطناعي مصري مخصص للطلاب، يوفر بيئة تعليمية ذكية تفهم اللهجة المصرية واللغة العربية الفصحى والإنجليزية، ويحل المسائل من الصور والكتب فوراً.'
            }
          }
        ]
      }
    ]
  };

  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script src="https://accounts.google.com/gsi/client" async defer></script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
        {/* Semantic crawler-accessible educational index for search engines */}
        <section className="sr-only" aria-label="نبذة تعريفية عن منصة EGS AI للذكاء الاصطناعي للمناهج المصرية">
          <h1>منصة EGS AI — أول ذكاء اصطناعي للمناهج المصرية</h1>
          <p>
            منصة وتطبيق EGS AI هو أول ذكاء اصطناعي مصري ومعلم ذكي مخصص بالكامل لطلاب المدارس الإعدادية والثانوية في جمهورية مصر العربية. 
            يوفر التطبيق شرحاً دقيقاً وتفاعلياً لمنهج وزارة التربية والتعليم، وحل المسائل والواجبات خطوة بخطوة بالذكاء الاصطناعي، وتحليل مسائل الكتب والامتحانات من الصور، وتوليد اختبارات إلكترونية تفاعلية تحاكي امتحانات الثانوية العامة والشهادة الإعدادية.
          </p>
          <h2>الذكاء الاصطناعي الخاص بالمناهج المصرية</h2>
          <p>
            يتميز EGS AI بارتباطه الوثيق بالمقررات والكتب المدرسية الرسمية: الرياضيات، العلوم، الفيزياء، الكيمياء، الأحياء، اللغة العربية، والنحو. يجيب المساعد الذكي بدقة تامة من داخل المنهج المدرسي مع توضيح القوانين والخطوات.
          </p>
          <h2>الذكاء الاصطناعي للطلاب والمذاكرة (Artificial Intelligence for Students)</h2>
          <p>
            منصة ذكاء اصطناعي شاملة للطلاب والطلبة في مصر والوطن العربي؛ تساعدك في فهم الدروس الصعبة، كتابة الملخصات، حل مسائل الرياضيات والعلوم خطوة بخطوة، والإجابة على أي سؤال دراسي فوري بدون تعقيد.
          </p>
          <h2>الذكاء الاصطناعي المصري (Egyptian Artificial Intelligence)</h2>
          <p>
            تطبيق وموقع ذكاء اصطناعي مصري 100% صُمم لدعم الطلاب وتوفير بديل ذكي واحترافي لشات جي بي تي متوافق مع المناهج التعليمية المصرية، ليكون بمثابة مدرس خصوصي متاح على مدار الساعة مجاناً.
          </p>
          <h2>ذكاء اصطناعي للثانوية العامة والشهادة الإعدادية</h2>
          <ul>
            <li>ذكاء اصطناعي مصري لطلاب الصف الأول الإعدادي، الثاني الإعدادي، والثالث الإعدادي.</li>
            <li>شرح ومراجعات ذكية لطلاب الصف الأول الثانوي والصف الثاني الثانوي بشعبه العلمية والأدبية.</li>
            <li>بنك أسئلة وامتحانات وتدريبات متطورة لطلاب الثانوية العامة (تالتة ثانوي).</li>
            <li>حل المسائل الرياضية والعلمية المعقدة فوراً بواسطة الذكاء الاصطناعي.</li>
          </ul>
        </section>
        {children}
      </body>
    </html>
  );
}
