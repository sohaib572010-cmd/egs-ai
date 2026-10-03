'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { buildPricingSnapshot, type PricingSnapshot } from '@/lib/points_pricing';
import {
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  CreditCard,
  Phone,
  Zap,
  BookOpen,
  GraduationCap,
  HeartHandshake,
  ArrowRight,
  Flame,
  Award,
  Clock,
  HelpCircle
} from 'lucide-react';

interface StudentInfo {
  id: string;
  name: string;
  grade_level: string;
  track_id: string | null;
  grade_name?: string;
  track_name?: string | null;
  elective_subject: string | null;
  study_streak: number;
  points: number;
  plan_type: string;
  subscription_status: string;
}

const PLANS = [
  {
    id: 'pro_1m',
    name: 'باقة شهر (1 Month)',
    price: 60,
    period: 'لمدة 30 يوماً',
    dailyCoins: '80 عملة ذكاء اصطناعي يومياً',
    badge: 'الباقة التمهيدية',
    popular: false,
    perDay: '2 ج.م / يوم فقط'
  },
  {
    id: 'pro_2m',
    name: 'باقة شهرين (2 Months)',
    price: 110,
    period: 'لمدة 60 يوماً',
    dailyCoins: '90 عملة ذكاء اصطناعي يومياً',
    badge: 'الباقة المرنة',
    popular: false,
    perDay: '1.83 ج.م / يوم'
  },
  {
    id: 'pro_3m',
    name: 'باقة 3 أشهر (3 Months)',
    price: 140,
    period: 'لمدة 90 يوماً كاملة (فصل دراسي)',
    dailyCoins: '120 عملة ذكاء اصطناعي يومياً',
    badge: 'خيار 85% من الطلاب المتفوقين — باقة الترم الكامل',
    popular: true,
    perDay: 'فقط 1.5 ج.م / يوم (أعلى توفير)'
  }
];

