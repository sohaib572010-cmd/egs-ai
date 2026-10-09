const EDENAI_API_KEY = process.env.EDENAI_API_KEY || '';
const EDENAI_BASE = 'https://api.edenai.run/v2';
const ALIBABA_API_KEY = process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || '';
const ALIBABA_API_BASE = process.env.ALIBABA_API_BASE || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * How a question relates to the student's curriculum:
 * - curriculum: taught in the textbook.
 * - curriculum_reasoning: not stated verbatim but answered by reasoning from textbook concepts
 *   (applications, inference, "what if", real-life phenomena, multi-lesson problems). In scope.
 * - beyond_curriculum: an academic point of this subject that the textbook does not teach and the student
 *   could mistake for exam material (a later-grade law, rule, method or detail).
 * - general_education: general knowledge, curiosity, study skills or learning advice not tied to the book.
 * - casual: greetings, thanks, small talk, feelings about studying.
 * - non_academic: requests unrelated to learning.
 */
export type QueryScope =
  | 'curriculum'
  | 'curriculum_reasoning'
  | 'beyond_curriculum'
  | 'general_education'
  | 'casual'
  | 'non_academic';

export const QUERY_SCOPES: QueryScope[] = [
  'curriculum', 'curriculum_reasoning', 'beyond_curriculum', 'general_education', 'casual', 'non_academic'
];

/**
 * What the student is doing with this message, relative to the conversation:
 * - question: a new question or request.
 * - follow_up: continues the previous point ("طب ليه؟", "مثال تاني", "حل واحدة زيها").
 * - confused: did not understand the last explanation ("مش فاهم", "مش واضحة").
 * - answer_attempt: answers a question or exercise the tutor asked.
 * - accept_offer: agrees to something the tutor offered ("اه", "ياريت") or asks to go on ("كمل", "تمام").
 * - chitchat: greetings, thanks, small talk.
 */
export type StudentIntent = 'question' | 'follow_up' | 'confused' | 'answer_attempt' | 'accept_offer' | 'chitchat';

export const STUDENT_INTENTS: StudentIntent[] = ['question', 'follow_up', 'confused', 'answer_attempt', 'accept_offer', 'chitchat'];

export interface QueryIntelligence {
  queryType: 'direct' | 'inferential' | 'overview' | 'problem_solving';
  scope?: QueryScope;
  intent?: StudentIntent;
  arabicKeywords: string[];
  englishKeywords: string[];
  hydePassage: string;          // hypothetical textbook passage for dense retrieval
  standaloneQuery?: string;     // follow-up rewritten as a self-contained textbook question
  searchQueries: string[];      // textbook-phrased sub-queries covering every concept the answer needs
  searchAnnouncement: string;
  isLessonExplanation?: boolean;
  lessonTitle?: string;
  isDifferentSubject?: boolean;
  isDifferentGrade?: boolean;
  curriculumLesson?: string;    // exact map title of the lesson that teaches the asked concept
  relatedLesson?: string;       // closest map lesson for a question outside the curriculum
  detectedSubject?: string;
  detectedGrade?: string;
}

export interface LessonMapEntry {
  title: string;
  subtopics?: string[];
}

// ─── Core AI Model Callers ────────────────────────────────────────────────────

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
// A hung provider must fall through to the fallback chain instead of stalling the student's turn
const TEXT_CALL_TIMEOUT_MS = 15000;
const FALLBACK_CALL_TIMEOUT_MS = 45000;
const VISION_CALL_TIMEOUT_MS = 60000;

