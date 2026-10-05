import Link from 'next/link';
import { FEATURES, SITE_NAME, SITE_URL } from '@/lib/seo';
import { pageMetadata } from '@/lib/seo_metadata';
import { FeatureFooter, FeatureTopNav, JsonLd } from '@/components/FeatureChrome';

export const metadata = pageMetadata({
  title: 'مميزات EGS AI: معلم ذكي، معلم صوتي، امتحانات وكويزات، فلاش كارد وحل المسائل بالصورة',
  description:
    'كل أدوات المذاكرة بالذكاء الاصطناعي في EGS AI للمنهج المصري: المعلم الذكي، المعلم الصوتي، الامتحانات والكويزات التفاعلية، البطاقات الذكية بالتكرار المتباعد، حل المسائل بالصورة، دفتر المذاكرة ولوحة الشرف.',
  path: '/features',
  keywords: ['مميزات EGS AI', 'أدوات مذاكرة بالذكاء الاصطناعي', 'ذكاء اصطناعي للطلاب', 'المنهج المصري']
});

export default function FeaturesHubPage() {
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `مميزات ${SITE_NAME}`,
    itemListElement: FEATURES.map((f, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: f.navLabel,
      url: `${SITE_URL}/features/${f.slug}`
    }))
  };

  return (
    <div className="feat-page standalone-page-scroll">
      <JsonLd data={itemList} />
      <main className="feat-wrap">
        <FeatureTopNav />
        <header className="feat-hero">
          <h1>مميزات EGS AI: كل ما تحتاجه للمذاكرة بالذكاء الاصطناعي</h1>
          <p>
            EGS AI معلم ذكي مبني على كتب المنهج المصري لطلاب الإعدادية والثانوية والبكالوريا المصرية. اشرح، اسأل بصوتك، امتحن نفسك،
            راجع بالبطاقات الذكية، وتابع تقدمك في مكان واحد.
          </p>
          <Link href="/chat" className="feat-cta">ابدأ مجاناً</Link>
        </header>
        <section className="feat-section" aria-labelledby="all-features">
          <h2 id="all-features">الأدوات</h2>
          <div className="feat-grid">
            {FEATURES.map(f => (
              <Link key={f.slug} href={`/features/${f.slug}`} className="feat-card">
                <h3>{f.navLabel}</h3>
                <p>{f.description}</p>
              </Link>
            ))}
          </div>
        </section>
        <FeatureFooter />
      </main>
    </div>
  );
}
