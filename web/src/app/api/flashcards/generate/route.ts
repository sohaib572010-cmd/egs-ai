export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { getCurriculumContextForLesson } from '@/lib/curriculum_structure';
import { isEnglishSubject } from '@/lib/subject_helpers';
import { acquireAiSlot, releaseAiSlot, chargeForUsage, usageFromProvider, estimateUsage, AI_BUSY_RESPONSE } from '@/lib/metering';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'جلسة العمل غير مصرحة أو منتهية' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة العمل غير صالحة' }, { status: 401 });
    }

    const body = await req.json();
    const { subject_name, grade_level, topic } = body;
    const count = Math.min(20, Math.max(1, Math.floor(Number(body.count) || 5)));

    if (typeof subject_name !== 'string' || typeof grade_level !== 'string' || typeof topic !== 'string' || !subject_name || !grade_level || !topic) {
      return NextResponse.json({ error: 'جميع الحقول مطلوبة (المادة، الصف الدراسي، الموضوع)' }, { status: 400 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    const coins = profile.coins === undefined ? 0.0 : profile.coins;
    const hasUnlimitedCredit = profile.role === 'admin' || !!profile.unlimited_credit;
    if (!hasUnlimitedCredit && coins <= 0) {
      return NextResponse.json({ error: 'لقد استنفدت رصيدك من النقاط. يرجى شحن باقتك للمتابعة.' }, { status: 402 });
    }

    // Retrieve targeted curriculum text for the selected topic/lesson
    const curriculumText = await getCurriculumContextForLesson(grade_level, subject_name, topic);

    const adherenceInstruction = (topic && topic !== 'المنهج بالكامل' && topic !== 'مراجعة المنهج بالكامل')
      ? `\nFOCUS TOPIC CONSTRAINT: All cards MUST focus strictly on this lesson: "${topic}". Do not pull concepts from other lessons.`
      : '';

    const isEnglish = isEnglishSubject(subject_name);

    const languageMandate = isEnglish
      ? `- ALL USER-FACING TEXT (questions, answers, deck titles) MUST BE STRICTLY AND ENTIRELY IN ENGLISH ONLY. NEVER USE ARABIC IN QUESTIONS, ANSWERS, OR DECK TITLES.
- NUMERALS MANDATE: Use English digits (0, 1, 2, 3, 4, 5, 6, 7, 8, 9) for all numbers and measurements.`
      : `- ALL USER-FACING TEXT (questions, answers, deck titles) MUST BE IN IMPECCABLE, FORMAL MODERN STANDARD ARABIC (اللغة العربية الفصحى السليمة).
- NUMERALS MANDATE (قاعدة كتابة الأرقام الإلزامية): Use Arabic numerals (٠، ١، ٢، ٣، ٤، ٥، ٦، ٧، ٨، ٩) for all numbers, measurements, and values.
- ABSOLUTELY ZERO COLLOQUIAL PHRASING (ممنوع العامية نهائياً في صياغة الكروت مثل: "إيه"، "ليه"، "مين"، "ازاي").`;

    const cardRules = isEnglish
      ? `1. Question: Clear, high-yield conceptual question in English testing understanding of principles, functions, or cause-and-effect rather than rote recall.
2. Answer: Concise, authoritative model answer highlighting underlying mechanisms, formulas, or rules.
3. Strict Curriculum Adherence: Ground all questions strictly in the provided textbook context.`
      : `1. Question: سؤال استيعابي مركز لقياس المفاهيم الجوهرية ونواتج التعلم باللغة العربية الفصحى السليمة، يركز على الفهم والاستنباط والعلاقات العلمية بدلاً من الحفظ والتلقين.
2. Answer: إجابة نموذجية دقيقة وشاملة توضح السبب العلمي، القاعدة، أو الصيغة الرياضية بوضوح.
3. Strict Curriculum Adherence: الالتزام التام بنصوص ومفاهيم المنهج المدرسي المعتمد وتجنب الأسئلة التافهة أو غير المجدية.`;

    const schemaExample = isEnglish
      ? `{
  "title": "Flashcards: ${topic}",
  "cards": [
    {
      "question": "What is the primary grammatical distinction between the Present Perfect and the Past Simple?",
      "answer": "The Present Perfect links a past action to the present moment or its current consequence, while the Past Simple describes an event completed at a specific past time."
    },
    {
      "question": "How does the prefix 'un-' alter the meaning of an adjective?",
      "answer": "It negates the adjective or denotes its opposite (e.g., known -> unknown, happy -> unhappy)."
    }
  ]
}`
      : `{
  "title": "كروت المفاهيم الأساسية: ${topic}",
  "cards": [
    {
      "question": "ما التفسير العلمي لكون النواة موجبة الشحنة في ذرة أي عنصر؟",
      "answer": "لاحتوائها على بروتونات موجبة الشحنة ونيوترونات متعادلة الشحنة كهربياً، فتكون المحصلة النهائية لشحنة النواة موجبة."
    }
  ]
}`;

    const systemPrompt = `You are the Flashcards Generation Engine for the Egyptian National Curriculum (Middle & High School).
Generate high-yield Active Recall flashcards to help students master conceptual understanding, underlying scientific causes, formulas, and learning outcomes. Strictly avoid rote memorization, trivial trivia, or colloquial phrasing.

================================================================================
CRITICAL LANGUAGE & OUTPUT MANDATE:
${languageMandate}
- Format all mathematical, physical, and chemical formulas in standard LaTeX ($$ or $). Strictly avoid raw Unicode superscripts (⁰-⁹) or Unicode multiply (×) in plain text.
- Return strict JSON ONLY (no markdown fences, no conversational prose).
================================================================================

Subject: ${subject_name}
Grade: ${grade_level}
Topic / Lesson: ${topic}${adherenceInstruction}
Required Count: ${count} cards

Curriculum Context:
"""
${curriculumText || 'General curriculum content for ' + subject_name}
"""

Card Design Rules:
${cardRules}

JSON Output Schema:
${schemaExample}`;

    if (!(await acquireAiSlot(userId))) {
      return NextResponse.json(AI_BUSY_RESPONSE, { status: 429 });
    }
    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Generate ${count} flashcards for topic: ${topic} as a JSON object.` }
          ],
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          temperature: 0.35,
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        console.error('DeepSeek flashcard generation failed:', await response.text());
        return NextResponse.json({ error: 'فشل مزود الذكاء الاصطناعي في توليد الكروت' }, { status: 502 });
      }

      const data = await response.json();
      const msg = data.choices?.[0]?.message;
      let content = (msg?.content || msg?.reasoning_content || '').trim();
      const charge = await chargeForUsage(profile, [usageFromProvider(data.usage) ?? estimateUsage(systemPrompt.length, content.length)]);

      // Clean JSON markdown fences
      if (content.startsWith('```json')) {
        content = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      } else if (content.startsWith('```')) {
        content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        console.error('Flashcards JSON parse error:', content);
        return NextResponse.json({ error: 'فشل في قراءة بيانات الكروت المولدة' }, { status: 500 });
      }

      if (!parsed.cards || !Array.isArray(parsed.cards) || parsed.cards.length === 0) {
        return NextResponse.json({ error: 'لم يتم توليد أي كروت صالحة' }, { status: 500 });
      }

      // Save deck and cards to database
      const deckTitle = parsed.title || (isEnglish ? `Cards: ${topic}` : `كروت: ${topic}`);
      const newDeck = await db.createFlashcardDeck(userId, subject_name, grade_level, deckTitle, parsed.cards);

      return NextResponse.json({
        success: true,
        deck: newDeck,
        cards: parsed.cards,
        coins_deducted: charge.points,
        remaining_coins: charge.remaining
      });

    } finally {
      await releaseAiSlot(userId);
    }

  } catch (error: any) {
    console.error('Generate flashcards error:', error);
    return NextResponse.json({ error: 'حدث خطأ غير متوقع أثناء توليد الكروت.' }, { status: 500 });
  }
}