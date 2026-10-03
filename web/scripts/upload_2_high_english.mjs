import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dns from 'dns';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// Prefer IPv4 on Windows to prevent IPv6 DNS lookup delays
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.substring(0, idx).trim();
        const v = trimmed.substring(idx + 1).trim();
        process.env[k] = v;
      }
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EDENAI_API_KEY = process.env.EDENAI_API_KEY;
const EDENAI_BASE = 'https://api.edenai.run/v2';
const ALIBABA_API_KEY = process.env.ALIBABA_API_KEY || process.env.DASHSCOPE_API_KEY;
const ALIBABA_API_BASE = process.env.ALIBABA_API_BASE || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Token Counter & Chunker ─────────────────────────────────────────────────

function countTokens(text) {
  if (!text) return 0;
  const wordCount = text.trim().split(/\s+/).length;
  return Math.ceil(wordCount * 1.4);
}

const PARENT_MAX_TOKENS = 500;
const CHILD_MAX_TOKENS = 120;
const CHILD_OVERLAP_TOKENS = 24;

function chunkMarkdownHierarchical(markdownText) {
  const lines = markdownText.split('\n');
  const rawSections = [];

  let currentHeading = 'مقدمة المنهج';
  let currentLines = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentLines.join('\n').trim().length > 10) {
        rawSections.push({ heading: currentHeading, contentLines: [...currentLines] });
      }
      currentHeading = headingMatch[2].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.join('\n').trim().length > 10) {
    rawSections.push({ heading: currentHeading, contentLines: currentLines });
  }

  const parents = [];

  for (const section of rawSections) {
    const fullContent = section.contentLines.join('\n').trim();
    const tokenCount = countTokens(fullContent);

    if (tokenCount <= PARENT_MAX_TOKENS) {
      parents.push({ heading: section.heading, content: fullContent });
    } else {
      const paragraphs = fullContent.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      const paragraphsWithTokens = paragraphs.map(p => ({
        text: p,
        tokens: countTokens(p)
      }));

      let buffer = '';
      let bufferTokens = 0;
      let subIndex = 1;

      for (const { text, tokens } of paragraphsWithTokens) {
        const separatorTokens = buffer ? 2 : 0;
        if (bufferTokens + separatorTokens + tokens > PARENT_MAX_TOKENS && buffer.trim()) {
          parents.push({
            heading: `${section.heading} (${subIndex++})`,
            content: buffer.trim()
          });
          buffer = text;
          bufferTokens = tokens;
        } else {
          buffer = buffer ? `${buffer}\n\n${text}` : text;
          bufferTokens += separatorTokens + tokens;
        }
      }
      if (buffer.trim()) {
        parents.push({
          heading: subIndex > 1 ? `${section.heading} (${subIndex})` : section.heading,
          content: buffer.trim()
        });
      }
    }
  }

  const children = [];

  for (const [parentIndex, parent] of parents.entries()) {
    const childChunks = createSlidingWindowChunks(
      parent.content,
      parent.heading,
      CHILD_MAX_TOKENS,
      CHILD_OVERLAP_TOKENS
    );
    children.push(...childChunks.map(c => ({ ...c, parentIndex })));
  }

  return { parents, children };
}

function createSlidingWindowChunks(text, parentHeading, maxTokens, overlapTokens) {
  const sentences = text
    .split(/(?<=[.!?؟\n])\s+|(?<=[\n])\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length === 0) return [];

  if (countTokens(text) <= maxTokens) {
    return [{
      heading: parentHeading,
      content: text.trim(),
      parentHeading
    }];
  }

  const sentencesWithTokens = sentences.map(s => ({
    text: s,
    tokens: countTokens(s)
  }));

  const chunks = [];
  let buffer = [];
  let bufferTokens = 0;

  for (const item of sentencesWithTokens) {
    if (bufferTokens + item.tokens > maxTokens && buffer.length > 0) {
      chunks.push({
        heading: parentHeading,
        content: buffer.map(b => b.text).join(' ').trim(),
        parentHeading
      });

      while (buffer.length > 0 && bufferTokens > overlapTokens) {
        const removed = buffer.shift();
        bufferTokens -= removed.tokens;
      }
    }

    buffer.push(item);
    bufferTokens += item.tokens;
  }

  if (buffer.length > 0 && buffer.map(b => b.text).join(' ').trim().length > 5) {
    chunks.push({
      heading: parentHeading,
      content: buffer.map(b => b.text).join(' ').trim(),
      parentHeading
    });
  }

  return chunks.length > 0 ? chunks : [{
    heading: parentHeading,
    content: text.trim(),
    parentHeading
  }];
}

// ─── Vector Embeddings (Alibaba text-embedding-v4 with EdenAI Fallback) ───────

