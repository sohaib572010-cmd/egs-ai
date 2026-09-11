import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate_limiter';
import { callDeepSeekVision } from '@/lib/gemini';

const EDENAI_API_KEY = process.env.EDENAI_API_KEY || '';
const EDENAI_BASE = 'https://api.edenai.run/v2';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_ANALYSIS_COIN_COST = 0.5;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      userId = verifySessionToken(authHeader.substring(7));
    }
    if (!userId) {
      return NextResponse.json(
        { error: 'تسجيل الدخول مطلوب لتحليل الصور.', code: 'login_required' },
        { status: 401 }
      );
    }

    const rateLimit = await checkRateLimitAsync(`upload_img_${userId || ip}`, 10, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `تم تجاوز الحد المسموح لتحليل الصور في الدقيقة. يرجى الانتظار ${rateLimit.resetSeconds} ثانية.` },
        { status: 429 }
      );
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }
    const hasUnlimitedCredit = profile.role === 'admin' || !!profile.unlimited_credit;
    const coins = profile.coins === undefined ? 0.0 : profile.coins;
    if (!hasUnlimitedCredit && coins <= 0) {
      return NextResponse.json(
        { error: 'ليس لديك رصيد كافٍ من النقاط لتحليل الصورة.' },
        { status: 429 }
      );
    }

    const { base64, mimeType } = await req.json();

    if (!base64) {
      return NextResponse.json(
        { error: 'بيانات الصورة مطلوبة' },
        { status: 400 }
      );
    }

    // ~3/4 ratio of base64 length to bytes; enforce the 5 MB client cap server-side
    if (base64.length * 0.75 > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: 'حجم الصورة يتجاوز الحد الأقصى المسموح (5 ميجابايت)' },
        { status: 413 }
      );
    }

    let description = '';

    // Step 1: DeepSeek Flash (deepseek-flash, Primary Vision Model with native multimodal support)
    if (process.env.DEEPSEEK_API_KEY) {
      try {
        description = await callDeepSeekVision(
          base64,
          mimeType || 'image/jpeg',
          'اقرأ هذه الصورة بالتفصيل واكتب وصفاً شاملاً ومفصلاً لها باللغة العربية، بما في ذلك أي نصوص أو معادلات رياضية أو فيزيائية أو كيميائية أو جداول أو رسوم توضيحية بداخلها بدقة بالغة وكتابتها حرفياً.'
        );
      } catch (deepseekVisionErr) {
        console.warn('DeepSeek Vision analysis failed, falling back to EdenAI VQA:', deepseekVisionErr);
      }
    }

    // Step 2: EdenAI VQA Fallback (Google / OpenAI)
    if (!description && EDENAI_API_KEY) {
      try {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType || 'image/jpeg' });

        const formData = new FormData();
        formData.append('providers', 'google');
        formData.append('fallback_providers', 'openai');
        formData.append('file', blob, `image.${(mimeType || 'image/jpeg').split('/')[1] || 'jpg'}`);
        formData.append(
          'question',
          'اقرأ هذه الصورة بالتفصيل واكتب وصفاً شاملاً ومفصلاً لها باللغة العربية، بما في ذلك أي نصوص أو معادلات رياضية أو فيزيائية أو كيميائية أو جداول أو رسوم توضيحية بداخلها بدقة بالغة وكتابتها حرفياً.'
        );

        const response = await fetch(`${EDENAI_BASE}/image/question_answer`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${EDENAI_API_KEY}`
          },
          body: formData
        });

        if (response.ok) {
          const data = await response.json();
          const googleAnswers = data?.google?.answers;
          const openaiAnswers = data?.openai?.answers;
          description = (googleAnswers && googleAnswers.length > 0 ? googleAnswers[0] : null) || 
                        (openaiAnswers && openaiAnswers.length > 0 ? openaiAnswers[0] : null) || 
                        data?.google?.answer || 
                        data?.openai?.answer || 
                        '';
        }
      } catch (edenErr) {
        console.warn('EdenAI VQA fallback also failed:', edenErr);
      }
    }

    if (!description) {
      return NextResponse.json(
        { error: 'فشل تحليل الصورة من مزود الخدمة. يرجى المحاولة مرة أخرى أو التأكد من وضوح الصورة.' },
        { status: 502 }
      );
    }

    await db.deductCoins(userId, null, IMAGE_ANALYSIS_COIN_COST);

    return NextResponse.json({ description });
  } catch (error: any) {
    console.error('Upload Image route error:', error);
    return NextResponse.json(
      { error: error.message || 'حدث خطأ غير متوقع أثناء معالجة الصورة.' },
      { status: 500 }
    );
  }
}