export async function callDeepSeekChat(
  prompt: string,
  maxTokens: number = 600,
  temperature: number = 0.1,
  jsonMode: boolean = false
): Promise<string> {
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
  if (!deepseekApiKey) throw new Error('DEEPSEEK_API_KEY is not set');

  const requestBody: any = {
    model: 'deepseek-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens,
    thinking: { type: 'disabled' }
  };

  if (jsonMode) {
    requestBody.response_format = { type: 'json_object' };
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${deepseekApiKey}`
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(TEXT_CALL_TIMEOUT_MS)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const msg = data?.choices?.[0]?.message;
  const content = (msg?.content || '').trim();
  if (content) return content;
  return (msg?.reasoning_content || '').trim();
}

/**
 * Multimodal Visual Analysis using DeepSeek Flash (deepseek-flash, native multimodal).
 * Analyzes diagrams, handwritten formulas, and textbook pages via Base64.
 */
export async function callDeepSeekVision(
  base64Image: string,
  mimeType: string,
  promptText: string,
  maxTokens: number = 4000
): Promise<string> {
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
  if (!deepseekApiKey) throw new Error('DEEPSEEK_API_KEY is not set');

  const cleanBase64 = base64Image.replace(/^data:[^;]+;base64,/, '').trim();
  const normalizedMime = mimeType || 'image/jpeg';

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${deepseekApiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            {
              type: 'image_url',
              image_url: { url: `data:${normalizedMime};base64,${cleanBase64}` }
            }
          ]
        }
      ],
      thinking: { type: 'disabled' },
      temperature: 0,
      max_tokens: maxTokens
    }),
    signal: AbortSignal.timeout(VISION_CALL_TIMEOUT_MS)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek Vision API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const msg = data?.choices?.[0]?.message;
  const content = (msg?.content || '').trim();
  if (content) return content;
  return (msg?.reasoning_content || '').trim();
}

export async function callGeminiFlash(prompt: string, maxTokens: number = 600): Promise<string> {
  if (!EDENAI_API_KEY) throw new Error('EDENAI_API_KEY is not set');

  const response = await fetch(`${EDENAI_BASE}/text/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${EDENAI_API_KEY}`
    },
    body: JSON.stringify({
      providers: 'google',
      model: 'gemini-2-5-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: maxTokens
    }),
    signal: AbortSignal.timeout(FALLBACK_CALL_TIMEOUT_MS)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`EdenAI Gemini error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();

  const googleResult = data?.google;
  if (googleResult?.status === 'fail') {
    throw new Error(`Gemini via EdenAI failed: ${googleResult?.error?.message || 'unknown error'}`);
  }
  return (googleResult?.generated_text || '').trim();
}

/**
 * Executes text intelligence prompt using DeepSeek-V3 as the primary model,
 * with automatic fallback to Gemini Flash via EdenAI if DeepSeek fails.
 */
export async function callTextIntelligence(
  prompt: string,
  maxTokens: number = 600,
  temperature: number = 0.1,
  jsonMode: boolean = false
): Promise<string> {
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      return await callDeepSeekChat(prompt, maxTokens, temperature, jsonMode);
    } catch (deepseekErr) {
      console.warn('DeepSeek text intelligence failed, falling back to Gemini Flash:', deepseekErr);
    }
  }
  return await callGeminiFlash(prompt, maxTokens);
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

export const EMBEDDING_MODEL = 'text-embedding-v4';

/**
 * Generates a 768-dimensional embedding vector using Alibaba Cloud text-embedding-v4.
 * Employs Matryoshka Representation Learning (dimensions: 768) matching the Supabase pgvector schema.
 */
