export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { getCurriculumContextForLesson } from '@/lib/curriculum_structure';
import { callGeminiFlash } from '@/lib/gemini';
import { isEnglishSubject } from '@/lib/subject_helpers';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

async function generateExamWithAI(systemPrompt: string, gradeLevel: string, subjectName: string): Promise<{ content: string; coinsCost: number }> {
  const deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
  if (deepseekApiKey) {
    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Generate an exam for grade level ${gradeLevel} and subject ${subjectName} as a strict JSON object.` }
          ],
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          temperature: 0.4,
          max_tokens: 8000
        })
      });

      if (response.ok) {
        const data = await response.json();
        const msg = data.choices?.[0]?.message;
        const content = (msg?.content || msg?.reasoning_content || '').trim();
        const promptTokens = data.usage?.prompt_tokens || 0;
        const completionTokens = data.usage?.completion_tokens || 0;
        const egpCost = (promptTokens / 1000000) * 30 + (completionTokens / 1000000) * 50;
        const coinsCost = egpCost * 12.5;
        if (content) {
          return { content, coinsCost };
        }
      } else {
        console.warn('DeepSeek exam generation returned status:', response.status, ', falling back to Gemini Flash.');
      }
    } catch (e) {
      console.warn('DeepSeek fetch error, falling back to Gemini Flash:', e);
    }
  }

  // Fallback to Gemini Flash via EdenAI
  try {
    const prompt = `${systemPrompt}\n\nUser request: Generate an exam for grade level ${gradeLevel} and subject ${subjectName} as a strict JSON object.`;
    const content = await callGeminiFlash(prompt, 1800);
    return { content, coinsCost: 0.5 };
  } catch (edenError: any) {
    console.error('All AI providers failed for exam generation:', edenError);
    throw new Error('تعذر إنشاء الامتحان في الوقت الحالي نظراً لانشغال مزودي الذكاء الاصطناعي. يرجى المحاولة مرة أخرى بعد قليل.');
  }
}

function parseGeneratedExam(content: string): any {
  let cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.substring(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return parsed;
      }
    } catch (_) {}
  }

  // Resilient fallback: extract title and all completed question objects
  const titleMatch = cleaned.match(/"title"\s*:\s*"([^"]+)"/);
  const title = titleMatch ? titleMatch[1] : undefined;

  const questionMatches: any[] = [];
  const questionRegex = /\{\s*"id"\s*:\s*"[^"]+"\s*,\s*"type"\s*:\s*"(?:multiple_choice|true_false|essay)"[\s\S]*?\n\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = questionRegex.exec(cleaned)) !== null) {
    try {
      const qObj = JSON.parse(m[0]);
      if (qObj.question && (qObj.options || qObj.type !== 'multiple_choice')) {
        questionMatches.push(qObj);
      }
    } catch (_) {}
  }

  if (questionMatches.length > 0) {
    return {
      title,
      questions: questionMatches
    };
  }

  return JSON.parse(cleaned);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const deviceIdHeader = req.headers.get('x-device-id');
    const body = await req.json();
    const { subject_name, grade_level, session_id, topic, mode, total_count, mcq_count, tf_count, essay_count } = body;

    if (!subject_name || !grade_level) {
      return NextResponse.json({ error: 'اسم المادة والسنة الدراسية مطلوبان' }, { status: 400 });
    }

    let userId: string | null = null;
    let deviceId: string | null = deviceIdHeader || null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      userId = verifySessionToken(token);
    }

    if (!userId) {
      return NextResponse.json({ error: 'تسجيل الدخول مطلوب لإنشاء الاختبارات' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    const coins = profile.coins === undefined ? 0.0 : profile.coins;
    const hasUnlimitedCredit = profile.role === 'admin' || !!profile.unlimited_credit;
    if (!hasUnlimitedCredit && coins <= 0) {
      return NextResponse.json({ error: 'لقد استنفدت رصيدك من النقاط. يرجى تجديد اشتراكك لمتابعة الاختبارات.' }, { status: 402 });
    }

    // Retrieve targeted curriculum text for the selected topic/lesson
    const curriculumText = await getCurriculumContextForLesson(grade_level, subject_name, topic || '');

    const adherenceInstruction = (topic && topic !== 'المنهج بالكامل' && topic !== 'مراجعة المنهج بالكامل')
      ? `\nFOCUS TOPIC CONSTRAINT: All questions MUST focus specifically on this lesson/topic: "${topic}". Do not ask questions from unrelated chapters.`
      : '';

    const isEnglish = isEnglishSubject(subject_name);

    let questionInstructions = "";
    if (mode === 'custom_types') {
      const mcqs = mcq_count ? parseInt(mcq_count, 10) : 0;
      const tfs = tf_count ? parseInt(tf_count, 10) : 0;
      const essays = essay_count ? parseInt(essay_count, 10) : 0;
      const total = mcqs + tfs + essays;
      
      questionInstructions = `Exam Question Counts: Exactly ${total} questions:
${mcqs > 0 ? `- Exactly ${mcqs} multiple-choice questions (multiple_choice) with 4 options in ${isEnglish ? 'English' : 'Arabic'}.\n` : ''}${tfs > 0 ? `- Exactly ${tfs} true/false questions (true_false) where correct_answer is strictly "true" or "false".\n` : ''}${essays > 0 ? `- Exactly ${essays} short essay questions (essay) where correct_answer is the concise model answer in ${isEnglish ? 'English' : 'Arabic'}.\n` : ''}`;
    } else if (mode === 'total_only') {
      const total = total_count ? parseInt(total_count, 10) : 5;
      questionInstructions = `Exam Question Counts: Exactly ${total} questions balanced across multiple_choice, true_false, and essay.`;
    } else {
      questionInstructions = `Exam Question Counts: Automatically generate a balanced, comprehensive exam (typically 4 to 6 questions) across multiple_choice, true_false, and essay.`;
    }

    const isMiddleSchool = ['1_middle', '2_middle', '3_middle'].includes(grade_level);
    const isHighSchool = ['1_high', '2_high'].includes(grade_level);

    const languageMandate = isEnglish
      ? `- CRITICAL MANDATE FOR ENGLISH EXAMS: ALL USER-FACING TEXT (questions, options, explanations, model answers, titles) MUST BE STRICTLY AND ONLY IN ENGLISH. NEVER USE ARABIC IN QUESTIONS, OPTIONS, ANSWERS, OR EXPLANATIONS.
- NUMERALS MANDATE: ALL numerals MUST be written in English digits (0, 1, 2, 3, 4, 5, 6, 7, 8, 9).
- Multiple-choice questions MUST have 4 options strictly in English (e.g. ["Option A", "Option B", "Option C", "Option D"]).
- True/false questions: question in English, correct_answer "true" or "false", explanation in English.
- Essay questions: question in English, correct_answer concise model answer in English, explanation in English.
- Exam title MUST be in English (e.g. "English Exam: ${topic || 'Language Practice'}").`
      : `- ALL USER-FACING TEXT (questions, options, explanations, model answers, titles) MUST BE IN IMPECCABLE, FORMAL MODERN STANDARD ARABIC (اللغة العربية الفصحى السليمة والدقيقة لغوياً وأكاديمياً).
- NUMERALS MANDATE (قاعدة كتابة الأرقام الإلزامية): ALL numerals (in question stems, options, problem values, given data, units, formulas, and explanations) MUST be written in Arabic numerals (٠، ١، ٢، ٣، ٤، ٥، ٦، ٧، ٨، ٩). English/Western digits (0-9) are strictly forbidden in Arabic exams.
- ABSOLUTELY ZERO COLLOQUIAL WORDS OR DIALECT PHRASING (ممنوع منعاً باتاً استخدام أي ألفاظ أو تراكيب عامية مثل: "إيه"، "ليه"، "مين"، "دول"، "علشان"، "ازاي"). Questions must conform to the formal academic standards of the Egyptian Ministry of Education and the National Center for Examinations.`;

    const schemaExample = isEnglish
      ? `{
  "title": "English Exam: ${topic || 'Comprehensive Practice'}",
  "subject_name": "${subject_name}",
  "grade_level": "${grade_level}",
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "question": "Which of the following sentences best demonstrates an action completed before another past event occurred?",
      "options": [
        "She had submitted the research report before the professor arrived.",
        "She has submitted the research report when the professor arrived.",
        "She was submitting the research report while the professor had arrived.",
        "She submitted the research report after the professor has arrived."
      ],
      "correct_answer": "She had submitted the research report before the professor arrived.",
      "explanation": "The Past Perfect ('had submitted') is specifically required to describe an action that happened prior to another past action ('arrived')."
    },
    {
      "id": "q2",
      "type": "true_false",
      "question": "In conditional sentences of type 2, the 'if-clause' uses the past simple to describe hypothetical or unlikely situations in the present or future.",
      "correct_answer": "true",
      "explanation": "Second conditional structures ('if + past simple, would + infinitive') express unreal, hypothetical, or improbable present/future conditions."
    },
    {
      "id": "q3",
      "type": "essay",
      "question": "Differentiate between the usage of 'must' for deduction and 'must' for obligation, providing a concise contextual example for each.",
      "correct_answer": "'Must' for deduction indicates strong logical certainty based on evidence (e.g., 'He has studied all day; he must be exhausted'). 'Must' for obligation expresses personal necessity or a strong rule (e.g., 'Students must wear uniforms').",
      "explanation": "Evaluation focuses on clear functional distinction between modal deduction and deontic obligation with valid examples."
    }
  ]
}`
      : `{
  "title": "اختبار تقييم نواتج التعلم: ${topic || subject_name}",
  "subject_name": "${subject_name}",
  "grade_level": "${grade_level}",
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "question": "في تجربة لدراسة أثر تركيز المتفاعلات على معدل التفاعل الكيميائي، لوحظ تضاعف سرعة التفاعل أربع مرات عند مضاعفة تركيز المادة (أ) مرتين مع ثبوت تركيز المادة (ب). ما الاستنتاج العلمي الأدق لرتبة التفاعل بالنسبة للمادة (أ)؟",
      "options": [
        "التفاعل من الرتبة الأولى بالنسبة للمادة (أ)",
        "التفاعل من الرتبة الثانية بالنسبة للمادة (أ)",
        "التفاعل من الرتبة الصفرية ولا يعتمد على تركيز (أ)",
        "التفاعل عكسي ويتناسب عكسياً مع مربع تركيز (أ)"
      ],
      "correct_answer": "التفاعل من الرتبة الثانية بالنسبة للمادة (أ)",
      "explanation": "بما أن تضاعف التركيز مرتين ($٢$) أدى إلى زيادة سرعة التفاعل بمقدار $٢^٢ = ٤$ مرات، فإن معدل التفاعل يتناسب طردياً مع مربع التركيز، مما يثبت أن التفاعل من الرتبة الثانية."
    },
    {
      "id": "q2",
      "type": "true_false",
      "question": "تزداد طاقة حركة الإلكترونات المنبعثة في ظاهرة التأثير الكهروضوئي بزيادة شدة الضوء الساقط عند ثبوت تردده أعلى من التردد الحرج.",
      "correct_answer": "false",
      "explanation": "طاقة حركة الإلكترونات المنبعثة تتوقف فقط على تردد الضوء الساقط ودالة الشغل لمعدن المهبط، بينما تؤثر شدة الضوء الساقط على عدد الإلكترونات المنبعثة (شدة تيار الانبعاث) وليس طاقتها الحركية."
    },
    {
      "id": "q3",
      "type": "essay",
      "question": "علل علمياً: يفضل استخدام التيار المتردد عن التيار المستمر في نقل الطاقة الكهربية لمسافات طويلة من محطات التوليد إلى أماكن الاستهلاك.",
      "correct_answer": "لأنه يمكن رفع أو خفض جهده الكهربي بواسطة المحولات الكهربية، مما يتيح نقله عبر خطوط النقل بجهد فائق وتيار شدته منخفضة جداً، فتقل الطاقة الكهربية المفقودة في الأسلاك على هيئة حرارة ($ت^2 \\times م \\times ز$).",
      "explanation": "الإجابة النموذجية تشمل ذكر المحولات الكهربية، خفض شدة التيار، وتقليل الفقد الحراري في الأسلاك."
    }
  ]
}`;

    const systemPrompt = `You are the Principal Exam Generator for the Egyptian National Curriculum (Middle & High School).
