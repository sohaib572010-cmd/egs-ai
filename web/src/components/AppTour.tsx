'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  BookOpen,
  Brain,
  Zap,
  Send,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Lightbulb,
  FileText,
  Trophy,
  GraduationCap,
  CreditCard,
  Layers
} from 'lucide-react';

export type TourScreen = 'chat' | 'exams' | 'flashcards' | 'leaderboard' | 'subscriptions';

export interface TourStep {
  targetId?: string;
  title: string;
  badge?: string;
  badgeIcon?: React.ReactNode;
  content: string | React.ReactNode;
  hint?: string;
  position?: 'top' | 'bottom' | 'center' | 'left' | 'right';
  actionButtonText?: string;
  actionButtonIcon?: React.ReactNode;
  onEnter?: () => void;
  onAction?: () => void;
  subSteps?: {
    title: string;
    badge: string;
    badgeIcon?: React.ReactNode;
    content: string | React.ReactNode;
    targetId?: string;
    actionText?: string;
  }[];
}

interface AppTourProps {
  screen: TourScreen;
  isOpen: boolean;
  onClose: (completed: boolean) => void;
  currentSubject?: string;
  onSelectSubjectPrompt?: () => void;
  onPrefillPrompt?: (text: string) => void;
  onSubmitTourMessage?: () => void;
  onStartExamPrompt?: () => void;
  onStartFlashcardPrompt?: () => void;
  onNavigateToChat?: () => void;
  isMobile?: boolean;
}

