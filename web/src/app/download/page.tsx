'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Download,
  Smartphone,
  Monitor,
  CheckCircle2,
  Share,
  PlusSquare,
  Zap,
  HardDrive,
  Sparkles,
  ShieldCheck,
  HelpCircle,
  Laptop,
  Check,
  ChevronDown,
  Layers
} from 'lucide-react';

export default function DownloadPage() {
  const [platform, setPlatform] = useState<'android' | 'ios' | 'desktop'>('android');
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    // Detect standalone / PWA mode
    const standaloneMode = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');
    setIsStandalone(standaloneMode);

    // Detect device platform
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) {
      setPlatform('ios');
    } else if (/Android/i.test(ua)) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }

    // Capture PWA beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setInstallSuccess(true);
      setDeferredPrompt(null);
      localStorage.setItem('egs_pwa_installed', 'true');
      localStorage.setItem('egs_pwa_platform', platform);
      const token = localStorage.getItem('egs_token');
      if (token) {
        fetch('/api/pwa/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ platform })
        }).catch(() => {});
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [platform]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstallSuccess(true);
        localStorage.setItem('egs_pwa_installed', 'true');
        localStorage.setItem('egs_pwa_platform', platform);
        const token = localStorage.getItem('egs_token');
        if (token) {
          fetch('/api/pwa/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ platform })
          }).catch(() => {});
        }
      }
      setDeferredPrompt(null);
    }
  };

  const toggleFaq = (index: number) => {
    setOpenFaq(prev => prev === index ? null : index);
  };

  return (
    <div className="standalone-page-scroll" style={{ background: 'var(--bg-color)', color: 'var(--text-main)', direction: 'rtl', minHeight: '100vh' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '40px 20px 80px' }}>
        
        {/* Navigation Link */}
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
            marginBottom: '28px' 
          }}
        >
          <ArrowRight size={16} />
          <span>العودة إلى منصة EGS AI</span>
        </Link>

        {/* Standalone Installed Notice */}
        {isStandalone && (
          <div className="glass" style={{
            padding: '20px 24px',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(125, 161, 70, 0.12)',
            border: '1.5px solid var(--border-primary)',
            marginBottom: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'var(--primary-color)',
                color: 'var(--text-on-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <CheckCircle2 size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary-color)' }}>
                  أنت تستخدم تطبيق EGS AI المثبت حالياً
                </div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  التطبيق يعمل بكامل كفاءته وسرعته كـ Progressive Web App على جهازك.
                </div>
              </div>
            </div>
            <Link
              href="/"
              className="btn-primary"
              style={{
                padding: '10px 20px',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.88rem'
              }}
            >
              الانتقال إلى المذاكرة
            </Link>
          </div>
        )}

        {/* Hero Header */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '68px',
            height: '68px',
            borderRadius: '22px',
            background: 'var(--primary-light)',
            border: '1.5px solid var(--border-primary)',
            boxShadow: 'var(--shadow-glow)',
            marginBottom: '16px'
          }}>
            <img src="/logo.png" alt="EGS AI Logo" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
          </div>

          <h1 style={{ fontSize: '2.1rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.5px', marginBottom: '10px', lineHeight: 1.3 }}>
            تثبيت تطبيق <span style={{ color: 'var(--primary-color)' }}>EGS AI</span> على جهازك
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '600px', margin: '0 auto', lineHeight: '1.6' }}>
            تطبيق ويب تقدمي (PWA) فائق السرعة — ثبّته بضغطة واحدة على هاتفك أو جهاز الكمبيوتر لفتح المناهج والامتحانات فوراً بدون الحاجة لمتاجر التطبيقات.
          </p>
        </div>

        {/* Platform Selection Tabs */}
        <div style={{
          display: 'flex',
          background: 'var(--card-bg)',
          padding: '6px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-color)',
          gap: '6px',
          marginBottom: '28px'
        }}>
          <button
            type="button"
            onClick={() => setPlatform('android')}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: platform === 'android' ? 'var(--primary-color)' : 'transparent',
              color: platform === 'android' ? 'var(--text-on-primary)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'var(--transition)'
            }}
          >
            <Smartphone size={18} />
            <span>هواتف أندرويد (Android)</span>
          </button>

          <button
            type="button"
            onClick={() => setPlatform('ios')}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: platform === 'ios' ? 'var(--primary-color)' : 'transparent',
              color: platform === 'ios' ? 'var(--text-on-primary)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'var(--transition)'
            }}
          >
            <Smartphone size={18} />
            <span>آيفون وآيباد (iOS)</span>
          </button>

          <button
            type="button"
            onClick={() => setPlatform('desktop')}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: platform === 'desktop' ? 'var(--primary-color)' : 'transparent',
              color: platform === 'desktop' ? 'var(--text-on-primary)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'var(--transition)'
            }}
          >
            <Monitor size={18} />
            <span>الكمبيوتر (Windows / Mac)</span>
          </button>
        </div>

        {/* Interactive Install Card / Platform Instructions */}
        <div className="glass" style={{
          padding: '32px 28px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-md)',
          marginBottom: '36px'
        }}>
          {/* Success Banner */}
          {installSuccess && (
            <div style={{
              background: 'rgba(125, 161, 70, 0.15)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--primary-color)'
            }}>
              <CheckCircle2 size={22} />
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                تم تثبيت تطبيق EGS AI بنجاح! ستجده الآن على شاشتك الرئيسية.
              </span>
            </div>
          )}

          {/* Android View */}
          {platform === 'android' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                    تثبيت EGS AI على أجهزة أندرويد
                  </h2>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
                    يعمل مع متصفح Google Chrome ومتصفح Samsung Internet وكافة متصفحات أندرويد الحديثة.
                  </p>
                </div>

                {deferredPrompt && (
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="btn-primary"
                    style={{
                      padding: '12px 24px',
                      borderRadius: 'var(--radius-md)',
                      fontWeight: 800,
                      fontSize: '0.92rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <Download size={18} />
                    <span>تثبيت التطبيق فوراً بنقرة واحدة</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'var(--alpha-white-2)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.88rem', flexShrink: 0 }}>
                    1
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      افتح قائمة الخيارات في المتصفح
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.6' }}>
                      اضغط على أيقونة النقاط الثلاث في الزاوية العلوية لمتصفح Chrome أو في الشريط السفلي لـ Samsung Internet.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'var(--alpha-white-2)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.88rem', flexShrink: 0 }}>
                    2
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      اختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية"
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.6' }}>
                      ابحث عن خيار <strong style={{ color: 'var(--primary-color)' }}>تثبيت التطبيق (Install App)</strong> أو <strong style={{ color: 'var(--primary-color)' }}>الإضافة إلى الشاشة الرئيسية</strong> واضغط عليه.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'var(--alpha-white-2)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.88rem', flexShrink: 0 }}>
                    3
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      تأكيد التثبيت والبدء فوراً
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.6' }}>
                      اضغط على زر "تثبيت" في الرسالة المنبثقة، وسيظهر رمز تطبيق EGS AI فوراً على شاشة هاتفك الرئيسية وفي قائمة التطبيقات.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* iOS View */}
          {platform === 'ios' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                  تثبيت EGS AI على أجهزة آيفون وآيباد (iOS)
                </h2>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
                  يرجى فتح الموقع في متصفح <strong style={{ color: 'var(--text-main)' }}>Safari</strong> الرسمي لتمكين التثبيت على شاشة الجهاز الرئيسية.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'var(--alpha-white-2)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.88rem', flexShrink: 0 }}>
                    1
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>اضغط على أيقونة المشاركة (Share)</span>
                      <Share size={16} style={{ color: 'var(--primary-color)' }} />
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.6' }}>
                      في شريط الأدوات أسفل متصفح Safari على iPhone (أو في الشريط العلوي على iPad)، اضغط على أيقونة المشاركة المربعة مع السهم المتجه للأعلى.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'var(--alpha-white-2)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.88rem', flexShrink: 0 }}>
                    2
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>اختر "إضافة إلى الشاشة الرئيسية"</span>
                      <PlusSquare size={16} style={{ color: 'var(--primary-color)' }} />
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.6' }}>
                      مرر للأسفل في قائمة خيارات المشاركة واضغط على خيار <strong style={{ color: 'var(--primary-color)' }}>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'var(--alpha-white-2)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.88rem', flexShrink: 0 }}>
                    3
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      اضغط على "إضافة" (Add) في الزاوية العلوية
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.6' }}>
                      اضغط على زر <strong>إضافة</strong> أعلى يمين الشاشة، وسيظهر تطبيق EGS AI مباشرة كأيقونة تطبيق مستقل على شاشة جهازك.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Desktop View */}
          {platform === 'desktop' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                    تثبيت EGS AI على أجهزة الكمبيوتر (Windows / Mac)
                  </h2>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0 }}>
                    يعمل مع متصفح Google Chrome ومتصفح Microsoft Edge و Brave لتثبيت التطبيق على سطح المكتب.
                  </p>
                </div>

                {deferredPrompt && (
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="btn-primary"
                    style={{
                      padding: '12px 24px',
                      borderRadius: 'var(--radius-md)',
                      fontWeight: 800,
                      fontSize: '0.92rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <Download size={18} />
                    <span>تثبيت التطبيق على سطح المكتب</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'var(--alpha-white-2)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.88rem', flexShrink: 0 }}>
                    1
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      أيقونة التثبيت في شريط العنوان (Address Bar)
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.6' }}>
                      انظر إلى شريط العنوان في متصفحك (الجهة اليسرى أو اليمنى بجانب رابط الموقع) واضغط على أيقونة <strong style={{ color: 'var(--primary-color)' }}>تثبيت التطبيق (Install EGS AI)</strong>.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'var(--alpha-white-2)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.88rem', flexShrink: 0 }}>
                    2
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      أو عبر قائمة المتصفح (Settings & More)
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.6' }}>
                      اضغط على قائمة المتصفح (النقاط الثلاث) ثم اختر <strong>تثبيت EGS AI كبرنامج على الجهاز</strong> (أو في Edge: التطبيقات Apps → تثبيت هذا الموقع كتطبيق).
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'var(--alpha-white-2)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.88rem', flexShrink: 0 }}>
                    3
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                      تشغيل مستقل وشاشة كاملة
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.6' }}>
                      سيفتح التطبيق في نافذة مستقلة أنيقة بدون أشرطة المتصفح المزدحمة، وستجد اختصاراً له في قائمة ابدأ (Start) وشريط المهام وسطح المكتب.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PWA Advantages Grid */}
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', textAlign: 'center', marginBottom: '20px' }}>
            لماذا تثبيت تطبيق EGS AI كـ Progressive Web App؟
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div className="glass" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', background: 'var(--card-bg)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={20} />
              </div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>سرعة استجابة فائقة</h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.6' }}>
                فتح فوري للمنصة والمناهج دون الحاجة للانتظار أو إعادة كتابة الرابط في كل مرة.
              </p>
            </div>

            <div className="glass" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', background: 'var(--card-bg)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <HardDrive size={20} />
              </div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>توفير فائق للمساحة</h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.6' }}>
                لا يستهلك مساحة التخزين الخاصة بهاتفك مثل التطبيقات التقليدية التي تتطلب مئات الميجابايتات.
              </p>
            </div>

            <div className="glass" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', background: 'var(--card-bg)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={20} />
              </div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>تحديثات تلقائية فورية</h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.6' }}>
                تحصل دائماً على أحدث المناهج الدراسية، نماذج الامتحانات، ومزايا الذكاء الاصطناعي لحظة إطلاقها.
              </p>
            </div>

            <div className="glass" style={{ padding: '20px', borderRadius: 'var(--radius-lg)', background: 'var(--card-bg)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={20} />
              </div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>أمان تام وتجربة كاملة</h3>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.6' }}>
                اتصال آمن ومشفر بالكامل 256-bit مع تجربة استخدام سلسة تناسب مختلف الشاشات.
              </p>
            </div>
          </div>
        </div>

        {/* Frequently Asked Questions */}
        <div className="glass" style={{ padding: '28px', borderRadius: 'var(--radius-lg)', background: 'var(--card-bg)', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <HelpCircle size={22} style={{ color: 'var(--primary-color)' }} />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
              الأسئلة الشائعة حول تثبيت التطبيق
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              {
                q: 'هل يتطلب تثبيت التطبيق وجود مساحة كبيرة على هاتفي؟',
                a: 'لا، يتم تثبيت تطبيق EGS AI كـ Progressive Web App (PWA) بحيث لا يتجاوز حجمه بضعة كيلوبايتات فقط ولا يستهلك ذاكرة جهازك أو يبطئه.'
              },
              {
                q: 'هل أحتاج للذهاب إلى Google Play أو App Store؟',
                a: 'لا، يمكنك تثبيت التطبيق مباشرة وبأمان تام من هذه الصفحة أو من خلال متصفحك بنقرة واحدة دون الحاجة لتسجيل الدخول إلى أي متجر تطبيقات.'
              },
              {
                q: 'كيف يمكنني إلغاء تثبيت التطبيق إذا أردت؟',
                a: 'يمكنك إزالة التطبيق بنفس طريقة إزالة أي تطبيق عادي: اضغط مطولاً على أيقونة التطبيق في شاشتك الرئيسية ثم اختر "إلغاء التثبيت" أو "إزالة من الشاشة الرئيسية".'
              }
            ].map((faq, idx) => (
              <div 
                key={idx}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--alpha-white-2)',
                  overflow: 'hidden'
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    textAlign: 'right',
                    cursor: 'pointer'
                  }}
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    size={18}
                    style={{
                      color: 'var(--primary-color)',
                      transform: openFaq === idx ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease',
                      flexShrink: 0
                    }}
                  />
                </button>
                {openFaq === idx && (
                  <div style={{ padding: '0 18px 16px', fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
