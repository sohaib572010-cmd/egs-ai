// Submits every sitemap URL to IndexNow (Bing, Yandex, Seznam, Naver). Run after each production deploy:
// node scripts/indexnow.mjs
const KEY = 'fb89abf7492bc696c4930c1290c67a7e';
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.egsaiedu.com').replace(/\/+$/, '');

const sitemap = await fetch(`${SITE}/sitemap.xml`).then(r => {
  if (!r.ok) throw new Error(`sitemap.xml returned ${r.status}`);
  return r.text();
});
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
urlList.push(`${SITE}/llms.txt`, `${SITE}/llms-full.txt`);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList })
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} URLs`);
if (!res.ok && res.status !== 202) process.exit(1);
