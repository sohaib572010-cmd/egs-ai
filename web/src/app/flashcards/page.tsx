'use client';

import App from '../page';

export default function FlashcardsPage() {
  return (
    <>
      <section className="sr-only" aria-label="البطاقات التعليمية الذكية لمنصة EGS AI">
        <h2>نظام البطاقات التعليمية التفاعلية والتكرار المتباعد</h2>
        <p>
          تتيح منصة EGS AI مراجعة سريعة وفعالة لمفاهيم وقوانين وتعريفات المناهج التعليمية المصرية، لترسيخ المعلومات قبل الاختبارات الشهرية والنهائية.
        </p>
      </section>
      <App initialTab="flashcards" />
    </>
  );
}
