const EDENAI_API_KEY = process.env.EDENAI_API_KEY || '';
const EDENAI_BASE = 'https://api.edenai.run/v2';
const ALIBABA_API_KEY = process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || '';
const ALIBABA_API_BASE = process.env.ALIBABA_API_BASE || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueryIntelligence {
  queryType: 'direct' | 'inferential' | 'overview' | 'problem_solving';
  arabicKeywords: string[];   // for Arabic FTS (tsvector 'simple')
  englishKeywords: string[];  // for English FTS (tsvector 'english')
  hydePassage: string;        // hypothetical passage for vector embedding
  searchAnnouncement: string; // Arabic UI text: "سأبحث الآن عن..."
  isLessonExplanation?: boolean;
  lessonTitle?: string;
  isDifferentSubject?: boolean;
  isDifferentGrade?: boolean;
  detectedSubject?: string;
  detectedGrade?: string;
  metadata?: {
    gradeLevel?: string;
    subject?: string;
    unit?: string;
    chapter?: string;
  };
}

export interface ContextGapAssessment {
  sufficient: boolean;
  confidence: number;         // 0 to 1
  missingTopics: string[];
  followUpAnnouncement: string; // Arabic UI text for follow-up step
}

// ─── Core AI Model Callers ────────────────────────────────────────────────────

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

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
    body: JSON.stringify(requestBody)
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
  mimeType: string = 'image/jpeg',
  promptText: string = 'اقرأ هذه الصورة بالتفصيل واكتب وصفاً شاملاً ومفصلاً لها باللغة العربية، بما في ذلك أي نصوص أو معادلات رياضية أو فيزيائية أو كيميائية أو جداول أو رسوم توضيحية بداخلها بدقة بالغة وكتابتها حرفياً.',
  maxTokens: number = 2048
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
      max_tokens: maxTokens
    })
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
    })
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

/**
 * Generates a 768-dimensional embedding vector using Alibaba Cloud text-embedding-v4.
 * Employs Matryoshka Representation Learning (dimensions: 768) matching the Supabase pgvector schema.
 */
export async function callAlibabaEmbedding(
  text: string,
  model: string = 'text-embedding-v4'
): Promise<number[]> {
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
        model,
        input: text.slice(0, 8000),
        dimensions: 768
      })
    });

    if (!res.ok) {
      if (model === 'text-embedding-v4') {
        return callAlibabaEmbedding(text, 'text-embedding-v3');
      }
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
export async function callAlibabaEmbeddingBatch(
  texts: string[],
  model: string = 'text-embedding-v4'
): Promise<number[][]> {
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
              model,
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
 * Generates a single embedding vector (768 dimensions).
 * Primary: Alibaba Cloud text-embedding-v4
 * Fallback: Google text-embedding-004 via EdenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // 1. Primary: Alibaba Cloud text-embedding-v4
  if (ALIBABA_API_KEY) {
    const alibabaVec = await callAlibabaEmbedding(text);
    if (alibabaVec && alibabaVec.length === 768) {
      return alibabaVec;
    }
  }

  // 2. Fallback: EdenAI Google text-embedding-004
  if (!EDENAI_API_KEY) return [];

  const response = await fetch(`${EDENAI_BASE}/text/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${EDENAI_API_KEY}`
    },
    body: JSON.stringify({
      providers: 'google',
      texts: [text.slice(0, 8000)],
      model: 'text-embedding-004'
    })
  });

  if (!response.ok) {
    console.error('EdenAI embedding error:', response.status);
    return [];
  }

  const data = await response.json();
  const googleKey = Object.keys(data).find(k => k.startsWith('google'));
  return googleKey ? (data[googleKey]?.items?.[0]?.embedding ?? []) : [];
}

/**
 * Batch-embeds texts into 768-dimensional vectors.
 * Primary: Alibaba Cloud text-embedding-v4 (batched in groups of 10)
 * Fallback: Google text-embedding-004 via EdenAI (batched in groups of 20)
 */
