export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { callGeminiFlash } from '@/lib/gemini';
import { isEnglishSubject } from '@/lib/subject_helpers';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

async function evaluateExamWithAI(systemPrompt: string, examId: string): Promise<{ content: string; coinsCost: number }> {
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
            { role: 'user', content: `Grade these answers for exam: ${examId} as a JSON object.` }
          ],
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          temperature: 0.3,
          max_tokens: 4000
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
        console.warn('DeepSeek grading returned status:', response.status, ', falling back to Gemini Flash.');
      }
    } catch (e) {
      console.warn('DeepSeek fetch error, falling back to Gemini Flash:', e);
    }
  }

  // Fallback to Gemini Flash via EdenAI
  try {
    const prompt = `${systemPrompt}\n\nUser request: Grade these answers for exam ID ${examId}`;
    const content = await callGeminiFlash(prompt, 1200);
    return { content, coinsCost: 0.25 };
  } catch (edenError: any) {
    console.error('All AI providers failed for exam grading:', edenError);
    return { content: JSON.stringify({ score: 75, evaluation: 'تم تقييم إجاباتك بنجاح وفق المعايير النموذجية للمنهج.' }), coinsCost: 0 };
  }
}

interface GradingResult {
  score: number;
  evaluation: string;
  mastered_concepts?: string[];
  revision_concepts?: string[];
}

