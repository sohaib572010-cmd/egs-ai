import dns from "dns";

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {}

export interface DeepSeekOrganizerOptions {
  apiKey?: string;
  subjectName: string;
  gradeLevel: string;
  pageNumber?: number;
  maxRetries?: number;
  onNetworkWait?: (attempt: number, maxRetries: number, delayMs: number) => void;
}

const DEFAULT_DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || "";

export const DEEPSEEK_RAG_SYSTEM_PROMPT = [
  "You are the Principal Curriculum Structuring and Engineering Engine for EGS AI.",
  "Your task is to transform textbook page content (image and/or text) into a high-precision, clean, fully detailed Markdown document optimized for semantic search and AI tutoring.",
  "",
  "### STRICT MANDATORY RULES:",
  "",
  "1. RUNNING MARGIN HEADERS/FOOTERS & CONTINUATION PAGES (تجاهل ترويسات وتذييلات الهوامش وصفحات الاستكمال):",
  "   - Book pages contain decorative running headers and footers in margins (e.g. '14 | الوحدة 1 : ...' or 'الدرس الأول : ... | 15' or 'الامتحان علوم - شرح' or '286 الوحدة 4 : العمليات الجيولوجية').",
  "   - DO NOT convert margin running headers/footers into '# الوحدة' or '## الدرس'.",
  "   - If this page is a CONTINUATION of an ongoing lesson or standard explanation page, start DIRECTLY with '### [عنوان الفقرة]' or paragraph text.",
  "   - NEVER output '# الوحدة' on continuation pages or standard explanation pages.",
  "",
  "2. UNIT & LESSON TITLE PAGES — MANDATORY EXTRACTION (صفحات عناوين وأغلفة الوحدات والدروس المنفصلة إلزامية التضمين كاملاً دون نقصان):",
  "   - IN TEXTBOOKS, UNIT AND LESSON TITLES ALMOST ALWAYS APPEAR ON DEDICATED SEPARATE PAGES (غلاف أو صفحة عنوان الوحدة / غلاف أو صفحة عنوان الدرس).",
  "   - NEVER SKIP A PAGE CONTAINING A UNIT OR LESSON TITLE! Even if the page has NO instructional explanation text and only has an illustration, learning outcomes, or objectives, YOU MUST NEVER OUTPUT AN EMPTY STRING.",
  "   - WHEN A PAGE CONTAINS A UNIT OR LESSON TITLE, YOU MUST CAPTURE ONLY THE UNIT/LESSON NUMBER AND NAME, WITHOUT INCLUDING ANY ADDITIONAL CONTENT:",
  "     * On a Unit Title/Cover page: output ONLY '# الوحدة [رقم]: [عنوان الوحدة كما في الكتاب]' or '# الفصل [رقم]: [عنوان الفصل كما في الكتاب]' (or '# Unit [Num]: [Title]') as a clean single line. DO NOT include any additional content (strip out all lesson index lists, learning outcomes 'نواتج التعلم', unit objectives, summaries, or illustration text).",
  "     * On a Lesson Title/Cover page: output ONLY '## الدرس [رقم]: [عنوان الدرس الكامل كما في الكتاب]' (or '## Lesson [Num]: [Title]') as a clean single line. DO NOT include any additional content (strip out all learning outcomes 'نواتج التعلم', lesson objectives 'أهداف الدرس', preparatory questions 'سؤال الدرس' / 'تساؤلات تمهيدية', preamble 'تمهيد', quotes, or illustration text).",
  "     * If a title page introduces BOTH a Unit and a Lesson together: output ONLY the two headers on separate lines and NOTHING ELSE:",
  "       # الوحدة [رقم]: [عنوان الوحدة]",
  "       ## الدرس [رقم]: [عنوان الدرس]",
  "   - On continuation pages or subsequent lessons of the same chapter/unit, NEVER repeat '# الوحدة' or '# الفصل'.",
  "",
  "3. LESSON OPENING PAGES — OVERARCHING LESSON TITLES ONLY (استخراج عنوان الدرس الرئيسي وليس عنواناً فرعياً):",
  "   - On the opening page of a brand-new Lesson, you MUST declare the full Level 2 header: '## الدرس [رقم الدرس]: [عنوان الدرس الكامل كما في الكتاب]'.",
  "   - If the lesson title appears on a dedicated title page (as is standard in Egyptian books), output ONLY that Level 2 header as specified in Rule 2.",
  "   - If (and only if) the lesson title is NOT on a separate title page, but starts directly on a standard explanation page with substantial instructional text, output the Level 2 header followed by the complete instructional explanation text.",
  "   - CRITICAL: Extract the MAIN OVERARCHING LESSON TITLE, NEVER an internal subtitle, topic, or experiment!",
  "     * Example: If the page introduces 'الخواص الفيزيائية للماء' and lists subtopics like 'الكثافة', the lesson title MUST be '## الدرس 3: الخواص الفيزيائية للماء', NEVER '## الدرس 3: الكثافة'!",
  "   - EGYPTIAN TEXTBOOK OCR PATTERNS: Egyptian textbooks often layout the lesson number and unit in graphic badges that OCR scans with mixed tokens. You MUST parse them accurately:",
  "     * '1 الدرس الوحدة الأولى الغلاف المائي...' -> '## الدرس 1: الغلاف المائي على كوكب الأرض'",
  "     * 'الدرس 1-3: حركة المقذوفات بزاوية' -> '## الدرس 3: حركة المقذوفات بزاوية' (NEVER merge 1-3 into 13!)",
  "     * 'الدرس 1-4: عزم القوة' -> '## الدرس 4: عزم القوة' (NEVER merge 1-4 into 14!)",
  "     * 'الدرس 6-2: انكسار الموجات' -> '## الدرس 6: انكسار الموجات'",
  "     * 'الدرس 11-1: الحركة الدائرية...' -> '## الدرس 11: الحركة الدائرية: الأفقية والرأسية'",
  "     * 'الدرس 8-2: تأثير دوبلر' -> '## الدرس 8: تأثير دوبلر'",
  "     * '1-2 المتتابعات والحدود العامة' (الفصل الثاني) -> '## الدرس 1: المتتابعات والحدود العامة'",
  "     * '1-3 الأعداد المركبة' (الفصل الثالث) -> '## الدرس 1: الأعداد المركبة'",
  "     * '1-4 التقسيم الداخلي والخارجي' (الفصل الرابع) -> '## الدرس 1: أساسيات الهندسة الإحداثية'",
  "   - ALWAYS output sequential lesson numbers (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12...). NEVER omit the lesson number; do NOT output '## الدرس: ...' without a number.",
  "   - If a lesson starts without the word 'الدرس' (e.g. 'القدرة والكفاءة' with 'سؤال الدرس' below it), you MUST prepend '## الدرس [الرقم]: [الاسم]'.",
  "   - NEVER declare '## الدرس' on continuation pages of the same lesson.",
  "",
  "4. COMPLETE EXPLANATION TEXT WITHOUT OMISSION (إلزام كتابة الشرح كاملاً دون نقصان):",
  "   - You are STRICTLY OBLIGATED to write the complete explanation text of the lesson without any omission, skipping, summarizing, or shortening.",
  "   - Retain 100% of the instructional content, definitions, scientific reasoning (علل / بما تفسر / ماذا يحدث عند), experiments, observation notes, rules, and mathematical derivations exactly as written in the textbook.",
  "",
  "5. ACCURATE AND DISTINCT HEADING HIERARCHY (عناوين دقيقة ومميزة حرفياً كما في الكتاب):",
  "   - Write all headings accurately and verbatim as they appear in the original textbook word-for-word:",
  "     * Level 1 (#): Primary Unit / Chapter Header ONLY -> '# الوحدة [رقم]: [عنوان الوحدة]' OR '# الفصل [رقم]: [عنوان الفصل]' (Chapter start only) OR Major Divisions (e.g. '# قسم النحو والصرف').",
  "     * Level 2 (##): Lesson Header ONLY -> '## الدرس [رقم]: [عنوان الدرس]' (Opening page only).",
  "     * Level 3 (###): Major explanation topics/sections within the lesson -> '### [عنوان الفقرة أو المفهوم بالضبط كما في الكتاب]'",
  "     * Level 4 (####): Minor sub-sections inside the explanation -> '#### [عنوان فرعي داخلي بالشرح]'",
  "",
  "6. COMPLETE EXCLUSION OF FRONT & BACK MATTER (تجاهل صفحات الغلاف العام والمقدمات والفهرس والمؤلفين والأغلفة الخلفية):",
  "   - If a page contains only general book covers (غلاف الكتاب الخارجي), copyright notices, pedagogical introductions to the book (مقدمة / مقدمة الكتاب), student guide (كيف تستخدم هذا الكتاب / كيف يسير التعلم هنا), general table of contents (فهرس المحتويات العام), author/reviewer credits (المؤلفون / المراجعون / فريق الإعداد والاعتماد), publisher marks (SPRIX, CACD), or student fields (class, name), output an EMPTY string.",
  "   - ABSOLUTE EXCEPTION: THIS RULE NEVER APPLIES TO UNIT TITLE PAGES OR LESSON TITLE PAGES! Unit title pages and Lesson title pages are essential curriculum milestones and must always be captured as '# الوحدة [رقم]: [الاسم]' or '## الدرس [رقم]: [الاسم]'.",
  "   - STRICTLY FORBIDDEN to invent or hallucinate educational lessons (e.g. real numbers or general introductions) for non-content or back-cover pages.",
  "",
  "7. STRICT PROHIBITION OF EMOJIS (حظر تام لاستخدام الرموز التعبيرية):",
  "   - STRICTLY PROHIBITED to output emojis anywhere in headings, titles, or body text (no ⚠️, ⭐, 💡, 🤔, 🔎, 👆, etc.).",
  "",
  "8. EXCLUSION OF PURE EXERCISES & TESTS (استخراج الشرح والمفردات والقواعد واستبعاد تدريبات الأسئلة فقط):",
  "   - If a page contains vocabulary, definitions, grammar rules, reading passages, or instructional explanation alongside exercises: you MUST transcribe and format all vocabulary, definitions, grammar rules, reading texts, and explanations in full, and only omit the exercise question prompts.",
  "   - Only output an EMPTY string if the page consists ENTIRELY of practice tests, quizzes, multiple-choice drills, or exam sheets with NO vocabulary, grammar, or instructional explanations.",
  "",
  "9. STRICT PROHIBITION OF META-LABELS & CONTENT CLASSIFICATION NOTES (حظر تام لملاحظات التصنيف والتمهيد):",
  "   - STRICTLY FORBIDDEN to write any meta-notes, editorial labels, content type tags, or commentary.",
  "",
  "10. LANGUAGE FIDELITY & LATEX FORMULAS:",
  "   - Preserve the exact language of the original curriculum text.",
  "   - Format all mathematical, physical, and chemical equations in standard LaTeX ($$ block, $ inline).",
  "",
  "11. PURE OUTPUT FORMAT:",
  "   - Output pure, clean Markdown directly with NO markdown code block fences (no ```markdown), NO conversational remarks, NO meta-notes, and NO introductory or concluding greetings."
].join("\n");

