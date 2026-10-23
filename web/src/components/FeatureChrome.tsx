import Link from 'next/link';
import { FEATURES } from '@/lib/seo';

export function FeatureTopNav() {
  return (
    <nav className="feat-topnav" aria-label="التنقل الرئيسي">
      <Link href="/" className="feat-brand">EGS <span>AI</span></Link>
      <Link href="/features" style={{ color: 'var(--primary-color)', fontWeight: 700, textDecoration: 'none' }}>كل المميزات</Link>
    </nav>
  );
}

export function FeatureFooter() {
  return (
    <footer className="feat-footer">
      {FEATURES.map(f => (
        <Link key={f.slug} href={`/features/${f.slug}`}>{f.navLabel}</Link>
      ))}
      <Link href="/about">عن EGS AI</Link>
      <Link href="/download">تحميل التطبيق</Link>
      <Link href="/contact">تواصل معنا</Link>
      <Link href="/privacy">سياسة الخصوصية</Link>
      <Link href="/terms">شروط الاستخدام</Link>
    </footer>
  );
}

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