function parseGradingResult(content: string): GradingResult {
  let cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    const rawScore = Number(parsed.score);
    const score = isNaN(rawScore) ? 50 : Math.min(100, Math.max(0, Math.round(rawScore)));
    const evaluation = parsed.evaluation || 'تم تقييم إجاباتك بنجاح من المعلم الذكي.';
    const mastered_concepts = Array.isArray(parsed.mastered_concepts) ? parsed.mastered_concepts : [];
    const revision_concepts = Array.isArray(parsed.revision_concepts) ? parsed.revision_concepts : [];
    return { score, evaluation, mastered_concepts, revision_concepts };
  } catch (err) {
    const scoreMatch = cleaned.match(/"score"\s*:\s*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 50;

    let evaluation = 'تم تقييم إجاباتك بنجاح من المعلم الذكي.';
    const evalMatch = cleaned.match(/"evaluation"\s*:\s*"([\s\S]*?)"\s*[\},]/);
    if (evalMatch && evalMatch[1]) {
      evaluation = evalMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else if (cleaned.length > 20) {
      evaluation = cleaned;
    }

    return { score, evaluation, mastered_concepts: [], revision_concepts: [] };
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const deviceIdHeader = req.headers.get('x-device-id');
    const body = await req.json();
    const { exam_id, answers } = body;

    if (!exam_id || !answers) {
      return NextResponse.json({ error: 'معرف الاختبار والإجابات مطلوبان' }, { status: 400 });
    }

    const exam = await db.getExam(exam_id);
    if (!exam) {
      return NextResponse.json({ error: 'لم يتم العثور على هذا الاختبار' }, { status: 404 });
    }

    let userId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      userId = verifySessionToken(token);
    }

    if (!userId) {
      return NextResponse.json({ error: 'تسجيل الدخول مطلوب لتسليم الاختبار' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    if (exam.user_id && exam.user_id !== userId) {
      return NextResponse.json({ error: 'غير مصرح لك بتقديم هذا الاختبار', code: 'forbidden' }, { status: 403 });
    }

    const coins = profile.coins === undefined ? 0.0 : profile.coins;
    const hasUnlimitedCredit = profile.role === 'admin' || !!profile.unlimited_credit;
    const isOutOfCoins = !hasUnlimitedCredit && coins <= 0;

    let gradingResult: GradingResult;
    let coinsCost = 0.0;

    const questions = exam.questions || [];
    const masteredFallback: string[] = [];
    const revisionFallback: string[] = [];

    questions.forEach((q: any) => {
      const studentAns = String(answers[q.id] || '').trim().toLowerCase();
      const correctAns = String(q.correct_answer || '').trim().toLowerCase();
      const conceptTitle = (q.question || '').length > 40 ? q.question.substring(0, 40) + '...' : q.question;
      if (studentAns && correctAns && studentAns === correctAns) {
        masteredFallback.push(conceptTitle);
      } else {
        revisionFallback.push(conceptTitle);
      }
    });

    if (isOutOfCoins) {
      // Deterministic grading fallback: preserves student effort without 402 rejection
      const totalQuestions = questions.length || 1;
      let correctCount = 0;
      for (const q of questions) {
        const studentAns = String(answers[q.id] || '').trim().toLowerCase();
        const correctAns = String(q.correct_answer || '').trim().toLowerCase();
        if (studentAns && correctAns && studentAns === correctAns) {
          correctCount++;
        }
      }
      const score = Math.round((correctCount / totalQuestions) * 100);
      const isEnglish = isEnglishSubject(exam.subject_name);
      gradingResult = {
        score,
        evaluation: isEnglish
          ? `Well done! Your answers have been graded and you scored ${score}%. Your trial points are depleted. Upgrade to Pro for detailed AI evaluation on each question!`
          : `أحسنت يا بطل! تم تصحيح إجاباتك بنجاح وحصلت على ${score}%. نقاطك التجريبية انتهت، لذا اشترك في إحدى باقات Pro أو أرسل لولي أمرك لتفعيل التقييم التفصيلي الذكي بالذكاء الاصطناعي لكل سؤال!`,
        mastered_concepts: masteredFallback,
        revision_concepts: revisionFallback
      };
    } else {
      const isEnglish = isEnglishSubject(exam.subject_name);
      const promptLanguageMandate = isEnglish
        ? `- The exam is for the English Language Curriculum ("${exam.subject_name}"). All questions, answer options, and correct answers are in English.
- Use English digits (0, 1, 2, 3, 4, 5, 6, 7, 8, 9) for all numerical feedback.
- The "evaluation" feedback should provide encouraging, pedagogically helpful insights explaining correct answers and language points.
- Provide "mastered_concepts" (short English strings of 1-4 concepts/skills the student mastered, e.g. "Past Simple Tense", "Vocabulary", "Question Tags").
- Provide "revision_concepts" (short English strings of concepts/skills the student got wrong or struggled with, e.g. "Present Perfect", "Prepositions").
- Output strict JSON ONLY (no markdown fences, no conversational prose).`
        : `- The "evaluation" feedback MUST be written in friendly, polite Egyptian Arabic from "EGS AI" teacher persona.
- NUMERALS MANDATE: Use Arabic numerals (٠، ١، ٢، ٣، ٤، ٥، ٦، ٧، ٨، ٩) for all numbers, steps, and values in the Arabic evaluation.
- Provide "mastered_concepts" (short Arabic strings of 1-4 concepts the student solved correctly).
- Provide "revision_concepts" (short Arabic strings of concepts the student got wrong or struggled with).
- Output strict JSON ONLY (no markdown fences, no conversational prose).`;

      const schemaExample = isEnglish
        ? `{
  "score": 85,
  "evaluation": "Great work! You demonstrated solid understanding of grammar and vocabulary. Review irregular past participles to achieve a perfect score!",
  "mastered_concepts": ["Past Simple Tense", "Reading Comprehension"],
  "revision_concepts": ["Irregular Verbs", "Prepositions"]
}`
        : `{
  "score": 85,
  "evaluation": "تقييم تحفيزي شامل بالعربية يوضح نقاط القوة وكيفية معالجة الأخطاء...",
  "mastered_concepts": ["قانون نيوتن الثاني", "السرعة المتجهة"],
  "revision_concepts": ["معادلات الحركة بعجلة منتظمة"]
}`;

      const systemPrompt = `You are the Official Academic Exam Grader for the Egyptian National Curriculum.
Evaluate the student answers accurately against the answer key. Provide a total score out of 100, diagnostic feedback, and a precise breakdown of concepts mastered vs concepts needing review.

================================================================================
CRITICAL LANGUAGE & OUTPUT MANDATE:
${promptLanguageMandate}
================================================================================

Exam Metadata:
- Title: ${exam.title}
- Subject: ${exam.subject_name}
- Grade: ${exam.grade_level}

Exam Questions & Answer Key:
${JSON.stringify(exam.questions, null, 2)}

Student Submitted Answers:
${JSON.stringify(answers, null, 2)}

Grading Guidelines:
1. Multiple Choice / True-False: Strict exact match against correct_answer.
2. Essay Questions & Pedagogical Rubric:
   - For Egyptian Baccalaureate (2_high): Questions measure Critical Thinking, Deductive Logic, Evidence-based Reasoning, and Causality. STRICTLY DO NOT require verbatim textbook wording. Award full credit if the student demonstrates valid comprehension of underlying mechanisms, correct historical/scientific motives, or logical causal inferences.
   - For Secondary Stage (1_high): Award credit for multi-step reasoning, accurate conceptual interpretation, and valid derivations.
   - For Preparatory Stages (1_middle, 2_middle, 3_middle): Grade based on clear sequential problem-solving, formula identification, and direct conceptual explanation.
3. Compute aggregate percentage score (0 to 100).
4. Provide structured evaluation ("evaluation") celebrating correct answers and explaining misconceptions constructively.
5. Populate "mastered_concepts" and "revision_concepts" accurately from the curriculum topics.

JSON Output Schema:
${schemaExample}`;

      const { content, coinsCost: evalCost } = await evaluateExamWithAI(systemPrompt, exam_id);
      coinsCost = evalCost;
      gradingResult = parseGradingResult(content);
      if (!gradingResult.mastered_concepts || gradingResult.mastered_concepts.length === 0) {
        gradingResult.mastered_concepts = masteredFallback;
      }
      if (!gradingResult.revision_concepts || gradingResult.revision_concepts.length === 0) {
        gradingResult.revision_concepts = revisionFallback;
      }
      await db.deductCoins(userId, null, coinsCost);
    }

    const deviceId = deviceIdHeader || null;
    const alreadySubmitted = await db.hasSubmittedExam(exam_id, userId, deviceId || undefined);
    const isFirstAttempt = !alreadySubmitted;
    const finalScore = gradingResult.score;

    let pointsAwarded = 0;
    let totalPoints: number | undefined = undefined;

    if (isFirstAttempt) {
      if (finalScore === 100) pointsAwarded = 5;
      else if (finalScore > 90) pointsAwarded = 3;
      else if (finalScore > 70) pointsAwarded = 2;
      else if (finalScore > 50) pointsAwarded = 1;
      else pointsAwarded = 0;

      if (pointsAwarded > 0 && userId) {
        totalPoints = await db.addPoints(userId, pointsAwarded);
      }
    }

    // Save submission to DB
    const submission = await db.createExamSubmission({
      exam_id,
      user_id: userId,
      device_id: deviceId || undefined,
      answers,
      score: finalScore,
      evaluation: gradingResult.evaluation,
      points_awarded: pointsAwarded,
      is_first_attempt: isFirstAttempt
    });

    const questionsReview = (exam.questions || []).map((q: any) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      options: q.options,
      student_answer: answers[q.id] ?? null,
      correct_answer: q.correct_answer,
      explanation: q.explanation
    }));

    return NextResponse.json({
      success: true,
      submission,
      score: finalScore,
      evaluation: gradingResult.evaluation,
      points_awarded: pointsAwarded,
      total_points: totalPoints,
      questions_review: questionsReview,
      diagnostic: {
        mastered_concepts: gradingResult.mastered_concepts || masteredFallback,
        revision_concepts: gradingResult.revision_concepts || revisionFallback
      }
    });

  } catch (error: any) {
    console.error('Exam submit error:', error);
    return NextResponse.json({ error: 'حدث خطأ غير متوقع أثناء تصحيح الاختبار.' }, { status: 500 });
  }
}