import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'سياسة الخصوصية | EGS AI',
  description: 'سياسة الخصوصية وحماية بيانات الطلاب في منصة وتطبيق EGS AI للمساعدة الدراسية بالذكاء الاصطناعي.',
  keywords: [
    'خصوصية EGS AI',
    'حماية البيانات EGS AI',
    'أمان الطلاب EGS AI'
  ],
  alternates: {
    canonical: '/privacy',
  },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="standalone-page-scroll" style={{ background: 'var(--bg-color)', color: 'var(--text-main)', direction: 'rtl' }}>
      <div style={{ maxWidth: '820px', margin: '0 auto', padding: '48px 24px 80px' }}>
        <Link href="/" style={{ color: 'var(--primary-color)', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '24px' }}>
          ← العودة إلى EGS AI
        </Link>

        <h1 style={{ fontSize: '1.9rem', fontWeight: 900, color: 'var(--primary-color)', marginBottom: '6px' }}>
          سياسة الخصوصية
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '32px' }}>
          تاريخ السريان وآخر تحديث: يوليو 2026 — الإصدار الرسمي المكتمل لمنصة وتطبيق EGS AI.
        </p>

        <div className="glass" style={{ padding: '28px', borderRadius: 'var(--radius-lg)', background: 'var(--card-bg)', border: '1px solid var(--border-color)', lineHeight: '1.9', fontSize: '0.95rem' }}>

          <p style={{ marginBottom: '20px' }}>
            توضح سياسة الخصوصية هذه كيفية جمع منصة وتطبيق <strong>EGS AI</strong> ("المنصة"، "نحن") لبياناتك واستخدامها وحمايتها عند استخدامك لموقعنا الإلكتروني وتطبيقنا على الهواتف المحمولة. باستخدامك للمنصة أو إنشائك لحساب، فإنك توافق على الشروط الواردة في هذه السياسة.
          </p>

          <Section title="1. البيانات التي نجمعها">
            <ul style={listStyle}>
              <li><strong>بيانات الحساب:</strong> رقم الهاتف، الاسم، الصف الدراسي، وكلمة المرور (يتم تخزينها بصيغة مشفّرة Hashed ولا يتم حفظ كلمة المرور الأصلية أبداً).</li>
              <li><strong>محتوى الاستخدام:</strong> الأسئلة التي ترسلها للمساعد الذكي، سجل المحادثات، والامتحانات التي تنشئها أو تجيب عليها، وذلك لتقديم الخدمة وتحسين تجربتك التعليمية.</li>
              <li><strong>بيانات المعاملات المالية (الموقع):</strong> عند الشراء عبر الموقع الإلكتروني، تُعالج بيانات بطاقتك أو محفظتك الإلكترونية مباشرة عبر بوابة كاشير (Kashier) المعتمدة دون حفظ بيانات بطاقتك البنكية الكاملة على خوادمنا.</li>
              <li><strong>بيانات المعاملات المالية (التطبيق):</strong> عند الشراء عبر تطبيق الهاتف المحمول، يتم تنفيذ الدفع عبر نظام Google Play Billing وتخضع لسياسات خصوصية متجر Google Play.</li>
              <li><strong>بيانات تقنية وحماية أمنية:</strong> عنوان IP، بصمة المتصفح (Browser Identifier)، ومعرّف الجهاز (Device ID)، وتوقيت الاستخدام وذلك لأغراض الأمان ومنع الاحتيال وحماية نظام النقاط التجريبية ومنع إنشاء حسابات متعددة غير مصرح بها.</li>
            </ul>
          </Section>

          <Section title="2. كيفية احتساب نقاط الاستخدام (Points)">
            <p>
              يعتمد رصيدك من النقاط على الاستهلاك الفعلي لكل رسالة، ويُحتسب تلقائياً بعد اكتمال كل إجابة بناءً على طول السؤال المُرسل وطول إجابة الذكاء الاصطناعي (عدد الكلمات/الرموز المعالجة). كلما طالت الإجابة أو كان النموذج المستخدم أكثر تقدماً (مثل نموذج Pro)، زاد عدد النقاط المخصومة.
            </p>
          </Section>

          <Section title="3. كيف نستخدم بياناتك">
            <ul style={listStyle}>
              <li>لتقديم خدمة الشرح والمساعدة الدراسية وتخصيصها حسب صفك الدراسي.</li>
              <li>لحفظ سجل محادثاتك وامتحاناتك حتى تتمكن من الرجوع إليها لاحقاً.</li>
              <li>لإرسال إشعارات تخص الخدمة (تحديثات، صيانة، إعلانات مهمة) عبر الموقع أو التطبيق.</li>
              <li>لتحسين جودة الإجابات ودقة النظام وأمانه، ولمراجعة أي بلاغ (Report) تقدمه بخصوص رد غير مناسب من الذكاء الاصطناعي.</li>
            </ul>
          </Section>

          <Section title="4. مشاركة البيانات مع أطراف ثالثة">
            <p>
              لا نبيع بياناتك الشخصية لأي طرف ثالث. لتقديم الخدمة، نستخدم معالجين موثوقين فقط:
            </p>
            <ul style={listStyle}>
              <li><strong>مزودو خدمة الذكاء الاصطناعي:</strong> يتم إرسال نص السؤال فقط (دون اسمك أو رقم هاتفك) لتوليد الإجابة التعليمية.</li>
              <li><strong>مزوّد البنية التحتية (Supabase):</strong> لتخزين بيانات الحساب والسجل بشكل مشفّر وآمن.</li>
              <li><strong>بوابة الدفع (Kashier / Google Play):</strong> لمعالجة دفع الاشتراكات بأعلى معايير الأمان المالي.</li>
            </ul>
          </Section>

          <Section title="5. أمان البيانات">
            <ul style={listStyle}>
              <li>يتم تشفير كلمات المرور رياضياً (Hashing) ولا نحتفظ بها في صورة نصية مقروءة.</li>
              <li>الاتصال بين تطبيقك ومنصتنا يتم عبر بروتوكولات مشفّرة آمنة (HTTPS / SSL 256-bit).</li>
              <li>الوصول إلى قاعدة البيانات مقيّد بصلاحيات إدارية دقيقة ومحميّة.</li>
            </ul>
          </Section>

          <Section title="6. إخلاء مسؤولية بخصوص إجابات الذكاء الاصطناعي">
            <p>
              المحتوى الذي يقدمه المساعد الذكي يُنتَج تلقائياً بواسطة نماذج ذكاء اصطناعي، وقد يحتوي أحياناً على معلومات غير دقيقة. لسنا مسؤولين عن أي قرار أو نتيجة مبنية بالكامل على إجابة الذكاء الاصطناعي دون التحقق منها من مصادر رسمية (كالمنهج أو الكتاب المدرسي أو المعلم).
            </p>
          </Section>

          <Section title="7. حقوقك واختياراتك">
            <ul style={listStyle}>
              <li>يمكنك تعديل اسمك وكلمة مرورك وصفك الدراسي في أي وقت من صفحة الملف الشخصي.</li>
              <li>يمكنك طلب حذف حسابك وكافة بياناتك واشتراكاتك نهائياً وفورياً وبشكل ذاتي عبر <Link href="/delete-account" style={{ color: 'var(--primary-color)', fontWeight: 700 }}>صفحة طلب حذف الحساب نهائياً</Link>.</li>
              <li>يمكنك تقديم طلبات الاسترجاع وفقاً لسياسة الإلغاء الشارحة الموضحة في شروط الاستخدام.</li>
            </ul>
          </Section>

          <Section title="8. خصوصية القُصَّر (طلاب الإعدادي والثانوي)">
            <p>
              تم تصميم هذه المنصة لخدمة طلاب المرحلتين الإعدادية والثانوية في مصر. نحرص على ألا تُجمع من المستخدمين القُصَّر أي بيانات تتجاوز ما هو ضروري لتقديم الخدمة التعليمية، ولا نستخدم هذه البيانات لأي غرض تسويقي خارجي.
            </p>
          </Section>

          <Section title="9. التواصل معنا لمسائل الخصوصية">
            <p>
              لأي استفسار بخصوص هذه السياسة، أو لطلب حذف حسابك وبياناتك الشخصية، يمكنك استخدام <Link href="/delete-account" style={{ color: 'var(--primary-color)', fontWeight: 700 }}>صفحة حذف الحساب المباشرة</Link> أو التواصل معنا مباشرة عبر:
            </p>
            <ul style={listStyle}>
              <li><strong>الهاتف / واتساب:</strong> <code>01037220587</code></li>
              <li><strong>البريد الإلكتروني:</strong> <code>business@egsaiedu.com</code></li>
              <li><strong>صفحة التواصل:</strong> <Link href="/contact" style={{ color: 'var(--primary-color)', fontWeight: 700 }}>صفحة اتصل بنا</Link></li>
            </ul>
          </Section>

        </div>

        {/* Website Footer links */}
        <div style={{ marginTop: '36px', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '18px', flexWrap: 'wrap', fontSize: '0.88rem' }}>
          <Link href="/terms" style={{ color: 'var(--primary-color)', fontWeight: 600, textDecoration: 'none' }}>شروط الاستخدام والاشتراكات</Link>
          <span style={{ color: 'var(--border-color)' }}>•</span>
          <Link href="/terms#refund" style={{ color: 'var(--primary-color)', fontWeight: 600, textDecoration: 'none' }}>سياسة الإرجاع والاسترجاع</Link>
          <span style={{ color: 'var(--border-color)' }}>•</span>
          <Link href="/contact" style={{ color: 'var(--primary-color)', fontWeight: 600, textDecoration: 'none' }}>نموذج التواصل والدعم</Link>
          <span style={{ color: 'var(--border-color)' }}>•</span>
          <Link href="/delete-account" style={{ color: 'var(--primary-color)', fontWeight: 600, textDecoration: 'none' }}>طلب حذف الحساب</Link>
        </div>
      </div>
    </div>
  );
}

const listStyle: React.CSSProperties = { paddingRight: '20px', display: 'flex', flexDirection: 'column', gap: '8px', margin: 0 };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '22px' }}>
      <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '10px' }}>{title}</h2>
      {children}
    </section>
  );
}
