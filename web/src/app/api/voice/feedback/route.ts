import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth_helpers';
import { db } from '@/lib/db';
import { checkRateLimitAsync } from '@/lib/rate_limiter';
import { VOICE_FEEDBACK_CATEGORY, VOICE_FEEDBACK_TAGS } from '@/lib/voice_policy';

const ALLOWED_TAGS: readonly string[] = [...VOICE_FEEDBACK_TAGS.good, ...VOICE_FEEDBACK_TAGS.bad];

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const userId = authHeader?.startsWith('Bearer ') ? verifySessionToken(authHeader.substring(7)) : null;
  if (!userId) return NextResponse.json({ error: 'login_required' }, { status: 401 });

  const limit = await checkRateLimitAsync(`voice_feedback:${userId}`, 6, 3600);
  if (!limit.allowed) return NextResponse.json({ error: 'شكراً، وصلنا تقييمك بالفعل.' }, { status: 429 });

  try {
    const body = (await req.json().catch(() => null)) || {};
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'اختار تقييم من 1 لـ 5.' }, { status: 400 });
    }
    const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string' && ALLOWED_TAGS.includes(t)).slice(0, 8) : [];
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 120) : '';
    const minutes = Math.max(0, Math.min(120, Math.round(Number(body.call_seconds) / 60) || 0));

    const profile = await db.getProfile(userId);
    if (!profile) return NextResponse.json({ error: 'user_not_found' }, { status: 401 });
    const callId = typeof body.call_id === 'string' && /^[\w-]{1,64}$/.test(body.call_id) ? body.call_id : '';
    if (callId) await db.updateVoiceCall(callId, userId, () => ({ rating })).catch(() => false);

    await db.createContactMessage({
      user_id: userId,
      name: (profile.name || 'طالب').slice(0, 200),
      contact_info: (profile.email || profile.phone || '—').slice(0, 200),
      category: VOICE_FEEDBACK_CATEGORY,
      message: [
        `التقييم: ${rating} من 5`,
        subject && `المادة: ${subject}`,
        `مدة المكالمة: ${minutes} دقيقة`,
        tags.length ? `ملاحظات سريعة: ${tags.join('، ')}` : '',
        comment && `اقتراحات الطالب:\n${comment}`
      ].filter(Boolean).join('\n')
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Voice feedback error:', error);
    return NextResponse.json({ error: 'تعذر إرسال التقييم الآن.' }, { status: 500 });
  }
}