Generate a balanced, rigorous, highly intelligent exam adhering strictly to Egyptian curriculum standards and modern Secondary School exam methodology (معايير المركز القومي للامتحانات ونظام التقييم الحديث بالثانوية العامة).

================================================================================
CRITICAL LANGUAGE & OUTPUT MANDATE:
${languageMandate}
- Format all mathematical, physical, and chemical formulas in standard LaTeX ($$ or $). Strictly avoid raw Unicode superscripts (⁰-⁹) or Unicode multiply (×) in plain text.
- Return strict JSON ONLY (no markdown fences, no conversational prose).

CRITICAL EXAM QUESTION QUALITY RULES:
1. FULL COMPREHENSION & MEANING DERIVATION (الفهم العميق والاستنباط بدلاً من الحفظ والتلقين):
   - ALL questions must rely on full comprehension and the student's ability to derive meaning, relationships, and implications from the curriculum text.
   - ABSOLUTE PROHIBITION OF ROTE MEMORIZATION: Do NOT ask shallow questions asking for bare definitions ("ما هو تعريف...", "اذكر نص قانون..."), reciting dates or isolated numbers without context, or literal keyword matching.
   - Every question must assess understanding of underlying scientific/literary mechanisms, application to realistic scenarios, or analysis of cause-and-effect.

