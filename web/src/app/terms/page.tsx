import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'شروط الاستخدام والاشتراكات | EGS AI',
  description: 'شروط استخدام منصة EGS AI وسياسات الاشتراكات والدفع والاسترجاع الرسمية.',
  keywords: [
    'شروط استخدام EGS AI',
    'سياسة الاسترجاع EGS AI',
    'اشتراكات EGS AI'
  ],
  alternates: {
    canonical: '/terms',
  },
};

export default function TermsOfUsePage() {
  return (
    <div className="standalone-page-scroll" style={{ background: 'var(--bg-color)', color: 'var(--text-main)', direction: 'rtl' }}>
      <div style={{ maxWidth: '820px', margin: '0 auto', padding: '48px 24px 80px' }}>
        <Link href="/" style={{ color: 'var(--primary-color)', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '24px' }}>
          ← العودة إلى EGS AI
        </Link>

        <h1 style={{ fontSize: '1.9rem', fontWeight: 900, color: 'var(--primary-color)', marginBottom: '6px' }}>
          شروط الاستخدام والاشتراكات
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '32px' }}>
          تاريخ السريان وآخر تحديث: يوليو 2026 — الإصدار الرسمي المكتمل لمنصة وتطبيق EGS AI.
        </p>

        <div className="glass" style={{ padding: '28px', borderRadius: 'var(--radius-lg)', background: 'var(--card-bg)', border: '1px solid var(--border-color)', lineHeight: '1.9', fontSize: '0.95rem' }}>

          <p style={{ marginBottom: '20px' }}>
            تحكم شروط الاستخدام هذه استخدامك لمنصة وتطبيق <strong>EGS AI</strong> ("المنصة"). بإنشائك لحساب أو استخدامك للمنصة أو اشتركك في أي من الباقات، فإنك تقر بموافقتك الكاملة على هذه الشروط، وعلى{' '}
            <Link href="/privacy" style={{ color: 'var(--primary-color)', fontWeight: 700 }}>سياسة الخصوصية</Link>{' '}
            المرتبطة بها.
          </p>

          <Section title="1. طبيعة الخدمة">
            <p>
              EGS AI هي منصة تعليمية مساعدة تعتمد على الذكاء الاصطناعي، تهدف إلى مساعدة طلاب المرحلتين الإعدادية والثانوية في مصر على فهم المنهج الدراسي وحل الأسئلة واستخراج الملخصات والتجهيز للامتحانات عبر نماذج ذكاء اصطناعي متقدمة.
            </p>
          </Section>

          <Section title="2. الحساب والتسجيل والنقاط التجريبية">
            <ul style={listStyle}>
              <li>يجب تقديم بيانات صحيحة (بريد إلكتروني، اسم، صف دراسي) عند إنشاء الحساب.</li>
              <li>أنت مسؤول عن الحفاظ على سرية كلمة المرور الخاصة بك وعن أي نشاط يتم من خلال حسابك.</li>
              <li><strong>نظام النقاط التجريبية:</strong> يُمنح الطالب <strong>20 نقطة تجريبية</strong> صالحة للاستخدام لمرة واحدة فقط وغير قابلة للتجديد اليومي عند إنشاء الحساب لأول مرة.</li>
              <li><strong>سياسة منع الاحتيال وتعدد الحسابات:</strong> يحفظ النظام عنوان IP ومعرّف المتصفح/الجهاز تقنياً لمنع استغلال النقاط المجانية. في حال قيام الطالب بإنشاء حساب آخر للحصول على نقاط مجانية، يتم تصفير رصيد الحساب الجديد (0 نقاط) وحرمانه من أية نقاط تجريبية.</li>
            </ul>
          </Section>

          <Section title="3. الاستخدام المقبول">
            <ul style={listStyle}>
              <li>يُستخدم المساعد الذكي لأغراض تعليمية مساعدة (الشرح، حل الأسئلة، توليد امتحانات تدريبية) — وليس بديلاً عن المذاكرة الجادة.</li>
              <li>يُمنع استخدام المنصة في أي غرض غير قانوني أو مسيء أو لإرسال محتوى مخالف للآداب العامة.</li>
              <li>يُمنع محاولة استغلال أي ثغرة تقنية أو الوصول غير المصرح به لبيانات مستخدمين آخرين أو للوحة التحكم الإدارية.</li>
            </ul>
          </Section>

          <Section title="4. باقات الاشتراك والأسعار">
            <p>
              تتيح المنصة باقات اشتراك مدفوعة لتوفير رصيد نقاط يومي متجدد وإمكانية استخدام النماذج المتقدمة (Pro) وميزة التفكير المستفيض. الأسعار المعلنة تشمل كافة الرسوم وتُحتسب بالجنيه المصري (EGP):
            </p>
            <ul style={listStyle}>
              <li><strong>باقة شهر (1 Month):</strong> بقيمة <strong>60 جنيه مصري</strong> شهرياً (تمنح الطالب <strong>80 نقطة يومياً</strong> تتجدد تلقائياً كل 24 ساعة).</li>
              <li><strong>باقة شهرين (2 Months):</strong> بقيمة <strong>100 جنيه مصري</strong> لمدة شهرين (تمنح الطالب <strong>90 نقطة يومياً</strong> تتجدد تلقائياً كل 24 ساعة).</li>
              <li><strong>باقة 3 أشهر (3 Months):</strong> بقيمة <strong>140 جنيه مصري</strong> لمدة 3 أشهر (تمنح الطالب <strong>120 نقطة يومياً</strong> تتجدد تلقائياً كل 24 ساعة).</li>
            </ul>
          </Section>

          <div id="refund">
            <Section title="5. سياسة الإلغاء والاسترجاع (Refund & Cancellation Policy)">
              <ul style={listStyle}>
                <li>يمكن للمستخدم طلب إلغاء الاشتراك واسترداد المبلغ المدفوع خلال مدة لا تتجاوز <strong>3 أيام (72 ساعة)</strong> فقط من تاريخ وتوقيت الشراء.</li>
                <li><strong>شرط الاسترجاع الأساسي:</strong> يشترط لقبول طلب الاسترجاع <strong>ألا يكون المستخدم قد استهلك أو استخدم أي جزء من النقاط المتاحة في الباقة المشترة</strong>. في حال استخدام أي نقطة واحدة من نقاط الاشتراك، يصبح الاشتراك غير قابل للاسترجاع.</li>
                <li>لتقديم طلب الاسترجاع، يرجى التواصل مع فريق الدعم عبر الرقم/واتساب <code>01037220587</code> أو البريد الإلكتروني <code>business@egsaiedu.com</code> خلال النافذة الزمنية المحددة.</li>
              </ul>
            </Section>
          </div>

          <Section title="6. بوابة الدفع الإلكتروني والأمان المالية (Payment Gateway)">
            <p>
              تُعالج كافة المعاملات المالية المباشرة على الموقع الإلكتروني عبر بوابة الدفع الإلكتروني المعتمدة <strong>كاشير (Kashier)</strong>.
            </p>
            <ul style={listStyle}>
              <li><strong>وسائل الدفع المقبولة:</strong> بطاقات الائتمان والخصم المباشر (Visa / Mastercard)، بطاقات ميزة (Meeza)، والمحافِظ الإلكترونية للهواتف المحمولة (مثل فودافون كاش، أورانج كاش، اتصالات كاش، وي باي، وإنستاباي).</li>
              <li><strong>أمان البيانات المالية:</strong> تُنفَّذ المعاملات عبر اتصال مشفّر ببروتوكول 256-bit SSL ووفقاً لمعايير الأمان العالمية PCI-DSS. لا نتمتع بالوصول إلى بيانات بطاقتك البنكية ولا نُخزن تفاصيل البطاقات على خوادمنا.</li>
            </ul>
          </Section>

          <Section title="7. إخلاء المسؤولية بخصوص إجابات الذكاء الاصطناعي">
            <p>
              الإجابات المُولَّدة عبر المساعد الذكي تعتمد على نماذج ذكاء اصطناعي، وقد تحتوي على أخطاء. <strong>لا تتحمل المنصة أي مسؤولية</strong> عن أي قرار دراسي أو غيره يُتخذ بناءً على إجابة غير مُتحقق منها. يمكنك الإبلاغ عن أي رد غير دقيق عبر زر "الإبلاغ" المتاح أسفل كل إجابة.
            </p>
          </Section>

          <Section title="8. الملكية الفكرية">
            <p>
              جميع الحقوق الخاصة بتصميم المنصة، شعارها، وأكوادها البرمجية محفوظة لـ EGS AI. المحتوى الدراسي المرجعي (المناهج) يخضع لملكية جهاته الأصلية ويُستخدم في المنصة لأغراض تعليمية مساعدة فقط.
            </p>
          </Section>

          <Section title="9. التعليق أو إنهاء الحساب">
            <p>
              نحتفظ بالحق في تعليق أو إنهاء أي حساب يخالف هذه الشروط، خاصة في حالات إساءة الاستخدام أو محاولات الاختراق أو التلاعب بنظام النقاط.
            </p>
          </Section>

          <Section title="10. القانون الحاكم وتواصل الدعم">
            <p>
              تخضع هذه الشروط وتُفسَّر وفقاً للقوانين المعمول بها في جمهورية مصر العربية. لأي استفسار أو تواصل بخصوص الخدمة أو الاشتراكات أو طلبات الدعم، يمكنك التواصل معنا عبر:
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
          <Link href="/privacy" style={{ color: 'var(--primary-color)', fontWeight: 600, textDecoration: 'none' }}>سياسة الخصوصية</Link>
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
