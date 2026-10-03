import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dns from 'dns';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// Use reliable Google & Cloudflare DNS to avoid Windows IPv6 router timeout
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
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

// ─── Complete Index Definition for 2_high Egyptian History ───────────────────

export const HIGH_2_HISTORY_DEFINITION = {
  id: 'ba98ec6e-f690-431d-9cfa-d069968d8d7e',
  grade_level: '2_high',
  subject_name: 'التاريخ المصري',
  file_name: 'Egyptian History.md',
  track_id: null,
  is_elective: false,
  is_placeholder: false,
  units: [
    {
      id: '2_high_his_u1',
      title: 'الوحدة 1: مصر بين الماضي والحاضر',
      unitNumber: 1,
      lessons: [
        {
          id: '2_high_his_u1_l1',
          title: 'الدرس الأول: بناء الدولة المصرية واستمرارها عبر التاريخ',
          lessonNumber: 1,
          unitId: '2_high_his_u1',
          unitTitle: 'الوحدة 1: مصر بين الماضي والحاضر',
          subtopics: [
            'تمهيد: نشأة الحضارة المصرية على ضفاف النيل وأول دولة مركزية في التاريخ',
            'مصادر دراسة التاريخ المصري (المصادر الأولية، المصادر الثانوية، وأهمية دراسة المصادر)',
            'الدولة القديمة وأركان قيام الدولة واستقرارها',
            'الحيز الجغرافي للدولة المصرية وحدودها الطبيعية والسياسية (البرية، البحرية، والجوية)',
            'سلطات الدولة المصرية (التشريعية، التنفيذية، القضائية، القانون، ومبدأ العدل أساس الملك)',
            'مقومات نشأة الدولة المصرية وعوامل استمرارها عبر الزمن وأنواع السيادة',
            'شخصية مصر وعبقرية المكان ومقومات قيام الحضارة المصرية القديمة',
            'مفاهيم أتعلمها: مفهوم الدولة وأركانها ودور المواطن في حماية هويتها واستقرارها'
          ]
        },
        {
          id: '2_high_his_u1_l2',
          title: 'الدرس الثاني: الدولة المصرية القديمة ومقاومة الاحتلال',
          lessonNumber: 2,
          unitId: '2_high_his_u1',
          unitTitle: 'الوحدة 1: مصر بين الماضي والحاضر',
          subtopics: [
            'دوافع احتلال مصر عبر التاريخ وموقعها الاستراتيجي وثرواتها الطبيعية',
            'ثانيًا: غزو الهكسوس لمصر وعوامل نجاحهم وأسباب الاحتلال وحرب التحرير الوطنية',
            'ثالثًا: الغزو الفارسي لمصر (525 ق.م) وأسبابه ونتائجه ومقاومة الشعب المصري للفرس',
            'رابعًا: غزو الإسكندر الأكبر لمصر (332 ق.م) وسياسته تجاه المصريين ودياناتهم',
            'خامسًا: مصر تحت حكم البطالمة (تأسيس دولة البطالمة، السياسة الداخلية، مدينة الإسكندرية ومعالمها، والحضارة الهيلينستية)',
            'سادسًا: مصر تحت حكم الرومان وسياسات الاستغلال الاقتصادي ومقاومة الشعب المصري للاحتلال الروماني'
          ]
        },
        {
          id: '2_high_his_u1_l3',
          title: 'الدرس الثالث: التحولات الكبرى في مصر (العصر الوسيط)',
          lessonNumber: 3,
          unitId: '2_high_his_u1',
          unitTitle: 'الوحدة 1: مصر بين الماضي والحاضر',
          subtopics: [
            'الفكرة الرئيسة: دور مصر في حماية الحضارة الإسلامية ومكانتها السياسية',
            'أولاً: التحول السياسي لمصر خلال العصر الوسيط (من الحكم البيزنطي إلى الولاية الإسلامية، ثم مركز الدول المستقلة، ثم ولاية عثمانية)',
            'ثانيًا: التحول الاجتماعي بعد الفتح الإسلامي (تعريب اللغة ونشرها، وحركات الهجرات العربية إلى مصر)',
            'ثالثًا: التحول الثقافي والفكري في مصر الإسلامية ودور العلماء في بناء المجتمع',
            'رابعًا: التحول العمراني والحضاري وتأسيس العواصم الإسلامية (الفسطاط، العسكر، القطائع، القاهرة الفاطمية والمملوكية، والأزهر الشريف)',
            'خامسًا: التحول الاقتصادي في مصر خلال العصر الوسيط (ازدهار الزراعة والصناعة والتجارة الدولية وموانئ مصر)',
            'سادسًا: مكانة مصر الإقليمية والدولية في العصر الإسلامي الوسيط وصد الأخطار الخارجية عن العالم الإسلامي'
          ]
        },
        {
          id: '2_high_his_u1_l4',
          title: 'الدرس الرابع: التحولات الكبرى في مصر (العصر الحديث)',
          lessonNumber: 4,
          unitId: '2_high_his_u1',
          unitTitle: 'الوحدة 1: مصر بين الماضي والحاضر',
          subtopics: [
            'الصدمة الحضارية: أثر الحملة الفرنسية في إيقاظ الوعي القومي المصري',
            'بناء الدولة الحديثة في عهد محمد علي ومشروعه الاستقلالي والتنموي',
            'من الاستقلالية إلى التبعية (عصر الخديو إسماعيل والأزمة المالية والتدخل الأجنبي)',
            'التصنيع المبكر في مصر بين الطموح التنموي والضغوط الاستعمارية الأوروبية',
            'التحولات الاقتصادية والاجتماعية في مصر خلال الاحتلال البريطاني',
            'التحولات الفكرية وتيارات الوعي الوطني (تيار الإصلاح الديني، التيار الليبرالي، وتيار الحركة الوطنية المصرية)',
            'مكانة مصر الإقليمية ودورها المحوري في العصر الحديث'
          ]
        }
      ]
    },
    {
      id: '2_high_his_u2',
      title: 'الوحدة 2: تحولات القوة وبناء الوعي بمصر في العصر الحديث والمعاصر',
      unitNumber: 2,
      lessons: [
        {
          id: '2_high_his_u2_l1',
          title: 'الدرس الأول: سياسات الاحتلال بمصر في العصر الحديث',
          lessonNumber: 1,
          unitId: '2_high_his_u2',
          unitTitle: 'الوحدة 2: تحولات القوة وبناء الوعي بمصر في العصر الحديث والمعاصر',
          subtopics: [
            'أطماع القوى الاستعمارية الأوروبية في مصر وموقعها ومواردها',
            'أولاً: سياسات فرنسا في مصر (سياسة التقرب من الأعيان والعلماء ومحاولات كسب الرأي العام)',
            'ثانياً: سياسة القمع والمواجهة والمقاومة الشعبية، والجوانب العلمية للحملة الفرنسية (موسوعة وصف مصر، المطبعة، واكتشاف حجر رشيد)',
            'ثالثاً: التدخل الأجنبي وإغراق مصر في الديون (اتفاقية بلطة ليمان 1838م، ومؤتمر لندن 1840م، وسياسة القروض)',
            'رابعاً: المراقبة المالية الثنائية (1876م) وفقدان الاستقلال المالي والتمهيد للاحتلال العسكري البريطاني',
            'خامساً: سياسات الاحتلال البريطاني في مصر (1882 – 1914) العسكرية والسياسية والاقتصادية',
            'سادساً: سياسة الاحتلال البريطاني في التعليم ومحاربة الوعي الوطني'
          ]
        },
        {
          id: '2_high_his_u2_l2',
          title: 'الدرس الثاني: صمود الشعب المصري ومقاومة الاحتلال',
          lessonNumber: 2,
          unitId: '2_high_his_u2',
          unitTitle: 'الوحدة 2: تحولات القوة وبناء الوعي بمصر في العصر الحديث والمعاصر',
          subtopics: [
            'الحملة الفرنسية وبداية تشكيل الوعي القومي والمقاومة الشعبية',
            'محمد علي والمثقفون وحركة الترجمة والنهضة الفكرية',
            'دور رواد الفكر في إحياء الوعي القومي (رفاعة الطهطاوي، جمال الدين الأفغاني، الشيخ محمد عبده، عبد الله النديم)',
            'الثورة العرابية (1881 - 1882م) أسبابها، مطالبها الوطنية، ومظاهرة عابدين',
            'مصطفى كامل ومحمد فريد وقيادة الحركة الوطنية وتأسيس الصحف والحزب الوطني',
            'سعد زغلول وثورة 1919م وترسيخ الوحدة الوطنية والمطالبة بالاستقلال',
            'دور المرأة المصرية في الحركة الوطنية (هدى شعراوي، صفية زغلول، ولجان الوفد المركزية للسيدات)'
          ]
        },
        {
          id: '2_high_his_u2_l3',
          title: 'الدرس الثالث: ثورة 23 يوليو 1952م والتحولات الكبرى في مصر',
          lessonNumber: 3,
          unitId: '2_high_his_u2',
          unitTitle: 'الوحدة 2: تحولات القوة وبناء الوعي بمصر في العصر الحديث والمعاصر',
          subtopics: [
            'عوامل قيام ثورة 23 يوليو 1952م (الأزمة السياسية، الاقتصادية والاجتماعية، والعسكرية)',
            'مصر والقضية الفلسطينية (1945 - 1948م) وأثر حرب فلسطين على وعي ضباط الجيش المصري',
            'تأسيس تنظيم الضباط الأحرار بزعامة جمال عبد الناصر وأهداف ومبادئ الثورة الستة',
            'مقدمات الثورة (إلغاء معاهدة 1936، انتخابات نادي الضباط، معركة الإسماعيلية، وحريق القاهرة)',
            'أحداث صباح 23 يوليو 1952م وتنازل الملك فاروق عن العرش وإعلان الجمهورية',
            'نتائج ثورة 23 يوليو (توقيع اتفاقية الجلاء 1954م، جلاء القوات البريطانية، تأميم قناة السويس 1956م، وبناء السد العالي)',
            'الإصلاحات الداخلية الكبرى (قوانين الإصلاح الزراعي والقضاء على الإقطاع، مجانية التعليم، تأميم المشروعات الاقتصادية، ودعم مشاركة المرأة والشباب)'
          ]
        },
        {
          id: '2_high_his_u2_l4',
          title: 'الدرس الرابع: الهوية الوطنية في مواجهة الاستعمار الجديد',
          lessonNumber: 4,
          unitId: '2_high_his_u2',
          unitTitle: 'الوحدة 2: تحولات القوة وبناء الوعي بمصر في العصر الحديث والمعاصر',
          subtopics: [
            'الفكرة الرئيسة وشعار الدرس: هوية راسخة .. أمة واعية مستقبل آمن',
            'أولاً: مفهوم الاستعمار الجديد ودوافعه وأدواته (الأدوات الاقتصادية كالقروض والديون، والأدوات التكنولوجية)',
            'ثانياً: حروب الجيل الرابع وأدواتها (الإعلام المضلل، المنصات الرقمية، استقطاب الشباب، وصناعة قيادات وهمية)',
            'ثالثاً: أساليب استهداف العقول وتشويه التاريخ والوعي القومي واستهداف القيم المصرية الأصيلة والإرهاب كأداة استنزاف',
            'رابعاً: حماية الوعي ومواجهة حروب الجيل الرابع وبناء المناعة الفكرية الوطنية',
            'خامساً: أدوار مؤسسات الدولة في حماية الهوية (دور الأسرة، المؤسسات التعليمية والدينية كالأزهر والكنيسة، والإعلام الوطني)',
            'سادساً: مشروع بحثي وتطبيقات حياتية حول الوعي التاريخي وحروب الجيل الرابع'
          ]
        }
      ]
    },
    {
      id: '2_high_his_u3',
      title: 'الوحدة 3: مصر وقضايا التحرر الوطني في الوطن العربي وإفريقيا',
      unitNumber: 3,
      lessons: [
        {
          id: '2_high_his_u3_l1',
          title: 'الدرس الأول: حركات التحرر الوطني ضد الاحتلال الفرنسي والإيطالي في العالم العربي',
          lessonNumber: 1,
          unitId: '2_high_his_u3',
          unitTitle: 'الوحدة 3: مصر وقضايا التحرر الوطني في الوطن العربي وإفريقيا',
          subtopics: [
            'آليات السيطرة الاستعمارية الفرنسية في الوطن العربي (السيطرة العسكرية، السياسية، الاقتصادية، والثقافية)',
            'ذريعة الاحتلال الفرنسي للجزائر (حادثة المروحة 1827م) والأسباب الحقيقية والنتائج',
            'الهيمنة الثقافية الفرنسية (سياسة الفرنسة والإدماج ومحاربة اللغة العربية) وتفكيك البنية الاجتماعية',
            'آليات وأساليب السيطرة الاستعمارية الإيطالية في ليبيا (الاستيطان الزراعي، البطش العسكري، معسكرات الاعتقال الجماعية)',
            'أساليب المقاومة الوطنية المسلحة والعمل السياسي والتنظيمي في ليبيا والجزائر وسوريا',
            'من أقوال ورموز الحركة الوطنية التحررية (عمر المختار، الأمير عبد القادر، أحمد بن بلة، علال الفاسي، والحبيب بورقيبة)'
          ]
        },
        {
          id: '2_high_his_u3_l2',
          title: 'الدرس الثاني: حركات التحرر الوطني ضد الاحتلال البريطاني والإسباني في العالم العربي',
          lessonNumber: 2,
          unitId: '2_high_his_u3',
          unitTitle: 'الوحدة 3: مصر وقضايا التحرر الوطني في الوطن العربي وإفريقيا',
          subtopics: [
            'آليات السيطرة الاستعمارية البريطانية في الوطن العربي (الهيمنة العسكرية، المعاهدات غير المتكافئة، وتأمين الممرات البحرية)',
            'الاستغلال الاقتصادي والهيمنة الثقافية وتفكيك البنية الاجتماعية في مناطق النفوذ البريطاني والإسباني',
            'أشكال المقاومة الوطنية ضد الاستعمار البريطاني والإسباني (المقاومة المسلحة، المقاطعة الاقتصادية، والعمل السياسي)',
            'القيادة الوطنية ودورها في الحركة الوطنية التحررية (في مصر، ومحمد عبد الكريم الخطابي ومعركة أنوال في المغرب)'
          ]
        },
        {
          id: '2_high_his_u3_l3',
          title: 'الدرس الثالث: مرتكزات الدور المصري إقليمياً ودولياً',
          lessonNumber: 3,
          unitId: '2_high_his_u3',
          unitTitle: 'الوحدة 3: مصر وقضايا التحرر الوطني في الوطن العربي وإفريقيا',
          subtopics: [
            'الموقع الجيوسياسي لمصر وأهميته وأدواره الاستراتيجية (الدور العربي، الإفريقي، الإسلامي، والدولي)',
            'السياسة الخارجية المصرية بعد عام 1952م (مبدأ عدم الانحياز، مؤتمر باندونغ 1955م، وتأسيس حركة عدم الانحياز في بلغراد 1961م)',
            'أهمية قناة السويس كأحد أهم الممرات الملاحية الاستراتيجية في حركة التجارة العالمية وحمايتها',
            'دعم حركات التحرر بوصفها امتدادًا للأمن القومي المصري والعمق الاستراتيجي لمصر',
            'الوحدة العربية بوصفها إطارًا إستراتيجيًا والعلاقة بين الأمن القومي المصري والعربي',
            'مبدأ السيادة وعدم التدخل في الشؤون الداخلية للدول في السياسة المصرية وميثاق الأمم المتحدة',
            'القوة الناعمة المصرية (المقومات الثقافية، الفنية، الأدبية، التعليمية، الأزهر الشريف، والإعلام)'
          ]
        },
        {
          id: '2_high_his_u3_l4',
          title: 'الدرس الرابع: دور مصر في دعم حركات التحرر الوطني',
          lessonNumber: 4,
          unitId: '2_high_his_u3',
          unitTitle: 'الوحدة 3: مصر وقضايا التحرر الوطني في الوطن العربي وإفريقيا',
          subtopics: [
            'مصر رمز التحرر الوطني ومقاومة الاستعمار في القرن العشرين في إفريقيا والعالم العربي',
            'الدعم المصري الشامل لثورة الجزائر (1954 - 1962م): إعلان الثورة من صوت العرب، الدعم الدبلوماسي، السلاح، والتمويل المالي',
            'أهمية باب المندب ودعم مصر للثورة اليمنية 1962م (مواقف الرئيس جمال عبد الناصر)',
            'أشكال الدعم المصري لحركات التحرر في إفريقيا (حركات التحرر في كينيا، الكونغو، غانا، أنغولا، ومناهضة الفصل العنصري)',
            'تأسيس منظمة الوحدة الإفريقية (1963م) ودور مصر الريادي في توحيد الصف الإفريقي ودعم استقلال شعوبه'
          ]
        }
      ]
    }
  ]
};

