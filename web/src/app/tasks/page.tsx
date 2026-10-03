'use client';

import App from '../page';

export default function TasksPage() {
  return (
    <>
      <section className="sr-only" aria-label="سجل المذاكرة والمهام الدراسية">
        <h2>تنظيم خطة المذاكرة ومتابعة إنجاز وحدات المنهج</h2>
        <p>
          لوحة متابعة تقدم الطالب في وحدات ودروس المنهج، وحساب معدل الإنجاز وسجل الملاحظات والمسائل المحفوظة.
        </p>
      </section>
      <App initialTab="tasks" />
    </>
  );
}
