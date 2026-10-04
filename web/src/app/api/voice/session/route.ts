import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth_helpers';
import { db, getCurriculumCorpus } from '@/lib/db';
import { checkRateLimitAsync } from '@/lib/rate_limiter';
import { findCurriculumFor, getCurriculumStructure } from '@/lib/curriculum_structure';
import { getGradeDisplayName } from '@/lib/subject_helpers';
import { buildVoicePrompt, createVoiceToken, voiceTranscription, VOICE_DIALECTS, VOICE_MODEL, type VoiceDialect, type VoiceTeacher } from '@/lib/voice_tutor';
import { voiceForeignLanguage } from '@/lib/voice_policy';
import { recordVoiceHeartbeat, resumeVoiceCall, setVoiceCallKeySlot, startVoiceCall } from '@/lib/voice_usage';
import { classifyDropReason, reportKeyFailure } from '@/lib/gemini_keys';

const limitMessage = (tier: string) => tier === 'free'
  ? 'خلصت دقائق المكالمات المجانية النهارده. بتتجدد بعد منتصف الليل بتوقيت القاهرة، والمشتركين ليهم وقت أطول بكتير.'
  : 'خلصت دقائق المكالمات بتاعتك النهارده. بتتجدد بعد منتصف الليل بتوقيت القاهرة.';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const userId = authHeader?.startsWith('Bearer ') ? verifySessionToken(authHeader.substring(7)) : null;
  if (!userId) {
    return NextResponse.json({ error: 'سجّل دخولك لاستخدام المعلم الصوتي.', code: 'login_required' }, { status: 401 });
  }

  const limit = await checkRateLimitAsync(`voice_session:${userId}`, 12, 600);
  if (!limit.allowed) {
    return NextResponse.json({ error: `بدأت مكالمات كتير في وقت قصير. جرّب تاني بعد ${Math.ceil(limit.resetSeconds / 60)} دقيقة.`, code: 'rate_limited' }, { status: 429 });
  }

  try {
    const body = (await req.json().catch(() => null)) || {};
    const subjectName = typeof body.subject_name === 'string' ? body.subject_name.trim().slice(0, 120) : '';
    const dialect: VoiceDialect = VOICE_DIALECTS.includes(body.dialect) ? body.dialect : 'egyptian';
    const teacher: VoiceTeacher = body.teacher === 'female' ? 'female' : 'male';
    const resumeHandle = typeof body.resume_handle === 'string' && /^[\w.:/=+-]{1,1024}$/.test(body.resume_handle) ? body.resume_handle : undefined;
    const callId = typeof body.call_id === 'string' && /^[\w-]{1,64}$/.test(body.call_id) ? body.call_id : undefined;
    if (!subjectName) {
      return NextResponse.json({ error: 'اختر المادة أولاً.', code: 'subject_required' }, { status: 400 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'حساب المستخدم غير موجود.', code: 'user_not_found' }, { status: 401 });
    }
    if (!profile.grade_level || profile.grade_level === 'unselected') {
      return NextResponse.json({ error: 'اختر صفك الدراسي من الملف الشخصي أولاً.', code: 'grade_required' }, { status: 400 });
    }

    const curriculum = await findCurriculumFor(profile.grade_level, subjectName);
    if (!curriculum || curriculum.is_placeholder) {
      return NextResponse.json({ error: 'منهج المادة دي مش متاح حالياً.', code: 'course_unavailable' }, { status: 400 });
    }

    const isReconnect = !!callId && (!!resumeHandle || body.reconnect === true);
    const grant = isReconnect && callId ? await resumeVoiceCall(profile, callId) : await startVoiceCall(profile);
    if (!grant.ok) {
      return NextResponse.json(
        { error: isReconnect ? 'انتهى وقت المكالمة.' : limitMessage(grant.summary.tier), code: 'voice_limit_reached', usage: grant.summary },
        { status: 429 }
      );
    }

    getCurriculumCorpus(curriculum.id).catch(() => {});
    const { units } = await getCurriculumStructure(profile.grade_level, subjectName);
    const foreign = voiceForeignLanguage(subjectName);
    const firstName = profile.name && profile.name !== 'طالب جديد' ? profile.name.trim().split(/\s+/)[0] : undefined;
    const prompt = buildVoicePrompt({
      subjectName,
      gradeName: getGradeDisplayName(profile.grade_level),
      dialect,
      teacher,
      studentName: firstName,
      units,
      foreign
    });

    // A drop caused by a key (quota, revoked key) cools that key and moves the call to another one
    const dropKind = isReconnect ? classifyDropReason(body.drop_reason) : null;
    if (dropKind && grant.slot !== null) reportKeyFailure(grant.slot, dropKind);
    const minted = await createVoiceToken({
      prompt,
      teacher,
      transcription: voiceTranscription(subjectName, units, foreign),
      seconds: grant.seconds,
      resume: resumeHandle && grant.slot !== null && !dropKind ? { handle: resumeHandle, slot: grant.slot } : undefined,
      avoidSlot: dropKind && grant.slot !== null ? grant.slot : undefined
    }).catch(async err => {
      if (!isReconnect) await recordVoiceHeartbeat(profile, grant.callId, true);
      throw err;
    });
    const { token, expiresAt, slot, resumed } = minted;
    await setVoiceCallKeySlot(profile, grant.callId, slot);
    if (!isReconnect) {
      await db.createVoiceCall({
        id: grant.callId,
        user_id: profile.id,
        subject_name: subjectName,
        grade_level: profile.grade_level,
        dialect,
        teacher,
        started_at: new Date().toISOString(),
        transcript: []
      }).catch(err => console.error('createVoiceCall failed:', err));
    }
    return NextResponse.json(
      { success: true, token, model: VOICE_MODEL, expires_at: expiresAt, call_id: grant.callId, call_seconds: grant.seconds, resumed, usage: grant.summary, subject_name: subjectName },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Voice session error:', error);
    return NextResponse.json({ error: 'تعذر بدء المكالمة الصوتية الآن. حاول مرة أخرى بعد قليل.', code: 'voice_unavailable' }, { status: 502 });
  }
}