2. HIGH SCHOOL VS. MIDDLE SCHOOL PEDAGOGICAL DIFFERENTIATION:
   ${isHighSchool ? `* HIGH SCHOOL LEVEL MANDATE (المرحلة الثانوية والبكالوريا - نظام التقييم الحديث ونواتج التعلم):
   - Every question must measure Bloom's Higher-Order Thinking Skills (HOTS): Analysis, Evaluation, Synthesis, and Deductive Problem-Solving.
   - Focus on modern Egyptian Secondary School exam standards: interpret relationships between multiple concepts, analyze experimental data or scenarios, evaluate boundary limits, and distinguish between closely related concepts.
   - Distractors (المشتتات) must be intelligent, scientifically plausible concepts representing common analytical pitfalls, never silly or obvious options.` : `* MIDDLE SCHOOL LEVEL MANDATE (المرحلة الإعدادية):
   - Focus on conceptual comprehension, scientific cause-and-effect (العلة والمعلول), and practical deduction suited to preparatory school cognition.
   - Avoid rote cramming while ensuring clarity and accessibility.`}

3. ZERO UNNECESSARY OR NONSENSICAL QUESTIONS:
   - Every question must be meaningful, unambiguous, academically sound, and grounded in the syllabus context.
   - Do NOT generate filler, repetitive, trivial, or nonsensical questions.

