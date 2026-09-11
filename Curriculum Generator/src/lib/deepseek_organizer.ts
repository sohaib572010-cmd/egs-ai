import dns from "dns";

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {}

export interface DeepSeekOrganizerOptions {
  apiKey?: string;
  subjectName: string;
  gradeLevel: string;
  maxRetries?: number;
  onNetworkWait?: (attempt: number, maxRetries: number, delayMs: number) => void;
}

const DEFAULT_DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || "";

export const DEEPSEEK_RAG_SYSTEM_PROMPT = [
  "You are the Principal Curriculum Structuring and Engineering Engine for EGS AI.",
  "Your task is to transform raw OCR extracted textbook page text into a high-precision, clean, fully detailed Markdown document optimized for semantic search and AI tutoring.",
  "",
  "### STRICT MANDATORY RULES:",
  "",
  "1. RUNNING MARGIN HEADERS/FOOTERS & CONTINUATION PAGES (تجاهل ترويسات وتذييلات الهوامش وصفحات الاستكمال):",
  "   - Book pages contain decorative running headers and footers in margins (e.g. '14 | الوحدة 1 : ...' or 'الدرس الأول : ... | 15' or 'الامتحان علوم - شرح' or '286 الوحدة 4 : العمليات الجيولوجية').",
  "   - DO NOT convert margin running headers/footers into '# الوحدة' or '## الدرس'.",
  "   - If this page is a CONTINUATION of an ongoing lesson or standard explanation page, start DIRECTLY with '### [عنوان الفقرة]' or paragraph text.",
  "   - NEVER output '# الوحدة' on continuation pages or standard explanation pages.",
  "",
  "2. UNIT & CHAPTER DECLARATIONS (إعلان الفصول والوحدات بدقة ومنع ضياع الفصول):",
  "   - If a page introduces a brand-new Unit or Chapter (either as a standalone cover page OR in the top header/banner of the first lesson of that chapter, e.g. 'الفصل الأول: البراهين الجبرية', 'الفصل الثاني: المتتابعات', 'الفصل الثالث: الأعداد المركبة والمعادلات', 'الفصل الرابع: الهندسة والمعادلات'):",
  "     * You MUST declare the Level 1 header at the very top of the output: '# الوحدة [رقم]: [عنوان الوحدة كما في الكتاب]' or '# الفصل [رقم]: [عنوان الفصل كما في الكتاب]'.",
  "     * If the same page also begins the first lesson of that chapter, immediately follow the Level 1 header with '## الدرس 1: [عنوان الدرس]'.",
  "   - On continuation pages or subsequent lessons of the same chapter/unit, NEVER repeat '# الوحدة' or '# الفصل'.",
  "",
  "3. LESSON OPENING PAGES — OVERARCHING LESSON TITLES ONLY (استخراج عنوان الدرس الرئيسي وليس عنواناً فرعياً):",
  "   - On the opening page of a brand-new Lesson, you MUST declare the full Level 2 header: '## الدرس [رقم الدرس]: [عنوان الدرس الكامل كما في الكتاب]'.",
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
  "6. COMPLETE EXCLUSION OF FRONT & BACK MATTER (تجاهل صفحات الغلاف والمقدمات والفهرس والمؤلفين والأغلفة الخلفية):",
  "   - If a page contains only book covers, copyright notices, pedagogical introductions (مقدمة / مقدمة الكتاب), student guide (كيف تستخدم هذا الكتاب / كيف يسير التعلم هنا), table of contents (فهرس المحتويات), author/reviewer credits (المؤلفون / المراجعون / فريق الإعداد والاعتماد), publisher marks (SPRIX, CACD), or student fields (class, name), output an EMPTY string.",
  "   - STRICTLY FORBIDDEN to invent or hallucinate educational lessons (e.g. real numbers or general introductions) for non-content or back-cover pages.",
  "",
  "7. STRICT PROHIBITION OF EMOJIS (حظر تام لاستخدام الرموز التعبيرية):",
  "   - STRICTLY PROHIBITED to output emojis anywhere in headings, titles, or body text (no ⚠️, ⭐, 💡, 🤔, 🔎, 👆, etc.).",
  "",
  "8. COMPLETE EXCLUSION OF QUESTIONS & EXERCISES (تجاهل جميع الأسئلة والاكتفاء بالشرح فقط):",
  "   - If there are questions, exercises, tests, drills, problem sets, or quizzes on the lesson, you MUST COMPLETELY IGNORE AND EXCLUDE THEM.",
  "   - Output ONLY the educational explanation, rules, facts, and concepts.",
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

export async function organizeTextWithDeepSeek(
  rawText: string,
  options: DeepSeekOrganizerOptions
): Promise<string> {
  const rawKey = options.apiKey || process.env.DEEPSEEK_API_KEY || DEFAULT_DEEPSEEK_KEY;
  const cleanKey = rawKey.replace(/^Bearer\s+/i, "").trim();

  if (!rawText || rawText.trim().length === 0) {
    return "";
  }

  const maxRetries = options.maxRetries ?? 8;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const userPrompt = [
        `Subject: ${options.subjectName}`,
        `Grade Level: ${options.gradeLevel}`,
        "",
        "Raw Extracted Textbook Page Text:",
        "---",
        rawText,
        "---",
        "",
        "Structure this textbook page into pure Markdown following all system rules:",
        "1. IGNORE decorative margin footers/headers (e.g. '14 | الوحدة 1...', '286 الوحدة 4...'). On continuation pages and standard explanation pages, start directly with '### [عنوان الفقرة]' or text. NEVER output '# الوحدة' or '## الدرس' from margin footers.",
        "2. On Unit cover pages ONLY, write ONLY the Unit header (# الوحدة [الرقم]: [اسم الوحدة الكامل]) as a single line and NOTHING ELSE. Distinguish Unit covers (index of all lessons) from Lesson opening pages. NEVER output '# الوحدة' on a Lesson opening page.",
        "3. Declare the full Level 2 header (## الدرس [رقم]: [عنوان الدرس الكامل]) on the opening page of every lesson/chapter. ALWAYS extract the overarching Lesson Title (e.g. 'الخواص الفيزيائية للماء', 'العوامل الفيزيائية وتأثيرها في الغلاف الجوي'), NEVER an internal subtopic (e.g. NOT 'الكثافة', NOT 'تكيف الكائنات الحية'). Subtopics and introductory topics go under the '##' header as '###'.",
        "4. Parse Egyptian textbook OCR layout properly: extract the correct lesson number (1..10) and full lesson title even if numbers are styled before or after 'الدرس' (e.g. '10 الدرس', '1 الدرس'). NEVER omit lesson numbers.",
        "5. Write the COMPLETE explanation text without omission or abbreviation.",
        "6. IGNORE all questions, exercises, drills (أسئلة / تدريبات / اختبر نفسك), and objectives (أهداف الدرس / نواتج التعلم).",
        "7. STRICTLY DO NOT write meta-notes or labels saying this is introductory content or explanation.",
      ].join("\n");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      let response: Response | null = null;
      let usedAlibaba = false;

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
              { role: "user", content: userPrompt },
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
            usedAlibaba = true;
            response = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${alibabaKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "qwen3.8-flash",
                messages: [
                  { role: "system", content: DEEPSEEK_RAG_SYSTEM_PROMPT },
                  { role: "user", content: userPrompt },
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
      const content = data?.choices?.[0]?.message?.content || "";

      let cleanContent = content.trim();
      if (cleanContent.startsWith("```markdown")) {
        cleanContent = cleanContent.replace(/^```markdown\s*/, "").replace(/\s*```$/, "");
      } else if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      return cleanContent;
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
        `DeepSeek attempt ${attempt}/${maxRetries} (${
          isNetworkError ? "Network timeout/error" : error.message
        }) - Retrying after ${Math.round(delayMs / 1000)}s...`
      );

      if (attempt >= maxRetries) {
        return rawText.trim();
      }

      await new Promise((res) => setTimeout(res, delayMs));
    }
  }

  return rawText.trim();
}