export async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // 1. Primary: Alibaba Cloud text-embedding-v4
  if (ALIBABA_API_KEY) {
    const alibabaBatch = await callAlibabaEmbeddingBatch(texts);
    const validCount = alibabaBatch.filter(v => v && v.length === 768).length;
    if (validCount === texts.length) {
      return alibabaBatch;
    }
    console.warn(`Alibaba batch returned ${validCount}/${texts.length} embeddings, falling back to EdenAI for missing`);
  }

  // 2. Fallback: EdenAI Google text-embedding-004
  if (!EDENAI_API_KEY) return texts.map(() => []);

  const BATCH_SIZE = 20;
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE).map(t => t.slice(0, 8000)));
  }

  const promises = batches.map(async (batch, index) => {
    try {
      const response = await fetch(`${EDENAI_BASE}/text/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${EDENAI_API_KEY}`
        },
        body: JSON.stringify({
          providers: 'google',
          texts: batch,
          model: 'text-embedding-004'
        })
      });

      if (!response.ok) {
        console.error(`Batch embedding error for batch ${index}: ${response.status}`);
        return batch.map(() => []);
      }

      const data = await response.json();
      const googleKey = Object.keys(data).find(k => k.startsWith('google'));
      const items: { embedding: number[] }[] = googleKey ? (data[googleKey]?.items ?? []) : [];
      
      const batchResults: number[][] = [];
      for (let j = 0; j < batch.length; j++) {
        batchResults.push(items[j]?.embedding ?? []);
      }
      return batchResults;
    } catch (err) {
      console.error(`Batch embedding exception for batch ${index}:`, err);
      return batch.map(() => []);
    }
  });

  const resolvedBatches = await Promise.all(promises);
  return resolvedBatches.flat();
}


// ─── Query Intelligence ───────────────────────────────────────────────────────

/**
 * Single-call query intelligence:
 * 1. Categorizes query type
 * 2. Extracts Arabic & English search keywords
 * 3. Generates a hypothetical textbook passage (HyDE)
 * 4. Produces a polite user-facing search announcement in Egyptian educational Arabic
 * 5. Detects full lesson explanation requests and lesson titles
 */
