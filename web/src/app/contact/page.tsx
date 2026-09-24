import type { Metadata } from 'next';
import Link from 'next/link';
import { Phone, Mail, MessageCircle, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import ContactForm from '@/components/ContactForm';

export const metadata: Metadata = {
  title: 'تواصل معنا | EGS AI | دعم منصة المناهج المصرية',
  description: 'طرق التواصل الرسمية مع فريق دعم منصة EGS AI للمساعدة الدراسية والذكاء الاصطناعي عبر الهاتف، واتساب، ونموذج المساعدة.',
  keywords: [
    'تواصل معنا EGS AI',
    'دعم منصة EGS AI',
    'خدمة عملاء EGS AI',
    'رقم EGS AI'
  ],
  alternates: {
    canonical: '/contact',
  },
};

export default function ContactPage() {
  return (
    <div className="standalone-page-scroll" style={{ background: 'var(--bg-color)', color: 'var(--text-main)', direction: 'rtl' }}>
      <div style={{ maxWidth: '820px', margin: '0 auto', padding: '48px 24px 80px' }}>
        <Link 
          href="/" 
          style={{ 
            color: 'var(--primary-color)', 
            fontWeight: 700, 
            fontSize: '0.88rem', 
            textDecoration: 'none', 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '6px', 
            marginBottom: '24px' 
          }}
        >
          <ArrowRight size={16} />
          <span>العودة إلى EGS AI</span>
        </Link>

        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-color)', marginBottom: '8px' }}>
          تواصل معنا
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '32px', lineHeight: '1.6' }}>
          فريق دعم EGS AI في خدمتك دائماً للإجابة على جميع استفساراتك ومساعدتك في تفعيل الاشتراكات وحل أي مشكلة تقنية.
        </p>

        {/* Contact Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          
          {/* Phone / Call */}
          <a
            href="tel:01037220587"
            className="glass"
            style={{
              padding: '24px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              textDecoration: 'none',
              color: 'var(--text-main)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              transition: 'var(--transition)'
            }}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Phone size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>الاتصال المباشر</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary-color)', direction: 'ltr', textAlign: 'right', marginTop: '4px' }}>
                01037220587
              </div>
            </div>
            <span style={{ fontSize: '0.82rem', color: 'var(--primary-color)', fontWeight: 700 }}>انقر للاتصال الآن ←</span>
          </a>

          {/* WhatsApp */}
          <a
            href="https://wa.me/201037220587"
            target="_blank"
            rel="noopener noreferrer"
            className="glass"
            style={{
              padding: '24px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              textDecoration: 'none',
              color: 'var(--text-main)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              transition: 'var(--transition)'
            }}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(37, 211, 102, 0.15)', color: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircle size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>المراسلة عبر واتساب</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#25D366', direction: 'ltr', textAlign: 'right', marginTop: '4px' }}>
                01037220587
              </div>
            </div>
            <span style={{ fontSize: '0.82rem', color: '#25D366', fontWeight: 700 }}>بدء محادثة واتساب ←</span>
          </a>

          {/* Email */}
          <a
            href="mailto:business@egsaiedu.com"
            className="glass"
            style={{
              padding: '24px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              textDecoration: 'none',
              color: 'var(--text-main)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              transition: 'var(--transition)'
            }}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Mail size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>البريد الإلكتروني الرسمـي</div>
              <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--primary-color)', direction: 'ltr', textAlign: 'right', marginTop: '4px', wordBreak: 'break-all' }}>
                business@egsaiedu.com
              </div>
            </div>
            <span style={{ fontSize: '0.82rem', color: 'var(--primary-color)', fontWeight: 700 }}>إرسال بريد إلكتروني ←</span>
          </a>

        </div>

        {/* Interactive Contact Form */}
        <div style={{ marginBottom: '32px' }}>
          <ContactForm />
        </div>

        {/* Additional Help Info */}
        <div className="glass" style={{ padding: '28px', borderRadius: 'var(--radius-lg)', background: 'var(--card-bg)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ background: 'var(--primary-light)', color: 'var(--primary-color)', padding: '10px', borderRadius: '12px' }}>
              <Clock size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '4px', color: 'var(--text-main)' }}>ساعات العمل والرد</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.7', margin: 0 }}>
                فريق الدعم الفني متواجد يومياً لمساعدتك والرد على استفسارات المحادثات والواتساب والبريد الإلكتروني في أسرع وقت ممكن.
              </p>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: 0 }} />

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div style={{ background: 'var(--primary-light)', color: 'var(--primary-color)', padding: '10px', borderRadius: '12px' }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '4px', color: 'var(--text-main)' }}>استفسارات الاشتراكات والاسترجاع</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: '1.7', margin: 0 }}>
                لطلب إلغاء اشتراك أو استرداد، يرجى التواصل معنا عبر واتساب أو البريد الإلكتروني أو نموذج التواصل أعلاه خلال 3 أيام (72 ساعة) من تاريخ الاشتراك مع مراعاة عدم استخدام نقاط الباقة.
              </p>
            </div>
          </div>

        </div>

        {/* Website Footer Quick Links */}
        <div style={{ marginTop: '36px', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '18px', flexWrap: 'wrap', fontSize: '0.88rem' }}>
          <Link href="/privacy" style={{ color: 'var(--primary-color)', fontWeight: 600, textDecoration: 'none' }}>سياسة الخصوصية</Link>
          <span style={{ color: 'var(--border-color)' }}>•</span>
          <Link href="/terms#refund" style={{ color: 'var(--primary-color)', fontWeight: 600, textDecoration: 'none' }}>سياسة الإرجاع والاسترجاع</Link>
          <span style={{ color: 'var(--border-color)' }}>•</span>
          <Link href="/terms" style={{ color: 'var(--primary-color)', fontWeight: 600, textDecoration: 'none' }}>شروط الاستخدام والاشتراكات</Link>
        </div>

      </div>
    </div>
  );
}