async function requestAlibabaBatch(batch) {
  const endpoint = `${ALIBABA_API_BASE}/embeddings`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ALIBABA_API_KEY}`
    },
    body: JSON.stringify({
      model: 'text-embedding-v4',
      input: batch,
      dimensions: 768
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Alibaba API status ${res.status}: ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  const items = data.data || [];
  items.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return items.map(it => it.embedding || []);
}

async function requestEmbedding(batch) {
  const https = await import('https');
  const body = JSON.stringify({
    providers: 'google',
    texts: batch,
    model: 'text-embedding-004'
  });

  return new Promise((resolve, reject) => {
    const req = https.request('https://api.edenai.run/v2/text/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EDENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            const googleKey = Object.keys(parsed).find(k => k.startsWith('google'));
            const items = googleKey ? (parsed[googleKey]?.items ?? []) : [];
            resolve(items.map(it => it.embedding || []));
          } catch (e) {
            reject(new Error(`Failed to parse embedding response: ${e.message}`));
          }
        } else {
          reject(new Error(`Embedding API status ${res.statusCode}: ${data.slice(0, 100)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Embedding request timed out (30s)'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

async function generateEmbeddingBatch(texts) {
  if (texts.length === 0) return [];

  // Primary: Alibaba text-embedding-v4 (max 10 items per batch)
  if (ALIBABA_API_KEY) {
    const BATCH_SIZE = 10;
    const batches = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      batches.push(texts.slice(i, i + BATCH_SIZE).map(t => (t || '').slice(0, 8000)));
    }

    const allEmbeddings = [];
    let allSucceeded = true;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      let retries = 3;
      let success = false;

      while (retries > 0 && !success) {
        try {
          const embeddings = await requestAlibabaBatch(batch);
          for (let j = 0; j < batch.length; j++) {
            allEmbeddings.push(embeddings[j] || []);
          }
          success = true;
        } catch (err) {
          retries--;
          console.warn(`Retry ${3 - retries}/3 for Alibaba batch ${i + 1}/${batches.length}:`, err.message);
          if (retries > 0) await new Promise(r => setTimeout(r, 1000));
        }
      }

      if (!success) {
        allSucceeded = false;
        break;
      }
      await new Promise(r => setTimeout(r, 150));
    }

    if (allSucceeded && allEmbeddings.length === texts.length) {
      return allEmbeddings;
    }
    console.warn('Alibaba batch embedding encountered errors, falling back to EdenAI...');
  }

  // Fallback: EdenAI Google text-embedding-004
  if (!EDENAI_API_KEY) return texts.map(() => []);

  const BATCH_SIZE = 15;
  const batches = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE).map(t => t.slice(0, 8000)));
  }

  const allEmbeddings = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    let retries = 6;
    let success = false;

    while (retries > 0 && !success) {
      try {
        const embeddings = await requestEmbedding(batch);
        for (let j = 0; j < batch.length; j++) {
          allEmbeddings.push(embeddings[j] || []);
        }
        success = true;
      } catch (err) {
        retries--;
        console.warn(`Retry ${6 - retries}/6 for embedding batch ${i + 1}/${batches.length}:`, err.message);
        if (retries > 0) await new Promise(r => setTimeout(r, 2500));
        else {
          for (let j = 0; j < batch.length; j++) allEmbeddings.push([]);
        }
      }
    }
    await new Promise(r => setTimeout(r, 400));
  }

  return allEmbeddings;
}

// ─── Complete Definition for 2_high English Curriculum ───────────────────────

