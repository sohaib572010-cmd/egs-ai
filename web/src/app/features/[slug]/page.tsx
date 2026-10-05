import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FEATURES, SITE_NAME, SITE_URL, getFeature } from '@/lib/seo';
import { pageMetadata } from '@/lib/seo_metadata';
import { FeatureFooter, FeatureTopNav, JsonLd } from '@/components/FeatureChrome';

export const dynamicParams = false;

export function generateStaticParams() {
  return FEATURES.map(f => ({ slug: f.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const f = getFeature((await params).slug);
  if (!f) return {};
  return pageMetadata({ title: f.title, description: f.description, path: `/features/${f.slug}`, keywords: f.keywords });
}

export default async function FeaturePage({ params }: Props) {
  const f = getFeature((await params).slug);
  if (!f) notFound();
  const url = `${SITE_URL}/features/${f.slug}`;
  const others = FEATURES.filter(o => o.slug !== f.slug);

  const structured = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#page`,
        url,
        name: f.title,
        description: f.description,
        inLanguage: 'ar-EG',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: { '@id': `${SITE_URL}/#application` }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'المميزات', item: `${SITE_URL}/features` },
          { '@type': 'ListItem', position: 3, name: f.navLabel, item: url }
        ]
      },
      {
        '@type': 'FAQPage',
        mainEntity: f.faq.map(q => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } }))
      },
      {
        '@type': 'HowTo',
        name: `طريقة استخدام ${f.navLabel} في ${SITE_NAME}`,
        step: f.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s, text: s }))
      }
    ]
  };

  return (
    <div className="feat-page standalone-page-scroll">
      <JsonLd data={structured} />
      <main className="feat-wrap">
        <FeatureTopNav />
        <ol className="feat-crumbs" aria-label="مسار التنقل">
          <li><Link href="/">{SITE_NAME}</Link> /</li>
          <li><Link href="/features">المميزات</Link> /</li>
          <li aria-current="page">{f.navLabel}</li>
        </ol>
        <header className="feat-hero">
          <h1>{f.h1}</h1>
          <p>{f.intro}</p>
          <Link href={f.route} className="feat-cta">{f.cta}</Link>
          <Link href="/subscriptions" className="feat-cta feat-cta-secondary">الباقات والأسعار</Link>
        </header>

        <section className="feat-section" aria-labelledby="highlights">
          <h2 id="highlights">ماذا يقدم لك {f.navLabel}؟</h2>
          <div className="feat-grid">
            {f.highlights.map(h => (
              <article key={h.title} className="feat-card">
                <h3>{h.title}</h3>
                <p>{h.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="feat-section" aria-labelledby="how">
          <h2 id="how">كيف تستخدمه؟</h2>
          <ol className="feat-steps">
            {f.steps.map(s => <li key={s}>{s}</li>)}
          </ol>
        </section>

        <section className="feat-section feat-faq" aria-labelledby="faq">
          <h2 id="faq">أسئلة شائعة</h2>
          {f.faq.map(q => (
            <details key={q.q}>
              <summary>{q.q}</summary>
              <p>{q.a}</p>
            </details>
          ))}
        </section>

        <section className="feat-section" aria-labelledby="more">
          <h2 id="more">مميزات أخرى</h2>
          <div className="feat-grid">
            {others.map(o => (
              <Link key={o.slug} href={`/features/${o.slug}`} className="feat-card">
                <h3>{o.navLabel}</h3>
                <p>{o.description}</p>
              </Link>
            ))}
          </div>
        </section>
        <FeatureFooter />
      </main>
    </div>
  );
}