export async function callAlibabaEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || '';
  if (!apiKey || !text || !text.trim()) return [];

  const endpoint = `${ALIBABA_API_BASE}/embeddings`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
        dimensions: 768
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Alibaba embedding error (${res.status}):`, errText.slice(0, 200));
      return [];
    }

    const data = await res.json();
    return data.data?.[0]?.embedding ?? [];
  } catch (err) {
    console.error('Alibaba embedding exception:', err);
    return [];
  }
}

/**
 * Batches text embeddings using Alibaba Cloud text-embedding-v4 (10 items per batch limit).
 * Returns array of 768-dimensional vectors matching input order.
 */
export async function callAlibabaEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || '';
  if (!apiKey || texts.length === 0) return texts.map(() => []);

  const endpoint = `${ALIBABA_API_BASE}/embeddings`;
  const BATCH_SIZE = 10; // DashScope enforces max 10 items per request
  const batches: { texts: string[]; indices: number[] }[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    batches.push({
      texts: slice.map(t => (t || '').slice(0, 8000)),
      indices: slice.map((_, idx) => i + idx)
    });
  }

  const results: number[][] = new Array(texts.length).fill(null).map(() => []);

  // Process in concurrency pools of 3 to prevent 429 rate-limiting and connection hangs
  const CONCURRENCY = 3;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const currentGroup = batches.slice(i, i + CONCURRENCY);
    await Promise.all(
      currentGroup.map(async (batch) => {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: EMBEDDING_MODEL,
              input: batch.texts,
              dimensions: 768
            }),
            signal: AbortSignal.timeout(10000)
          });

          if (!res.ok) {
            const errText = await res.text();
            console.error(`Alibaba batch embedding error (${res.status}):`, errText.slice(0, 200));
            return;
          }

          const data = await res.json();
          const items = data.data || [];
          items.forEach((item: { embedding?: number[]; index?: number }) => {
            const itemIdx = item.index ?? 0;
            if (batch.indices[itemIdx] !== undefined) {
              results[batch.indices[itemIdx]] = item.embedding || [];
            }
          });
        } catch (err) {
          console.error('Alibaba batch embedding exception:', err);
        }
      })
    );
  }

  return results;
}

/**
 * Query and chunk vectors must come from the same model, otherwise pgvector similarity is meaningless.
 * There is deliberately no cross-model fallback: on failure the caller gets [] and retrieval
 * degrades to lexical search, while unembedded chunks stay pending for the admin embed route.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!ALIBABA_API_KEY) return [];
  const vec = await callAlibabaEmbedding(text);
  return vec.length === 768 ? vec : [];
}

export async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0 || !ALIBABA_API_KEY) return texts.map(() => []);
  const vectors = await callAlibabaEmbeddingBatch(texts);
  return vectors.map(v => (v && v.length === 768 ? v : []));
}


// ─── Reranking ────────────────────────────────────────────────────────────────

const RERANK_MODEL = process.env.RERANK_MODEL || 'qwen3-rerank';
const RERANK_INSTRUCT = 'Given an Egyptian school student\'s question, retrieve the textbook passages that contain the facts, definitions, laws, worked examples or principles needed to answer it, including passages needed to reason toward an answer that is not stated directly.';

/**
 * Cross-encoder relevance scores (0..1, same order as `documents`) from Alibaba Cloud qwen3-rerank.
 * Returns null on any failure so callers keep their fusion order.
 */
export async function rerankDocuments(query: string, documents: string[]): Promise<number[] | null> {
  if (!ALIBABA_API_KEY || !query.trim() || documents.length === 0) return null;
  try {
    const res = await fetch(`${new URL(ALIBABA_API_BASE).origin}/api/v1/services/rerank/text-rerank/text-rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ALIBABA_API_KEY}` },
      body: JSON.stringify({
        model: RERANK_MODEL,
        input: { query: query.slice(0, 1500), documents: documents.map(d => d.slice(0, 2400)) },
        parameters: { top_n: documents.length, return_documents: false, instruct: RERANK_INSTRUCT }
      }),
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) {
      console.error(`Rerank error (${res.status}):`, (await res.text()).slice(0, 200));
      return null;
    }
    const data = await res.json();
    const scores = new Array<number>(documents.length).fill(0);
    for (const r of data?.output?.results || []) {
      if (typeof r?.index === 'number' && typeof r?.relevance_score === 'number') scores[r.index] = r.relevance_score;
    }
    return scores;
  } catch (err) {
    console.error('Rerank exception:', err);
    return null;
  }
}

// ─── Query Intelligence ───────────────────────────────────────────────────────

const WHOLE_LESSON_REQUEST = /(?:اشرح|شرح|ذاكر|راجع|ابدأ|فهمني|تشرح)\s*(?:لي|لى)?\s*(?:معايا\s+|معي\s+)?(?:ال)?درس|(?:شرح كامل|شرح شامل|كل نقاط الدرس|الدرس كامل|الدرس بالكامل)/;
const STEP_PHRASES = /(?:نقط[ةه]\s*(?:ب|ورا)?\s*نقط[ةه]|خطو[ةه]\s*(?:ب)?\s*خطو[ةه]|جزئي[ةه]\s*(?:ب)?\s*جزئي[ةه])/g;
const SINGLE_POINT_CUES = /(?:مش فاهم|مش مستوعب|مش واضح|وضحلي|اشرحلي نقطة|نقطة|جزئية|مفهوم|معنى|يعني ايه|يعني إيه|ما هو|ما هي|ماهو|ماهي|ما المقصود|ليه|لماذا|علل|ازاي|إزاي|كيف|ما الفرق|الفرق بين|قارن|سؤال|مسألة|مسأله|احسب|أوجد|اوجد|حل المعادلة|عرف|تعريف|قانون|قوانين|نظرية|متى|أين|هل)/i;

/**
 * True when the student asks about one concept, law, term, or problem (even if a lesson is named
 * for context), as opposed to requesting a whole-lesson explanation. An explicit "explain the lesson"
 * request wins even when the lesson title itself contains a cue word ("اشرح درس قانون بويل").
 */
export function isSinglePointQuestion(text: string): boolean {
  if (WHOLE_LESSON_REQUEST.test(text)) return false;
  return SINGLE_POINT_CUES.test(text.replace(STEP_PHRASES, ' '));
}

/** "نقطة نقطة", "خطوة بخطوة": the student wants a lesson taught one point per message. */
export function isStepByStepRequest(text: string): boolean {
  return new RegExp(STEP_PHRASES.source).test(text) || /(?:تفاعلي|امشي معايا)/.test(text);
}

const QUERY_INTELLIGENCE_INSTRUCTIONS = `You are the query-understanding engine of an AI tutor for the Egyptian national curriculum.
Read the LESSON MAP of the student's textbook, the recent conversation and the student's message, then return ONE JSON object.

