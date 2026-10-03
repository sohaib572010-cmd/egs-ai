import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

// POST: submit a message through the contact / support form
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      userId = verifySessionToken(authHeader.substring(7));
    }

    const body = await req.json();
    const { name, contact_info, category, message } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'الاسم الكامل مطلوب.' }, { status: 400 });
    }
    if (!contact_info || typeof contact_info !== 'string' || !contact_info.trim()) {
      return NextResponse.json({ error: 'بيانات الاتصال (الهاتف أو البريد الإلكتروني) مطلوبة.' }, { status: 400 });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'تفاصيل الرسالة أو الاستفسار مطلوبة.' }, { status: 400 });
    }

    const validCategory = typeof category === 'string' && category.trim() ? category.trim().slice(0, 100) : 'استفسار عام';

    const contactMsg = await db.createContactMessage({
      user_id: userId || undefined,
      name: name.trim().slice(0, 200),
      contact_info: contact_info.trim().slice(0, 200),
      category: validCategory,
      message: message.trim().slice(0, 8000),
    });

    return NextResponse.json({
      success: true,
      message: 'شكراً لتواصلك معنا. تم استلام رسالتك وسيقوم فريق الدعم الفني بالرد عليك في أقرب وقت.',
      message_id: contactMsg.id
    });

  } catch (error: any) {
    console.error('Contact API Error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء إرسال رسالتك. يرجى المحاولة لاحقاً.' }, { status: 500 });
  }
}
