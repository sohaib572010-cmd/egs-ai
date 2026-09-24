export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { getCurriculumContextForLesson } from '@/lib/curriculum_structure';
import { callGeminiFlash } from '@/lib/gemini';
import { isEnglishSubject } from '@/lib/subject_helpers';
import { buildOfficialExamSystemPrompt } from '@/lib/exam_specifications';

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
    const { subject_name, grade_level, session_id, topic, mode, total_count, mcq_count, tf_count, essay_count, remedial_concepts } = body;

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
    const effectiveTopic = (mode === 'remedial' && Array.isArray(remedial_concepts) && remedial_concepts.length > 0)
      ? remedial_concepts.join(' ')
      : (topic || '');
    const curriculumText = await getCurriculumContextForLesson(grade_level, subject_name, effectiveTopic);
    const isEnglish = isEnglishSubject(subject_name);

    const systemPrompt = buildOfficialExamSystemPrompt({
      gradeLevel: grade_level,
      subjectName: subject_name,
      topic,
      mode,
      remedialConcepts: remedial_concepts,
      mcqCount: mcq_count,
      tfCount: tf_count,
      essayCount: essay_count,
      totalCount: total_count
    }, curriculumText);

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
      coins_deducted: coinsCost,
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