READING THE STUDENT: students write in Egyptian dialect, Modern Standard Arabic, English or Franco-Arabic (Arabic in Latin letters with digits: 2=ء, 3=ع, 5=خ, 7=ح, 8=غ, 9=ق), with misspellings, missing hamzas, merged words and voice-transcription errors. Work out what they mean, the way an experienced teacher would, and write every output field in correct textbook terms. Short replies ("اه", "لا", "تمام", "كمل", "مش فاهم", "ب", "عشان كده") only make sense against the teacher's last message: resolve them from the conversation.

FIELDS:
- intent: what the message does in the conversation: "question" (new question or request), "follow_up" (continues the previous point: why, more detail, another example, a similar problem), "confused" (did not understand the last explanation), "answer_attempt" (answers a question, exercise or quiz the teacher asked, even with a single word, letter or number), "accept_offer" (agrees to what the teacher offered or proposed, or asks to go on: "اه", "ياريت", "تمام كمل"), "chitchat" (greeting, thanks, small talk).
- scope: how the message relates to THIS textbook. Decide from the lesson map (titles and subtopics) and your knowledge of what these lessons teach:
  * "curriculum": the asked concept, rule, law, event, text, example or problem type is taught in one of the mapped lessons.
  * "curriculum_reasoning": the answer is not written verbatim in the book but follows by reasoning from concepts the book teaches: applying a law to a new situation, explaining an everyday phenomenon with a lesson's principle, "what happens if", "why", comparisons, multi-lesson problems, exam-style inference questions. This IS the curriculum; prefer it over "beyond_curriculum" whenever the mapped lessons contain the principles needed.
  * "beyond_curriculum": an academic point of THIS subject's discipline that the mapped lessons do not teach and that the student could mistake for exam material (a law, formula, rule, method, event or detail from a later grade or a different branch). Choose it only when you are confident no mapped lesson covers it.
  * "general_education": general knowledge or curiosity the student would not assume is in their syllabus, study skills, exam strategy, learning advice, careers, how the platform works, or a concept from outside this subject asked out of interest.
  * "casual": greetings, thanks, small talk, jokes, feelings or motivation about studying.
  * "non_academic": requests unrelated to learning (recipes, games, celebrities, shopping).
