// Plain-text views of the site for AI assistants and answer engines (llms.txt standard).
import { DEFAULT_EDUCATION_CATALOG, sortedSystems, stagesOfSystem, tracksOfStage } from './education_catalog';
import { KASHIER_PLANS } from './plans';
import { CONTACT, DEFAULT_DESCRIPTION, ENGLISH_SUMMARY, FEATURES, SITE_FAQ, SITE_NAME, SITE_URL, getFeature, type FeaturePage } from './seo';

// Search, answer and assistant crawlers that are explicitly welcomed in robots.txt.
export const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'GoogleOther', 'Applebot', 'Applebot-Extended', 'bingbot',
  'meta-externalagent', 'Amazonbot', 'DuckAssistBot', 'MistralAI-User', 'cohere-ai', 'YouBot', 'CCBot'
];

export const PLANS = Object.values(KASHIER_PLANS).map(p => ({
  months: Math.round(p.durationDays / 30),
  price: p.amount,
  currency: p.currency,
  days: p.durationDays,
  dailyPoints: p.dailyCoins
}));

export function curriculumCoverage(): { system: string; stages: string[] }[] {
  const c = DEFAULT_EDUCATION_CATALOG;
  return sortedSystems(c, true).map(s => ({
    system: s.name,
    stages: stagesOfSystem(c, s.id, true).map(st => {
      const tracks = tracksOfStage(c, st.id, true).map(t => t.name);
      return tracks.length ? `${st.name} (${tracks.join('، ')})` : st.name;
    })
  }));
}

const url = (path: string) => `${SITE_URL}${path}`;

function header(): string {
  return [
    `# ${SITE_NAME}`,
    '',
    `> ${ENGLISH_SUMMARY}`,
    '',
    DEFAULT_DESCRIPTION,
    '',
    '- Language: Arabic (Egyptian), right-to-left',
    '- Audience: students of the Egyptian national curriculum (preparatory, secondary, Egyptian Baccalaureate)',
    `- Platforms: web app at ${SITE_URL} (installable PWA on Android, iOS, Windows, macOS) and a mobile app (${url('/download')})`,
    `- Pricing: free start; ${PLANS.map(p => `${p.price} ${p.currency} / ${p.months} month${p.months > 1 ? 's' : ''}`).join(', ')}`,
    `- Contact: ${CONTACT.email}, ${CONTACT.phone}`
  ].join('\n');
}

export function llmsTxt(): string {
  return [
    header(),
    '',
    '## Product',
    `- [About EGS AI](${url('/about')}): fact sheet in Arabic and English: what it is, curriculum coverage, tools, prices, FAQ`,
    `- [All features](${url('/features')}): overview of every study tool`,
    ...FEATURES.map(f => `- [${f.navLabel}](${url(`/features/${f.slug}`)}): ${f.description}`),
    '',
    '## Use the app',
    `- [Start chatting with the AI tutor](${url('/chat')}): ask about any lesson; \`?q=\` pre-fills the question`,
    `- [Download the app](${url('/download')})`,
    `- [Contact](${url('/contact')})`,
    '',
    '## Optional',
    `- [Full content for LLMs](${url('/llms-full.txt')}): every feature page, FAQ and plan in one file`,
    `- [Privacy policy](${url('/privacy')})`,
    `- [Terms of use](${url('/terms')})`,
    ''
  ].join('\n');
}

export function featureMarkdown(f: FeaturePage): string {
  return [
    `## ${f.h1}`,
    '',
    `Page: ${url(`/features/${f.slug}`)} | Open in app: ${url(f.route)}`,
    '',
    f.intro,
    '',
    ...f.highlights.map(h => `- **${h.title}**: ${h.text}`),
    '',
    'Steps:',
    ...f.steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    ...f.faq.flatMap(q => [`**${q.q}**`, q.a, ''])
  ].join('\n');
}

export function llmsFullTxt(): string {
  return [
    header(),
    '',
    '## Curriculum coverage',
    '',
    ...curriculumCoverage().flatMap(s => [`- ${s.system}: ${s.stages.join('، ')}`]),
    '',
    '## Plans',
    '',
    ...PLANS.map(p => `- ${p.months} month${p.months > 1 ? 's' : ''}: ${p.price} ${p.currency}, ${p.dailyPoints} points per day for ${p.days} days`),
    '- Payment: Visa, Mastercard, Meeza, mobile wallets and InstaPay via Kashier; refund within 72 hours if no points were used.',
    '',
    ...FEATURES.map(featureMarkdown),
    '## FAQ',
    '',
    ...SITE_FAQ.flatMap(q => [`**${q.q}**`, q.a, ''])
  ].join('\n');
}

function featuresIndexMarkdown(): string {
  return [
    `# ${SITE_NAME}: كل أدوات المذاكرة بالذكاء الاصطناعي`,
    '',
    ...FEATURES.map(f => `- [${f.navLabel}](${url(`/features/${f.slug}`)}): ${f.description}`),
    ''
  ].join('\n');
}

// Markdown twin of an HTML page for agents that send Accept: text/markdown; null when the path has none.
export function markdownForPath(path: string): string | null {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/') return llmsTxt();
  if (clean === '/about') return llmsFullTxt();
  if (clean === '/features') return featuresIndexMarkdown();
  const f = clean.startsWith('/features/') ? getFeature(clean.slice(10)) : FEATURES.find(x => x.route === clean);
  return f ? `# ${SITE_NAME}\n\n${featureMarkdown(f)}` : null;
}

export function robotsTxt(): string {
  const rules = [
    'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
    'Allow: /',
    'Allow: /llms.txt',
    'Allow: /llms-full.txt',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /pay'
  ];
  return [
    '# Content Signals (https://contentsignals.org): search indexing, AI answers and AI training are all permitted.',
    'User-Agent: *',
    ...rules,
    '',
    ...AI_CRAWLERS.map(a => `User-Agent: ${a}`),
    ...rules,
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    ''
  ].join('\n');
}

export function textResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400'
    }
  });
}