4. MANDATORY RANDOMIZATION OF CORRECT ANSWERS:
   - For multiple_choice questions, distribute the correct answers evenly across all 4 positions (Options 1, 2, 3, 4 / أ، ب، ج، د).
   - NEVER place the correct answer as option A by default! In 4 questions, each option position should be used approximately once.
   - The "correct_answer" field for multiple_choice MUST be the exact verbatim string of one of the options in the "options" array.
   - Explanations must clearly explain why the correct choice is valid and why the key distractor is incorrect.
================================================================================

Target Curriculum Context:
"""
${curriculumText ? curriculumText.slice(0, 10000) : 'General Egyptian Curriculum for ' + subject_name}
"""
${adherenceInstruction}
${questionInstructions}

JSON Output Schema:
${schemaExample}`;

    const { content: rawAiResponse, coinsCost } = await generateExamWithAI(systemPrompt, grade_level, subject_name);

    let parsedExam: any;
    try {
      parsedExam = parseGeneratedExam(rawAiResponse);
    } catch (parseError) {
      console.error('Failed to parse AI exam response:', rawAiResponse, parseError);
      return NextResponse.json({ error: 'حدث خطأ في معالجة وتنسيق أسئلة الاختبار من الذكاء الاصطناعي.' }, { status: 500 });
    }

    if (!parsedExam || !Array.isArray(parsedExam.questions) || parsedExam.questions.length === 0) {
      return NextResponse.json({ error: 'لم يتم إنشاء أي أسئلة صالحة للاختبار.' }, { status: 500 });
    }

    const savedExam = await db.createExam({
      title: parsedExam.title || (isEnglish ? `English Exam - ${topic || 'Practice'}` : `اختبار ${subject_name}`),
      questions: parsedExam.questions,
      subject_name: subject_name,
      grade_level: grade_level,
      session_id: session_id,
      user_id: userId,
      device_id: deviceId || undefined
    });

    await db.deductCoins(userId, deviceId, coinsCost);

    // Strip answers from response
    const questionsWithoutAnswers = (savedExam.questions || []).map((q: any) => {
      const { correct_answer, explanation, ...rest } = q;
      return rest;
    });

    return NextResponse.json({
      success: true,
      exam: {
        ...savedExam,
        questions: questionsWithoutAnswers
      }
    });

  } catch (error: any) {
    console.error('Exam generation error:', error);
    return NextResponse.json({ error: error?.message || 'حدث خطأ غير متوقع أثناء إنشاء الاختبار.' }, { status: 500 });
  }
}