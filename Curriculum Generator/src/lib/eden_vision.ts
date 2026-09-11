import dns from "dns";

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {}

export interface VisionExtractionOptions {
  geminiApiKey?: string;
  edenAiApiKey?: string;
  maxRetries?: number;
  onNetworkWait?: (attempt: number, maxRetries: number, delayMs: number) => void;
}

const DEFAULT_EDENAI_KEY = process.env.EDENAI_API_KEY || "";
const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || "";

async function extractWithGeminiVisionDirect(
  imageBuffer: Buffer,
  apiKey: string
): Promise<string> {
  const cleanKey = apiKey.trim();
  const base64Image = imageBuffer.toString("base64");

  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  let lastError = "";

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Read this textbook page in its entirety. Transcribe all explanation text, definitions, scientific concepts, formulas, equations, headings, and instructional details with extreme precision in the exact original language of the page (Arabic/English/etc.) without omitting or abbreviating any educational explanation. Do not transcribe questions or exercises; focus entirely on the full lesson explanation."
                },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: base64Image
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096
          }
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text.trim().length > 0) {
          return text.trim();
        }
      } else {
        const err = await res.text();
        lastError = `Gemini (${model}) ${res.status}: ${err}`;
      }
    } catch (e: any) {
      lastError = e.message;
    }
  }

  throw new Error(`فشل استخراج النصوص عبر Gemini Vision: ${lastError}`);
}

async function extractWithDeepSeekVisionDirect(
  imageBuffer: Buffer,
  apiKey: string
): Promise<string> {
  const cleanKey = apiKey.trim();
  const base64Image = imageBuffer.toString("base64");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanKey}`
    },
    body: JSON.stringify({
      model: "deepseek-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Read this textbook page in its entirety. Transcribe all explanation text, definitions, scientific concepts, formulas, equations, headings, and instructional details with extreme precision in the exact original language of the page (Arabic/English/etc.) without omitting or abbreviating any educational explanation. Do not transcribe questions or exercises; focus entirely on the full lesson explanation."
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64Image}` }
            }
          ]
        }
      ],
      thinking: { type: "disabled" },
      max_tokens: 4096
    }),
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));

  if (res.ok) {
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    const content = (msg?.content || '').trim();
    if (content) return content;
    return (msg?.reasoning_content || '').trim();
  }
  return "";
}

async function extractWithAlibabaVisionDirect(
  imageBuffer: Buffer,
  apiKey: string
): Promise<string> {
  const cleanKey = apiKey.trim();
  const base64Image = imageBuffer.toString("base64");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  const res = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cleanKey}`
    },
    body: JSON.stringify({
      model: "qwen-vl-ocr-2025-11-20",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Read this textbook page in its entirety. Transcribe all explanation text, definitions, scientific concepts, formulas, equations, headings, and instructional details with extreme precision in the exact original language of the page (Arabic/English/etc.) without omitting or abbreviating any educational explanation. Do not transcribe questions or exercises; focus entirely on the full lesson explanation."
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64Image}` }
            }
          ]
        }
      ],
      max_tokens: 4096
    }),
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));

  if (res.ok) {
    const data = await res.json();
    const content = (data.choices?.[0]?.message?.content || "").trim();
    if (content) return content;
  }
  return "";
}