function SponsorContent() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get('student_id') || searchParams.get('studentId') || '';
  const initialPlan = searchParams.get('plan') || 'pro_3m';

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>(initialPlan);
  const [subscribing, setSubscribing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [pricing, setPricing] = useState<PricingSnapshot>(() => buildPricingSnapshot());

  useEffect(() => {
    fetch('/api/pricing')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data?.pricing) setPricing(data.pricing); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!studentId) {
      setError('رابط الاشتراك غير مكتمل. يرجى التأكد من فتح الرابط المرسل من حساب الطالب.');
      setLoading(false);
      return;
    }

    async function fetchStudent() {
      try {
        setLoading(true);
        const res = await fetch(`/api/payment/sponsor-info?student_id=${encodeURIComponent(studentId)}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'تعذر العثور على حساب الطالب.');
        }
        setStudent(data.student);
      } catch (err: any) {
        setError(err.message || 'حدث خطأ أثناء تحميل بيانات الطالب.');
      } finally {
        setLoading(false);
      }
    }

    fetchStudent();
  }, [studentId]);

  const handleCheckout = async () => {
    if (!studentId) return;
    setSubscribing(true);
    setPaymentError(null);

    try {
      const res = await fetch('/api/payment/kashier/initialize-sponsor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          student_id: studentId,
          plan_id: selectedPlan,
          payer_name: payerName.trim() || undefined,
          payer_phone: payerPhone.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل تجهيز عملية الدفع.');
      }

      const order = data.order;
      const redirectUrl = `https://checkout.kashier.io/?merchantId=${order.merchantId}&orderId=${order.orderId}&amount=${order.amount}&currency=${order.currency}&hash=${order.hash}&mode=${order.mode}&merchantRedirect=${encodeURIComponent(order.merchantRedirect)}&serverWebhook=${encodeURIComponent(order.serverWebhook)}&allowedMethods=${encodeURIComponent(order.allowedMethods)}&display=ar`;

      window.location.href = redirectUrl;
    } catch (err: any) {
      setPaymentError(err.message || 'حدث خطأ أثناء بدء عملية الدفع عبر كاشير.');
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', direction: 'rtl' }}>
        <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid var(--border-color)', borderTopColor: 'var(--primary-color)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 600 }}>جاري تجهيز بوابة اشتراك ورعاية الطالب...</p>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', direction: 'rtl', textAlign: 'center' }}>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '20px', borderRadius: '50%', color: '#ef4444', marginBottom: '16px' }}>
          <HelpCircle size={48} />
        </div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)', marginBottom: '8px' }}>
          تعذر فتح رابط الاشتراك
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '460px', lineHeight: '1.6', marginBottom: '24px' }}>
          {error || 'الرابط المطلوب غير صالح أو انتهت صلاحيته. يرجى طلب رابط جديد من تطبيق الطالب.'}
        </p>
        <Link href="/" className="btn-primary" style={{ textDecoration: 'none', padding: '10px 24px', borderRadius: '10px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span>الذهاب للمنصة الرئيسية</span>
          <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  const activePlanObj = PLANS.find(p => p.id === selectedPlan) || PLANS[0];
  const gradeLabel = student.grade_name || 'المرحلة الدراسية';
  const trackLabel = student.track_name || null;

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto', padding: '24px 16px 100px', direction: 'rtl' }}>
      {/* Return to Main App */}
      <Link 
        href="/" 
        style={{ 
          color: 'var(--primary-color)', 
          fontWeight: 700, 
          fontSize: '0.86rem', 
          textDecoration: 'none', 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '6px', 
          marginBottom: '20px' 
        }}
      >
        <ArrowRight size={16} />
        <span>العودة إلى منصة EGS AI</span>
      </Link>

      {/* Payment Result Notification */}
      {searchParams.get('payment_result') === 'success' && (
        <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--success-color)', padding: '16px 20px', borderRadius: '14px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <CheckCircle2 size={24} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.96rem' }}>تم تأكيد عملية الدفع بنجاح!</div>
            <div style={{ fontSize: '0.84rem', marginTop: '2px', opacity: 0.9 }}>تم تفعيل باقة اشتراك الطالب فوراً وأصبحت ميزات Pro والعملات اليومية متاحة في حسابه الآن.</div>
          </div>
        </div>
      )}
      {searchParams.get('payment_result') === 'failed' && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444', padding: '16px 20px', borderRadius: '14px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <HelpCircle size={24} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.96rem' }}>تعذرت عملية الدفع أو تم إلغاؤها</div>
            <div style={{ fontSize: '0.84rem', marginTop: '2px', opacity: 0.9 }}>يمكنك المحاولة مرة أخرى باستخدام بطاقة بنكية أخرى أو محفظة إلكترونية.</div>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--primary-light)', color: 'var(--primary-color)', padding: '6px 16px', borderRadius: '24px', fontSize: '0.84rem', fontWeight: 800, marginBottom: '12px' }}>
          <HeartHandshake size={16} />
          <span>بوابة رعاية واشتراك ولي الأمر</span>
        </div>
        <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.1rem)', fontWeight: 900, color: 'var(--text-main)', margin: '0 0 10px', lineHeight: '1.3' }}>
          تفعيل اشتراك Pro للطالب: <span style={{ color: 'var(--primary-color)' }}>{student.name}</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '640px', margin: '0 auto', lineHeight: '1.6' }}>
          استثمر في تفوق ابنك/ابنتك الدراسي بمساعد ذكي يرافقهم 24 ساعة لشرح المنهج المصري وحل أصعب المسائل والامتحانات.
        </p>
      </div>

      {/* Student Academic Profile Card */}
      <div className="glass" style={{ borderRadius: '18px', padding: '20px 24px', marginBottom: '28px', border: '1.5px solid var(--border-color)', background: 'var(--card-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, var(--primary-color), #7209B7)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.3rem', flexShrink: 0 }}>
              <GraduationCap size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)' }}>
                {student.name}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '3px' }}>
                <span>{gradeLabel}</span>
                {trackLabel && <span>• {trackLabel}</span>}
                {student.elective_subject && <span>• {student.elective_subject}</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ background: 'var(--alpha-white-3)', padding: '6px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
              <Flame size={15} color="#FFB703" />
              <span style={{ fontWeight: 800 }}>حماس المذاكرة: {student.study_streak} أيام</span>
            </div>
            <div style={{ background: 'var(--alpha-white-3)', padding: '6px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
              <Award size={15} color="var(--primary-color)" />
              <span style={{ fontWeight: 800 }}>{student.points} نقطة تفوق</span>
            </div>
          </div>
        </div>
      </div>

      {/* Value Comparison vs Private Lessons */}
      <div style={{ background: 'linear-gradient(135deg, rgba(0, 180, 216, 0.08) 0%, rgba(114, 9, 183, 0.06) 100%)', borderRadius: '16px', border: '1px solid rgba(0, 180, 216, 0.25)', padding: '20px 24px', marginBottom: '32px' }}>
        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-main)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={20} color="var(--primary-color)" />
          <span>استثمارك الأفضل في تفوق ابنك الأكاديمي (مقارنة واقعية لولي الأمر)</span>
        </div>
        
        {/* Parent Cost Comparison Box */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', margin: '14px 0', background: 'var(--card-bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '12px' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 700 }}>تكلفة الدروس الخصوصية للترم:</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--danger-color)', marginTop: '4px' }}>
              ~2,400 إلى 4,500 ج.م
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>حصة أسبوعية محدودة مع مشقة الانتقال</span>
          </div>
          <div>
            <span style={{ fontSize: '0.76rem', color: 'var(--primary-color)', fontWeight: 700 }}>باقة الترم الكامل في EGS AI:</span>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--success-color)', marginTop: '4px' }}>
              140 ج.م فقط (توفير 94%+)
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>معلم خصوصي ذكي مرافق لابنك 24/7 طوال الترم</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            <CheckCircle2 size={16} color="var(--success-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>تغطية معتمدة لكل كتب ودروس المنهج المصري الرسمي لعام 2026.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            <CheckCircle2 size={16} color="var(--success-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>حل وشرح مسائل الفيزياء والرياضيات والكيمياء خطوة بخطوة بنموذج التفكير المعمق.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            <CheckCircle2 size={16} color="var(--success-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>امتحانات تفاعلية وتصحيح ذكي لتجهيز الطالب للامتحانات النهائية دون توتر.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            <CheckCircle2 size={16} color="var(--success-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>ضمان استرجاع كامل المبلغ خلال 72 ساعة في حال لم ترتقِ نتائج ابنك.</span>
          </div>
        </div>
      </div>

      {/* Plan Selection */}
      <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-main)', marginBottom: '14px' }}>
        اختر باقة الاشتراك المناسبة:
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        {PLANS.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          return (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              style={{
                borderRadius: '16px',
                border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                background: isSelected ? 'linear-gradient(180deg, var(--card-bg) 0%, rgba(0, 180, 216, 0.06) 100%)' : 'var(--card-bg)',
                padding: '20px',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? 'var(--shadow-glow)' : 'none'
              }}
            >
              {plan.badge && (
                <div style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '16px',
                  background: isSelected ? 'var(--primary-color)' : 'var(--border-color)',
                  color: isSelected ? 'var(--text-on-primary)' : 'var(--text-main)',
                  padding: '2px 10px',
                  borderRadius: '12px',
                  fontSize: '0.7rem',
                  fontWeight: 800
                }}>
                  {plan.badge}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.96rem', fontWeight: 900, color: 'var(--text-main)' }}>
                  {plan.name}
                </span>
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: isSelected ? '6px solid var(--primary-color)' : '2px solid var(--border-color)',
                  background: 'var(--card-bg)'
                }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '14px 0 6px' }}>
                <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)' }}>
                  {plan.price}
                </span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                  جنيه مصري
                </span>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--primary-color)', fontWeight: 700, marginBottom: '12px' }}>
                {plan.perDay} • {plan.period}
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                {plan.dailyCoins} تتجدد كل 24 ساعة.
                {pricing.plans[plan.id] && (
                  <div style={{ marginTop: '4px', fontWeight: 700 }}>
                    {`تكفي لنحو ${pricing.plans[plan.id].chatsPerDay.offPeak} سؤال يومياً، أو ${pricing.plans[plan.id].thinkingPerDay.offPeak} سؤال بالتفكير العميق.`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional Payer Info */}
      <div className="glass" style={{ borderRadius: '16px', padding: '18px 20px', marginBottom: '24px', border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '12px' }}>
          بيانات ولي الأمر (اختياري لتأكيد الإيصال):
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
              اسم ولي الأمر
            </label>
            <input
              type="text"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder="مثال: والد الطالب"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '0.85rem' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>
              رقم الهاتف / واتساب
            </label>
            <input
              type="tel"
              value={payerPhone}
              onChange={(e) => setPayerPhone(e.target.value)}
              placeholder="010XXXXXXXX"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '0.85rem' }}
            />
          </div>
        </div>
      </div>

      {paymentError && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px 16px', borderRadius: '10px', fontSize: '0.84rem', fontWeight: 700, marginBottom: '20px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          {paymentError}
        </div>
      )}

      {/* Primary Payment Action or Active Subscription Card */}
      {student.subscription_status === 'active' || (student.plan_type && student.plan_type !== 'free') ? (
        <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '14px', padding: '20px', textAlign: 'center', marginBottom: '24px' }}>
          <CheckCircle2 size={36} color="var(--success-color)" style={{ margin: '0 auto 10px' }} />
          <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '6px' }}>
            الطالب لديه باقة اشتراك نشطة وسارية بالفعل
          </div>
          <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            حساب الطالب مفعّل حالياً ويتمتع بكافة مزايا باقة Pro والعملات اليومية المتجددة.
          </div>
          <Link href="/" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '10px', fontWeight: 800 }}>
            <span>الذهاب للمنصة الرئيسية</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleCheckout}
          disabled={subscribing}
          className="btn-primary"
          style={{
            width: '100%',
            padding: '16px 24px',
            fontSize: '1.05rem',
            fontWeight: 900,
            borderRadius: '14px',
            border: 'none',
            cursor: subscribing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: 'var(--shadow-glow-strong)',
            marginBottom: '24px'
          }}
        >
          <CreditCard size={20} />
          <span>
            {subscribing ? 'جاري تجهيز بوابة الدفع...' : `تأكيد ودفع ${activePlanObj.price} ج.م لتفعيل اشتراك الطالب فوراً`}
          </span>
        </button>
      )}

      {/* Supported Payment Badges */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 700, marginBottom: '8px' }}>
          طرق دفع فورية وآمنة عبر بوابة كاشير (Kashier):
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ background: 'var(--alpha-white-3)', padding: '5px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>فودافون كاش</span>
          <span style={{ background: 'var(--alpha-white-3)', padding: '5px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>انستاباي InstaPay</span>
          <span style={{ background: 'var(--alpha-white-3)', padding: '5px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>كروت ميزة الوطنية</span>
          <span style={{ background: 'var(--alpha-white-3)', padding: '5px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>أورنج / اتصالات / وي كاش</span>
          <span style={{ background: 'var(--alpha-white-3)', padding: '5px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>فيزا وماستركارد</span>
        </div>
      </div>

      {/* Safety & Guarantee Note */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginTop: '16px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
        <ShieldCheck size={16} color="var(--success-color)" />
        <span>دفع مشفر وآمن 100% — ضمان استرجاع كامل المبلغ خلال 72 ساعة في حال عدم استخدام أي رصيد.</span>
      </div>
    </div>
  );
}

export default function SponsorPage() {
  return (
    <div
      className="standalone-page-scroll"
      style={{
        width: '100%',
        height: '100vh',
        minHeight: '100dvh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: 'var(--bg-color)',
        color: 'var(--text-main)',
        direction: 'rtl'
      }}
    >
      <Suspense fallback={
        <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>جاري تحميل بوابة الاشتراك...</p>
        </div>
      }>
        <SponsorContent />
      </Suspense>
    </div>
  );
}