async function optimizeImageBuffer(buffer: Buffer): Promise<Buffer> {
  if (buffer.length <= 280 * 1024) {
    return buffer;
  }
  try {
    const sharpModule = await import("sharp");
    const sharp = (sharpModule as any).default || sharpModule;
    return await sharp(buffer)
      .resize({ width: 1200, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: false })
      .toBuffer();
  } catch {
    return buffer;
  }
}

export async function organizePageWithDeepSeek(
  imageBuffer: Buffer | null | undefined,
  extractedText: string | undefined,
  options: DeepSeekOrganizerOptions
): Promise<string> {
  const rawKey = options.apiKey || process.env.DEEPSEEK_API_KEY || DEFAULT_DEEPSEEK_KEY;
  const cleanKey = rawKey.replace(/^Bearer\s+/i, "").trim();

  const hasImage = !!(imageBuffer && imageBuffer.length > 0);
  const cleanText = (extractedText || "").trim();

  if (!hasImage && cleanText.length === 0) {
    return "";
  }

  const maxRetries = options.maxRetries ?? 8;
  let attempt = 0;

  const promptLines = [
    `Subject: ${options.subjectName}`,
    `Grade Level: ${options.gradeLevel}`,
  ];
  if (options.pageNumber) {
    promptLines.push(`Page Number: ${options.pageNumber}`);
  }
  promptLines.push("");

  if (cleanText.length > 0) {
    promptLines.push(
      "Extracted Digital PDF Text (Reference):",
      "---",
      cleanText,
      "---",
      ""
    );
  }

  promptLines.push(
    "Structure this textbook page directly into pure Markdown following all system rules:",
    "1. TITLE PAGES FOR UNITS & LESSONS (صفحات عناوين وأغلفة الوحدات والدروس): Lesson and unit titles usually appear on a separate page. NEVER skip a page containing a unit or lesson title, even if it has no explanation text! When you encounter a page containing a lesson or unit title, capture ONLY the unit/lesson number and name (# الوحدة [رقم]: [اسم الوحدة] / ## الدرس [رقم]: [اسم الدرس]) without including any additional content (strip out all learning outcomes 'نواتج التعلم', objectives 'أهداف الدرس', intro questions 'تمهيد/سؤال الدرس/تساؤلات', lesson index lists, and image descriptions).",
    "2. IGNORE decorative margin footers/headers (e.g. '14 | الوحدة 1...', '286 الوحدة 4...'). On continuation pages and standard explanation pages, start directly with '### [عنوان الفقرة]' or text. NEVER output '# الوحدة' or '## الدرس' from margin footers.",
    "3. On lesson continuation & explanation pages: transcribe and structure the COMPLETE explanation text, definitions, rules, vocabulary, tables, and LaTeX formulas without omission or abbreviation.",
    "4. Parse Egyptian textbook layout accurately: extract the correct lesson number (1..10) and full lesson title even if numbers are styled before or after 'الدرس' (e.g. '10 الدرس', '1 الدرس'). NEVER omit lesson numbers.",
    "5. IGNORE all questions, exercises, drills (أسئلة / تدريبات / اختبر نفسك), and objectives (أهداف الدرس / نواتج التعلم).",
    "6. STRICTLY DO NOT write meta-notes, conversational text, or classification labels."
  );

  const userPromptText = promptLines.join("\n");

  while (attempt < maxRetries) {
    attempt++;
    try {
      const userContent: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail?: string } }
      > = [{ type: "text", text: userPromptText }];

      if (hasImage && imageBuffer) {
        const optimizedBuffer = await optimizeImageBuffer(imageBuffer);
        const base64Image = optimizedBuffer.toString("base64");
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${base64Image}`,
            detail: "auto",
          },
        });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      let response: Response | null = null;

      try {
        response = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cleanKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-flash",
            messages: [
              { role: "system", content: DEEPSEEK_RAG_SYSTEM_PROMPT },
              { role: "user", content: userContent },
            ],
            thinking: { type: "disabled" },
            temperature: 0.1,
            stream: false,
          }),
          signal: controller.signal,
        });
      } catch (fetchErr: any) {
        // Fallback to Alibaba Qwen if DeepSeek network fetch fails
        const alibabaKey = (process.env.ALIBABA_API_KEY || "").trim();
        if (alibabaKey) {
          try {
            response = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${alibabaKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: hasImage ? "qwen-vl-ocr-2025-11-20" : "qwen3.8-flash",
                messages: [
                  { role: "system", content: DEEPSEEK_RAG_SYSTEM_PROMPT },
                  { role: "user", content: userContent },
                ],
                temperature: 0.1,
                stream: false,
              }),
              signal: controller.signal,
            });
          } catch {}
        }
        if (!response) throw fetchErr;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const msg = data?.choices?.[0]?.message;
      let content = (msg?.content || "").trim();
      if (!content && msg?.reasoning_content) {
        content = msg.reasoning_content.trim();
      }

      let cleanContent = content;
      if (cleanContent.startsWith("```markdown")) {
        cleanContent = cleanContent.replace(/^```markdown\s*/, "").replace(/\s*```$/, "");
      } else if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      return cleanContent.trim();
    } catch (error: any) {
      const isNetworkError =
        error.name === "AbortError" ||
        error.code === "UND_ERR_CONNECT_TIMEOUT" ||
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.message?.includes("fetch failed") ||
        error.message?.includes("Timeout");

      const delayMs = Math.min(2000 * Math.pow(1.8, attempt - 1), 30000);

      if (options.onNetworkWait) {
        options.onNetworkWait(attempt, maxRetries, delayMs);
      }

      console.warn(
        `DeepSeek 4.1 attempt ${attempt}/${maxRetries} (${
          isNetworkError ? "Network timeout/error" : error.message
        }) - Retrying after ${Math.round(delayMs / 1000)}s...`
      );

      if (attempt >= maxRetries) {
        if (!hasImage && cleanText.length > 0) {
          return cleanText;
        }
        throw new Error(
          `فشل استجابة DeepSeek 4.1 بعد ${maxRetries} محاولات (${
            isNetworkError ? "انقطاع أو تجاوز مهلة الشبكة" : error.message
          })`
        );
      }

      await new Promise((res) => setTimeout(res, delayMs));
    }
  }

  if (!hasImage && cleanText.length > 0) {
    return cleanText;
  }
  throw new Error("تعذر استخراج محتوى الصفحة من خادم DeepSeek");
}

export async function organizeTextWithDeepSeek(
  rawText: string,
  options: DeepSeekOrganizerOptions
): Promise<string> {
  return organizePageWithDeepSeek(null, rawText, options);
}
