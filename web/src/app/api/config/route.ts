export const runtime = 'edge';
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db, getPublicConfigVersion, invalidateCurriculumsCache } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

const DEFAULT_GRADE_LEVELS = ['1_middle', '2_middle', '3_middle', '1_high', '2_high'];
const DEFAULT_TRACKS = ['medicine_life_sciences', 'engineering_cs', 'business', 'arts_literature'];

// GET public system settings
export async function GET(req: NextRequest) {
  try {
    const {
      websiteLink,
      activeGradeLevels,
      activeTracks,
      activeCurriculumIds,
      allCurriculums
    } = await db.getPublicConfig();

    // Check for authenticated user to return current coins and profile
    const authHeader = req.headers.get('Authorization');
    let profile = null;
    let authAttempted = false;
    let authValid = false;
    let dailyQuests = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      authAttempted = true;
      const token = authHeader.substring(7);
      try {
        const userId = verifySessionToken(token);
        if (userId) {
          profile = await db.getProfile(userId);
          if (profile) {
            authValid = true;
            try {
              dailyQuests = await db.getDailyQuests(userId);
            } catch (e) {}
          }
        }
      } catch (e) {}
    }

    const guestMessagesCount = 0;
    const guestCoins = 0.0;
    
    const userNotFound = authAttempted && !authValid;
    const publicVer = getPublicConfigVersion();
    let etag = `"pub_${publicVer}_${allCurriculums.length}"`;

    if (profile) {
      etag = `"usr_${publicVer}_${profile.id}_${profile.coins}_${profile.points}_${profile.plan_type}_${profile.subscription_status}_${profile.study_streak || 1}_${dailyQuests?.streakDays || 0}_${dailyQuests?.allCompleted ? 1 : 0}"`;
    } else if (userNotFound) {
      etag = `"usr_invalid_${publicVer}"`;
    }

    const cacheHeaders: Record<string, string> = {
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
      'Vary': 'Authorization, If-None-Match',
      'ETag': etag
    };

    const ifNoneMatch = req.headers.get('If-None-Match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }

    return NextResponse.json({
      website_link: websiteLink || 'http://localhost:3000',
      active_grade_levels: activeGradeLevels,
      active_tracks: activeTracks,
      active_curriculum_ids: activeCurriculumIds,
      all_curriculums: allCurriculums,
      guest_messages_count: guestMessagesCount,
      guest_coins: guestCoins,
      authenticated: authValid,
      ...(userNotFound ? {
        user: null,
        user_not_found: true,
        session_invalid: true
      } : {}),
      ...(profile ? {
        user: {
          id: profile.id,
          phone: profile.phone,
          email: profile.email,
          name: profile.name,
          grade_level: profile.grade_level,
          track_id: profile.track_id || null,
          elective_subject: profile.elective_subject || null,
          plan_type: profile.plan_type,
          subscription_status: profile.subscription_status || (profile.plan_type && profile.plan_type !== 'free' ? 'active' : 'inactive'),
          subscription_start_date: profile.subscription_start_date,
          subscription_end_date: profile.subscription_end_date,
          subscription_plan_id: profile.subscription_plan_id,
          role: profile.role,
          coins: profile.coins === undefined ? 20.0 : profile.coins,
          points: profile.points || 0,
          study_streak: profile.study_streak || 1,
          welcome_reward_claimed: !!profile.welcome_reward_claimed,
          free_plan_claimed: !!profile.free_plan_claimed,
          apology_compensation_claimed: !!profile.apology_compensation_claimed,
          apology_dismissed: !!profile.apology_dismissed,
          created_at: profile.created_at,
          improve_ai_opt_in: profile.improve_ai_opt_in !== undefined ? profile.improve_ai_opt_in : true
        },
        daily_quests: dailyQuests
      } : {})
    }, { headers: cacheHeaders });
  } catch (error) {
    return NextResponse.json({
      website_link: 'http://localhost:3000',
      active_grade_levels: DEFAULT_GRADE_LEVELS,
      active_tracks: DEFAULT_TRACKS,
      active_curriculum_ids: [],
      all_curriculums: [],
      guest_messages_count: 0
    });
  }
}

// POST update system settings (Admin Only)
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'غير مصرح للقيام بهذه العملية' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة العمل منتهية أو غير صالحة' }, { status: 401 });
    }

    // Verify user role
    const profile = await db.getProfile(userId);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'صلاحيات غير كافية. هذه العملية للمسؤولين فقط.' }, { status: 403 });
    }

    const body = await req.json();
    
    if (body.website_link !== undefined) {
      await db.setSystemSetting('website_link', body.website_link);
    }
    
    if (body.active_grade_levels !== undefined) {
      const filtered = Array.isArray(body.active_grade_levels) ? body.active_grade_levels.filter((g: string) => g !== '3_high') : body.active_grade_levels;
      await db.setSystemSetting('active_grade_levels', JSON.stringify(filtered));
    }

    if (body.active_tracks !== undefined) {
      await db.setSystemSetting('active_tracks', JSON.stringify(body.active_tracks));
    }
    
    if (body.active_curriculum_ids !== undefined) {
      await db.setSystemSetting('active_curriculum_ids', JSON.stringify(body.active_curriculum_ids));
    }

    invalidateCurriculumsCache();
    await db.setSystemSetting('curriculum_version', Date.now().toString()).catch(() => {});

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Config API Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء حفظ الإعدادات.' },
      { status: 500 }
    );
  }
}