export function AppTour({
  screen,
  isOpen,
  onClose,
  currentSubject = '',
  onSelectSubjectPrompt,
  onPrefillPrompt,
  onSubmitTourMessage,
  onStartExamPrompt,
  onStartFlashcardPrompt,
  onNavigateToChat,
  isMobile = false
}: AppTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [subStepIndex, setSubStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Dynamic mobile detection ensuring robust styling even if prop is omitted or on resize
  const [effectiveIsMobile, setEffectiveIsMobile] = useState(isMobile);

  useEffect(() => {
    const checkMobile = () => {
      const isSmall = typeof window !== 'undefined' && (
        window.innerWidth <= 768 ||
        (window.visualViewport ? window.visualViewport.width <= 768 : false)
      );
      setEffectiveIsMobile(Boolean(isMobile || isSmall));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [isMobile]);

  // Define screen tours with authentic Egyptian Arabic explanations
  const getScreenSteps = useCallback((): TourStep[] => {
    const subjectName = currentSubject || 'المادة اللي هتختارها';

    switch (screen) {
      case 'chat':
        return [
          {
            targetId: undefined,
            title: 'يلا ناخد جولة سريعة في المنصة!',
            badge: 'مرحباً بك في EGS AI',
            badgeIcon: <Sparkles size={14} />,
            position: 'center',
            content: (
              <div className="tour-content-body">
                <p>
                  أهلاً بيك يا بطل في <strong>EGS AI</strong>! دي شاشة الدردشة والمذاكرة الذكية، هنا تقدر تسأل الذكاء الاصطناعي أي سؤال ييجي في بالك، يشرحلك أي درس مش فاهمه بالتفصيل، أو يحل معاك أصعب المسائل والتمارين خطوة بخطوة من كتاب الوزارة.
                </p>
                <div className="tour-highlight-box">
                  <Lightbulb size={16} className="tour-highlight-icon" />
                  <span>الذكاء الاصطناعي متدرب بالكامل على مناهجك المصرية ومخصص لمرحلتك الدراسية!</span>
                </div>
              </div>
            ),
            actionButtonText: 'يلا نبدأ الخطوات'
          },
          {
            targetId: 'tour-subject-selector',
            title: '1. اختيار المادة الدراسية',
            badge: 'خطوة أساسية',
            badgeIcon: <BookOpen size={14} />,
            position: 'bottom',
            content: (
              <div className="tour-content-body">
                <p>
                  أول وأهم خطوة لازم تعملها: <strong>حدد المادة اللي عايز تذاكرها دلوقتي</strong> من شريط المواد قدامك!
                </p>
                <p>
                  بمجرد ما تختار المادة، الذكاء الاصطناعي بيظبط كل إجاباته وشروحه على منهج وقوانين المادة دي بالظبط.
                </p>
                <div className="tour-highlight-box">
                  <GraduationCap size={16} className="tour-highlight-icon" />
                  <span>{currentSubject ? `أنت دلوقتي محدد: (${currentSubject}) - تقدر تبدلها في أي وقت بنقرة واحدة.` : 'اضغط على أي مادة من المواد المقررة عليك للمتابعة!'}</span>
                </div>
              </div>
            ),
            actionButtonText: 'المتابعة للخطوة التالية'
          },
          {
            targetId: 'tour-composer-dock',
            title: '2. صندوق السؤال وخيارات الذكاء الاصطناعي',
            badge: 'التحكم الذكي',
            badgeIcon: <Brain size={14} />,
            position: isMobile ? 'top' : 'top',
            content: null,
            subSteps: [
              {
                title: 'كتبنالك رسالة جاهزة للتجربة!',
                badge: '1 من 4: صندوق الكتابة',
                badgeIcon: <FileText size={14} />,
                targetId: 'tour-composer-dock',
                content: (
                  <div className="tour-content-body">
                    <p>
                      كتبنالك تلقائياً رسالة تجريبية في صندوق السؤال: 
                      <br />
                      <strong style={{ color: 'var(--primary-color)', display: 'inline-block', marginTop: '6px' }}>
                        «اشرحلي بالتفصيل وبأمثلة واضحة أول درس في منهج {subjectName}»
                      </strong>
                    </p>
                    <p>
                      تقدر في أي وقت تعدل الرسالة، أو تكتب أي سؤال يخطر في بالك، أو تضغط على أيقونة الكاميرا لإرفاق صورة مسألة من كتابك.
                    </p>
                  </div>
                ),
                actionText: 'التالي: أنماط الشرح والتفكير'
              },
              {
                title: 'ميزة التفكير العميق وأنماط الشرح',
                badge: '2 من 4: التفكير العميق',
                badgeIcon: <Brain size={14} />,
                targetId: 'tour-thinking-controls',
                content: (
                  <div className="tour-content-body">
                    <p>
                      تحت مربع السؤال عندك تحكّم قوي جداً:
                    </p>
                    <ul className="tour-features-list">
                      <li>
                        <strong>تفكير عميق (Deep Thinking):</strong> فعّله لما تكون المسألة صعبة أو محتاجة خطوات رياضية واستنتاج، وهيخلي الذكاء الاصطناعي يفكر خطوة بخطوة ويوضح خطوات تفكيره قبل الإجابة.
                      </li>
                      <li>
                        <strong>نمط الشرح:</strong> اختار بين (شرح مفصل شامل، أو أسلوب سقراطي تفاعلي يسألك ويناقشك، أو ملخص سريع ينجزك).
                      </li>
                    </ul>
                  </div>
                ),
                actionText: 'التالي: ميزة التفكير المعمق'
              },
              {
                title: 'ميزة التفكير المعمق (Deep Thinking)',
                badge: '3 من 4: التفكير الذكي',
                badgeIcon: <Brain size={14} />,
                targetId: 'tour-thinking-controls',
                content: (
                  <div className="tour-content-body">
                    <p>
                      محرك الذكاء الاصطناعي فائق السرعة، ومتاح للمشتركين تفعيل التفكير المعمق للمسائل الصعبة:
                    </p>
                    <ul className="tour-features-list">
                      <li>
                        <strong>الوضع السريع:</strong> استجابة فورية فائقة السرعة للمفاهيم والأسئلة المباشرة وحفظ القوانين.
                      </li>
                      <li>
                        <strong>التفكير المعمق (حصرياً للمشتركين):</strong> تحليل استنتاجي خطوة بخطوة لأعقد مسائل امتحانات الثانوية العامة بدقة متناهية.
                      </li>
                    </ul>
                  </div>
                ),
                actionText: 'التالي: إرسال السؤال ورؤية النتيجة'
              },
              {
                title: 'اضغط إرسال وشوف النتيجة بنفسك!',
                badge: '4 من 4: جرّب دلوقتي',
                badgeIcon: <Send size={14} />,
                targetId: 'tour-send-button',
                content: (
                  <div className="tour-content-body">
                    <p>
                      كل حاجة جاهزة! اضغط دلوقتي على زر <strong>الإرسال</strong> عشان تشوف بنفسك إزاي EGS AI هيشرحلك الدرس باحترافية وسهولة، ويجاوبك خطوة بخطوة من كتابك المقرر.
                    </p>
                    <div className="tour-highlight-box success">
                      <CheckCircle size={16} className="tour-highlight-icon" />
                      <span>اضغط زر «إرسال وتجربة النتيجة» أدناه لبدء المحادثة فوراً!</span>
                    </div>
                  </div>
                ),
                actionText: 'إرسال وتجربة النتيجة الآن'
              }
            ]
          }
        ];

      case 'exams':
        return [
          {
            targetId: undefined,
            title: 'قسم الامتحانات والاختبارات الذكية',
            badge: 'امتحانات تفاعلية',
            badgeIcon: <FileText size={14} />,
            position: 'center',
            content: (
              <div className="tour-content-body">
                <p>
                  هنا تقدر تولّد وتخوض امتحانات إلكترونية تفاعلية على أي درس أو وحدة في منهجك، مطابقة تماماً لمواصفات ونظام امتحانات الوزارة الحديثة.
                </p>
                <div className="tour-highlight-box">
                  <Sparkles size={16} className="tour-highlight-icon" />
                  <span>توليد فوري للامتحانات بأسئلة اختيار من متعدد مع وقت زمني محدد لتدريبك على جو الامتحان الحقيقي!</span>
                </div>
              </div>
            ),
            actionButtonText: 'يلا نبدأ الخطوات'
          },
          {
            targetId: 'tour-exams-create-btn',
            title: '1. توليد امتحان مخصص في ثوانٍ',
            badge: 'تخصيص المنهج',
            badgeIcon: <BookOpen size={14} />,
            position: 'bottom',
            content: (
              <div className="tour-content-body">
                <p>
                  اضغط على زر <strong>توليد امتحان جديد</strong>، واختار مادتك والوحدة أو الدرس المحدد، أو اكتب أي موضوع تريده، وحدد عدد الأسئلة ونوعها بكل سهولة.
                </p>
                <div className="tour-highlight-box">
                  <Lightbulb size={16} className="tour-highlight-icon" />
                  <span>تقدر تضغط على زر توليد الامتحان أدناه للبدء فوراً!</span>
                </div>
              </div>
            ),
            actionButtonText: 'التالي: التصحيح الذكي والشرح'
          },
          {
            targetId: 'tour-exams-list',
            title: '2. التصحيح الفوري والشرح التفصيلي',
            badge: 'التقييم الذكي',
            badgeIcon: <CheckCircle size={14} />,
            position: 'top',
            content: (
              <div className="tour-content-body">
                <p>
                  بعد ما تخلص إجابة كل سؤال، النظام هيصححلك فورياً ويعرفك درجتك بدقة، ويقدملك شرحاً نموذجياً لكل مسألة، وتضاف درجاتك لنقاط ترتيبك في لوحة المتصدرين!
                </p>
                <div className="tour-highlight-box success">
                  <CheckCircle size={16} className="tour-highlight-icon" />
                  <span>اضغط أدناه للبدء في تجهيز وتوليد أول امتحان لك!</span>
                </div>
              </div>
            ),
            actionButtonText: 'ابدأ بتوليد امتحان الآن'
          }
        ];

      case 'flashcards':
        return [
          {
            targetId: undefined,
            title: 'المدرب الذكي والكروت التعليمية',
            badge: 'التكرار المتباعد',
            badgeIcon: <Layers size={14} />,
            position: 'center',
            content: (
              <div className="tour-content-body">
                <p>
                  طريقة عبقرية لحفظ وتثبيت أهم القوانين، التعريفات، والمفاهيم الأساسية باستخدام نظام <strong>التكرار المتباعد الذكي</strong> عشان متنساش أي معلومة قبل الامتحان.
                </p>
                <div className="tour-highlight-box">
                  <Brain size={16} className="tour-highlight-icon" />
                  <span>تثبيت المعلومات في الذاكرة طويلة المدى بأقل مجهود يومي!</span>
                </div>
              </div>
            ),
            actionButtonText: 'يلا نبدأ الخطوات'
          },
          {
            targetId: 'tour-flashcards-create-btn',
            title: '1. إنشاء كروت المراجعة بالذكاء الاصطناعي',
            badge: 'توليد ذكي فوري',
            badgeIcon: <Sparkles size={14} />,
            position: 'bottom',
            content: (
              <div className="tour-content-body">
                <p>
                  تقدر بنقرة واحدة تولّد مجموعة كروت ذكية على أي درس في منهجك تلقائياً بالذكاء الاصطناعي، أو تضيف كروتك وملاحظاتك الخاصة للمراجعة في أي وقت.
                </p>
              </div>
            ),
            actionButtonText: 'التالي: طريقة المذاكرة وتقييم الحفظ'
          },
          {
            targetId: 'tour-flashcards-card',
            title: '2. اقلب الكارت وقيّم استدعاءك',
            badge: 'تفاعل وتكرار ذكي',
            badgeIcon: <Brain size={14} />,
            position: 'bottom',
            content: (
              <div className="tour-content-body">
                <p>
                  اقرأ السؤال أو المفهوم، واضغط على الكارت ليتقلب ويظهرلك الشرح والإجابة النموذجية.
                </p>
                <p>
                  بعدها قيّم مدى حفظك، والمدرب الذكي هيبرمج إعادة ظهور الكارت في الوقت المناسب بالظبط قبل ما تنساه!
                </p>
                <div className="tour-highlight-box success">
                  <CheckCircle size={16} className="tour-highlight-icon" />
                  <span>اضغط أدناه للبدء في إنشاء أو مراجعة أول مجموعة كروت!</span>
                </div>
              </div>
            ),
            actionButtonText: 'إنشاء أول مجموعة كروت الآن'
          }
        ];

      case 'leaderboard':
        return [
          {
            targetId: undefined,
            title: 'المسابقة ولوحة المتصدرين',
            badge: 'تنافس الأبطال',
            badgeIcon: <Trophy size={14} />,
            position: 'center',
            content: (
              <div className="tour-content-body">
                <p>
                  تنافس مع أشطر زملائك من نفس صفك الدراسي على مستوى كل محافظات مصر، واجمع نقاط الترتيب مع كل خطوة مذاكرة!
                </p>
                <div className="tour-highlight-box">
                  <Trophy size={16} className="tour-highlight-icon" />
                  <span>كل محادثة، كل امتحان تخلصه، وكل كارت تذاكره بيزود نقاطك ورصيدك في الترتيب!</span>
                </div>
              </div>
            ),
            actionButtonText: 'يلا نبدأ الخطوات'
          },
          {
            targetId: 'tour-leaderboard-header',
            title: '1. تصنيف صفي الدراسي والترتيب العام',
            badge: 'الفلترة الذكية',
            badgeIcon: <Trophy size={14} />,
            position: 'bottom',
            content: (
              <div className="tour-content-body">
                <p>
                  تقدر تبدّل بنقرة واحدة بين قائمة متصدري صفك الدراسي فقط، أو الترتيب العام الشامل لكل الصفوف والمراحل على مستوى الجمهورية.
                </p>
              </div>
            ),
            actionButtonText: 'التالي: كيف تتصدر القائمة؟'
          },
          {
            targetId: 'tour-leaderboard-list',
            title: '2. كيف تصعد لقائمة أفضل 10 طلاب؟',
            badge: 'نقاط الترتيب',
            badgeIcon: <Zap size={14} />,
            position: 'top',
            content: (
              <div className="tour-content-body">
                <p>
                  كل سؤال تسأله، كل امتحان تحله بدرجة عالية، وكل كارت تعليمي تراجعه بانتظام يضيف نقاطاً حقيقية لرصيد ترتيبك حتى تصعد لصدارة المتفوقين!
                </p>
              </div>
            ),
            actionButtonText: 'فهمت، جاهز للمنافسة والصدارة!'
          }
        ];

      case 'subscriptions':
        return [
          {
            targetId: undefined,
            title: 'باقات الاشتراك وتفعيل Pro',
            badge: 'مميزات بلا حدود',
            badgeIcon: <CreditCard size={14} />,
            position: 'center',
            content: (
              <div className="tour-content-body">
                <p>
                  اشترك في باقة Pro لتفعيل تجديد الرصيد اليومي تلقائياً، إتاحة نماذج Pro الفائقة، وتوليد عدد غير محدود من الامتحانات الذكية وتفعيل ميزة التفكير العميق.
                </p>
                <div className="tour-highlight-box">
                  <Sparkles size={16} className="tour-highlight-icon" />
                  <span>تفعيل فوري وآمن بأسهل طرق الدفع المتاحة في مصر!</span>
                </div>
              </div>
            ),
            actionButtonText: 'يلا نبدأ الخطوات'
          },
          {
            targetId: 'tour-subscriptions-plans',
            title: '1. باقات مصممة للطلاب ودفع إلكتروني آمن',
            badge: 'دفع محلي فوري',
            badgeIcon: <CheckCircle size={14} />,
            position: 'top',
            content: (
              <div className="tour-content-body">
                <p>
                  اختر الباقة المناسبة لاحتياجاتك (شهر، شهرين، أو 3 أشهر). الدفع سهل ومباشر عبر بوابة كاشير المعتمدة في مصر بواسطة فودافون كاش، محافظ المحمول، ميزة، وبطاقات فيزا وماستركارد.
                </p>
              </div>
            ),
            actionButtonText: 'فهمت كل المميزات'
          }
        ];

      default:
        return [];
    }
  }, [screen, currentSubject, effectiveIsMobile]);

  const steps = getScreenSteps();
  const currentStep = steps[currentStepIndex] || steps[0];
  const isSubStepped = !!(currentStep?.subSteps && currentStep.subSteps.length > 0);
  const activeSubStep = isSubStepped ? currentStep.subSteps![subStepIndex] : null;

  // Active target ID based on main step or sub-step
  const activeTargetId = activeSubStep?.targetId || currentStep?.targetId;

  // Measure target element position accurately
  const measureTargetRect = useCallback(() => {
    if (!activeTargetId) {
      setTargetRect(null);
      return;
    }

    const targetEl = document.getElementById(activeTargetId);
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect(rect);
        return;
      }
    }
    setTargetRect(null);
  }, [activeTargetId]);

  useEffect(() => {
    if (!isOpen) return;

    if (activeTargetId) {
      const targetEl = document.getElementById(activeTargetId);
      if (targetEl) {
        if (effectiveIsMobile) {
          // For mobile, scroll intelligently based on target location:
          // For bottom dock controls (composer dock, send button, deep thinking, models),
          // scroll target towards the bottom so the card has ample, unobstructed space at the top!
          const isBottomDockControl = activeTargetId === 'tour-composer-dock' ||
            activeTargetId === 'tour-thinking-controls' ||
            activeTargetId === 'tour-model-selector' ||
            activeTargetId === 'tour-send-button' ||
            currentStep?.position === 'top';

          targetEl.scrollIntoView({
            behavior: 'smooth',
            block: isBottomDockControl ? 'end' : 'start',
            inline: 'nearest'
          });
        } else {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
      }
    }

    measureTargetRect();
    const timer1 = setTimeout(measureTargetRect, 60);
    const timer2 = setTimeout(measureTargetRect, 200);
    const timer3 = setTimeout(measureTargetRect, 450);

    const handleScrollOrResize = () => {
      measureTargetRect();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleScrollOrResize);
      window.visualViewport.addEventListener('scroll', handleScrollOrResize);
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      if (typeof window !== 'undefined' && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleScrollOrResize);
        window.visualViewport.removeEventListener('scroll', handleScrollOrResize);
      }
    };
  }, [isOpen, currentStepIndex, subStepIndex, activeTargetId, measureTargetRect, effectiveIsMobile]);

  // When opening Step 2 (Submit box) in Chat screen: automatically prefill the prompt!
  useEffect(() => {
    if (screen === 'chat' && currentStepIndex === 2 && isOpen) {
      const prompt = `اشرحلي بالتفصيل وبأمثلة واضحة أول درس في منهج ${currentSubject || 'الفيزياء'}`;
      if (onPrefillPrompt) {
        onPrefillPrompt(prompt);
      }
    }
  }, [screen, currentStepIndex, isOpen, currentSubject, onPrefillPrompt]);

  if (!isOpen || !currentStep) return null;

  const totalMainSteps = steps.length;
  const isLastMainStep = currentStepIndex === totalMainSteps - 1;
  const isLastSubStep = isSubStepped ? subStepIndex === (currentStep.subSteps!.length - 1) : true;

  const handleNext = () => {
    if (isSubStepped && !isLastSubStep) {
      setSubStepIndex(prev => prev + 1);
      return;
    }

    if (isLastMainStep) {
      // Completed all steps
      onClose(true);
    } else {
      setCurrentStepIndex(prev => prev + 1);
      setSubStepIndex(0);
    }
  };

  const handlePrev = () => {
    if (isSubStepped && subStepIndex > 0) {
      setSubStepIndex(prev => prev - 1);
      return;
    }

    if (currentStepIndex > 0) {
      const prevStep = steps[currentStepIndex - 1];
      setCurrentStepIndex(prev => prev - 1);
      if (prevStep.subSteps && prevStep.subSteps.length > 0) {
        setSubStepIndex(prevStep.subSteps.length - 1);
      } else {
        setSubStepIndex(0);
      }
    }
  };

  const handleSkip = () => {
    onClose(false);
  };

  const handleActionClick = () => {
    // Custom action triggers
    if (screen === 'chat') {
      if (currentStepIndex === 1) {
        // Step 1: Subject selector
        if (onSelectSubjectPrompt && !currentSubject) {
          onSelectSubjectPrompt();
        }
        handleNext();
        return;
      }

      if (currentStepIndex === 2 && isLastSubStep) {
        // Step 2 final sub-step: Submit message - Close tour immediately first so streaming is completely unobstructed!
        onClose(true);
        if (onSubmitTourMessage) {
          setTimeout(onSubmitTourMessage, 40);
        }
        return;
      }
    } else if (screen === 'exams') {
      if (isLastMainStep) {
        onClose(true);
        if (onStartExamPrompt) {
          setTimeout(onStartExamPrompt, 150);
        }
        return;
      }
    } else if (screen === 'flashcards') {
      if (isLastMainStep) {
        onClose(true);
        if (onStartFlashcardPrompt) {
          setTimeout(onStartFlashcardPrompt, 150);
        }
        return;
      }
    } else if (screen === 'leaderboard' || screen === 'subscriptions') {
      if (isLastMainStep) {
        onClose(true);
        return;
      }
    }

    handleNext();
  };

  // Card positioning logic with guaranteed non-overlapping bounds
  const getCardStyle = (): React.CSSProperties => {
    const visualViewport = typeof window !== 'undefined' ? window.visualViewport : null;
    const winW = visualViewport ? visualViewport.width : (typeof window !== 'undefined' ? window.innerWidth : 1200);
    const winH = visualViewport ? visualViewport.height : (typeof window !== 'undefined' ? window.innerHeight : 800);
    const offsetTop = visualViewport ? visualViewport.offsetTop : 0;

    if (effectiveIsMobile) {
      // 1. Centered fallback when there's no target or position is explicitly center
      if (!targetRect || currentStep.position === 'center') {
        return {
          position: 'fixed',
          top: `calc(${offsetTop + winH / 2}px)`,
          left: '12px',
          right: '12px',
          transform: 'translateY(-50%)',
          margin: '0 auto',
          maxWidth: '440px',
          maxHeight: 'min(80vh, calc(100dvh - 36px))',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10002
        };
      }

      // 2. We have a targetRect. Calculate available space above and below the target:
      const targetTop = targetRect.top;
      const targetBottom = targetRect.bottom;
      const spaceAbove = targetTop - offsetTop - 12;
      const spaceBelow = (winH + offsetTop) - targetBottom - 12;

      // Card prefers top if explicitly requested, or if target is closer to bottom
      const placeAtTop = currentStep.position === 'top' || spaceAbove >= spaceBelow;

      if (placeAtTop) {
        // Place card at top of viewport, strictly bounded above targetRect so it NEVER overlaps
        const availableHeight = Math.max(160, Math.min(380, spaceAbove - 12));
        return {
          position: 'fixed',
          top: `calc(${offsetTop + 10}px + env(safe-area-inset-top, 0px))`,
          left: '12px',
          right: '12px',
          margin: '0 auto',
          maxWidth: '440px',
          maxHeight: `${availableHeight}px`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10002
        };
      } else {
        // Place card at bottom of viewport, strictly bounded below targetRect so it NEVER overlaps
        const availableHeight = Math.max(160, Math.min(380, spaceBelow - 12));
        return {
          position: 'fixed',
          bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
          left: '12px',
          right: '12px',
          margin: '0 auto',
          maxWidth: '440px',
          maxHeight: `${availableHeight}px`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10002
        };
      }
    }

    // Desktop positioning
    if (!targetRect || currentStep.position === 'center') {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: '520px',
        width: '92%',
        maxHeight: 'min(86vh, 600px)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10002
      };
    }

    const cardWidth = 460;
    const padding = 16;
    let top = targetRect.bottom + padding;
    let left = targetRect.left + (targetRect.width / 2) - (cardWidth / 2);

    // If target is low on screen, place card above target
    if (targetRect.bottom + 320 > winH) {
      top = Math.max(16, targetRect.top - 340);
    }

    // Horizontal bounds
    if (left + cardWidth > winW - 16) {
      left = winW - cardWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }

    return {
      position: 'fixed',
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${cardWidth}px`,
      maxHeight: 'min(86vh, 600px)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10002
    };
  };

  return (
    <div className="tour-wrapper" style={{ direction: 'rtl' }}>
      {/* Surround Backdrop Panels & Spotlight Ring */}
      {(() => {
        if (!targetRect) {
          return (
            <div
              className="tour-full-backdrop"
              onClick={handleSkip}
            />
          );
        }

        const pad = 6;
        const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const winH = typeof window !== 'undefined' ? window.innerHeight : 800;

        const t = Math.max(0, targetRect.top - pad);
        const b = Math.min(winH, targetRect.bottom + pad);
        const l = Math.max(0, targetRect.left - pad);
        const r = Math.min(winW, targetRect.right + pad);
        const w = Math.max(0, r - l);
        const h = Math.max(0, b - t);

        return (
          <>
            {/* Top Dark Panel */}
            <div
              className="tour-backdrop-panel"
              style={{ top: 0, left: 0, right: 0, height: `${t}px` }}
              onClick={handleSkip}
            />

            {/* Bottom Dark Panel */}
            <div
              className="tour-backdrop-panel"
              style={{ top: `${b}px`, left: 0, right: 0, bottom: 0 }}
              onClick={handleSkip}
            />

            {/* Left Dark Panel */}
            <div
              className="tour-backdrop-panel"
              style={{ top: `${t}px`, left: 0, width: `${l}px`, height: `${h}px` }}
              onClick={handleSkip}
            />

            {/* Right Dark Panel */}
            <div
              className="tour-backdrop-panel"
              style={{ top: `${t}px`, left: `${r}px`, right: 0, height: `${h}px` }}
              onClick={handleSkip}
            />

            {/* Spotlight Focus Ring around target: The inside area is 100% open, clear, unblurred, and interactive! */}
            <div
              className="tour-spotlight-ring"
              style={{
                top: `${t}px`,
                left: `${l}px`,
                width: `${w}px`,
                height: `${h}px`,
              }}
            />
          </>
        );
      })()}

      {/* Floating Tour Guide Card */}
      <div ref={cardRef} className="tour-card animate-scale-in" style={getCardStyle()} onClick={(e) => e.stopPropagation()}>
        
        {/* Header: Badge & Close button */}
        <div className="tour-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="tour-badge">
              {activeSubStep?.badgeIcon || currentStep.badgeIcon || <Sparkles size={13} />}
              <span>{activeSubStep?.badge || currentStep.badge || `الخطوة ${currentStepIndex + 1} من ${totalMainSteps}`}</span>
            </div>
            {screen !== 'chat' && onNavigateToChat && (
              <button
                type="button"
                onClick={() => {
                  onClose(false);
                  onNavigateToChat();
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--primary-color)',
                  borderRadius: '6px',
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="الانتقال لجولة المساعد الذكي الرئيسية (الدردشة)"
              >
                <span>جولة الدردشة الرئيسية</span>
                <ChevronLeft size={12} />
              </button>
            )}
          </div>

          <button
            type="button"
            className="tour-close-btn"
            onClick={handleSkip}
            title="إغلاق وتخطي الجولة"
            aria-label="إغلاق الجولة"
          >
            <X size={16} />
          </button>
        </div>

        {/* Title & Micro-step Sub-indicator */}
        <div className="tour-card-title-section">
          <h3 className="tour-card-title">
            {activeSubStep?.title || currentStep.title}
          </h3>

          {/* Sub-steps carousel pills for Step 3 */}
          {isSubStepped && currentStep.subSteps && (
            <div className="tour-substep-pills">
              {currentStep.subSteps.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSubStepIndex(idx)}
                  className={`tour-substep-pill ${subStepIndex === idx ? 'active' : ''}`}
                  title={s.title}
                >
                  <span className="tour-substep-num">{idx + 1}</span>
                  <span className="tour-substep-label">{s.badge.split(':')[0]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Body content */}
        <div className="tour-card-content">
          {activeSubStep?.content || currentStep.content}
        </div>

        {/* Footer controls: Progress, Skip, Back, Next/Action */}
        <div className="tour-card-footer">
          {/* Progress dots */}
          <div className="tour-step-indicators">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`tour-step-dot ${i === currentStepIndex ? 'active' : ''} ${i < currentStepIndex ? 'completed' : ''}`}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div className="tour-actions-group">
            <button
              type="button"
              className="tour-btn-skip"
              onClick={handleSkip}
            >
              تخطي الجولة
            </button>

            {(currentStepIndex > 0 || (isSubStepped && subStepIndex > 0)) && (
              <button
                type="button"
                className="tour-btn-secondary"
                onClick={handlePrev}
                title="الرجوع للخطوة السابقة"
              >
                <ChevronRight size={16} />
                <span>السابق</span>
              </button>
            )}

            <button
              type="button"
              className="tour-btn-primary"
              onClick={handleActionClick}
            >
              <span>
                {effectiveIsMobile
                  ? (isLastMainStep && isLastSubStep ? 'إرسال وتجربة الآن' : (isLastMainStep ? 'إتمام الجولة' : 'التالي'))
                  : (activeSubStep?.actionText || currentStep.actionButtonText || (isLastMainStep ? 'إتمام الجولة' : 'التالي'))}
              </span>
              {isLastMainStep && isLastSubStep ? (
                <CheckCircle size={15} />
              ) : (
                <ChevronLeft size={16} />
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default AppTour;