export const HIGH_2_ENGLISH_DEFINITION = {
  id: 'ac7b9331-49c4-416d-bcd7-8f95fb84803b',
  grade_level: '2_high',
  subject_name: 'اللغة الإنجليزية',
  file_name: 'اللغة الانجليزية.md',
  track_id: null,
  is_elective: false,
  is_placeholder: false,
  units: [
    {
      id: '2_high_eng_u1',
      title: 'الوحدة 1: العيش الجيد في عالم معقد - Unit 1: Living Well in a Complex World',
      unitNumber: 1,
      groupTitle: 'المحور 1: الوعي والرفاهية الذاتية - Concept 1: Well-being',
      lessons: [
        {
          id: '2_high_eng_u1_l1',
          title: 'الدرس 1: وسائل التواصل الاجتماعي والصورة الذاتية - Lesson 1: Social Media and Self-Image',
          lessonNumber: 1,
          unitId: '2_high_eng_u1',
          unitTitle: 'الوحدة 1: العيش الجيد في عالم معقد - Unit 1: Living Well in a Complex World',
          subtopics: [
            'Key Vocabulary: Social media, self-image, unrealistic expectations, comparison culture, digital habits (مفردات وسائل التواصل والصورة الذاتية)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات للوحدة الأولى)',
            'Verbal Collocations & Expressions: Form an impression, project an image, measure self-worth (المتلازمات والتعبيرات اللغوية)',
            'Language Notes: Absolute words, bias, perception vs. reality (ملاحظات لغوية واشتقاقات الكلمات)',
            'Grammar Focus: Relative Clauses (ضمائر وعبارات الوصل المحددة وغير المحددة: who, whom, which, that, whose)',
            'Relative Adverbs: Where, when, why (ظروف الوصل الزمانية والمكانية والسببية)',
            'Reading Text & Critical Thinking: The impact of curated social media feeds on teen self-esteem (أثر المنشورات الافتراضية على تقدير الذات لدى المراهقين)',
            'Writing Focus: Reflective Paragraph on healthy digital habits (كتابة فقرة تأملية عن تنظيم العادات الرقمية)'
          ]
        },
        {
          id: '2_high_eng_u1_l2',
          title: 'الدرس 2: استكشاف أنماط الحياة المعاصرة - Lesson 2: Exploring Modern Lifestyles',
          lessonNumber: 2,
          unitId: '2_high_eng_u1',
          unitTitle: 'الوحدة 1: العيش الجيد في عالم معقد - Unit 1: Living Well in a Complex World',
          subtopics: [
            'Key Vocabulary: Modern lifestyles, sedentary habits, work-life balance, mindfulness, digital detox (أنماط الحياة الحديثة والتوازن النفسي والبدني)',
            'Important Vocabulary & Definitions (مفردات هامة وتعريفاتها الدقيقة)',
            'Collocations, Idioms & Prepositions: Lead a balanced life, disconnect to reconnect, cope with pressure (المتلازمات وحروف الجر)',
            'Language Notes: Clear up confusion between lifestyle words (الفروق اللغوية الدقيقة بين مصطلحات نمط الحياة)',
            'Listening & Speaking: Prioritizing physical health and mental clarity in a fast-paced world (الحفاظ على الصحة البدنية والنقاء الذهني)',
            'Writing Skills: Descriptive and Analytical Paragraph (كتابة فقرة وصفية وتحليلية لأنماط الحياة المعاصرة)'
          ]
        },
        {
          id: '2_high_eng_u1_l3',
          title: 'الدرس 3: على من تقع المسؤولية؟ - Lesson 3: Whose Responsibility Is It?',
          lessonNumber: 3,
          unitId: '2_high_eng_u1',
          unitTitle: 'الوحدة 1: العيش الجيد في عالم معقد - Unit 1: Living Well in a Complex World',
          subtopics: [
            'Key Vocabulary: Corporate responsibility, civic accountability, ethical standards, regulation (المسؤولية المؤسسية والمدنية والمعايير الأخلاقية)',
            'Definitions & Synonyms (التعريفات والمترادفات لمفاهيم المسؤولية)',
            'Verbal Collocations: Take responsibility, hold accountable, enforce regulations, protect user welfare (متلازمات تحمل المسؤولية والمحاسبة)',
            'Language Notes & Word Families (الملاحظات اللغوية واشتقاقات الكلمات)',
            'Reading Comprehension: Tech companies, platform moderation, and teenage well-being (دور منصات التكنولوجيا في سلامة المستخدمين)',
            'Discussion & Debate: Individual agency vs. regulatory intervention (المسؤولية الفردية في مقابل التنظيم المؤسسي)'
          ]
        },
        {
          id: '2_high_eng_u1_l4',
          title: 'الدرس 4: فهم الصحة النفسية - Lesson 4: Understanding Mental Health',
          lessonNumber: 4,
          unitId: '2_high_eng_u1',
          unitTitle: 'الوحدة 1: العيش الجيد في عالم معقد - Unit 1: Living Well in a Complex World',
          subtopics: [
            'Key Vocabulary: Mental health, well-being, resilience, stigma, anxiety, coping mechanisms, empathy (الصحة النفسية، المرونة، آليات المواجهة، كسر الوصمة)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات لمفاهيم الصحة النفسية)',
            'Verbal Collocations & Prepositions: Overcome anxiety, build resilience, seek guidance, cope with stress (المتلازمات اللفظية وحروف الجر)',
            'Grammar Focus: Conditionals & Advanced Conditional Rules (حالات if الشرطية الأربعة: Zero, First, Second, Third)',
            'Advanced Conditionals: Unless, provided that, as long as, in case of, but for, without (بدائل وقواعد الشرط المتقدمة)',
            'Reading Text: Destigmatizing mental health issues and creating supportive school environments (التوعية بالصحة النفسية وبيئات التعلم الداعمة)',
            'Writing Skills: Argumentative Essay on youth mental health awareness (كتابة مقال إقناعي حول التوعية بالصحة النفسية)'
          ]
        }
      ]
    },
    {
      id: '2_high_eng_u2',
      title: 'الوحدة 2: أوقات الفراغ والأنشطة الترفيهية - Unit 2: Leisure Time',
      unitNumber: 2,
      groupTitle: 'المحور 2: التجارب والخبرات - Concept 2: Experiences',
      lessons: [
        {
          id: '2_high_eng_u2_l1',
          title: 'الدرس 1: وقت الشاشة والشباب - Lesson 1: Screen Time and Young People',
          lessonNumber: 1,
          unitId: '2_high_eng_u2',
          unitTitle: 'الوحدة 2: أوقات الفراغ والأنشطة الترفيهية - Unit 2: Leisure Time',
          subtopics: [
            'Key Vocabulary: Screen time, passive consumption, attention span, digital boundary, binge-watching (وقت الشاشة، التصفح السلبي، مدى الانتباه)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)',
            'Verbal Collocations & Expressions: Set boundaries, limit exposure, keep track of time (متلازمات تنظيم وقت الشاشة)',
            'Language Notes: Boundary, limit, restrict, addict vs. addiction (ملاحظات لغوية)',
            'Reading Comprehension: Guidelines and practical solutions for managing digital consumption (إرشادات وحلول عملية للتحكم في استهلاك الشاشات)',
            'Writing Focus: Action plan for reducing screen dependency (خطة عمل لتقليل الاعتماد على الأجهزة الرقمية)'
          ]
        },
        {
          id: '2_high_eng_u2_l2',
          title: 'الدرس 2: الفنون الإبداعية كأنشطة ترفيهية - Lesson 2: Creative Arts as Leisure Activities',
          lessonNumber: 2,
          unitId: '2_high_eng_u2',
          unitTitle: 'الوحدة 2: أوقات الفراغ والأنشطة الترفيهية - Unit 2: Leisure Time',
          subtopics: [
            'Key Vocabulary: Creative arts, craftsmanship, pottery, painting, theatre, expressive hobbies (الفنون الإبداعية، الحرف اليدوية، التعبير الفني)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)',
            'Verbal Collocations: Practice an art, express creativity, find solace in hobbies (متلازمات ممارسة الفنون)',
            'Grammar Focus: Gerunds and Infinitives (الأفعال المتبوعة بالمصدر to + inf والأفعال المتبوعة بـ ing)',
            'Verbs with Change in Meaning: Remember, forget, regret, stop, try (أفعال يتغير معناها مع المصدر أو الـ gerund)',
            'Listening & Speaking: The therapeutic benefits of artistic expression for students (الفوائد النفسية والذهنية للأنشطة الإبداعية)'
          ]
        },
        {
          id: '2_high_eng_u2_l3',
          title: 'الدرس 3: الرياضة والنشاط البدني كوسيلة للترفيه - Lesson 3: Sport and Physical Activity as Leisure',
          lessonNumber: 3,
          unitId: '2_high_eng_u2',
          unitTitle: 'الوحدة 2: أوقات الفراغ والأنشطة الترفيهية - Unit 2: Leisure Time',
          subtopics: [
            'Key Vocabulary: Physical fitness, cardiovascular health, teamwork, stamina, sportsmanship, endorphins (اللياقة البدنية، الرياضات الجماعية، الروح الرياضية)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)',
            'Verbal Collocations: Take up a sport, boost endurance, achieve a milestone (متلازمات الرياضة والنشاط البدني)',
            'Grammar & Word Formation: Suffixes for Adjectives and Adverbs (-able, -ive, -ful, -less, -ly) (لواحق تكوين الصفات والظروف)',
            'Reading Text: The lifelong impact of regular physical recreation on academic performance (أثر الرياضة المستمرة على التحصيل الدراسي)',
            'Speaking: Organizing intramural athletic clubs and tournaments (تنظيم الأنشطة والبطولات الرياضية المدرسية)'
          ]
        },
        {
          id: '2_high_eng_u2_l4',
          title: 'الدرس 4: ليس يوماً مريحاً تماماً - Lesson 4: Not Exactly a Relaxing Day',
          lessonNumber: 4,
          unitId: '2_high_eng_u2',
          unitTitle: 'الوحدة 2: أوقات الفراغ والأنشطة الترفيهية - Unit 2: Leisure Time',
          subtopics: [
            'Key Vocabulary: Misadventures, outdoor excursions, unexpected setbacks, stamina, composure (مفارقات الرحلات، العقبات غير المتوقعة، الحفاظ على الهدوء)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)',
            'Phrasal Verbs & Idioms: Wear on, struggle to keep up, fall behind, call it a day (الأفعال الاصطلاحية وتعبيرات المواقف الشاقة)',
            'Language Notes: Subtle nuances in narrative phrasing (الفروق الدقيقة في الصياغة السردية)',
            'Reading & Narrative Analysis: A humorous account of an exhausting weekend camping trip (نص سردي فكاهي عن رحلة تخييم مليئة بالتحديات)',
            'Writing Skills: Narrative Essay writing techniques and vivid imagery (تقنيات كتابة المقال السردي والوصف الحي)'
          ]
        }
      ]
    },
    {
      id: '2_high_eng_u3',
      title: 'الوحدة 3: أصداء الماضي والتاريخ - Unit 3: Echoes of the Past',
      unitNumber: 3,
      groupTitle: 'المحور 3: الهوية والتراث - Concept 3: Identity',
      lessons: [
        {
          id: '2_high_eng_u3_l1',
          title: 'الدرس 1: مواقع الذاكرة والتراث - Lesson 1: Sites of Memory',
          lessonNumber: 1,
          unitId: '2_high_eng_u3',
          unitTitle: 'الوحدة 3: أصداء الماضي والتاريخ - Unit 3: Echoes of the Past',
          subtopics: [
            'Key Vocabulary: Heritage sites, historical monuments, archeological preservation, tangible legacy, UNESCO (المواقع التراثية، المعالم الأثرية، الحفاظ والتوثيق)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات لمفردات التراث)',
            'Verbal Collocations & Prepositions: Restore monuments, safeguard heritage, bear witness to history (متلازمات حماية التراث)',
            'Language Notes & Word Families (ملاحظات لغوية واشتقاقات الكلمات)',
            'Reading Comprehension: Preserving Egypt’s historical landmarks and UNESCO sites (حماية المعالم التاريخية ومواقع التراث العالمي في مصر)',
            'Speaking: Promoting cultural tourism and responsible visitation (تعزيز السياحة الثقافية والزيارة المسؤولة للمواقع الأثرية)'
          ]
        },
        {
          id: '2_high_eng_u3_l2',
          title: 'الدرس 2: المتحف كراوٍ للتاريخ - Lesson 2: The Museum as a Storyteller',
          lessonNumber: 2,
          unitId: '2_high_eng_u3',
          unitTitle: 'الوحدة 3: أصداء الماضي والتاريخ - Unit 3: Echoes of the Past',
          subtopics: [
            'Key Vocabulary: Curator, antiquities, interactive exhibits, archival storytelling, restoration (أمين المتحف، الآثار، المعارض التفاعلية، السرد التاريخي)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)',
            'Collocations & Idioms: Curate an exhibit, bring history to life, shed light on (متلازمات العمل المتحفي وعرض الآثار)',
            'Grammar Focus: Concession Clauses & Contrast (عبارات التناقض والاستدراك: although, even though, though, despite, in spite of, however, whereas)',
            'Listening & Reading: The Grand Egyptian Museum (GEM) and modern museum curating (المتحف المصري الكبير وتجربة العرض المتحفي المعاصر)',
            'Writing Skills: Descriptive review of a cultural exhibition (كتابة مراجعة وصفية لمعرض أثري أو متحف)'
          ]
        },
        {
          id: '2_high_eng_u3_l3',
          title: 'الدرس 3: الماضي الرقمي والانتشار الواسع - Lesson 3: The Viral Past',
          lessonNumber: 3,
          unitId: '2_high_eng_u3',
          unitTitle: 'الوحدة 3: أصداء الماضي والتاريخ - Unit 3: Echoes of the Past',
          subtopics: [
            'Key Vocabulary: Digital history, viral trends, historical democratization, 3D reconstruction, misinformation (التاريخ الرقمي، النمذجة ثلاثية الأبعاد، تحري الدقة)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)',
            'Verbal Collocations: Spark viral interest, revive forgotten history, reconstruct artifacts (متلازمات الانتشار الرقمي والتراث)',
            'Language Notes: Nuances of historical credibility online (المصداقية التاريخية في المحتوى الرقمي)',
            'Reading & Critical Media Literacy: Evaluating digital claims about ancient history (النقد والتحليل الإعلامي للمعلومات التاريخية المتداولة)',
            'Writing Skills: Discursive paragraph on digital history versus formal scholarship (فقرة مقارنة بين التوثيق الرقمي والبحث الأكاديمي)'
          ]
        },
        {
          id: '2_high_eng_u3_l4',
          title: 'الدرس 4: وسائل التواصل الاجتماعي والأحداث التاريخية - Lesson 4: Social Media and Historical Events',
          lessonNumber: 4,
          unitId: '2_high_eng_u3',
          unitTitle: 'الوحدة 3: أصداء الماضي والتاريخ - Unit 3: Echoes of the Past',
          subtopics: [
            'Key Vocabulary: Excavation, commemorative events, citizen documentation, public memory (التنقيب، الفعاليات التذكارية، التوثيق المجتمعي)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)',
            'Language Notes: Fragile, remarkable, unprecedented, tangible vs. intangible (ملاحظات لغوية)',
            'Listening Comprehension: How historical anniversaries are celebrated in the digital age (إحياء المناسبات التاريخية عبر الوسائط الحديثة)',
            'Reading Text: Reconnecting youth with ancestral achievements through interactive media (ربط الشباب بإنجازات الأجداد عبر الإعلام التفاعلي)',
            'Writing Skills: Formal Article commemorating an iconic Egyptian milestone (كتابة مقال رسمي تذكاري لحدث تاريخي مصري بارز)'
          ]
        }
      ]
    },
    {
      id: '2_high_eng_u4',
      title: 'الوحدة 4: قوة الاختيار وثقافة الاستهلاك - Unit 4: The Power of Choice',
      unitNumber: 4,
      groupTitle: 'المحور 4: الاستهلاك والاختيار - Concept 4: Consumption and Choice',
      lessons: [
        {
          id: '2_high_eng_u4_l1',
          title: 'الدرس 1: هدر الطعام والاستهلاك المستدام - Lesson 1: Food Waste',
          lessonNumber: 1,
          unitId: '2_high_eng_u4',
          unitTitle: 'الوحدة 4: قوة الاختيار وثقافة الاستهلاك - Unit 4: The Power of Choice',
          subtopics: [
            'Key Vocabulary: Food waste, sustainable consumption, supply chains, leftovers, compost, perishables (هدر الطعام، الاستهلاك المستدام، سلاسل الإمداد، التدوير)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)',
            'Verbal Collocations & Expressions: Minimize waste, manage portions, make conscious choices (متلازمات ترشيد الاستهلاك الغذائي)',
            'Grammar Focus: Cause and Effect Structures (تراكيب وصيغ السبب والنتيجة: because of, owing to, due to, as a result, consequently, lead to)',
            'Reading Comprehension: Global and Egyptian initiatives against food waste (مبادرات مكافحة هدر الطعام عالمياً وفي مصر)',
            'Writing Focus: Proposal to reduce food waste in school cafeterias (مقترح عملي لتقليل هدر الطعام في المدارس)'
          ]
        },
        {
          id: '2_high_eng_u4_l2',
          title: 'الدرس 2: ما وراء العلامة التجارية - Lesson 2: Beyond the Brand',
          lessonNumber: 2,
          unitId: '2_high_eng_u4',
          unitTitle: 'الوحدة 4: قوة الاختيار وثقافة الاستهلاك - Unit 4: The Power of Choice',
          subtopics: [
            'Key Vocabulary: Ethical branding, fair trade, sweatshops, eco-friendly certification, transparency (العلامات التجارية الأخلاقية، التجارة العادلة، معايير الاستدامة)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)',
            'Verbal Collocations & Prepositions: Boycott unethical practices, demand transparency, support local artisans (متلازمات الاستهلاك الواعي)',
            'Language Notes: Brand awareness, consumer rights, genuine vs. counterfeit (ملاحظات لغوية والفروق الاصطلاحية)',
            'Reading Text: Conscious consumer choices driving ethical market changes (أثر اختيارات المستهلكين الواعية في تحفيز التغيير في الأسواق)',
            'Speaking: Analyzing product labels and corporate responsibility claims (تحليل ملصقات المنتجات ومعايير المسؤولية المجتمعية)'
          ]
        },
        {
          id: '2_high_eng_u4_l3',
          title: 'الدرس 3: الاستهلاك الرقمي وتشتت الانتباه - Lesson 3: Digital Consumption',
          lessonNumber: 3,
          unitId: '2_high_eng_u4',
          unitTitle: 'الوحدة 4: قوة الاختيار وثقافة الاستهلاك - Unit 4: The Power of Choice',
          subtopics: [
            'Key Vocabulary: Attention economy, microtransactions, notification fatigue, subscription traps, content binge (اقتصاد الانتباه، المعاملات الرقمية الدقيقة، إرهاق التنبيهات)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)',
            'Collocations & Idioms: Drain attention, hook the user, fall prey to algorithms (متلازمات استنزاف الانتباه والاستهلاك الرقمي)',
            'Listening Comprehension: Psychological tactics used in app design and in-app purchases (الأساليب النفسية المستخدمة في تصميم التطبيقات)',
            'Reading & Critical Evaluation: Developing digital discipline and intentional browsing (بناء الانضباط الرقمي والتصفح الهادف)',
            'Writing Skills: Cause-and-Effect Paragraph on digital overload (كتابة فقرة عن أسباب ونتائج الإفراط في الاستهلاك الرقمي)'
          ]
        },
        {
          id: '2_high_eng_u4_l4',
          title: 'الدرس 4: الجمعة السوداء وثقافة التخفيضات - Lesson 4: Black Friday and Sales Culture',
          lessonNumber: 4,
          unitId: '2_high_eng_u4',
          unitTitle: 'الوحدة 4: قوة الاختيار وثقافة الاستهلاك - Unit 4: The Power of Choice',
          subtopics: [
            'Key Vocabulary: Flash sales, impulsive buying, scarcity marketing, retail frenzy, buyer’s remorse (مواسم التخفيضات، الشراء الاندفاعي، التسويق عبر ندرة العرض)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات)',
            'Collocations & Prepositions: Slash prices, buy on impulse, resist promotional pressure (متلازمات الشراء ومقاومة الإغراءات التسويقية)',
            'Language Notes: Financial literacy and smart shopping vocabulary (ملاحظات لغوية حول الثقافة المالية والشراء الذكي)',
            'Reading Text: The psychological triggers behind seasonal mega-sales (المحفزات النفسية وراء مواسم التخفيضات الكبرى)',
            'Writing Skills: Problem-Solution Essay on overcoming consumerism (كتابة مقال تقديم حلول لمشكلة الهوس الاستهلاكي)'
          ]
        }
      ]
    },
    {
      id: '2_high_eng_u5',
      title: 'الوحدة 5: ظاهرة الاحتباس الحراري والعمل البيئي - Unit 5: The Greenhouse Effect',
      unitNumber: 5,
      groupTitle: 'المحور 5: مشاركة الكوكب - Concept 5: Sharing the Planet',
      lessons: [
        {
          id: '2_high_eng_u5_l1',
          title: 'الدرس 1: أزمة المناخ والتحديات البيئية - Lesson 1: The Climate Crisis',
          lessonNumber: 1,
          unitId: '2_high_eng_u5',
          unitTitle: 'الوحدة 5: ظاهرة الاحتباس الحراري والعمل البيئي - Unit 5: The Greenhouse Effect',
          subtopics: [
            'Key Vocabulary: Greenhouse effect, global warming, carbon emissions, sea level rise, extreme weather, biodiversity (الاحتباس الحراري، الانبعاثات، ارتفاع منسوب البحار، التنوع الحيوي)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات للمفاهيم المناخية)',
            'Verbal Collocations & Expressions: Curb emissions, pose an existential threat, combat global warming (متلازمات مواجهة التغير المناخي)',
            'Language Notes: Nuances in environmental terminology (ملاحظات لغوية واصطلاحية حول قضايا المناخ)',
            'Reading Comprehension: Scientific consensus on climate tipping points (الأدلة العلمية ونقاط التحول المناخي الحرجة)',
            'Writing Skills: Argumentative Paragraph Structure (Topic sentence, Supporting evidence, Concession, Conclusion) (بناء وتطوير الفقرة الجدلية)'
          ]
        },
        {
          id: '2_high_eng_u5_l2',
          title: 'الدرس 2: الطاقة المتجددة نحو مستقبل مستدام - Lesson 2: Renewable Energy - Powering a Sustainable Future',
          lessonNumber: 2,
          unitId: '2_high_eng_u5',
          unitTitle: 'الوحدة 5: ظاهرة الاحتباس الحراري والعمل البيئي - Unit 5: The Greenhouse Effect',
          subtopics: [
            'Key Vocabulary: Solar energy, wind turbines, green hydrogen, fossil fuels, renewable transition (الطاقة الشمسية، توربينات الرياح، الهيدروجين الأخضر، التحول الطاقي)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات لمفردات الطاقة المتجددة)',
            'Verbal Collocations: Generate clean power, phase out coal, harness natural resources (متلازمات توليد واستغلال الطاقة النظيفة)',
            'Grammar Focus: Modal Verbs of Obligation, Advice, Permission & Deduction (الأفعال الناقصة: should, must, have to, needn’t, can, could, may, might)',
            'Listening Text: Egypt’s landmark green initiatives (Benban Solar Park and Zaafarana Wind Farm) (مشاريع مصر الرائدة: مجمع بنبان ومزرعة الزعفرانة)',
            'Writing Focus: Informational Leaflet design, headlines, bullet points and call to action (تصميم وكتابة النشرة المعلوماتية الإرشادية)'
          ]
        },
        {
          id: '2_high_eng_u5_l3',
          title: 'الدرس 3: مشاريع التخضير في مصر - Lesson 3: Greening Projects in Egypt',
          lessonNumber: 3,
          unitId: '2_high_eng_u5',
          unitTitle: 'الوحدة 5: ظاهرة الاحتباس الحراري والعمل البيئي - Unit 5: The Greenhouse Effect',
          subtopics: [
            'Key Vocabulary: Afforestation, desert reclamation, urban greening, carbon sequestration, sustainable agriculture (التشجير، استصلاح الصحراء، الرئة الخضراء، الزراعة المستدامة)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات لمشاريع التخضير)',
            'Collocations & Prepositions: Embark on projects, transform barren lands, invest in sustainability (متلازمات المبادرات البيئية)',
            'Grammar Focus: Adverbials of Degree, Frequency, Manner, Time & Place (ظروف الدرجة والتكرار والكيفية والزمان والمكان وموقعها في الجملة)',
            'Adverbials in Argumentative Writing (توظيف الظروف لتقوية الحجج في الكتابة الإقناعية والجدلية)',
            'Listening & Reading: Egypt’s Journey Towards a Greener Future and COP hosting legacy (مسيرة مصر نحو مستقبل أخضر وإرث استضافة مؤتمرات المناخ)'
          ]
        },
        {
          id: '2_high_eng_u5_l4',
          title: 'الدرس 4: المبادرات الفردية والجماعية لحماية البيئة - Lesson 4: Individual & Collective Actions',
          lessonNumber: 4,
          unitId: '2_high_eng_u5',
          unitTitle: 'الوحدة 5: ظاهرة الاحتباس الحراري والعمل البيئي - Unit 5: The Greenhouse Effect',
          subtopics: [
            'Key Vocabulary: Grassroots activism, carbon footprint, recycling campaigns, collective stewardship (المبادرات المجتمعية، البصمة الكربونية، حملات التدوير، المسؤولية الجماعية)',
            'Definitions, Synonyms & Antonyms (التعريفات والمترادفات والمتضادات للعمل البيئي)',
            'Verbal Collocations & Expressions: Mobilize communities, launch campaigns, spearhead initiatives (متلازمات إطلاق وقيادة المبادرات)',
            'Reading Text: Inspiring Young Egyptians Taking Action for Our Planet (قصص ملهمة لشباب مصريين يقودون مبادرات لحماية البيئة)',
            'Writing & Project Task: Crafting an actionable Environmental Community Plan (إعداد خطة عمل بيئية متكاملة للمدرسة والمجتمع المحلي)',
            'Review & Reflection: Summary of major competencies and vocabulary across the curriculum (مراجعة شاملة للكفايات اللغوية والمهارات المكتسبة)'
          ]
        }
      ]
    }
  ]
};