export async function analyzeQueryIntelligence(
  query: string,
  subject: string,
  grade: string
): Promise<QueryIntelligence> {
  // Check if query is asking a specific question, definition, calculation, or concept doubt
  const isSinglePointDoubt = /(?:مش فاهم|مش مستوعب|مش واضحة|وضحلي|اشرحلي نقطة|نقطة|جزئية|مفهوم|معنى|ما هو|ما هي|ماهو|ماهي|ما المقصود|ليه|لماذا|علل|ازاي|كيف|ما الفرق|قارن|سؤال|مسألة|احسب|عرف|متى|أين|هل)/i.test(query) &&
    !/(?:شرح كامل|شرح شامل|الدرس كامل|كل نقاط الدرس|اشرح لي الدرس من البداية|ذاكر معايا الدرس)/i.test(query);

  // Check explicit full lesson request with clean title stripping
  const cleanedQueryForLesson = query
    .replace(/(?:بالتفصيل|كاملاً|كامل|شامل|من البداية|لو سمحت|من فضلك|يا مستر|في التاريخ|تاريخ اولى ثانوي|تاريخ اولي ثانوي|تاريخ الصف الاول الثانوي)/gi, '')
    .trim();

  const fullLessonRegex = /(?:اشرح|شرح|ذاكر|راجع|مراجعة|ابدأ|عايز شرح|عاوز شرح|ممكن شرح|ممكن تشرح|فهمني)\s+(?:لي\s+)?(?:معايا\s+)?(?:الدرس|درس|اول درس|أول درس|للدرس|فدرس)\s*([^؟?!.\n]*)/i;
  const revFullLessonRegex = /(?:الدرس|درس|اول درس|أول درس)\s+([^؟?!.\n]+?)\s+(?:شرح كامل|كامل|بالكامل|شامل|من البداية|شرح)/i;
  const explicitFullLessonMatch = !isSinglePointDoubt && (cleanedQueryForLesson.match(fullLessonRegex) || cleanedQueryForLesson.match(revFullLessonRegex));
  let heuristicLessonTitle = explicitFullLessonMatch ? explicitFullLessonMatch[1]?.trim() : undefined;
  if ((!heuristicLessonTitle || heuristicLessonTitle.length === 0) && /(?:الدرس الأول|الدرس الاول|اول درس|أول درس)/i.test(query)) {
    heuristicLessonTitle = 'الدرس الأول';
  }
  const heuristicIsLesson = !isSinglePointDoubt && (!!heuristicLessonTitle || /(?:شرح كامل|الدرس كامل|كل نقاط الدرس|شرح شامل|شرح الدرس|اشرح الدرس)/i.test(query));

  const prompt = `You are an expert Query Intelligence and Curriculum Search Engine for the Egyptian National Curriculum.
Analyze the student's question against the active curriculum subject ("${subject}") and grade level ("${grade}").
Extract precise textbook keywords, search terms, whether the student is requesting a full lesson explanation, and whether the question is about a different subject or grade level.
NOTE: General inquiries about platform capabilities, sending camera photos, uploading images, voice messages, study methods, or conversational greetings are NOT a different subject or grade (set isDifferentSubject: false, isDifferentGrade: false).
Return a valid JSON object ONLY:
{
  "queryType": "direct|inferential|overview|problem_solving",
  "isLessonExplanation": ${heuristicIsLesson ? 'true' : 'true|false'},
  "lessonTitle": ${heuristicLessonTitle ? `"${heuristicLessonTitle}"` : 'string or null'},
  "isDifferentSubject": true|false,
  "isDifferentGrade": true|false,
  "detectedSubject": "string or null",
  "detectedGrade": "string or null",
  "arabicKeywords": ["3-6 core academic or historical keywords from the Egyptian textbook"],
  "englishKeywords": ["corresponding terms in English if STEM/English subject, or empty"],
  "hydePassage": "1-2 sentence concise textbook statement directly addressing the query",
  "searchAnnouncement": "سأبحث الآن عن: [الموضوع]",
  "metadata": {
    "gradeLevel": "${grade}",
    "subject": "${subject}"
  }
}

Active Subject: "${subject}", Grade: "${grade}", Query: "${query}"`;

  try {
    const raw = await callTextIntelligence(prompt, 350, 0.1, true);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in text intelligence response');

    const parsed = JSON.parse(jsonMatch[0]);

    // Accept lesson explanation if heuristic confirms or model confirms without single-point doubt
    const isLesson = !isSinglePointDoubt && (heuristicIsLesson || parsed.isLessonExplanation === true);
    const resolvedLessonTitle = (typeof parsed.lessonTitle === 'string' && parsed.lessonTitle.trim())
      ? parsed.lessonTitle.trim()
      : heuristicLessonTitle;

    const isDifferentSubject = parsed.isDifferentSubject === true;
    const isDifferentGrade = parsed.isDifferentGrade === true;
    const detectedSubject = typeof parsed.detectedSubject === 'string' && parsed.detectedSubject.trim() ? parsed.detectedSubject.trim() : undefined;
    const detectedGrade = typeof parsed.detectedGrade === 'string' && parsed.detectedGrade.trim() ? parsed.detectedGrade.trim() : undefined;

    return {
      queryType: ['direct', 'inferential', 'overview', 'problem_solving'].includes(parsed.queryType)
        ? parsed.queryType
        : (isLesson ? 'overview' : 'direct'),
      isLessonExplanation: isLesson,
      lessonTitle: resolvedLessonTitle,
      isDifferentSubject,
      isDifferentGrade,
      detectedSubject,
      detectedGrade,
      arabicKeywords: Array.isArray(parsed.arabicKeywords) ? parsed.arabicKeywords.slice(0, 8) : [],
      englishKeywords: Array.isArray(parsed.englishKeywords) ? parsed.englishKeywords.slice(0, 5) : [],
      hydePassage: typeof parsed.hydePassage === 'string' && parsed.hydePassage.length > 10
        ? parsed.hydePassage
        : query,
      searchAnnouncement: typeof parsed.searchAnnouncement === 'string'
        ? parsed.searchAnnouncement
        : (isLesson && resolvedLessonTitle
            ? `سأجمع الآن جميع عناصر وتفاصيل درس "${resolvedLessonTitle}" من المنهج...`
            : `سأبحث الآن في منهج ${subject}...`),
      metadata: parsed.metadata ? {
        gradeLevel: typeof parsed.metadata.gradeLevel === 'string' && parsed.metadata.gradeLevel.trim() ? parsed.metadata.gradeLevel.trim() : undefined,
        subject: typeof parsed.metadata.subject === 'string' && parsed.metadata.subject.trim() ? parsed.metadata.subject.trim() : undefined,
        unit: typeof parsed.metadata.unit === 'string' && parsed.metadata.unit.trim() ? parsed.metadata.unit.trim() : undefined,
        chapter: typeof parsed.metadata.chapter === 'string' && parsed.metadata.chapter.trim() ? parsed.metadata.chapter.trim() : undefined,
      } : undefined
    };
  } catch (err) {
    console.error('analyzeQueryIntelligence failed, using fallback:', err);
    const STOP_WORDS = new Set([
      'ما', 'ماذا', 'هو', 'هي', 'هم', 'هن', 'كيف', 'لماذا', 'علل', 'بما', 'تفسر',
      'اشرح', 'وضح', 'معنى', 'مفهوم', 'عرف', 'قارن', 'ممكن', 'السؤال', 'في', 'من',
      'على', 'عن', 'مع', 'هل', 'يا', 'ده', 'دي', 'عايز', 'اعرف', 'قولي', 'ايه',
      'لو', 'سمحت', 'اريد', 'حل', 'مسألة', 'سؤال'
    ]);
    const words = query
      .replace(/[؟?!.،,;:]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 1 && !STOP_WORDS.has(w));

    return {
      queryType: heuristicIsLesson ? 'overview' : 'direct',
      isLessonExplanation: heuristicIsLesson,
      lessonTitle: heuristicLessonTitle,
      arabicKeywords: words.length > 0 ? words.slice(0, 7) : [query.slice(0, 30)],
      englishKeywords: [],
      hydePassage: query,
      searchAnnouncement: heuristicIsLesson && heuristicLessonTitle
        ? `سأجمع الآن جميع عناصر وتفاصيل درس "${heuristicLessonTitle}" من المنهج...`
        : `سأبحث الآن في منهج ${subject}...`
    };
  }
}

