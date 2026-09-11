const TEMPLATES = {
  register: {
    subject: 'رمز التحقق الخاص بك - EGS AI',
    heading: 'مرحباً بك في EGS AI',
    intro: 'عزيزنا الطالب، شكراً لتسجيلك في منصة EGS AI لمساعدتك الذكي في المذاكرة.',
    label: 'رمز التحقق (OTP) الخاص بك هو:'
  },
  reset: {
    subject: 'رمز تغيير كلمة المرور - EGS AI',
    heading: 'تغيير كلمة المرور',
    intro: 'استلمنا طلباً لتغيير كلمة المرور الخاصة بحسابك. إذا لم تكن أنت من طلب ذلك، تجاهل هذه الرسالة.',
    label: 'رمز التحقق لتغيير كلمة المرور هو:'
  },
  delete_account: {
    subject: 'رمز تأكيد حذف الحساب نهائياً - EGS AI',
    heading: 'تأكيد حذف الحساب نهائياً',
    intro: 'استلمنا طلباً لحذف حسابك وكافة بياناتك من منصة EGS AI. تنبيه: عملية حذف الحساب نهائية وفورية ولا يمكن التراجع عنها، وسيتم إلغاء أي اشتراكات سارية وحذف كافة سجلاتك فوراً.',
    label: 'رمز التحقق (OTP) لتأكيد الحذف النهائي هو:'
  }
} as const;

export async function sendOtpEmail(
  to: string,
  otp: string,
  purpose: keyof typeof TEMPLATES
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV OTP EMAIL to ${to} for ${purpose}]: ${otp}`);
      return { ok: true };
    }
    return { ok: false, error: 'خدمة البريد الإلكتروني غير مهيأة' };
  }
  const from = process.env.RESEND_FROM_EMAIL || 'no-reply@egsaiedu.com';
  const t = TEMPLATES[purpose];

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: `EGS AI <${from}>`,
        to: to.trim(),
        subject: t.subject,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; text-align: right;">
            <h2 style="color: #00B4D8; text-align: center;">${t.heading}</h2>
            <p style="color: #333; line-height: 1.6;">${t.intro}</p>
            <p style="font-size: 1.1rem; font-weight: bold; color: #0D1B2A;">${t.label}</p>
            <div style="background: #F0F9FC; padding: 15px; text-align: center; font-size: 2rem; font-weight: bold; letter-spacing: 5px; color: #00B4D8; border-radius: 8px; margin: 20px 0; border: 1.5px solid #D0EFF7;">
              ${otp}
            </div>
            <p style="font-size: 0.85rem; color: #666;">ملاحظة: هذا الرمز صالح لمدة 10 دقائق ولاستخدام واحد فقط.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 0.8rem; color: #999; text-align: center;">تم الإرسال بواسطة منصة EGS AI التعليمية</p>
          </div>
        `
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('Resend API response error:', errData);
      return { ok: false, error: errData.message || 'فشل في إرسال البريد الإلكتروني' };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('Fetch error while sending email:', err);
    return { ok: false, error: err.message };
  }
}

export async function sendStudyReminderEmail(
  to: string,
  studentName: string,
  subjectName: string = 'المنهج الدراسي'
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'خدمة البريد الإلكتروني غير مهيأة' };
  }
  const from = process.env.RESEND_FROM_EMAIL || 'no-reply@egsaiedu.com';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.egsaiedu.com';
  const name = studentName && studentName !== 'طالب جديد' ? studentName : 'يا بطل';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: `EGS AI <${from}>`,
        to: to.trim(),
        subject: `يا ${name}، بطلك منتظرك في EGS AI للمذاكرة اليوم!`,
        html: `
          <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; background: #0D1B2A; color: #F8F9FA; border-radius: 16px; text-align: right; border: 1px solid #1E2E3D;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #00B4D8; margin: 0; font-size: 1.8rem; font-weight: 900; letter-spacing: -0.5px;">EGS AI</h1>
              <p style="color: #8899A6; font-size: 0.88rem; margin-top: 4px;">مساعدك الذكي المعتمد في المنهج المصري</p>
            </div>
            
            <div style="background: #1E2E3D; padding: 22px; border-radius: 12px; border: 1px solid rgba(0, 180, 216, 0.2); margin-bottom: 20px;">
              <h2 style="color: #FFB703; margin: 0 0 12px 0; font-size: 1.25rem;">أهلاً بك يا ${name}!</h2>
              <p style="font-size: 0.95rem; line-height: 1.7; color: #C5D1DE; margin: 0 0 12px 0;">
                بدأت خطوتك الأولى في مذاكرة <strong>${subjectName}</strong>، والنجاح والتفوق محتاج استمرارية!
              </p>
              <p style="font-size: 0.92rem; line-height: 1.7; color: #C5D1DE; margin: 0;">
                معلمك الذكي في انتظارك لتكملة الدرس، حل أي مسألة صعبة، أو خوض اختبار تدريبي سريع لتحافظ على سلسلة أيام المذاكرة (Study Streak) وتنافس على لوحة الشرف للأوائل.
              </p>
            </div>

            <div style="text-align: center; margin: 28px 0;">
              <a href="${siteUrl}" style="background: #FFB703; color: #0D1B2A; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 800; font-size: 1rem; display: inline-block; box-shadow: 0 4px 14px rgba(255, 183, 3, 0.35);">
                متابعة المذاكرة الآن ←
              </a>
            </div>

            <div style="border-top: 1px solid #1E2E3D; padding-top: 16px; font-size: 0.78rem; color: #8899A6; text-align: center; line-height: 1.5;">
              <p style="margin: 4px 0;">رصيدك المجاني اليومي يتجدد تلقائياً للمساعدة في التفوق والنجاح.</p>
              <p style="margin: 4px 0;">منصة EGS AI التعليمية — جمهورية مصر العربية</p>
            </div>
          </div>
        `
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('Resend study reminder response error:', errData);
      return { ok: false, error: errData.message || 'فشل في إرسال البريد الإلكتروني' };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('Fetch error while sending study reminder email:', err);
    return { ok: false, error: err.message };
  }
}
