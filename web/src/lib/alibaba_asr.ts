/**
 * Alibaba Cloud DashScope Speech-to-Text Integration
 * Transcribes student voice notes (Egyptian Arabic & English) using Alibaba Qwen3-ASR models
 * with an Egyptian curriculum dialect & phonetic refinement layer.
 */

const ALIBABA_API_BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';

export interface TranscriptionResult {
  success: boolean;
  transcript: string;
  rawTranscript?: string;
  duration?: number;
  modelUsed?: string;
  error?: string;
}

/**
 * Refines raw ASR output specifically for Egyptian Arabic dialect and curriculum terms.
 * Fixes phonetic mishearings (e.g., "الدينيا" -> "الـ DNA", "بنسخين الميت" -> "بنسخن المية")
 * while strictly preserving the student's colloquial Egyptian dialect without converting to MSA.
 */
async function refineEgyptianTranscript(
  rawTranscript: string,
  alibabaKey: string
): Promise<string> {
  const trimmed = rawTranscript.trim();
  if (!trimmed || trimmed.split(/\s+/).length < 2) {
    return trimmed;
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  const systemPrompt = `أنت نظام تدقيق وتصحيح ذكي للتفريغ الصوتي لكلام الطلاب في منصة تعليمية للمناهج المصرية.
يصلك نص تم تفريغه آلياً من تسجيل صوتي لطالب مصري يتحدث بلهجته المصرية الدارجة، وقد يحتوي النص على أخطاء سماعية أو تشوهات صوتية ناتجة عن:
1. المصطلحات العلمية أو الإنجليزية التي يكتبها محول الصوت بحروف عربية مشوهة (مثل: الدينيا -> الـ DNA، الأورينيا -> الـ RNA، فيزكس -> Physics، إكس وواي -> X و Y).
2. كلمات عامية مصرية مشوهة بفعل التقارب الصوتي (مثل: "بنسخين الميت" -> "بنسخن المية"، "هولي" -> "هو ليه"، "إزيكا" -> "إزيك").

قواعدك الصارمة:
- حافظ 100% على العامية واللهجة المصرية الدارجة التي تكلم بها الطالب ولا تحولها أبداً إلى اللغة العربية الفصحى (اترك: عايز، كده، إزاي، دلوقتي، علشان، مش، إيه، يا مستر، بنسخن، إلخ كما هي تماماً).
- صحح فقط الكلمات المشوهة صوتياً لتستقيم الجملة لغوياً وعلمياً في سياق سؤال الطالب.
- أعد فقط النص المصحح مباشرة بدون أي كلمة مقدمة أو شرح أو علامات اقتباس.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    if (deepseekKey) {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'deepseek-chat',
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: trimmed }
          ]
        })
      });

      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const refined = data.choices?.[0]?.message?.content?.trim();
        if (refined && refined.length > 0 && !refined.includes('```')) {
          return refined.replace(/^["'«»]|["'«»]$/g, '').trim();
        }
      }
    } else if (alibabaKey) {
      const res = await fetch(`${ALIBABA_API_BASE.replace('/api/v1', '')}/compatible-mode/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${alibabaKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'qwen-plus',
          temperature: 0.1,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: trimmed }
          ]
        })
      });

      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        const refined = data.choices?.[0]?.message?.content?.trim();
        if (refined && refined.length > 0 && !refined.includes('```')) {
          return refined.replace(/^["'«»]|["'«»]$/g, '').trim();
        }
      }
    }
  } catch {
    // Graceful fallback to raw transcript on timeout or error
  } finally {
    clearTimeout(timeoutId);
  }

  return trimmed;
}

/**
 * Synchronous transcription via Alibaba Qwen3-ASR-Flash.
 */
async function transcribeWithQwen3Sync(
  audioDataUrl: string,
  apiKey: string
): Promise<{ success: boolean; text?: string; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${ALIBABA_API_BASE}/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'qwen3-asr-flash',
        input: {
          messages: [
            {
              role: 'user',
              content: [{ audio: audioDataUrl }]
            }
          ]
        },
        parameters: {
          asr_options: {
            language: 'ar',
            enable_itn: false
          }
        }
      })
    });

    clearTimeout(timeoutId);
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`Qwen3-ASR-Flash sync error (${res.status}):`, errText.slice(0, 200));
      return { success: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const text = data.output?.choices?.[0]?.message?.content?.[0]?.text?.trim() || '';
    return { success: true, text };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return { success: false, error: err.message || 'Connection error' };
  }
}

/**
 * Asynchronous file-transcription fallback via Qwen-Audio ASR.
 */