// ─── Main Execution Pipeline ─────────────────────────────────────────────────

async function main() {
  console.log('Starting 2_high English Curriculum Upload & Indexing Pipeline...');
  const filePath = path.resolve(__dirname, '../../Curriculum Generator/output/2 ثانوي بكالوريا/اللغة الانجليزية.md');

  if (!fs.existsSync(filePath)) {
    console.error(`Curriculum file not found at: ${filePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  console.log(`File loaded: ${filePath} (${(fileContent.length / 1024).toFixed(1)} KB)`);

  // 1. Chunk markdown hierarchically
  console.log('1. Chunking Markdown hierarchically...');
  const { parents, children } = chunkMarkdownHierarchical(fileContent);
  console.log(`   Created ${parents.length} parent chunks and ${children.length} child chunks.`);

  // 2. Generate vector embeddings for child chunks (with disk cache)
  const cacheFilePath = path.resolve(__dirname, 'english_child_embeddings_cache.json');
  let embeddings = [];
  if (fs.existsSync(cacheFilePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      if (Array.isArray(cached) && cached.length === children.length) {
        console.log(`   Loaded ${cached.length} cached embeddings from disk.`);
        embeddings = cached;
      }
    } catch (e) {}
  }

  if (embeddings.length === 0) {
    console.log(`2. Generating text embeddings for ${children.length} child chunks via Alibaba/EdenAI...`);
    const childTexts = children.map(c => `${c.heading}\n${c.content}`);
    embeddings = await generateEmbeddingBatch(childTexts);
    const validEmbeddingsCount = embeddings.filter(e => e && e.length > 0).length;
    console.log(`   Generated ${validEmbeddingsCount}/${children.length} vector embeddings (768 dims).`);
    if (validEmbeddingsCount > 0) {
      fs.writeFileSync(cacheFilePath, JSON.stringify(embeddings), 'utf8');
      console.log(`   Saved embeddings to disk cache: ${cacheFilePath}`);
    }
  }

  // 3. Prepare parent chunks with IDs
  const parentWithIds = parents.map((p, i) => ({
    ...p,
    id: crypto.randomUUID(),
    position_index: i
  }));

  const curriculumId = HIGH_2_ENGLISH_DEFINITION.id;
  const orphanCurriculumId = 'db0fa825-515b-4370-b2de-8d1eeac9e944';

  async function retryOp(fn, name = 'operation', maxRetries = 10) {
    let attempts = 0;
    while (attempts < maxRetries) {
      attempts++;
      try {
        const result = await fn();
        if (result && result.error) throw result.error;
        return result;
      } catch (e) {
        console.warn(`Retry ${attempts}/${maxRetries} for ${name}: ${e.message}`);
        if (attempts >= maxRetries) throw e;
        await new Promise(r => setTimeout(r, 2000 + attempts * 500));
      }
    }
  }

  // 4. Update / Insert Curriculum in Supabase
  console.log('3. Updating Curriculum and inserting chunks in Supabase...');

  // Delete previous chunks if any for both the target ID and orphan ID
  await retryOp(() => supabase.from('curriculum_chunks').delete().eq('curriculum_id', curriculumId), 'delete old target chunks');
  await retryOp(() => supabase.from('curriculum_chunks').delete().eq('curriculum_id', orphanCurriculumId), 'delete old orphan chunks');

  // Upsert target curriculum row
  const curriculumRow = {
    id: curriculumId,
    grade_level: HIGH_2_ENGLISH_DEFINITION.grade_level,
    subject_name: HIGH_2_ENGLISH_DEFINITION.subject_name,
    file_name: HIGH_2_ENGLISH_DEFINITION.file_name,
    units: HIGH_2_ENGLISH_DEFINITION.units,
    is_placeholder: false,
    track_id: HIGH_2_ENGLISH_DEFINITION.track_id,
    is_elective: HIGH_2_ENGLISH_DEFINITION.is_elective,
    created_at: new Date().toISOString()
  };

  await retryOp(() => supabase.from('curriculums').upsert(curriculumRow), 'upsert curriculum');
  console.log(`Curriculum record updated in Supabase (ID: ${curriculumId}).`);

  // Remove orphan curriculum row if present
  try {
    await retryOp(() => supabase.from('curriculums').delete().eq('id', orphanCurriculumId), 'delete orphan curriculum');
    console.log(`Orphan curriculum row (${orphanCurriculumId}) cleaned up.`);
  } catch (e) {
    console.warn('Orphan cleanup notice:', e.message);
  }

  // Insert all PARENT chunks first (so child foreign keys are always valid)
  const parentRows = parentWithIds.map(p => ({
    id: p.id,
    curriculum_id: curriculumId,
    content: p.content,
    heading: p.heading,
    chunk_level: 'parent',
    parent_id: null,
    position_index: p.position_index,
    embedding: null
  }));

  const BATCH_SIZE = 100;
  for (let i = 0; i < parentRows.length; i += BATCH_SIZE) {
    const batch = parentRows.slice(i, i + BATCH_SIZE);
    await retryOp(() => supabase.from('curriculum_chunks').insert(batch), `insert parent chunk batch ${Math.floor(i / BATCH_SIZE) + 1}`);
  }
  console.log(`Inserted ${parentRows.length} parent chunks.`);

  // Then insert all CHILD chunks with smaller batch size and pacing to avoid statement timeout
  const childRows = children.map((c, i) => {
    const matchingParent = parentWithIds[c.parentIndex];
    return {
      id: crypto.randomUUID(),
      curriculum_id: curriculumId,
      content: c.content,
      heading: c.heading,
      chunk_level: 'child',
      parent_id: matchingParent ? matchingParent.id : null,
      position_index: i,
      embedding: embeddings[i] && embeddings[i].length > 0 ? embeddings[i] : null
    };
  });

  const CHILD_BATCH_SIZE = 25;
  const totalChildBatches = Math.ceil(childRows.length / CHILD_BATCH_SIZE);
  for (let i = 0; i < childRows.length; i += CHILD_BATCH_SIZE) {
    const batch = childRows.slice(i, i + CHILD_BATCH_SIZE);
    const batchNum = Math.floor(i / CHILD_BATCH_SIZE) + 1;
    await retryOp(() => supabase.from('curriculum_chunks').insert(batch), `insert child chunk batch ${batchNum}/${totalChildBatches}`);
    if (batchNum % 10 === 0 || batchNum === totalChildBatches) {
      console.log(`   Inserted child chunks progress: ${batchNum}/${totalChildBatches} batches (${Math.min(i + CHILD_BATCH_SIZE, childRows.length)}/${childRows.length})`);
    }
    await new Promise(r => setTimeout(r, 80));
  }
  console.log(`Inserted all ${childRows.length} child chunks.`);

  const formattedChunks = [...parentRows, ...childRows];

  // 5. Update system_settings (active_curriculum_ids & active_grade_levels)
  console.log('4. Updating System Settings...');
  const { data: allCurriculumsInDb } = await retryOp(() => supabase.from('curriculums').select('id'), 'select curriculums');
  let allIds = allCurriculumsInDb ? allCurriculumsInDb.map(c => c.id) : [curriculumId];
  if (!allIds.includes(curriculumId)) allIds.push(curriculumId);
  allIds = allIds.filter(id => id !== orphanCurriculumId);

  await retryOp(() => supabase.from('system_settings').upsert({
    key: 'active_curriculum_ids',
    value: JSON.stringify(allIds)
  }), 'upsert active_curriculum_ids');

  await retryOp(() => supabase.from('system_settings').upsert({
    key: 'active_grade_levels',
    value: JSON.stringify(['1_middle', '2_middle', '3_middle', '1_high', '2_high', '3_high'])
  }), 'upsert active_grade_levels');
  console.log(`System settings synchronized (active curricula: ${allIds.length}).`);

  // 6. Synchronize local db_data.json
  console.log('5. Synchronizing local db_data.json...');
  const localDbPath = path.resolve(__dirname, '../db_data.json');
  try {
    let localData = { curriculums: [], curriculum_chunks: [], system_settings: [] };
    if (fs.existsSync(localDbPath)) {
      try {
        localData = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
      } catch (e) {}
    }

    const { data: allSupabaseCurriculums } = await supabase.from('curriculums').select('*');
    if (allSupabaseCurriculums) {
      localData.curriculums = allSupabaseCurriculums;
    }

    // Update local curriculum_chunks: remove old ones for this curriculum and orphan, then add new ones
    if (Array.isArray(localData.curriculum_chunks)) {
      localData.curriculum_chunks = localData.curriculum_chunks.filter(
        c => c.curriculum_id !== curriculumId && c.curriculum_id !== orphanCurriculumId
      );
      localData.curriculum_chunks.push(...formattedChunks.map(c => ({
        ...c,
        embedding: null // omit bulky embedding vectors from local json to keep it fast
      })));
    }

    fs.writeFileSync(localDbPath, JSON.stringify(localData, null, 2), 'utf8');
    console.log(`Local db_data.json updated with curriculum and ${formattedChunks.length} chunks.`);
  } catch (err) {
    console.warn(`Local db_data.json sync notice:`, err.message);
  }

  // 7. Synchronize default_curriculums.ts
  console.log('6. Synchronizing default_curriculums.ts...');
  const defaultCurrPath = path.resolve(__dirname, '../src/lib/default_curriculums.ts');
  if (fs.existsSync(defaultCurrPath)) {
    let tsContent = fs.readFileSync(defaultCurrPath, 'utf8');
    const oldEntryRegex = new RegExp(
      `\\{\\s*"id":\\s*"ac7b9331-49c4-416d-bcd7-8f95fb84803b"[\\s\\S]*?\\},`,
      'g'
    );
    const updatedEntry = JSON.stringify({
      id: HIGH_2_ENGLISH_DEFINITION.id,
      grade_level: HIGH_2_ENGLISH_DEFINITION.grade_level,
      subject_name: HIGH_2_ENGLISH_DEFINITION.subject_name,
      file_name: HIGH_2_ENGLISH_DEFINITION.file_name,
      is_placeholder: false,
      track_id: HIGH_2_ENGLISH_DEFINITION.track_id,
      is_elective: HIGH_2_ENGLISH_DEFINITION.is_elective,
      created_at: new Date().toISOString(),
      units: HIGH_2_ENGLISH_DEFINITION.units
    }, null, 4) + ',';

    if (oldEntryRegex.test(tsContent)) {
      tsContent = tsContent.replace(oldEntryRegex, updatedEntry);
      fs.writeFileSync(defaultCurrPath, tsContent, 'utf8');
      console.log('default_curriculums.ts updated with full English curriculum units!');
    } else {
      console.warn('Could not find exact regex in default_curriculums.ts, manual verification recommended.');
    }
  }

  console.log('\n2nd Secondary English Curriculum uploaded, indexed (5 Units, 20 Lessons), and activated successfully!');
}

main().catch(err => {
  console.error('Fatal upload error:', err);
  process.exit(1);
});
