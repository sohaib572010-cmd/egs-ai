import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';
import { sendStudyReminderEmail } from '@/lib/email';

function getCairoDate(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch (e) {
    return new Date().toISOString().split('T')[0];
  }
}

async function verifyCronOrAdmin(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('Authorization');
  const queryKey = req.nextUrl.searchParams.get('key');

  if (cronSecret) {
    if (queryKey === cronSecret) return true;
    if (authHeader === `Bearer ${cronSecret}`) return true;
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (userId) {
      const profile = await db.getProfile(userId);
      if (profile && profile.role === 'admin') {
        return true;
      }
    }
  }

  // Allow in development environment if no CRON_SECRET is set
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  return false;
}

export async function POST(req: NextRequest) {
  return handleReminder(req);
}

export async function GET(req: NextRequest) {
  return handleReminder(req);
}

async function handleReminder(req: NextRequest) {
  try {
    const isAuthorized = await verifyCronOrAdmin(req);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'غير مصرح لك بتشغيل خدمة تذكير المذاكرة.' },
        { status: 401 }
      );
    }

    const todayCairo = getCairoDate();
    const { users: allUsers } = await db.getUsers();

    const now = Date.now();
    const twelveHoursAgo = now - 12 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Filter students at risk of drop-off:
    // 1. role === 'student'
    // 2. valid email (not test/trial)
    // 3. registered between 12 hours and 7 days ago
    // 4. haven't been active today
    const candidates = allUsers.filter(u => {
      if (u.role !== 'student' || !u.email) return false;
      const lowerEmail = u.email.toLowerCase();
      if (lowerEmail.includes('test') || lowerEmail.includes('trial') || lowerEmail.includes('fake')) return false;

      const createdTime = u.created_at ? new Date(u.created_at).getTime() : 0;
      if (createdTime > twelveHoursAgo || createdTime < sevenDaysAgo) return false;

      if (u.last_active_date === todayCairo) return false;

      return true;
    });

    const results: Array<{ email: string; name: string; status: string }> = [];
    // Process up to 15 candidates per batch to respect rate limits
    const batch = candidates.slice(0, 15);

    for (const student of batch) {
      if (!student.email) continue;
      const studentEmail = student.email;
      try {
        const sessions = await db.getChatSessions(student.id);
        // Only target students who have 0 or 1 session (at-risk single message drop-offs)
        if (sessions.length <= 1) {
          const subject = sessions[0]?.subject_name || 'منهجك الدراسي';
          const emailRes = await sendStudyReminderEmail(studentEmail, student.name, subject);
          if (emailRes.ok) {
            results.push({ email: studentEmail, name: student.name, status: 'sent' });
          } else {
            results.push({ email: studentEmail, name: student.name, status: `failed: ${emailRes.error}` });
          }
        } else {
          results.push({ email: studentEmail, name: student.name, status: 'skipped (active user)' });
        }
      } catch (err: any) {
        results.push({ email: studentEmail, name: student.name, status: `error: ${err.message}` });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      cairo_date: todayCairo,
      candidates_count: candidates.length,
      processed_count: batch.length,
      sent_count: results.filter(r => r.status === 'sent').length,
      details: results
    });

  } catch (error: any) {
    console.error('Study reminder cron error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء تنفيذ عملية تذكير المذاكرة.' },
      { status: 500 }
    );
  }
}