- queryType: "direct" (fact/definition), "inferential" (needs reasoning), "problem_solving" (calculation or exercise), "overview" (whole curriculum or unit).
- isLessonExplanation: true ONLY when the student asks to explain or study a WHOLE lesson ("اشرح درس ...", "عايز شرح الدرس الأول"). A question about one concept, law, term or problem is false even if it names a lesson.
- lessonTitle: the lesson the student wants explained in full (copy the map title when you can), otherwise null.
- curriculumLesson: for scope "curriculum" or "curriculum_reasoning", the EXACT map title of the lesson that teaches the concept or principle the answer relies on (a voltage/current calculation belongs to the Ohm's law lesson). Judge by topic, not by the lesson the student names. null when no mapped lesson clearly teaches it: a wrong lesson is worse than none.
- relatedLesson: for scope "beyond_curriculum" or "general_education", the EXACT map title of the closest genuinely related lesson, or null when none is truly related.
- isDifferentSubject: true ONLY when the question clearly belongs to an UNRELATED school subject (Arabic grammar in a Science chat, a chemistry calculation in a History chat). Neighboring disciplines are one family: physics, chemistry, biology and earth science; history, geography, civics, the constitution, politics, economics, philosophy and sociology. Casual, general and platform questions are false. When unsure, false.
- detectedSubject: Arabic name of the school subject the question belongs to, or null.
- isDifferentGrade: true ONLY when the student explicitly says they study in another grade or asks for another grade's curriculum. A merely advanced topic is false.
- detectedGrade: the grade the student referred to, or null.
- standaloneQuery: the message rewritten as ONE self-contained question in textbook Arabic (English for English-language subjects). Resolve follow-ups ("طب ليه؟", "وضح أكتر", "حل واحدة زيها", "والنوع التاني؟") from the conversation. For "confused" restate the concept that needs a simpler explanation; for "answer_attempt" state the teacher's question and the student's answer; for "accept_offer" state what the teacher offered as the student's request.
- searchQueries: 1-3 short textbook-phrased search queries that together retrieve EVERYTHING needed to answer: the asked concept itself, plus, for inference or application questions, the underlying laws, definitions or mechanisms the reasoning needs. Distinct from each other and from standaloneQuery. Empty for casual and non_academic.
- arabicKeywords: 3-6 core terms exactly as an Egyptian textbook writes them (not dialect), most specific first.
- englishKeywords: matching English terms for STEM or English subjects, else empty.
- hydePassage: 2-3 sentences written as the textbook passage that would answer the standalone question (textbook terminology and notation).
- searchAnnouncement: short Arabic status line, e.g. "أبحث في المنهج عن: ...".

Return JSON only:
{"intent":"","scope":"","queryType":"","isLessonExplanation":false,"lessonTitle":null,"curriculumLesson":null,"relatedLesson":null,"isDifferentSubject":false,"detectedSubject":null,"isDifferentGrade":false,"detectedGrade":null,"standaloneQuery":"","searchQueries":[],"arabicKeywords":[],"englishKeywords":[],"hydePassage":"","searchAnnouncement":""}`;

function formatLessonMapForClassifier(lessonMap: LessonMapEntry[]): string {
  return lessonMap
    .map(l => {
      const subs = (l.subtopics || []).slice(0, 8).join('، ');
      return `- ${l.title}${subs ? ` | ${subs}` : ''}`.slice(0, 260);
    })
    .join('\n');
}

function normalizeTitle(title: string): string {
  return title
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lesson title without its "الدرس N:" label. */
function lessonSubtitle(title: string): string {
  return normalizeTitle(title.replace(/^\s*الدرس\s+[^:：]{1,20}[:：]/, ''));
}

function cleanString(value: unknown, max = 500): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

function cleanStringList(value: unknown, limit: number, max = 200): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => cleanString(v, max)).filter((v): v is string => !!v))].slice(0, limit);
}

export async function analyzeQueryIntelligence(
  query: string,
  subject: string,
  grade: string,
  lessonMap: LessonMapEntry[] = [],
  conversation = ''
): Promise<QueryIntelligence> {
  const isSinglePointDoubt = isSinglePointQuestion(query);

  const cleanedQueryForLesson = query
    .replace(/(?:بالتفصيل|كاملاً|كامل|شامل|من البداية|لو سمحت|من فضلك|يا مستر)/gi, '')
    .trim();
  const fullLessonRegex = /(?:اشرح|شرح|ذاكر|راجع|مراجعة|ابدأ|عايز شرح|عاوز شرح|ممكن شرح|ممكن تشرح|فهمني)\s+(?:لي\s+)?(?:معايا\s+)?(?:الدرس|درس|اول درس|أول درس|للدرس|فدرس)\s*([^؟?!.\n]*)/i;
  const revFullLessonRegex = /(?:الدرس|درس|اول درس|أول درس)\s+([^؟?!.\n]+?)\s+(?:شرح كامل|كامل|بالكامل|شامل|من البداية|شرح)/i;
  const explicitFullLessonMatch = !isSinglePointDoubt && (cleanedQueryForLesson.match(fullLessonRegex) || cleanedQueryForLesson.match(revFullLessonRegex));
  let heuristicLessonTitle = explicitFullLessonMatch ? explicitFullLessonMatch[1]?.trim() || undefined : undefined;
  if (!heuristicLessonTitle && /(?:الدرس الأول|الدرس الاول|اول درس|أول درس)/i.test(query)) {
    heuristicLessonTitle = 'الدرس الأول';
  }
  const heuristicIsLesson = !isSinglePointDoubt && (!!heuristicLessonTitle || /(?:شرح كامل|الدرس كامل|كل نقاط الدرس|شرح شامل|شرح الدرس|اشرح الدرس)/i.test(query));

  // Stable per-curriculum prefix first (instructions, subject, map) so the provider's prompt cache is reused
  const prompt = `${QUERY_INTELLIGENCE_INSTRUCTIONS}

SUBJECT: "${subject}" | GRADE: "${grade}"
${lessonMap.length ? `LESSON MAP (title | subtopics):\n${formatLessonMapForClassifier(lessonMap)}` : 'LESSON MAP: not available; judge scope from the subject and grade.'}

${conversation ? `RECENT CONVERSATION (oldest first):\n${conversation}\n\n` : ''}STUDENT MESSAGE: "${query.slice(0, 3000)}"`;

  const titles = lessonMap.map(l => l.title.trim());
  const pickTitle = (value: unknown) => {
    const t = cleanString(value);
    if (!t) return undefined;
    const target = normalizeTitle(t);
    const sub = lessonSubtitle(t);
    return lessonMap.find(l => l.title.trim() === t)?.title
      || lessonMap.find(l => normalizeTitle(l.title) === target)?.title
      || (sub.length > 2 ? lessonMap.find(l => lessonSubtitle(l.title) === sub)?.title : undefined);
  };

  try {
    const raw = await callTextIntelligence(prompt, 900, 0.1, true);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in text intelligence response');
    const parsed = JSON.parse(jsonMatch[0]);

    const isLesson = !isSinglePointDoubt && (heuristicIsLesson || parsed.isLessonExplanation === true);
    const modelLessonTitle = cleanString(parsed.lessonTitle);
    const resolvedLessonTitle = (modelLessonTitle && titles.includes(modelLessonTitle) ? modelLessonTitle : undefined)
      || heuristicLessonTitle || modelLessonTitle;
    const scope = QUERY_SCOPES.includes(parsed.scope) ? parsed.scope as QueryScope : undefined;
    const curriculumLesson = pickTitle(parsed.curriculumLesson);
    const standaloneQuery = cleanString(parsed.standaloneQuery);
    const searchQueries = cleanStringList(parsed.searchQueries, 3).filter(q => q !== standaloneQuery);

    return {
      intent: STUDENT_INTENTS.includes(parsed.intent) ? parsed.intent as StudentIntent : undefined,
      queryType: ['direct', 'inferential', 'overview', 'problem_solving'].includes(parsed.queryType)
        ? parsed.queryType
        : (isLesson ? 'overview' : 'direct'),
      scope: curriculumLesson && (scope === 'beyond_curriculum' || !scope) ? 'curriculum_reasoning' : scope,
      isLessonExplanation: isLesson,
      lessonTitle: resolvedLessonTitle,
      // A topic that sits in this curriculum's own lesson map is never a different subject
      isDifferentSubject: parsed.isDifferentSubject === true && !curriculumLesson,
      isDifferentGrade: parsed.isDifferentGrade === true,
      curriculumLesson,
      relatedLesson: pickTitle(parsed.relatedLesson),
      detectedSubject: cleanString(parsed.detectedSubject, 80),
      detectedGrade: cleanString(parsed.detectedGrade, 80),
      arabicKeywords: cleanStringList(parsed.arabicKeywords, 8, 80),
      englishKeywords: cleanStringList(parsed.englishKeywords, 5, 80),
      hydePassage: cleanString(parsed.hydePassage, 1200) || standaloneQuery || query,
      standaloneQuery,
      searchQueries,
      searchAnnouncement: cleanString(parsed.searchAnnouncement, 160)
        || (isLesson && resolvedLessonTitle ? `أجمع عناصر درس "${resolvedLessonTitle}" من المنهج...` : `أبحث في منهج ${subject}...`)
    };
  } catch (err) {
    console.error('analyzeQueryIntelligence failed, using fallback:', err);
    const words = [...new Set(tokenizeQueryWords(query))];
    return {
      queryType: heuristicIsLesson ? 'overview' : 'direct',
      isLessonExplanation: heuristicIsLesson,
      lessonTitle: heuristicLessonTitle,
      arabicKeywords: words.length > 0 ? words.slice(0, 7) : [query.slice(0, 30)],
      englishKeywords: [],
      hydePassage: query,
      searchQueries: [],
      searchAnnouncement: heuristicIsLesson && heuristicLessonTitle
        ? `أجمع عناصر درس "${heuristicLessonTitle}" من المنهج...`
        : `أبحث في منهج ${subject}...`
    };
  }
}

/** "uncertain": the classifier placed the question in the book but the textbook evidence does not back it up. */
export type AnswerScope = 'curriculum' | 'uncertain' | 'beyond' | 'general' | 'casual' | 'non_academic';

/** Cross-encoder relevance at which the textbook clearly covers the question, whatever the classifier said. */
export const STRONG_TEXTBOOK_RELEVANCE = 0.72;
/** Below this, no retrieved section really answers the question. */
export const WEAK_TEXTBOOK_RELEVANCE = 0.6;

/**
 * Final scope of an answer. The classifier sees the whole lesson map, but its verdict is checked against the
 * textbook evidence both ways: "beyond the curriculum" needs the core term to be absent from the book and no
 * strongly relevant section (a false out-of-curriculum remark is worse than a missing one), and "in the
 * curriculum" with neither the term in the book nor a relevant section becomes "uncertain", which claims neither.
 */
export function resolveAnswerScope(
  intelligence: Pick<QueryIntelligence, 'scope' | 'curriculumLesson'>,
  evidence: { termInTextbook: boolean; topRelevance: number | null }
): AnswerScope {
  const strong = (evidence.topRelevance ?? 0) >= STRONG_TEXTBOOK_RELEVANCE;
  const weak = evidence.topRelevance !== null && evidence.topRelevance < WEAK_TEXTBOOK_RELEVANCE;
  switch (intelligence.scope) {
    case 'casual': return 'casual';
    case 'non_academic': return 'non_academic';
    case 'curriculum':
    case 'curriculum_reasoning': return weak && !evidence.termInTextbook ? 'uncertain' : 'curriculum';
    case 'general_education': return intelligence.curriculumLesson && !weak ? 'curriculum' : 'general';
    case 'beyond_curriculum': return evidence.termInTextbook || strong ? 'curriculum' : 'beyond';
    default: return evidence.termInTextbook || strong ? 'curriculum' : 'general';
  }
}

const FALLBACK_STOP_WORDS = new Set([
  'ما', 'ماذا', 'هو', 'هي', 'هم', 'كيف', 'لماذا', 'علل', 'بما', 'تفسر', 'اشرح', 'وضح', 'معنى', 'مفهوم', 'عرف',
  'قارن', 'ممكن', 'السؤال', 'في', 'من', 'على', 'عن', 'مع', 'هل', 'يا', 'ده', 'دي', 'عايز', 'اعرف', 'قولي',
  'ايه', 'إيه', 'ليه', 'ازاي', 'لو', 'سمحت', 'اريد', 'حل', 'مسألة', 'سؤال'
]);

function tokenizeQueryWords(query: string): string[] {
  return query
    .replace(/[؟?!.،,;:]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !FALLBACK_STOP_WORDS.has(w));
}

// ─── Curriculum Summary Generator ─────────────────────────────────────────────

/**
 * Generates a semantic summary of the full curriculum.
 * Called once during curriculum upload and stored as a special chunk.
 */
export async function generateCurriculumSummary(fullText: string): Promise<string> {
  const prompt = `You are a curriculum architect for Egyptian secondary education.
Read the textbook content below and produce a comprehensive 400-600 word academic summary in clear, structured Arabic covering:
1. Main units and chapters (الموضوعات الرئيسية والفصول)
2. Core scientific laws, definitions, and formulas (أهم القوانين والمفاهيم العلمية)
3. Essential student competencies and problem-solving skills (المهارات المكتسبة)
4. Logical sequence of topics (الترتيب المنطقي للمحتوى)

Write directly in formal academic Arabic without meta-intro or filler.

Curriculum Content:
"""
${fullText.slice(0, 15000)}
"""`;

  try {
    const summaryPromise = callTextIntelligence(prompt, 800, 0.2);
    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Summary generation timed out')), 8000)
    );
    return await Promise.race([summaryPromise, timeoutPromise]);
  } catch (err) {
    console.warn('generateCurriculumSummary notice (using structural fallback):', err);
    const structuralHeadings = fullText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('#'))
      .slice(0, 30)
      .join('\n');
    return structuralHeadings ? `ملخص هيكلي لفصول ووحدات المنهج:\n${structuralHeadings}` : '';
  }
}

// ─── Student Engagement Classifier ───────────────────────────────────────────

/**
 * Classifies whether a chat turn represents genuine, meaningful student engagement.
 * Used for silent background points scoring (+3 points, max once per session).
 * Returns boolean. Fails open on errors for substantive messages.
 */
export async function classifyEngagement(
  userMessage: string,
  aiResponseText: string
): Promise<boolean> {
  const trimmed = userMessage.trim();
  if (!trimmed || trimmed.length < 2) return false;

  // Filter out superficial single-word greetings or acknowledgments
  const trivialPattern = /^(مرحبا|أهلا|اهلا|سلام|السلام عليكم|شكرا|شكراً|تمام|اوك|أوك|ماشى|ماشي|ok|okay|hi|hello|hey|thanks|thx|bye)[\s.!,]*$/i;
  if (trivialPattern.test(trimmed)) {
    return false;
  }

  const prompt = `You are an AI student engagement evaluator.
Read the student message and teacher response. Determine if the student is showing genuine academic engagement (asking conceptual questions, seeking clarification, solving problems) vs superficial chatter or single greetings (e.g. 'hi', 'thanks', 'ok').

Student Message: "${trimmed.slice(0, 400)}"
Teacher Response: "${aiResponseText.slice(0, 400)}"

Return strict JSON ONLY:
{
  "genuine_engagement": true|false
}`;

  if (process.env.DEEPSEEK_API_KEY || EDENAI_API_KEY) {
    try {
      const raw = await callTextIntelligence(prompt, 120, 0.1);
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed.genuine_engagement === 'boolean') {
          return parsed.genuine_engagement;
        }
      }
    } catch (err) {
      console.warn('classifyEngagement evaluator notice (failing open):', err);
    }
  }

  // Fail-open for meaningful student questions and prompts
  return trimmed.length >= 6;
}
