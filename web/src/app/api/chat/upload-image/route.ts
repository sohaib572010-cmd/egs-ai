import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate_limiter';
import { readStudentImage } from '@/lib/image_reader';
import { chargeForUsage } from '@/lib/metering';
import { VISION_USAGE } from '@/lib/points_pricing';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

    if (typeof base64 !== 'string' || !base64) {
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

    const description = await readStudentImage(base64, typeof mimeType === 'string' ? mimeType : 'image/jpeg');

    if (!description) {
      return NextResponse.json(
        { error: 'فشل تحليل الصورة من مزود الخدمة. يرجى المحاولة مرة أخرى أو التأكد من وضوح الصورة.' },
        { status: 502 }
      );
    }

    const charge = await chargeForUsage(profile, [VISION_USAGE]);

    return NextResponse.json({ description, coins_used: charge.points, remaining_coins: charge.remaining });
  } catch (error: any) {
    console.error('Upload Image route error:', error);
    return NextResponse.json(
      { error: error.message || 'حدث خطأ غير متوقع أثناء معالجة الصورة.' },
      { status: 500 }
    );
  }
}
