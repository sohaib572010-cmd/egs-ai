import Link from 'next/link';
import { CONTACT, DEFAULT_DESCRIPTION, ENGLISH_SUMMARY, FEATURES, SITE_FAQ, SITE_NAME, SITE_URL } from '@/lib/seo';
import { pageMetadata } from '@/lib/seo_metadata';
import { PLANS, curriculumCoverage } from '@/lib/ai_discovery';
import { FeatureFooter, FeatureTopNav, JsonLd } from '@/components/FeatureChrome';

const TITLE = 'عن EGS AI: أول معلم ذكاء اصطناعي مبني على المنهج المصري';
const UPDATED = '2026-10-13';

export const metadata = pageMetadata({
  title: TITLE,
  description: DEFAULT_DESCRIPTION,
  path: '/about',
  keywords: ['ما هو EGS AI', 'ذكاء اصطناعي للمنهج المصري', 'أدوات ذكاء اصطناعي للطلاب في مصر', 'Egyptian curriculum AI tool', 'AI tutor Egypt']
});

export default function AboutPage() {
  const url = `${SITE_URL}/about`;
  const coverage = curriculumCoverage();
  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${url}#page`,
        url,
        name: TITLE,
        description: DEFAULT_DESCRIPTION,
        inLanguage: ['ar-EG', 'en'],
        dateModified: UPDATED,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: { '@id': `${SITE_URL}/#application` },
        mainEntity: { '@id': `${SITE_URL}/#organization` },
        speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.feat-hero p', '#english p'] }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'عن EGS AI', item: url }
        ]
      }
    ]
  };

  return (
    <div className="feat-page standalone-page-scroll">
      <JsonLd data={structured} />
      <main className="feat-wrap">
        <FeatureTopNav />
        <header className="feat-hero">
          <h1>{TITLE}</h1>
          <p>{DEFAULT_DESCRIPTION}</p>
          <Link href="/chat" className="feat-cta">ابدأ مجاناً</Link>
          <Link href="/features" className="feat-cta feat-cta-secondary">كل المميزات</Link>
        </header>

        <section className="feat-section" aria-labelledby="coverage">
          <h2 id="coverage">المراحل الدراسية المدعومة</h2>
          <div className="feat-grid">
            {coverage.map(s => (
              <article key={s.system} className="feat-card">
                <h3>{s.system}</h3>
                <p>{s.stages.join('، ')}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="feat-section" aria-labelledby="tools">
          <h2 id="tools">أدوات المذاكرة</h2>
          <div className="feat-grid">
            {FEATURES.filter(f => f.slug !== 'pricing').map(f => (
              <Link key={f.slug} href={`/features/${f.slug}`} className="feat-card">
                <h3>{f.navLabel}</h3>
                <p>{f.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="feat-section" aria-labelledby="plans">
          <h2 id="plans">الأسعار</h2>
          <div className="feat-grid">
            <article className="feat-card">
              <h3>البداية المجانية</h3>
              <p>حساب مجاني بنقاط تجريبية بعد التسجيل.</p>
            </article>
            {PLANS.map(p => (
              <article key={p.months} className="feat-card">
                <h3>{p.months === 1 ? 'شهر' : p.months === 2 ? 'شهرين' : `${p.months} أشهر`}: {p.price} جنيه</h3>
                <p>{p.dailyPoints} نقطة يومياً لمدة {p.days} يوماً.</p>
              </article>
            ))}
          </div>
        </section>

        <section className="feat-section feat-faq" aria-labelledby="faq">
          <h2 id="faq">أسئلة شائعة</h2>
          {SITE_FAQ.map(q => (
            <details key={q.q}>
              <summary>{q.q}</summary>
              <p>{q.a}</p>
            </details>
          ))}
        </section>

        <section className="feat-section" id="english" lang="en" dir="ltr" aria-labelledby="english-title">
          <h2 id="english-title">About EGS AI (English)</h2>
          <p className="feat-card">{ENGLISH_SUMMARY}</p>
        </section>

        <section className="feat-section" aria-labelledby="contact">
          <h2 id="contact">التواصل</h2>
          <ul className="feat-card" style={{ listStyle: 'none', display: 'grid', gap: 8, margin: 0, lineHeight: 1.8 }}>
            <li>البريد: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></li>
            <li>الهاتف وواتساب: <span dir="ltr">{CONTACT.phone}</span></li>
            <li><Link href="/contact">صفحة التواصل</Link></li>
          </ul>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>آخر تحديث: <time dateTime={UPDATED}>{UPDATED}</time></p>
        </section>
        <FeatureFooter />
      </main>
    </div>
  );
}