async function transcribeWithQwenFiletransFallback(
  audioDataUrl: string,
  apiKey: string
): Promise<{ success: boolean; text?: string; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const submitResponse = await fetch(`${ALIBABA_API_BASE}/services/audio/asr/transcription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'qwen-audio-3.0-asr-flash-filetrans',
        input: {
          file_urls: [audioDataUrl]
        },
        parameters: {
          language_hints: ['ar']
        }
      })
    });

    if (!submitResponse.ok) {
      clearTimeout(timeoutId);
      return { success: false, error: `Submit error (${submitResponse.status})` };
    }

    const submitData = await submitResponse.json();
    const taskId = submitData.output?.task_id;
    if (!taskId) {
      clearTimeout(timeoutId);
      return { success: false, error: 'No task_id returned' };
    }

    const maxPollAttempts = 25;
    const pollIntervalMs = 600;

    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      const pollResponse = await fetch(`${ALIBABA_API_BASE}/tasks/${taskId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: controller.signal
      });

      if (!pollResponse.ok) continue;

      const pollData = await pollResponse.json();
      const taskStatus = pollData.output?.task_status;

      if (taskStatus === 'SUCCEEDED') {
        clearTimeout(timeoutId);
        const transUrl = pollData.output?.results?.[0]?.transcription_url || pollData.output?.transcription_url;
        let transcriptText = '';
        if (transUrl) {
          const fileResponse = await fetch(transUrl);
          if (fileResponse.ok) {
            const fileData = await fileResponse.json();
            transcriptText = (fileData.transcripts || [])
              .map((t: any) => t.text || '')
              .filter(Boolean)
              .join(' ')
              .trim();
          }
        }
        return { success: true, text: transcriptText };
      }

      if (taskStatus === 'FAILED') {
        clearTimeout(timeoutId);
        return { success: false, error: pollData.output?.message || 'ASR task failed' };
      }
    }

    clearTimeout(timeoutId);
    return { success: false, error: 'ASR polling timeout' };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return { success: false, error: err.message || 'Fallback exception' };
  }
}

export async function transcribeAudioWithAlibaba(
  audioBase64: string,
  mimeType: string = 'audio/webm'
): Promise<TranscriptionResult> {
  const apiKey = process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY || '';
  if (!apiKey) {
    return {
      success: false,
      transcript: '',
      error: 'مفتاح خدمة تحويل الصوت إلى نص غير متوفر في الخادم.'
    };
  }

  let cleanBase64 = audioBase64;
  if (cleanBase64.includes('base64,')) {
    cleanBase64 = cleanBase64.split('base64,')[1];
  }
  cleanBase64 = cleanBase64.trim().replace(/\s+/g, '');

  if (!cleanBase64) {
    return {
      success: false,
      transcript: '',
      error: 'الملف الصوتي فارغ أو غير صالح.'
    };
  }

  let normalizedMime = mimeType.toLowerCase();
  if (normalizedMime.includes('webm')) normalizedMime = 'audio/webm';
  else if (normalizedMime.includes('mp4') || normalizedMime.includes('m4a')) normalizedMime = 'audio/mp4';
  else if (normalizedMime.includes('wav')) normalizedMime = 'audio/wav';
  else if (normalizedMime.includes('ogg')) normalizedMime = 'audio/ogg';
  else normalizedMime = 'audio/mp3';

  const audioDataUrl = `data:${normalizedMime};base64,${cleanBase64}`;

  try {
    let rawText = '';
    let modelUsed = 'qwen3-asr-flash';

    // Tier 1: Synchronous ultra-low-latency transcription via Qwen3-ASR-Flash
    const syncResult = await transcribeWithQwen3Sync(audioDataUrl, apiKey);
    if (syncResult.success && syncResult.text !== undefined) {
      rawText = syncResult.text;
    } else {
      // Tier 1 Fallback: Asynchronous filetrans with Arabic language hint
      modelUsed = 'qwen-audio-3.0-asr-flash-filetrans';
      const fallbackResult = await transcribeWithQwenFiletransFallback(audioDataUrl, apiKey);
      if (fallbackResult.success && fallbackResult.text) {
        rawText = fallbackResult.text;
      } else {
        return {
          success: false,
          transcript: '',
          error: 'تعذر استخراج النص من التسجيل الصوتي. يرجى التحدث بوضوح وإعادة المحاولة.'
        };
      }
    }

    // Clean transcription artifacts
    let cleanedRaw = rawText
      .replace(/^(هنا هو النص|التفريغ الصوتي|النص المسموع|Transcript):\s*/i, '')
      .replace(/^["'«»]|["'«»]$/g, '')
      .trim();

    if (!cleanedRaw) {
      return {
        success: false,
        transcript: '',
        error: 'لم يتم رصد أي صوت أو كلام واضح في التسجيل الصوتي. يرجى التحدث بوضوح وإعادة المحاولة.'
      };
    }

    // Tier 2: Egyptian dialect & curriculum context phonetic refinement
    const refinedTranscript = await refineEgyptianTranscript(cleanedRaw, apiKey);

    return {
      success: true,
      transcript: refinedTranscript || cleanedRaw,
      rawTranscript: cleanedRaw,
      modelUsed
    };
  } catch (err: any) {
    console.error('ASR processing exception:', err);
    return {
      success: false,
      transcript: '',
      error: 'حدث خطأ أثناء معالجة التسجيل الصوتي.'
    };
  }
}