export async function extractWithEdenAI(
  extractedText: string,
  imageBuffer: Buffer | null,
  options: VisionExtractionOptions
): Promise<string> {
  const geminiKey = (options.geminiApiKey || process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY).trim();
  const rawEdenKey = options.edenAiApiKey || process.env.EDENAI_API_KEY || DEFAULT_EDENAI_KEY;
  const cleanEdenKey = rawEdenKey.replace(/^Bearer\s+/i, "").trim();
  const deepseekKey = (process.env.DEEPSEEK_API_KEY || "").trim();
  const alibabaKey = (process.env.ALIBABA_API_KEY || "").trim();

  const maxRetries = options.maxRetries ?? 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      if (imageBuffer && imageBuffer.length > 0) {
        // Step 1: DeepSeek Flash (deepseek-flash, native multimodal, thinking disabled for sub-1s latency)
        if (deepseekKey) {
          try {
            const deepseekText = await extractWithDeepSeekVisionDirect(imageBuffer, deepseekKey);
            if (deepseekText && deepseekText.trim().length > 0) {
              return deepseekText.trim();
            }
          } catch (dsErr: any) {
            console.warn("DeepSeek Vision attempt note:", dsErr.message);
          }
        }

        // Step 2: Alibaba Qwen-VL OCR (high-speed fallback if available)
        if (alibabaKey) {
          try {
            const alibabaText = await extractWithAlibabaVisionDirect(imageBuffer, alibabaKey);
            if (alibabaText && alibabaText.trim().length > 0) {
              return alibabaText.trim();
            }
          } catch (aliErr: any) {
            console.warn("Alibaba Vision attempt note:", aliErr.message);
          }
        }

        // Step 3: Direct Google Gemini Vision (if key available)
        if (geminiKey) {
          try {
            const geminiText = await extractWithGeminiVisionDirect(imageBuffer, geminiKey);
            if (geminiText && geminiText.trim().length > 0) {
              return geminiText.trim();
            }
          } catch (geminiErr: any) {
            console.warn("Direct Gemini Vision attempt note:", geminiErr.message);
          }
        }

        // Step 2: EdenAI Document OCR API
        if (cleanEdenKey) {
          let ocrStatus = 0;
          let ocrErrorDetail = "";

          try {
            const fileBlob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
            const formData = new FormData();
            formData.append("providers", "google");
            formData.append("fallback_providers", "amazon,microsoft");
            formData.append("file", fileBlob, "page.jpg");
            formData.append("language", "ar");

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            const ocrResponse = await fetch("https://api.edenai.run/v2/ocr/ocr", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${cleanEdenKey}`,
              },
              body: formData,
              signal: controller.signal,
            }).finally(() => clearTimeout(timeoutId));

            ocrStatus = ocrResponse.status;

            if (ocrResponse.ok) {
              const ocrData = await ocrResponse.json();
              const ocrText =
                ocrData?.google?.text ||
                ocrData?.amazon?.text ||
                ocrData?.microsoft?.text ||
                "";

              if (ocrText && ocrText.trim().length > 0) {
                return ocrText.trim();
              }

              // If OCR found no text in image, but page already has digital text, use it directly
              if (extractedText && extractedText.trim().length > 25) {
                return extractedText.trim();
              }
            } else {
              ocrErrorDetail = await ocrResponse.text();
            }
          } catch (ocrErr: any) {
            ocrErrorDetail = ocrErr.message;
          }

          // Check if EdenAI failed due to credit exhaustion or auth
          if (ocrStatus === 402 || ocrErrorDetail.includes("No more credits")) {
            throw new Error("رصيد EdenAI غير كافٍ (402 No more credits) - يرجى شحن رصيد EdenAI أو إضافة مفتاح Google Gemini في الإعدادات");
          }
          if (ocrStatus === 401) {
            throw new Error("مفتاح EdenAI غير صالح أو غير معتمد (401 Unauthorized)");
          }

          // If digital text is available, skip expensive and slow VQA
          if (extractedText && extractedText.trim().length > 25) {
            return extractedText.trim();
          }

          // Step 3: EdenAI VQA API fallback
          try {
            const fileBlob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
            const formData = new FormData();
            formData.append("providers", "google");
            formData.append("fallback_providers", "openai");
            formData.append("file", fileBlob, "page.jpg");
            formData.append(
              "question",
              "Read this textbook page in its entirety. Transcribe all explanation text, definitions, scientific concepts, formulas, equations, headings, and instructional details with extreme precision in the exact original language of the page (Arabic/English/etc.) without omitting or abbreviating any educational explanation. Do not transcribe questions or exercises; focus entirely on the full lesson explanation."
            );

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            const vqaResponse = await fetch("https://api.edenai.run/v2/image/question_answer", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${cleanEdenKey}`,
              },
              body: formData,
              signal: controller.signal,
            }).finally(() => clearTimeout(timeoutId));

            if (vqaResponse.ok) {
              const vqaData = await vqaResponse.json();
              const googleAnswers = vqaData?.google?.answers;
              const openaiAnswers = vqaData?.openai?.answers;

              const description =
                (googleAnswers && googleAnswers.length > 0 ? googleAnswers[0] : null) ||
                (openaiAnswers && openaiAnswers.length > 0 ? openaiAnswers[0] : null) ||
                vqaData?.google?.answer ||
                vqaData?.openai?.answer ||
                "";

              if (description && description.trim().length > 0 && !description.includes("عذرًا")) {
                return description.trim();
              }
            } else if (vqaResponse.status === 402) {
              throw new Error("رصيد EdenAI غير كافٍ (402 No more credits) - يرجى شحن الرصيد أو استخدام مفتاح Google Gemini");
            }
          } catch (vqaErr: any) {
            if (vqaErr.message?.includes("402") || vqaErr.message?.includes("No more credits")) {
              throw vqaErr;
            }
          }
        }
      }

      // Step 4: Digital text from PDF layer
      if (extractedText && extractedText.trim().length > 20) {
        return extractedText.trim();
      }

      // If no image and no text, page is blank
      if (!imageBuffer || imageBuffer.length === 0) {
        return extractedText ? extractedText.trim() : "";
      }

      // If image exists but all OCR providers failed or keys missing
      if (!geminiKey && !cleanEdenKey && !deepseekKey && !alibabaKey) {
        throw new Error("لم يتم إدخال مفتاح API صالح للرؤية البصرية (يرجى إدخال مفتاح DeepSeek أو EdenAI أو Google Gemini في الإعدادات)");
      }

      throw new Error("تعذر استخراج نصوص الصفحة من الصورة - يرجى التحقق من صلاحية ورصيد مفاتيح الـ API");
    } catch (error: any) {
      const isCritical =
        error.message?.includes("402") ||
        error.message?.includes("No more credits") ||
        error.message?.includes("401") ||
        error.message?.includes("لم يتم إدخال مفتاح");

      if (isCritical) {
        throw error;
      }

      const delayMs = Math.min(1000 * Math.pow(1.5, attempt - 1), 8000);

      if (options.onNetworkWait) {
        options.onNetworkWait(attempt, maxRetries, delayMs);
      }

      if (attempt >= maxRetries) {
        if (extractedText && extractedText.trim().length > 0) {
          return extractedText.trim();
        }
        throw new Error(`فشل استخراج النصوص بعد ${maxRetries} محاولات: ${error.message}`);
      }

      await new Promise((res) => setTimeout(res, delayMs));
    }
  }

  return extractedText ? extractedText.trim() : "";
}
