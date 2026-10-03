'use client';

import App from '../page';

export default function LeaderboardPage() {
  return (
    <>
      <section className="sr-only" aria-label="لوحة المتفوقين لمنصة EGS AI">
        <h2>لوحة شرف وتنافس طلاب المناهج المصرية</h2>
        <p>
          شاهد ترتيب الطلاب الأكثر التزاماً وتفوقاً في حل الأسئلة والامتحانات، واكسب نقاط التميز والشارات التنافسية.
        </p>
      </section>
      <App initialTab="leaderboard" />
    </>
  );
}
