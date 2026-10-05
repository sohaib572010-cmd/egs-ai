import { NextRequest, NextResponse } from 'next/server';
import { db, ChatMode, getCurriculumCorpus } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { generateChatResponseStream, buildChatMessages, staticChatCompletionStream, type ChatTurn } from '@/lib/deepseek';
import { buildBoundaryRedirectMessage, buildScopeHint, isScopeDisclaimerLine, type LessonMode } from '@/lib/tutor_prompts';
import { isEnglishSubject, isEnglishText, isClearlyDifferentSubject } from '@/lib/subject_helpers';
import {
  analyzeQueryIntelligence,
  classifyEngagement,
  callDeepSeekVision,
  isSinglePointQuestion,
  resolveAnswerScope,
  type AnswerScope
} from '@/lib/gemini';
import { retrieveCurriculumContext, formatCurriculumMap, formatSections } from '@/lib/hybrid_retriever';
import { getExhaustiveLessonContext, curriculumTextContains, findCurriculumFor, getCurriculumStructure } from '@/lib/curriculum_structure';
import { getGradeDisplayName } from '@/lib/subject_helpers';
import { acquireAiSlot, releaseAiSlot, chargeForUsage, usageFromProvider, estimateUsage, AI_BUSY_RESPONSE, type ChargeResult } from '@/lib/metering';
import { RAG_OVERHEAD_USAGE, VISION_USAGE, type TokenUsage } from '@/lib/points_pricing';
import { offloadInlineMedia } from '@/lib/chat_media';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_MODES: ChatMode[] = ['socratic', 'detailed', 'summary'];
// Fits a 10 MB voice note and a 5 MB image, both base64-encoded inside the message.
const MAX_MESSAGE_CHARS = 22_000_000;
const MAX_TEXT_CHARS = 8000;
const MAX_CLIENT_HISTORY = 14;

type HistoryEntry = { sender: 'user' | 'ai'; message: string };

function sanitizeClientHistory(history: unknown): HistoryEntry[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h): h is HistoryEntry => !!h && (h.sender === 'user' || h.sender === 'ai') && typeof h.message === 'string')
    .slice(-MAX_CLIENT_HISTORY)
    .map(h => ({ sender: h.sender, message: h.message.slice(0, MAX_TEXT_CHARS) }));
}

function parseMessage(msg: string): {
  cleanText: string;
  hasImage: boolean;
  imageDesc?: string;
  imageBase64?: string;
  imageMime?: string;
  isVoice?: boolean;
  voiceDuration?: number;
  voiceMime?: string;
  voiceAudio?: string;
} {
  let cleanText = msg || '';
  let imageDesc: string | undefined;
  let imageBase64: string | undefined;
  let imageMime: string | undefined;
  let isVoice = false;
  let voiceDuration: number | undefined;
  let voiceMime: string | undefined;
  let voiceAudio: string | undefined;

  // Extract IMAGE_MESSAGE prefix if present
  if (cleanText.includes('[IMAGE_MESSAGE:')) {
    const imgMatch = cleanText.match(/\[IMAGE_MESSAGE:([^;]+);([^;]+)(?:;([^\]]*))?\]/);
    if (imgMatch) {
      imageMime = imgMatch[1] || 'image/jpeg';
      imageBase64 = imgMatch[2] || '';
      if (imgMatch[3]) {
        try {
          imageDesc = decodeURIComponent(imgMatch[3]);
        } catch (e) {
          imageDesc = imgMatch[3];
        }
      }
      cleanText = cleanText.replace(imgMatch[0], '').trim();
    }
  }

  // Extract VOICE_MESSAGE prefix if present: [VOICE_MESSAGE:duration=12;mime=audio/webm;codecs=opus;audio=...]
  if (cleanText.includes('VOICE_MESSAGE:')) {
    const voiceMatch = cleanText.match(/\[?VOICE_MESSAGE:duration=([0-9.]+);mime=([\s\S]*?);audio=([\s\S]*?)\]/);
    if (voiceMatch) {
      isVoice = true;
      voiceDuration = parseFloat(voiceMatch[1]) || 0;
      voiceMime = voiceMatch[2] || 'audio/webm';
      voiceAudio = voiceMatch[3] || '';
      cleanText = cleanText.replace(voiceMatch[0], '').trim();
    }
  }

  return { 
    cleanText, 
    hasImage: !!imageBase64, 
    imageDesc, 
    imageBase64, 
    imageMime, 
    isVoice, 
    voiceDuration, 
    voiceMime, 
    voiceAudio 
  };
}

