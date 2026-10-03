import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const deviceIdHeader = req.headers.get('x-device-id');
    
    let userId: string | null = null;
    let deviceId: string | null = deviceIdHeader || null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      userId = verifySessionToken(token);
    }

    if (!userId) {
      return NextResponse.json({ error: 'تسجيل الدخول مطلوب لعرض نتائج الامتحانات', code: 'login_required' }, { status: 401 });
    }

    const profile = await db.getProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'لم يتم العثور على حساب المستخدم أو تم حذفه.', code: 'user_not_found' }, { status: 401 });
    }

    const submissions = await db.getExamSubmissions(userId, deviceId || undefined);
    return NextResponse.json(submissions);
  } catch (error: any) {
    console.error('GET Submissions Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب نتائج الامتحانات' }, { status: 500 });
  }
}
