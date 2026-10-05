import Link from 'next/link';

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

export function LegalPage({ title, updated, intro, sections, links }: {
  title: string;
  updated: string;
  intro: React.ReactNode;
  sections: LegalSection[];
  links: { href: string; label: string }[];
}) {
  return (
    <div className="standalone-page-scroll" style={{ background: 'var(--bg-color)', color: 'var(--text-main)', direction: 'rtl' }}>
      <main className="legal-wrap">
        <Link href="/" className="legal-back">العودة إلى EGS AI</Link>
        <h1>{title}</h1>
        <p className="legal-date">آخر تحديث: {updated}</p>
        <nav className="legal-toc" aria-label="محتويات الصفحة">
          <strong>المحتويات</strong>
          <ul>
            {sections.map(s => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
          </ul>
        </nav>
        <article className="legal-body">
          <div style={{ marginBottom: '22px' }}>{intro}</div>
          {sections.map(s => (
            <section key={s.id} id={s.id}>
              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </article>
        <nav className="legal-links" aria-label="روابط ذات صلة">
          {links.map(l => <Link key={l.href} href={l.href}>{l.label}</Link>)}
        </nav>
      </main>
    </div>
  );
}
