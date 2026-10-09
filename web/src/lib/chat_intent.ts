/**
 * Deterministic reading of chat messages before (or instead of) the query classifier: fast-lane greetings and
 * capability questions, lesson requests and step-lesson navigation, and the conversation digest the classifier
 * uses to resolve short replies.
 */

export type HistoryMessage = { id?: string; sender: 'user' | 'ai'; message: string };

const PUNCTUATION = /[؟?!.،,;:~`@#$%^&*()_+\-=\[\]{}'"]/g;

function plain(text: string): string {
  return (text || '').replace(PUNCTUATION, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

const GREETINGS = new Set([
  'سلام', 'سلام عليكم', 'السلام عليكم', 'السلام عليكم ورحمة الله', 'وعليكم السلام', 'أهلا', 'اهلا', 'مرحبا', 'مرحباً',
  'هاي', 'هلو', 'hi', 'hello', 'hey', 'صباح الخير', 'مساء الخير', 'صباح النور', 'مساء النور', 'صباح الورد', 'مساء الورد',
  'ازيك', 'ازي حضرتك', 'إزيك', 'عامل ايه', 'اخبارك', 'أخبارك', 'شخبارك',
  'مين انت', 'أنت مين', 'انت مين', 'مين حضرتك', 'عرفني بنفسك', 'بتعمل ايه', 'تقدر تساعدني ازاي', 'تقدر تعمل ايه',
  'عاوز اذاكر', 'عايز اذاكر', 'ممكن تساعدني', 'محتاج مساعدة', 'يلا نذاكر', 'ابدأ معايا',
  'يا مستر', 'يا استاذ', 'يا باشا', 'يا دكتور', 'يا بشمهندس'
]);
const GREETING_PREFIXES = ['ازيك', 'إزيك', 'السلام عليكم', 'سلام عليكم', 'صباح الخير', 'مساء الخير', 'أهلا', 'اهلا', 'مرحبا'];

/** An opening greeting or "who are you". Only meaningful at the start of a conversation. */
export function isConversationalGreeting(text: string): boolean {
  const clean = plain(text);
  if (!clean || clean.length > 60) return false;
  return GREETINGS.has(clean) || GREETING_PREFIXES.some(p => clean.startsWith(p) && clean.length < 30);
}

const ACK_WORDS = new Set([
  'تمام', 'ماشي', 'ماشى', 'اوك', 'أوك', 'ok', 'okay', 'اه', 'آه', 'ايوه', 'أيوه', 'ايوة', 'أيوة', 'نعم', 'يلا', 'يالا',
  'فهمت', 'فاهم', 'واضح', 'واضحة', 'اشطه', 'اشطة', 'حلو', 'جميل', 'كمل', 'كمّل', 'استمر', 'التالي', 'التالية', 'كده',
  'خلاص', 'بس', 'يا', 'مستر', 'استاذ', 'next', 'yes', 'yeah', 'yep', 'got', 'it', 'continue', 'go', 'on', 'ياريت', 'طيب'
]);

const ACK_FILLERS = new Set(['يا', 'بس', 'كده', 'مستر', 'استاذ', 'got', 'it', 'go', 'on']);

/** "تمام", "اه كمل", "فهمت": a short acknowledgement whose meaning depends on the tutor's last message. */
export function isAcknowledgement(text: string): boolean {
  const words = plain(text).split(' ').filter(Boolean);
  return words.length > 0 && words.length <= 4 && words.every(w => ACK_WORDS.has(w)) && words.some(w => !ACK_FILLERS.has(w));
}

const CONFUSION = /(?:مش فاهم|مش فاهمه|مفهمتش|ما فهمتش|مافهمتش|مش واضح|مش مستوعب|مش قادر افهم|مش عارف افهم|وضح اكتر|وضح أكتر|وضحها|اشرح تاني|اشرحها تاني|اشرحلي تاني|بطريقة تانية|بطريقه تانيه|بطريقة أبسط|بطريقه ابسط|ابسط من كده|أبسط من كده|لم أفهم|لم افهم|i don'?t understand|didn'?t get it)/i;

/** "مش فاهم", "اشرحها تاني بطريقة أبسط": the student did not understand the last explanation. */
export function isConfusionSignal(text: string): boolean {
  const clean = (text || '').trim();
  return clean.length <= 120 && CONFUSION.test(clean);
}

const NAV_ACTION = /(?:الانتقال إلى النقطة التالية|النقطة التالية|النقطة التانية|النقطة الجاية|انقل للنقطة|النقطة اللي بعدها|كمل النقطة|فهمت كمل|استمر في الشرح|وضح بمثال إضافي)/;

/** A move inside an ongoing step-by-step lesson: next point, acknowledgement, confusion, or an answer to its check question. */
export function isLessonNavAction(text: string): boolean {
  const clean = (text || '').trim();
  return NAV_ACTION.test(clean) || isAcknowledgement(clean) || isConfusionSignal(clean) ||
    /^(?:الخيار\s+)?[أابجد](?:\s*|\.)$/.test(clean) || /^(?:صح|خطأ|غلط|صحيح)$/.test(clean);
}

const LESSON_REQUEST = [
  /(?:شرح كامل|شرح شامل|الدرس كامل|كل نقاط الدرس|ذاكر معايا الدرس|من البداية بالكامل|شرح الدرس|اشرح الدرس|اشرح لي الدرس|اشرحلي الدرس)/,
  /(?:اشرح|شرح|ذاكر|ابدأ|عايز شرح|عاوز شرح|ممكن شرح|ممكن تشرح|فهمني)\s*(?:لي\s+)?(?:معايا\s+)?(?:الدرس|درس)\s+[^؟?!.\n]+/,
  /(?:الدرس|درس)\s+[^؟?!.\n]+?\s+(?:شرح كامل|كامل|بالكامل|شامل|من البداية|شرح|بالتفصيل)/
];

export function isLessonRequestText(text: string): boolean {
  return LESSON_REQUEST.some(re => re.test(text));
}

/** Title of a step-by-step lesson the tutor started in this conversation and has not finished yet. */
export function ongoingStepLesson(history: HistoryMessage[]): { title: string; roadmap: HistoryMessage } | null {
  const reversed = [...history].reverse();
  const roadmap = reversed.find(m => m.sender === 'ai' && (m.message.includes('مقسم إلى') || m.message.includes('نقاط أساسية')));
  if (!roadmap) return null;
  const lastNav = reversed.find(m => m.sender === 'ai' && m.message.includes('[LESSON_NAV]'));
  if (lastNav && /"is_completed"\s*:\s*true/.test(lastNav.message)) return null;
  const title = roadmap.message.match(/درسنا اليوم هو\s+([^\n،,]+?)(?:\s+يا بطل|\s*،|\s*والدرس)/)?.[1]?.trim()
    || roadmap.message.match(/درس\s+([^\n،,]+?)\s+مقسم إلى/)?.[1]?.trim();
  return title ? { title, roadmap } : null;
}

/** Tutor reply without its hidden reasoning, which must never be sent back to the model as history. */
export function stripThought(message: string): string {
  return (message || '').replace(/<thought[^>]*>[\s\S]*?<\/thought>/g, '').trim();
}

const CARD_BLOCKS = /\[(QUIZ_QUESTION|CREATE_EXAM|CREATE_FLASHCARDS|LESSON_NAV)\]([\s\S]*?)\[\/\1\]/g;

function cardSummary(tag: string, json: string): string {
  if (tag !== 'QUIZ_QUESTION') return '';
  try {
    const q = JSON.parse(json.trim());
    const options = Array.isArray(q.options) ? ` (${q.options.join(' / ')})` : '';
    return ` [سؤال تفاعلي: ${q.question}${options}]`;
  } catch {
    return '';
  }
}

/**
 * The last turns as the classifier reads them. Tutor messages keep their opening and their ending, because a
 * question or offer at the end ("تحب نحل مسألة؟") is what a short reply such as "اه" answers.
 */
export function conversationDigest(history: HistoryMessage[], turns = 4): string {
  return history.slice(-turns).map(h => {
    const isAi = h.sender === 'ai';
    const text = stripThought(h.message).replace(CARD_BLOCKS, (_, tag, json) => cardSummary(tag, json)).replace(/\s+/g, ' ').trim();
    const body = !isAi ? text.slice(0, 400) : text.length <= 520 ? text : `${text.slice(0, 200)} ... ${text.slice(-300)}`;
    return `${isAi ? 'المعلم' : 'الطالب'}: ${body}`;
  }).join('\n');
}

const OPTICS_TERMS = /(?:مرآة|مرايا|عدسة|عدسات|تكون الصور|صفات الصورة|خواص الصورة|مسار الأشعة|بؤرة|خيالية|حقيقية|مقلوبة|معتدلة)/i;
const CAMERA_OR_IMAGE = /(?:صورة|صور|صوره|كاميرا|كاميره|تصوير|أصور|اصور|رفع صورة|ارفق صورة|ارفاق صورة|image|images|picture|pictures|photo|photos|camera)/i;
const CAPABILITY_QUESTION = /(?:هل|أقدر|اقدر|تقدر|بتقدر|ينفع|ممكن|عايز|عاوز|كيف|ازاي|طريقة|تدعم|بتدعم|تقبل|بيقبل|بتقبل|تفهم|بيفهم|بتفهم|تشوف|بيشوف|بتشوف|تقرأ|بتقرأ|تستقبل|بتستقبل|يمكنك|تستطيع|بتعرف|تعرف|أبعت|ابعت|ارفع|أرفع|اصور|أصور|can i|do you (?:support|accept|see|read|take)|are you (?:text|multimodal))/i;
const VOICE_TERMS = /(?:صوتية|رسالة صوتية|رسائل صوتية|فويس|فويسات|صوت|تسجيل صوتي|تسجيل صوت|مايك|ميكروفون|تسجيلات|voice|audio|voice[- ]?note)/i;
const VOICE_CAPABILITY = /(?:هل|أقدر|اقدر|تقدر|بتقدر|ينفع|ممكن|عايز|عاوز|كيف|ازاي|طريقة|تدعم|بتدعم|تقبل|بيقبل|بتقبل|تسمع|بيسمع|بتسمع|تفهم|بيفهم|بتفهم|تستقبل|بتستقبل|تتكلم|اتكلم|أبعت|ابعت|اسجل|أسجل|can i|do you (?:support|accept|hear|listen))/i;

/** "ينفع أبعتلك صورة المسألة؟" (never an optics question about images formed by mirrors or lenses). */
export function isImageCapabilityInquiry(text: string): boolean {
  const clean = plain(text);
  if (!clean || clean.length > 150 || OPTICS_TERMS.test(clean)) return false;
  return /(?:نصي فقط|نصوص بس|كلام بس|text[- ]?only)/i.test(clean) || (CAMERA_OR_IMAGE.test(clean) && CAPABILITY_QUESTION.test(clean));
}

/** "ينفع أسجلك فويس؟" */
export function isVoiceCapabilityInquiry(text: string): boolean {
  const clean = plain(text);
  if (!clean || clean.length > 150) return false;
  return VOICE_TERMS.test(clean) && VOICE_CAPABILITY.test(clean);
}