// ─── Context Gap Analysis ─────────────────────────────────────────────────────

/**
 * Assesses whether the retrieved context is sufficient to answer the query.
 * Only called for 'inferential' or 'problem_solving' queries when chunk count < 3.
 */
export async function assessContextGap(
  query: string,
  context: string
): Promise<ContextGapAssessment> {
  const prompt = `You are a RAG Context Sufficiency Evaluator for the Egyptian National Curriculum.
Assess whether the retrieved curriculum context contains enough facts to answer the student's question.

Student Query:
"${query.slice(0, 500)}"

Retrieved Context:
"""
${context.slice(0, 2000)}
"""

Return strict JSON ONLY:
{
  "sufficient": true|false,
  "confidence": 0.0-1.0,
  "missingTopics": ["specific missing topic in Arabic (max 2)"],
  "followUpAnnouncement": "سأبحث أيضاً عن: [الموضوع الناقص]"
}

Rule: If the context contains relevant information to address the query even partially, set sufficient to true.`;

  try {
    const raw = await callTextIntelligence(prompt, 250, 0.1);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in gap analysis response');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      sufficient: !!parsed.sufficient,
      confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
      missingTopics: Array.isArray(parsed.missingTopics) ? parsed.missingTopics.slice(0, 2) : [],
      followUpAnnouncement: typeof parsed.followUpAnnouncement === 'string'
        ? parsed.followUpAnnouncement
        : 'سأبحث عن معلومات إضافية...'
    };
  } catch (err) {
    console.error('assessContextGap failed:', err);
    return { sufficient: true, confidence: 0.5, missingTopics: [], followUpAnnouncement: '' };
  }
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