function isConversationalGreeting(text: string): boolean {
  if (!text) return false;
  const clean = text
    .replace(/[؟?!.،,;:~`!@#$%^&*()_+\-=\[\]{}'"]/g, ' ')
    .trim()
    .toLowerCase();
  if (!clean || clean.length > 60) return false;

  const exactGreetings = new Set([
    'سلام', 'سلام عليكم', 'السلام عليكم', 'وعليكم السلام', 'أهلا', 'اهلا', 'مرحبا', 'مرحباً',
    'هاي', 'هلو', 'صباح الخير', 'مساء الخير', 'صباح النور', 'مساء النور', 'صباح الورد', 'مساء الورد',
    'ازيك', 'ازي حضرتك', 'إزيك', 'عامل ايه', 'اخبارك', 'أخبارك', 'شخبارك', 'تمام', 'الحمد لله',
    'مين انت', 'أنت مين', 'انت مين', 'مين حضرتك', 'عرفني بنفسك', 'بتعمل ايه', 'تقدر تساعدني ازاي',
    'شكرا', 'شكراً', 'تسلم', 'جزاك الله خير', 'جزاك الله خيرا', 'ألف شكر', 'مشكور',
    'عاوز اذاكر', 'عايز اذاكر', 'ممكن تساعدني', 'محتاج مساعدة', 'يلا نذاكر', 'ابدأ معايا',
    'يا مستر', 'يا استاذ', 'يا باشا', 'يا دكتور', 'يا بشمهندس'
  ]);

  if (exactGreetings.has(clean)) return true;

  const greetingPrefixes = [
    'ازيك', 'إزيك', 'السلام عليكم', 'سلام عليكم', 'صباح الخير', 'مساء الخير', 'أهلا', 'اهلا', 'مرحبا'
  ];
  return greetingPrefixes.some(p => clean.startsWith(p) && clean.length < 30);
}

function isImageCapabilityInquiry(text: string): boolean {
  if (!text) return false;
  const clean = text
    .replace(/[؟?!.،,;:~`!@#$%^&*()_+\-=\[\]{}'"]/g, ' ')
    .trim()
    .toLowerCase();
  if (!clean || clean.length > 150) return false;

  // Never match physics optics curriculum questions about mirrors/lenses and image formations
  if (/(?:مرآة|مرايا|عدسة|عدسات|تكون الصور|صفات الصورة|خواص الصورة|مسار الأشعة|بؤرة|خيالية|حقيقية|مقلوبة|معتدلة)/i.test(clean)) {
    return false;
  }

  // Check direct query about text-only model or camera/image capabilities
  const directTextOnlyCheck = /(?:نصي فقط|نصوص بس|كلام بس|text[- ]?only)/i.test(clean);

  const cameraOrImagePattern = /(?:صورة|صور|صوره|كاميرا|كاميره|تصوير|أصور|اصور|صورة بالكاميرا|صور بالكاميرا|رفع صورة|ارفق صورة|ارفاق صورة|image|images|picture|pictures|photo|photos|camera)/i;
  const capabilityQuestionPattern = /(?:هل|أقدر|اقدر|تقدر|بتقدر|ينفع|ممكن|عايز|عاوز|كيف|ازاي|طريقة|تدعم|بتدعم|تقبل|بيقبل|بتقبل|تفهم|بيفهم|بتفهم|تشوف|بيشوف|بتشوف|تقرأ|بتقرأ|تستقبل|بتستقبل|يمكنك|تستطيع|بتعرف|تعرف|أبعت|ابعت|ارفع|أرفع|اصور|أصور|can i|do you (?:support|accept|see|read|take)|are you (?:text|multimodal))/i;

  return directTextOnlyCheck || (cameraOrImagePattern.test(clean) && capabilityQuestionPattern.test(clean));
}

function isVoiceCapabilityInquiry(text: string): boolean {
  if (!text) return false;
  const clean = text
    .replace(/[؟?!.،,;:~`!@#$%^&*()_+\-=\[\]{}'"]/g, ' ')
    .trim()
    .toLowerCase();
  if (!clean || clean.length > 150) return false;

  const voicePattern = /(?:صوتية|رسالة صوتية|رسائل صوتية|فويس|فويسات|صوت|تسجيل صوتي|تسجيل صوت|مايك|ميكروفون|تسجيلات|voice|audio|voice[- ]?note)/i;
  const capabilityPattern = /(?:هل|أقدر|اقدر|تقدر|بتقدر|ينفع|ممكن|عايز|عاوز|كيف|ازاي|طريقة|تدعم|بتدعم|تقبل|بيقبل|بتقبل|تسمع|بيسمع|بتسمع|تفهم|بيفهم|بتفهم|تستقبل|بتستقبل|تتكلم|اتكلم|أبعت|ابعت|اسجل|أسجل|can i|do you (?:support|accept|hear|listen))/i;

  return voicePattern.test(clean) && capabilityPattern.test(clean);
}

async function analyzeImageWithEdenAI(base64: string, mimeType: string): Promise<string> {
  if (!base64) return '';

  // Step 1: DeepSeek Flash (deepseek-flash, Primary Vision Model with native multimodal)
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const desc = await callDeepSeekVision(
        base64,
        mimeType || 'image/jpeg',
        'اقرأ هذه الصورة بالتفصيل واكتب وصفاً شاملاً ومفصلاً لها باللغة العربية، بما في ذلك أي نصوص أو أسئلة أو مسائل أو معادلات رياضية أو فيزيائية أو كيميائية أو جداول أو رسوم توضيحية بداخلها بدقة بالغة واكتب النصوص والمسائل كما هي حرفياً.'
      );
      if (desc && desc.trim().length > 0) {
        return desc.trim();
      }
    } catch (deepseekVisionErr) {
      console.warn('DeepSeek Vision in chat failed, falling back to EdenAI:', deepseekVisionErr);
    }
  }

  // Step 2: EdenAI VQA Fallback (Google / OpenAI)
  const EDENAI_API_KEY = process.env.EDENAI_API_KEY || '';
  if (!EDENAI_API_KEY) return '';

  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType || 'image/jpeg' });

    const formData = new FormData();
    formData.append('providers', 'google');
    formData.append('fallback_providers', 'openai');
    formData.append('file', blob, `image.${(mimeType || 'image/jpeg').split('/')[1] || 'jpg'}`);
    formData.append(
      'question',
      'اقرأ هذه الصورة بالتفصيل واكتب وصفاً شاملاً ومفصلاً لها باللغة العربية، بما في ذلك أي نصوص أو أسئلة أو مسائل أو معادلات رياضية أو فيزيائية أو كيميائية أو جداول أو رسوم توضيحية بداخلها بدقة بالغة واكتب النصوص والمسائل كما هي حرفياً.'
    );

    const response = await fetch('https://api.edenai.run/v2/image/question_answer', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EDENAI_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      console.error('EdenAI VQA in chat error:', response.status);
      return '';
    }

    const data = await response.json();
    const googleAnswers = data?.google?.answers;
    const openaiAnswers = data?.openai?.answers;

    return (googleAnswers && googleAnswers.length > 0 ? googleAnswers[0] : null) || 
           (openaiAnswers && openaiAnswers.length > 0 ? openaiAnswers[0] : null) || 
           data?.google?.answer || 
           data?.openai?.answer || 
           '';
  } catch (err) {
    console.error('Error analyzing image in chat via EdenAI fallback:', err);
    return '';
  }
}

function buildPromptText(
  cleanText: string,
  imageDesc?: string,
  isVoice?: boolean,
  voiceDuration?: number
): string {
  const trimmed = (cleanText || '').trim();
  let textPart = trimmed;
  if (isVoice) {
    const durStr = voiceDuration && voiceDuration > 0 ? ` (المدة: ${Math.round(voiceDuration)} ثانية)` : '';
    textPart = `[رسالة صوتية مسجلة بصوت الطالب${durStr} - تم تفريغها نصياً بدقة]: "${trimmed || 'استمع إلى تسجيلي الصوتي وأجبني'}"`;
  }

  if (imageDesc) {
    const questionPart = textPart || 'قم بقراءة وحل وشرح المسألة أو المحتوى الظاهر في الصورة بالتفصيل وفق المنهج المصري المعتمد.';
    return `[صورة ملتقطة بالكاميرا / مرفقة من الطالب${isVoice ? ' بجانب رسالته الصوتية' : ''}: ${imageDesc}]\n\nطلب أو سؤال الطالب حول الصورة: ${questionPart}`;
  }
  return textPart;
}

const HEAD_HOLD_CHARS = 280;
const RELATED_EXCERPT_RELEVANCE = 0.6;
// ─── Main POST Handler ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let heldSlotUser: string | null = null;
  try {
    let { message, grade_level, subject_name, session_id, history, thinking, mode } = await req.json();
    if (typeof message !== 'string' || typeof subject_name !== 'string' || message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: 'invalid_request', message: 'بيانات الرسالة غير صالحة.' }, { status: 400 });
    }
    if (typeof grade_level === 'string') grade_level = grade_level.trim();
    subject_name = subject_name.trim();

    const isThinkingEnabled = !!thinking;
    const chatMode: ChatMode = VALID_MODES.includes(mode) ? mode : 'detailed';

    if (!message || !subject_name) {
      return NextResponse.json(
        { error: 'حقل الرسالة واسم المادة مطلوبان' },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get('Authorization');
    const deviceIdHeader = req.headers.get('x-device-id');

    let userId: string | null = null;
    let deviceId: string | null = deviceIdHeader || null;
    let profile: any = null;
    let targetGrade = '';
    let plan = 'free';
    let coins = 0.0;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      userId = verifySessionToken(token);
      if (userId) {
        const sessionCheck = await db.validateUserSessionDevice(userId, token, deviceId || undefined);
        if (!sessionCheck.valid) {
          return NextResponse.json(
            {
              error: 'device_session_revoked',
              code: 'device_session_revoked',
              message: 'تم تسجيل الخروج لأن هذا الحساب تم تسجيل الدخول إليه من جهاز آخر أو تجاوز الحد المسموح للأجهزة (3 أجهزة).'
            },
            { status: 401 }
          );
        }
      }
    }

    if (!userId) {
      return NextResponse.json(
        {
          error: 'login_required',
          code: 'login_required',
          message: 'يجب تسجيل الدخول أو إنشاء حساب جديد لتجربة EGS AI وبدء المذاكرة.'
        },
        { status: 401 }
      );
    }

    profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json(
        { error: 'user_not_found', code: 'user_not_found', message: 'لم يتم العثور على حساب المستخدم أو تم حذفه.' },
        { status: 401 }
      );
    }

    plan = profile.plan_type || 'free';
    coins = profile.coins === undefined ? 0.0 : profile.coins;
    targetGrade = profile.grade_level?.trim();

    const isSubscribed = plan && plan !== 'free' && profile.subscription_status === 'active';
    const hasUnlimitedCredit = profile.role === 'admin' || !!profile.unlimited_credit;
    const activeThinking = (isSubscribed || hasUnlimitedCredit) ? isThinkingEnabled : false;

    if (!hasUnlimitedCredit && coins <= 0) {
      return NextResponse.json({
        error: 'limit_reached',
        plan: plan,
        message: isSubscribed
          ? 'لقد استنفدت رصيد النقاط المتاح لك لهذا اليوم. سيتجدد رصيدك تلقائياً غداً.'
          : 'لقد استنفدت رصيدك اليومي المجاني. سيتجدد رصيدك تلقائياً غداً، أو اشترك الآن في باقة Pro لمتابعة المذاكرة ونموذج التفكير المعمق!'
      }, { status: 429 });
    }

    // Resolve or auto-create Chat Session
    let activeSessionId = session_id;
    if (activeSessionId) {
      const existingSession = await db.getChatSession(activeSessionId);
      if (existingSession) {
        // Ownership check: session belongs to user
        if (userId && existingSession.user_id && existingSession.user_id !== userId) {
          return NextResponse.json(
            { error: 'forbidden', message: 'ليس لديك صلاحية للوصول إلى هذه المحادثة.' },
            { status: 403 }
          );
        }
        // Authoritatively bind subject_name and grade_level from the open chat session
        if (existingSession.subject_name) {
          subject_name = existingSession.subject_name.trim();
        }
        if (existingSession.grade_level) {
          targetGrade = existingSession.grade_level.trim();
        }
        if ((existingSession.mode || 'detailed') !== chatMode) {
          await db.updateChatSessionMode(activeSessionId, chatMode);
        }
      }
    }

    if (!targetGrade) {
      return NextResponse.json(
        { error: 'grade_level_required', message: 'السنة الدراسية مطلوبة لتحديد المنهج المناسب.' },
        { status: 400 }
      );
    }

    // The curriculum may belong to this stage or be shared into it from another stage or system
    const targetCurr = await findCurriculumFor(targetGrade, subject_name);
    if (!targetCurr) {
      return NextResponse.json({
        error: 'course_unavailable',
        message: 'المنهج الدراسي غير متوفر حالياً. (The course is unavailable.)'
      }, { status: 400 });
    }

    const curriculumUnits = (await getCurriculumStructure(targetGrade, subject_name)).units;
    const parsedMsg = parseMessage(message);
    if (parsedMsg.cleanText.length > MAX_TEXT_CHARS) {
      return NextResponse.json(
        { error: 'message_too_long', message: `الرسالة طويلة جداً. الحد الأقصى ${MAX_TEXT_CHARS} حرف.` },
        { status: 413 }
      );
    }

    if (!(await acquireAiSlot(userId))) {
      return NextResponse.json(AI_BUSY_RESPONSE, { status: 429 });
    }
    heldSlotUser = userId;

    if (!activeSessionId) {
      let sessionTitle = '';
      if (parsedMsg.cleanText && parsedMsg.cleanText.trim().length > 0) {
        const clean = parsedMsg.cleanText.trim();
        sessionTitle = clean.length > 35 ? clean.substring(0, 35) + '...' : clean;
      } else if (parsedMsg.isVoice && parsedMsg.hasImage) {
        sessionTitle = 'تسجيل صوتي مع صورة';
      } else if (parsedMsg.isVoice) {
        sessionTitle = 'تسجيل صوتي';
      } else if (parsedMsg.hasImage) {
        sessionTitle = parsedMsg.imageDesc ? (parsedMsg.imageDesc.length > 35 ? parsedMsg.imageDesc.substring(0, 35) + '...' : parsedMsg.imageDesc) : 'سؤال من صورة';
      } else {
        sessionTitle = 'محادثة جديدة';
      }
      const newSession = await db.createChatSession(sessionTitle, subject_name, targetGrade, userId, undefined, chatMode);
      activeSessionId = newSession.id;
    }

    let isCurriculumActive = false;
    try {
      const activeCurrsRaw = await db.getSystemSetting('active_curriculum_ids');
      if (activeCurrsRaw) {
        const activeIds = JSON.parse(activeCurrsRaw);
        isCurriculumActive = activeIds.includes(targetCurr.id);
      } else {
        isCurriculumActive = true;
      }
    } catch (e) {
      isCurriculumActive = true;
    }

    const { cleanText, imageDesc: initialImageDesc, imageBase64, imageMime, isVoice, voiceDuration } = parsedMsg;
    let promptText = buildPromptText(cleanText, initialImageDesc, isVoice, voiceDuration);

    // Save user message before streaming; photos and voice notes go to object storage, not the row
    const storedMessage = (parsedMsg.hasImage || isVoice) ? await offloadInlineMedia(message, userId as string) : message;
    await db.addChatMessage('user', storedMessage, userId, undefined, activeSessionId);

    // Fetch recent message history (prior to the current turn)
    let recentHistory: any[] = [];
    let ongoingLessonTitle: string | null = null;
    let roadmapMsg: any = null;

    const rawHistory = await db.getChatHistory(undefined, undefined, activeSessionId, 60);
    const priorHistory = (rawHistory && rawHistory.length > 0)
      ? rawHistory.slice(0, -1)
      : sanitizeClientHistory(history);

    if (priorHistory && priorHistory.length > 0) {
      // Check if session has an active lesson explanation roadmap that is not yet completed
      roadmapMsg = [...priorHistory].reverse().find((m: any) =>
        m.sender === 'ai' && (m.message.includes('مقسم إلى') || m.message.includes('نقاط أساسية'))
      );
      if (roadmapMsg) {
        const lastNavMsg = [...priorHistory].reverse().find((m: any) =>
          m.sender === 'ai' && m.message.includes('[LESSON_NAV]')
        );
        const isLessonAlreadyCompleted = !!lastNavMsg && /"is_completed"\s*:\s*true/.test(lastNavMsg.message);

        if (!isLessonAlreadyCompleted) {
          const match1 = roadmapMsg.message.match(/درسنا اليوم هو\s+([^\n،,]+?)(?:\s+يا بطل|\s*،|\s*والدرس)/);
          const match2 = roadmapMsg.message.match(/درس\s+([^\n،,]+?)\s+مقسم إلى/);
          ongoingLessonTitle = (match1 && match1[1]?.trim()) || (match2 && match2[1]?.trim()) || null;
        }
      }

      // Preserve up to 14 prior messages; anchor the roadmap message at the front if evicted
      let selectedHistory = priorHistory.slice(-14);
      if (roadmapMsg && !selectedHistory.some((m: any) => m.id && m.id === roadmapMsg.id)) {
        selectedHistory = [roadmapMsg, ...selectedHistory];
      }

      recentHistory = selectedHistory.map((h: any) => {
        const { cleanText: hText, imageDesc: histDesc, isVoice: hVoice, voiceDuration: hDuration } = parseMessage(h.message);
        return {
          sender: h.sender,
          message: buildPromptText(hText, histDesc, hVoice, hDuration)
        };
      });
    }

    const encoder = new TextEncoder();
    const billedProfile = profile;
    const billedUserId = userId;
    let clientGone = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: object | string) => {
          if (clientGone) return;
          try {
            controller.enqueue(encoder.encode(typeof payload === 'string' ? payload : `data: ${JSON.stringify(payload)}\n\n`));
          } catch {
            clientGone = true;
          }
        };
        const close = () => {
          try { controller.close(); } catch {}
        };
        function emitSearchStep(step: string, icon: string, msg: string) {
          send({ type: 'search_step', step, icon, message: msg });
        }

        // Every paid step is recorded here and billed exactly once in `finally`, even if the student disconnects.
        const meteredUsage: TokenUsage[] = [];
        let providerUsage: TokenUsage | null = null;
        let generatedChars = 0;
        let estimateInputChars = 0;
        let charge: ChargeResult | null = null;
        const settle = async () => {
          if (charge) return charge;
          const main = providerUsage ?? (generatedChars > 0 ? estimateUsage(estimateInputChars, generatedChars) : null);
          const usages = main ? [...meteredUsage, main] : (clientGone ? meteredUsage : []);
          charge = await chargeForUsage(billedProfile, usages);
          return charge;
        };

        try {
          // ─── IN-STREAM IMAGE ANALYSIS (if attached) ─────────────────────
          if (imageBase64) {
            emitSearchStep('image_analysis', '🔍', 'تحليل الصورة');
            let desc = initialImageDesc;
            if (!desc) {
              desc = await analyzeImageWithEdenAI(imageBase64, imageMime || 'image/jpeg');
              if (desc) meteredUsage.push(VISION_USAGE);
            }
            if (desc) {
              promptText = buildPromptText(cleanText, desc, isVoice, voiceDuration);
            }
          }

          // ─── PHASE 1: Build RAG Context ─────────────────────────────────
          let ragContext = '';
          let redirectMessage = '';
          let answerScope: AnswerScope = 'general';
          let scopeLesson = '';
          let scopeConcept = '';
          let scopeReasoning = false;
          let isLessonExplanationActive = false;
          let lessonMode: LessonMode = 'none';
          const activeSubject = targetCurr.subject_name;
          const activeGrade = targetCurr.grade_level;

          if (!imageBase64 && isVoiceCapabilityInquiry(cleanText)) {
            emitSearchStep('capabilities', '🎙️', 'التعرف على إمكانيات الرسائل الصوتية...');
            ragContext = `[توجيه استفسار عن إمكانيات الرسائل الصوتية والتسجيل الصوتي]:
الطالب يستفسر عما إذا كان يمكنه إرسال رسائل صوتية (فويس نوت) أو التحدث بالميكروفون أو هل الذكاء الاصطناعي يدعم استقبال وفهم الصوت.
أجب الطالب بأسلوب هادئ وواثق وذكي ومهذب بالعامية المصرية التعليمية الراقية دون مبالغة:
1. أكد له بكل وضوح واطمئنان أنك تدعم استقبال وفهم الرسائل الصوتية كمدخل أساسي واعتيادي (لست نموذجاً نصياً فقط أبداً).
2. وضّح له أنه يستطيع تسجيل سؤاله أو استفساره بصوته مباشرة عبر الضغط على زر الميكروفون (أيقونة الميكروفون بجانب خانة الكتابة) والتحدث بحرية، كما يمكنه إرفاق صورة مع الرسالة الصوتية في نفس الوقت.
3. أكد له أنك ستستمع لكل تفاصيل سؤاله وتشرحها وتحلها له خطوة بخطوة وفق المنهج المصري لمادة "${subject_name}".
4. ادعه بهدوء وثقة لتجربة تسجيل رسالة صوتية الآن بالسؤال أو المسألة التي تشغله لتبدأ في شرحها معه.
استثناء حاسم: يمنع منعاً باتاً إصدار أي تنبيه بأن المعلومة خارج المنهج أو أنك نموذج نصي فقط.`;
          } else if (!imageBase64 && isImageCapabilityInquiry(cleanText)) {
            emitSearchStep('capabilities', '📷', 'التعرف على إمكانيات الكاميرا والصور...');
            ragContext = `[توجيه استفسار عن إمكانيات الكاميرا والصور والمرفقات]:
الطالب يستفسر عن إمكانية إرسال أو التقاط أو رفع الصور أو استخدام الكاميرا لحل الأسئلة والمسائل أو هل الذكاء الاصطناعي يدعم الصور.
أجب الطالب بأسلوب هادئ وواثق وذكي ومهذب بالعامية المصرية التعليمية الراقية دون مبالغة:
1. أكد له بكل وضوح واطمئنان أنك تدعم استقبال وقراءة وتحليل صور الكاميرا والمرفقات كمدخل أساسي واعتيادي (لست نموذجاً نصياً فقط أبداً).
2. وضّح له أنه يستطيع تصوير أي مسألة أو معادلة أو رسم بياني أو صفحة في كتابه أو كشكوله مباشرة عبر زر الكاميرا (أيقونة الكاميرا بجانب خانة الكتابة)، أو رفع صورة جاهزة من جهازه عبر زر إرفاق الصور.
3. أكد له أنك ستقرأ كل تفاصيل الصورة والمسائل والرسومات بدقة تامة وستشرحها وتحلها خطوة بخطوة وفق المنهج المصري لمادة "${subject_name}".
4. ادعه بهدوء وثقة لتجربة تصوير أي مسألة أو سؤال أمامه الآن والضغط على إرسال لتبدأ في تحليلها وشرحها معه.
استثناء حاسم: يمنع منعاً باتاً إصدار أي تنبيه بأن المعلومة خارج المنهج أو أنك نموذج نصي فقط.`;
          } else if (!imageBase64 && isConversationalGreeting(cleanText)) {
            emitSearchStep('greeting', '✨', 'أهلاً بك...');
            const studentGreetingName = profile?.name && profile.name !== 'طالب جديد' ? profile.name : '';
            ragContext = `أنت في محادثة ترحيبية افتتاحية مع الطالب${studentGreetingName ? ` (${studentGreetingName})` : ''}.
1. رحب بالطالب بلهجة مصرية تعليمية مهذبة وذكية وراقية، دون أي مدح مصطنع أو مجاملات مبالغ فيها، ودون استخدام ألقاب متكررة مثل "يا بطل" أو "يا دكتور".
2. عرف بنفسك باختصار شديد بأنك معلمه ومساعده الذكي في مادة "${subject_name}".
3. وضّح له باحترافية أنك جاهز لمساعدته في: شرح أي درس بالتفصيل، إيضاح أي نقطة غير مفهومة، حل المسائل والتدريبات خطوة بخطوة (سواء كتابة أو بتصوير المسألة بالكاميرا مباشرة أو إرفاق صورتها)، أو توليد اختبارات تدريبية سريعة.
4. اقترح عليه البدء بسؤال محدد أو تحديد النقطة التي يريد استيعابها أو مراجعة أي موضوع في المنهج، بأسلوب واثق وذكي ومباشر.
5. استثناء حاسم: يمنع منعاً باتاً إصدار أي تنبيه بأن المعلومة خارج المنهج للتحيات والترحيب.`;
          } else if (isCurriculumActive) {
            emitSearchStep('analyzing', '🧠', 'أحلل سؤالك...');
            meteredUsage.push(RAG_OVERHEAD_USAGE);

            // Warm the in-memory retrieval corpus while the question is being analyzed
            getCurriculumCorpus(targetCurr.id).catch(() => {});
            const lessonMap = curriculumUnits.flatMap(u => u.lessons.map(l => ({ title: l.title, subtopics: l.subtopics })));
            const conversation = recentHistory
              .slice(-4)
              .map(h => `${h.sender === 'user' ? 'الطالب' : 'المعلم'}: ${h.message.replace(/<thought[\s\S]*?<\/thought>/g, '').replace(/\[(QUIZ_QUESTION|CREATE_EXAM|CREATE_FLASHCARDS|LESSON_NAV)\][\s\S]*?\[\/\1\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 400)}`)
              .join('\n');

            const intelligence = await analyzeQueryIntelligence(promptText, subject_name, `${getGradeDisplayName(targetGrade)} (${targetGrade})`, lessonMap, conversation);
            const retrievalQuery = intelligence.standaloneQuery || promptText;

            // The fixed redirect refuses to answer, so it needs the classifier flag, a recognizably unrelated subject
            // family, and none of the question's core terms appearing in this textbook. Anything less is answered.
            let isSubjectMismatch = intelligence.isDifferentSubject === true &&
              isClearlyDifferentSubject(subject_name, intelligence.detectedSubject);
            if (isSubjectMismatch) {
              const terms = intelligence.arabicKeywords.slice(0, 3);
              const inTextbook = await Promise.all(terms.map(t => curriculumTextContains(targetCurr.id, t).catch(() => true)));
              isSubjectMismatch = terms.length > 0 && !inTextbook.some(Boolean);
            }
            const isGradeMismatch = intelligence.isDifferentGrade === true;

            if (isSubjectMismatch || isGradeMismatch) {
              emitSearchStep('checking', '🔍', 'التحقق من المادة والصف الدراسي...');
              // The redirection text is fixed product copy, so it is served directly instead of trusting the model to stop there
              redirectMessage = buildBoundaryRedirectMessage(
                subject_name,
                targetGrade,
                isSubjectMismatch && isGradeMismatch ? 'both' : isSubjectMismatch ? 'subject' : 'grade',
                isEnglishSubject(subject_name) || isEnglishText(cleanText)
              );
            } else {

            const isSinglePointDoubt = isSinglePointQuestion(cleanText);

            // Check if user specifically requested interactive step-by-step mode
            const isExplicitStepByStep = /(?:خطوة بخطوة|نقطة بنقطة|خطوة خطوة|نقطة نقطة|تفاعلي|جزئية بجزئية|امشي معايا)/i.test(cleanText);

            // Check if current user turn is an explicit lesson navigation action or check question response
            const hasLessonNavAction = /(?:الانتقال إلى النقطة التالية|النقطة التالية|النقطة التانية|انقل للنقطة|النقطة اللي بعدها|كمل النقطة|فهمت كمل|استمر في الشرح وتفصيل هذه النقطة|لم أفهم، وضح بمثال إضافي|وضح بمثال إضافي)/i.test(cleanText) ||
              /^(?:الخيار\s+)?[أابجد](?:\s*|\.)$/i.test(cleanText.trim()) ||
              /^(?:صح|خطأ)$/i.test(cleanText.trim());

            const isContinuityAnswer = !!ongoingLessonTitle && !isSinglePointDoubt && hasLessonNavAction;

            // Lesson explanation request (either explicitly saying 'كامل' or asking to explain a lesson/chapter)
            const isLessonRequest = !isSinglePointDoubt && (
              intelligence.isLessonExplanation ||
              /(?:شرح كامل|شرح شامل|الدرس كامل|كل نقاط الدرس|ذاكر معايا الدرس|من البداية بالكامل|شرح الدرس|اشرح الدرس|اشرح لي الدرس|اشرحلي الدرس)/i.test(cleanText) ||
              /(?:اشرح|شرح|ذاكر|ابدأ|عايز شرح|عاوز شرح|ممكن شرح|ممكن تشرح|فهمني)\s+(?:لي\s+)?(?:معايا\s+)?(?:الدرس|درس)\s+([^؟?!.\n]+)/i.test(cleanText) ||
              /(?:الدرس|درس)\s+([^؟?!.\n]+?)\s+(?:شرح كامل|كامل|بالكامل|شامل|من البداية|شرح|بالتفصيل)/i.test(cleanText)
            );

            lessonMode = 'none';
            if (isContinuityAnswer || (isExplicitStepByStep && isLessonRequest)) {
              lessonMode = 'step_by_step';
            } else if (isLessonRequest) {
              lessonMode = 'full_lesson';
            }

            const targetLessonCandidate = (isContinuityAnswer ? ongoingLessonTitle : null) ||
              (isLessonRequest ? (intelligence.lessonTitle || cleanText) : null);

            if (targetLessonCandidate) {
              emitSearchStep('lesson_search', '📖', `أجمع جميع نقاط ومحاور الدرس من المنهج المعتمد...`);
              let exhaustiveLesson = await getExhaustiveLessonContext(activeGrade, activeSubject, targetLessonCandidate);
              if (!exhaustiveLesson.success && targetLessonCandidate !== cleanText) {
                exhaustiveLesson = await getExhaustiveLessonContext(activeGrade, activeSubject, cleanText);
              }

              if (exhaustiveLesson.success && exhaustiveLesson.contextText.length > 80) {
                isLessonExplanationActive = true;
                answerScope = 'curriculum';
                const curriculumMap = formatCurriculumMap(curriculumUnits);
                ragContext = curriculumMap ? `${curriculumMap}\n\n${exhaustiveLesson.contextText}` : exhaustiveLesson.contextText;
                emitSearchStep(
                  'lesson_ready',
                  '✅',
                  lessonMode === 'full_lesson'
                    ? `تم تحضير الشرح الكامل والشامل لدرس "${exhaustiveLesson.lessonTitle}" من المنهج المعتمد`
                    : `تم حصر جميع محاور وتفاصيل درس "${exhaustiveLesson.lessonTitle}" بالكامل دون إغفال أي جزئية`
                );
              } else {
                lessonMode = 'none';
              }
            }

            if (!isLessonExplanationActive) {
              if (intelligence.scope === 'casual' || intelligence.scope === 'non_academic') {
                answerScope = intelligence.scope;
                ragContext = formatCurriculumMap(curriculumUnits);
              } else {
                emitSearchStep('searching', '🔍', intelligence.searchAnnouncement);
                emitSearchStep('graph_traversal', '🕸️', 'أتتبع المفاهيم المرتبطة بسؤالك في المنهج...');
                const retrieval = await retrieveCurriculumContext({
                  curriculumId: targetCurr.id,
                  question: retrievalQuery,
                  queries: [retrievalQuery, ...intelligence.searchQueries, cleanText],
                  hydePassage: intelligence.hydePassage,
                  keywords: [...intelligence.arabicKeywords, ...intelligence.englishKeywords],
                  units: curriculumUnits
                });
                emitSearchStep('fusion', '⚡', 'رتبت أدق مقتطفات الكتاب حسب صلتها بسؤالك');
                ragContext = retrieval.formattedContext;

                if (intelligence.queryType === 'overview') {
                  emitSearchStep('summary', '📚', 'أستعرض محاور المنهج الشاملة...');
                  const [summary, outline] = await Promise.all([
                    db.getCurriculumSummary(activeGrade, activeSubject),
                    db.getFullCurriculumOutline(activeGrade, activeSubject)
                  ]);
                  const overviewPrefix = [
                    summary ? `ملخص المنهج الشامل:\n${summary}` : '',
                    outline.length ? `محاور المنهج الدراسي:\n${outline.map((h, i) => `${i + 1}. ${h}`).join('\n')}` : ''
                  ].filter(Boolean).join('\n\n');
                  if (overviewPrefix) ragContext = `${overviewPrefix}\n\n${ragContext}`;
                }

                const foundCount = retrieval.sections.length;
                emitSearchStep('found', '✅', `وجدت ${foundCount} ${foundCount === 1 ? 'قسماً' : 'أقسام'} ذات صلة من المنهج`);

                const coreConcept = intelligence.arabicKeywords[0];
                const needsTextCheck = intelligence.scope === 'beyond_curriculum' || !intelligence.scope;
                const termInTextbook = needsTextCheck && !!coreConcept
                  ? await curriculumTextContains(targetCurr.id, coreConcept).catch(() => true)
                  : false;
                answerScope = resolveAnswerScope(intelligence, { termInTextbook, topRelevance: retrieval.topRelevance });
                // Loosely related excerpts only invite forced links in general or beyond-curriculum answers
                if (answerScope === 'general' || answerScope === 'beyond') {
                  const related = retrieval.sections.filter(s => (s.relevance ?? 0) >= RELATED_EXCERPT_RELEVANCE).slice(0, 2).map(s => s.chunk);
                  ragContext = [formatCurriculumMap(curriculumUnits), formatSections(related)].filter(Boolean).join('\n\n');
                }
                if (answerScope === 'beyond' && intelligence.relatedLesson) scopeLesson = intelligence.relatedLesson;
                else if (answerScope === 'curriculum') scopeLesson = intelligence.curriculumLesson || '';
                scopeConcept = coreConcept || retrievalQuery;
                scopeReasoning = intelligence.scope === 'curriculum_reasoning' || intelligence.queryType === 'inferential';
              }
              const scopeHint = buildScopeHint(answerScope, scopeLesson, scopeConcept, scopeReasoning);
              if (scopeHint) ragContext = ragContext ? `${scopeHint}\n\n${ragContext}` : scopeHint;
            }
            }
          }

          const finalContext = ragContext || formatCurriculumMap(curriculumUnits) ||
            `=== منهج ${subject_name} (${targetGrade}) ===\nNo textbook section was retrieved for this message. Answer only what is standard for this grade and subject, and apply the CURRICULUM SCOPE rules.`;
          if (clientGone) return;
          const turn: ChatTurn = {
            studentMessage: promptText,
            context: finalContext,
            history: recentHistory,
            thinkingEnabled: activeThinking,
            mode: chatMode,
            lessonMode,
            subjectName: activeSubject,
            gradeLevel: activeGrade
          };
          estimateInputChars = buildChatMessages(turn).reduce((n, m) => n + m.content.length, 0);

          // ─── PHASE 2: Real-time Streaming Generation with DeepSeek ─────────
          const deepseekRes = redirectMessage
            ? staticChatCompletionStream(redirectMessage)
            : await generateChatResponseStream(turn);

          if (!deepseekRes.ok) {
            const errorText = await deepseekRes.text();
            console.error('DeepSeek stream error:', errorText);
            send({ type: 'error', message: 'فشل الاتصال بمزود الذكاء الاصطناعي.' });
            return;
          }

          const reader = deepseekRes.body?.getReader();
          const decoder = new TextDecoder('utf-8');
          if (!reader) return;

          let fullThought = '';
          let fullContent = '';
          const thoughtStartTime = Date.now();
          let streamBuffer = '';

          // Outside genuinely beyond-curriculum answers, a leading "this is outside the curriculum" line is always
          // wrong, so the first line is held back until it can be checked.
          let headBuffer = '';
          let headResolved = answerScope === 'beyond' || !!redirectMessage;
          const emitContent = (text: string) => {
            if (!text) return;
            fullContent += text;
            send({ type: 'content', content: text });
          };
          const resolveHead = () => {
            headResolved = true;
            const newline = headBuffer.indexOf('\n');
            const firstLine = newline >= 0 ? headBuffer.slice(0, newline) : headBuffer;
            emitContent(isScopeDisclaimerLine(firstLine) ? headBuffer.slice(firstLine.length).trimStart() : headBuffer);
          };
          const pushContent = (text: string) => {
            if (headResolved) return emitContent(text);
            headBuffer += text;
            const trimmed = headBuffer.trimStart();
            if (trimmed.includes('\n') || trimmed.length >= HEAD_HOLD_CHARS) resolveHead();
          };

          while (true) {
            if (clientGone) {
              await reader.cancel().catch(() => {});
              break;
            }
            const { done, value } = await reader.read();
            if (done) break;

            streamBuffer += decoder.decode(value, { stream: true });
            const lines = streamBuffer.split('\n');
            streamBuffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') break;

              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.usage) providerUsage = usageFromProvider(parsed.usage);

                const delta = parsed.choices?.[0]?.delta;
                if (!delta) continue;

                if (delta.reasoning_content) {
                  fullThought += delta.reasoning_content;
                  if (!redirectMessage) generatedChars += delta.reasoning_content.length;
                  send({ type: 'thought', content: delta.reasoning_content });
                } else if (delta.content) {
                  if (!redirectMessage) generatedChars += delta.content.length;
                  pushContent(delta.content);
                }
              } catch {}
            }
          }
          if (clientGone) return;
          if (!headResolved) resolveHead();

          const thoughtDuration = (Date.now() - thoughtStartTime) / 1000;
          const finalDuration = thoughtDuration > 0 ? thoughtDuration : 0;
          const combinedMessage = fullThought
            ? `<thought duration="${Math.round(finalDuration)}">${fullThought}</thought>${fullContent}`
            : fullContent;

          const { points: coinsCost, remaining: remainingCoins, peak, fairUse } = await settle();
          const savedAiMsg = await db.addChatMessage('ai', combinedMessage, billedUserId, undefined, activeSessionId, coinsCost);

          let pointsAwarded = 0;
          let totalPoints: number | undefined = undefined;

          if (activeSessionId) {
            try {
              const session = await db.getChatSession(activeSessionId);
              if (session && !session.engagement_points_awarded) {
                const isEngaged = await classifyEngagement(promptText, fullContent);
                if (isEngaged) {
                  pointsAwarded = 3;
                  totalPoints = await db.addPoints(billedUserId, 3);
                  await db.updateChatSessionEngagement(activeSessionId);
                }
              }
            } catch (err) {
              console.error('Error evaluating engagement points in chat:', err);
            }
          }

          send({
            type: 'done',
            session_id: activeSessionId,
            subject_name: subject_name,
            message_id: savedAiMsg?.id || undefined,
            duration: finalDuration,
            coins_used: coinsCost,
            remaining_coins: remainingCoins,
            peak_rate: peak,
            fair_use_rate: fairUse,
            points_awarded: pointsAwarded,
            total_points: totalPoints
          });
          send('data: [DONE]\n\n');
        } catch (err: any) {
          console.error('Chat stream exception:', err);
          send({ type: 'error', message: 'حدث خطأ غير متوقع أثناء معالجة الرد.' });
        } finally {
          try {
            await settle();
          } catch (billingErr) {
            console.error('Chat billing error:', billingErr);
          }
          await releaseAiSlot(billedUserId);
          close();
        }
      },
      cancel() {
        clientGone = true;
      }
    });
    heldSlotUser = null;

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });

  } catch (error: any) {
    console.error('Chat endpoint error:', error);
    if (heldSlotUser) await releaseAiSlot(heldSlotUser);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء معالجة الطلب.' },
      { status: 500 }
    );
  }
}