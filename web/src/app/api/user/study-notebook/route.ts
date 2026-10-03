import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifySessionToken } from '@/lib/auth_helpers';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'تسجيل الدخول مطلوب' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة غير صالحة', code: 'invalid_token' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    // On-demand resolution of conversation & message for a specific note
    if (action === 'resolve') {
      const noteId = searchParams.get('note_id');
      if (!noteId) {
        return NextResponse.json({ error: 'معرف الملاحظة مطلوب' }, { status: 400 });
      }
      const notes = await db.getStudyNotebook(userId);
      const targetNote = notes.find(n => n.id === noteId);
      if (!targetNote) {
        return NextResponse.json({ error: 'الملاحظة غير موجودة' }, { status: 404 });
      }

      if (targetNote.session_id) {
        return NextResponse.json({
          success: true,
          session_id: targetNote.session_id,
          message_id: targetNote.message_id || null
        });
      }

      // Search user chat history for matching message content
      const history = await db.getChatHistory(userId);
      const match = history.find(ch => 
        ch.sender === 'ai' &&
        ch.message &&
        (ch.message === targetNote.content ||
         ch.message.includes(targetNote.content.trim().slice(0, 50)) ||
         targetNote.content.includes(ch.message.trim().slice(0, 50)))
      );

      return NextResponse.json({
        success: true,
        session_id: match?.session_id || null,
        message_id: match?.id || null
      });
    }

    const subjectName = searchParams.get('subject_name') || undefined;
    const notes = await db.getStudyNotebook(userId, subjectName);

    return NextResponse.json({
      success: true,
      notes,
      totalCount: notes.length
    });
  } catch (error: any) {
    console.error('Study notebook GET error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء جلب دفتر الملاحظات' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'تسجيل الدخول مطلوب' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة غير صالحة', code: 'invalid_token' }, { status: 401 });
    }

    const body = await req.json();
    const { subject_name, grade_level, title, content, note_type, session_id, message_id, sessionId, messageId } = body;

    if (!subject_name || !title || !content) {
      return NextResponse.json({ error: 'المادة والعنوان والمحتوى حقول مطلوبة' }, { status: 400 });
    }

    // Strip any raw thought blocks from content and title
    const cleanContent = String(content).replace(/<thought[\s\S]*?<\/thought>/gi, '').trim();
    const cleanTitle = String(title).replace(/<thought[\s\S]*?<\/thought>/gi, '').replace(/\[[\s\S]*?\]/g, '').trim();

    if (!cleanContent) {
      return NextResponse.json({ error: 'محتوى الملاحظة غير صالح' }, { status: 400 });
    }

    // Validate and sanitize session UUID format to prevent database constraint errors
    const rawSessionId = session_id || sessionId || null;
    const sanitizedSessionId = (rawSessionId && UUID_REGEX.test(rawSessionId)) ? rawSessionId : null;

    const profile = await db.getProfile(userId);
    const targetGrade = grade_level || profile?.grade_level || '1_high';

    const note = await db.createStudyNote({
      userId,
      subjectName: subject_name,
      gradeLevel: targetGrade,
      title: cleanTitle || 'ملاحظة تعليمية',
      content: cleanContent,
      noteType: note_type || 'formula',
      sessionId: sanitizedSessionId,
      messageId: message_id || messageId || null
    });

    return NextResponse.json({
      success: true,
      note
    });
  } catch (error: any) {
    console.error('Study notebook POST error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء حفظ الملاحظة' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'تسجيل الدخول مطلوب' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const userId = verifySessionToken(token);
    if (!userId) {
      return NextResponse.json({ error: 'جلسة غير صالحة', code: 'invalid_token' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const noteId = searchParams.get('id');

    if (!noteId) {
      return NextResponse.json({ error: 'معرف الملاحظة مطلوب' }, { status: 400 });
    }

    const success = await db.deleteStudyNote(noteId, userId);

    return NextResponse.json({
      success
    });
  } catch (error: any) {
    console.error('Study notebook DELETE error:', error);
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف الملاحظة' }, { status: 500 });
  }
}