// ─── Main Execution Pipeline ─────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting 2_high Egyptian History Upload & Indexing Pipeline...');
  const filePath = path.resolve(__dirname, '../../Curriculum Generator/output/2_high/Egyptian History.md');

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Curriculum file not found at: ${filePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  console.log(`📄 File loaded: ${filePath} (${(fileContent.length / 1024).toFixed(1)} KB)`);

  // 1. Chunk markdown hierarchically
  console.log('1. Chunking Markdown hierarchically...');
  const { parents, children } = chunkMarkdownHierarchical(fileContent);
  console.log(`   Created ${parents.length} parent chunks and ${children.length} child chunks.`);

  // 2. Generate vector embeddings for child chunks
  console.log(`2. Generating text embeddings for ${children.length} child chunks via EdenAI...`);
  const childTexts = children.map(c => `${c.heading}\n${c.content}`);
  const embeddings = await generateEmbeddingBatch(childTexts);
  const validEmbeddingsCount = embeddings.filter(e => e && e.length > 0).length;
  console.log(`   Generated ${validEmbeddingsCount}/${children.length} vector embeddings (768 dims).`);

  // 3. Prepare parent chunks with IDs
  const parentWithIds = parents.map((p, i) => ({
    ...p,
    id: crypto.randomUUID(),
    position_index: i
  }));

  const allChunks = [
    ...parentWithIds.map(p => ({
      id: p.id,
      content: p.content,
      heading: p.heading,
      chunk_level: 'parent',
      parent_id: null,
      position_index: p.position_index,
      embedding: null
    })),
    ...children.map((c, i) => {
      const matchingParent = parentWithIds[c.parentIndex];
      return {
        id: crypto.randomUUID(),
        content: c.content,
        heading: c.heading,
        chunk_level: 'child',
        parent_id: matchingParent ? matchingParent.id : null,
        position_index: i,
        embedding: embeddings[i] && embeddings[i].length > 0 ? embeddings[i] : null
      };
    })
  ];

  // 4. Update / Insert Curriculum in Supabase
  console.log('3. Updating Curriculum and inserting chunks in Supabase...');
  const curriculumId = HIGH_2_HISTORY_DEFINITION.id;

  async function retryOp(fn, name = 'operation', maxRetries = 6) {
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
        await new Promise(r => setTimeout(r, 2500));
      }
    }
  }

  // Delete previous chunks if any
  await retryOp(() => supabase.from('curriculum_chunks').delete().eq('curriculum_id', curriculumId), 'delete old chunks');

  const curriculumRow = {
    id: curriculumId,
    grade_level: HIGH_2_HISTORY_DEFINITION.grade_level,
    subject_name: HIGH_2_HISTORY_DEFINITION.subject_name,
    file_name: HIGH_2_HISTORY_DEFINITION.file_name,
    units: HIGH_2_HISTORY_DEFINITION.units,
    is_placeholder: false,
    track_id: HIGH_2_HISTORY_DEFINITION.track_id,
    is_elective: HIGH_2_HISTORY_DEFINITION.is_elective,
    created_at: new Date().toISOString()
  };

  await retryOp(() => supabase.from('curriculums').upsert(curriculumRow), 'upsert curriculum');
  console.log(`✅ Curriculum record updated in Supabase (ID: ${curriculumId}).`);

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
  console.log(`✅ Inserted ${parentRows.length} parent chunks.`);

  // Then insert all CHILD chunks
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

  for (let i = 0; i < childRows.length; i += BATCH_SIZE) {
    const batch = childRows.slice(i, i + BATCH_SIZE);
    await retryOp(() => supabase.from('curriculum_chunks').insert(batch), `insert child chunk batch ${Math.floor(i / BATCH_SIZE) + 1}`);
  }
  console.log(`✅ Inserted ${childRows.length} child chunks.`);

  const formattedChunks = [...parentRows, ...childRows];

  // 5. Update system_settings (active_curriculum_ids & active_grade_levels)
  console.log('4. Updating System Settings...');
  const { data: allCurriculumsInDb } = await retryOp(() => supabase.from('curriculums').select('id'), 'select curriculums');
  const allIds = allCurriculumsInDb ? allCurriculumsInDb.map(c => c.id) : [curriculumId];
  if (!allIds.includes(curriculumId)) allIds.push(curriculumId);

  await retryOp(() => supabase.from('system_settings').upsert({
    key: 'active_curriculum_ids',
    value: JSON.stringify(allIds)
  }), 'upsert active_curriculum_ids');

  await retryOp(() => supabase.from('system_settings').upsert({
    key: 'active_grade_levels',
    value: JSON.stringify(['1_middle', '2_middle', '3_middle', '1_high', '2_high', '3_high'])
  }), 'upsert active_grade_levels');
  console.log(`✅ System settings synchronized (active curricula: ${allIds.length}).`);

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

    // Also update local curriculum_chunks: remove old ones for this curriculum and add new ones
    if (Array.isArray(localData.curriculum_chunks)) {
      localData.curriculum_chunks = localData.curriculum_chunks.filter(c => c.curriculum_id !== curriculumId);
      localData.curriculum_chunks.push(...formattedChunks.map(c => ({
        ...c,
        embedding: null // omit bulky embedding vectors from local json to keep it fast
      })));
    }

    fs.writeFileSync(localDbPath, JSON.stringify(localData, null, 2), 'utf8');
    console.log(`✅ Local db_data.json updated with curriculum and ${formattedChunks.length} chunks.`);
  } catch (err) {
    console.warn(`Local db_data.json sync notice:`, err.message);
  }

  console.log(`\n🎉 Egyptian History Curriculum (2_high) uploaded, indexed (3 Units, 12 Lessons), and activated successfully!`);
}

main().catch(err => {
  console.error('Fatal upload error:', err);
  process.exit(1);
});
