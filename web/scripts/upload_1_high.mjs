import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables
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

  for (const parent of parents) {
    const childChunks = createSlidingWindowChunks(
      parent.content,
      parent.heading,
      CHILD_MAX_TOKENS,
      CHILD_OVERLAP_TOKENS
    );
    children.push(...childChunks);
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

// ─── EdenAI Embeddings ───────────────────────────────────────────────────────

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

  const BATCH_SIZE = 20;
  const batches = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE).map(t => t.slice(0, 8000)));
  }

  const allEmbeddings = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    let retries = 4;
    let success = false;

    while (retries > 0 && !success) {
      try {
        const response = await fetch(`${EDENAI_BASE}/text/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${EDENAI_API_KEY}`
          },
          body: JSON.stringify({
            providers: 'google',
            texts: batch,
            model: 'text-embedding-004'
          })
        });

        if (!response.ok) {
          throw new Error(`Embedding API status ${response.status}`);
        }

        const data = await response.json();
        const googleKey = Object.keys(data).find(k => k.startsWith('google'));
        const items = googleKey ? (data[googleKey]?.items ?? []) : [];
        
        for (let j = 0; j < batch.length; j++) {
          allEmbeddings.push(items[j]?.embedding ?? []);
        }
        success = true;
      } catch (err) {
        retries--;
        console.warn(`Retry ${4 - retries}/4 for embedding batch ${i + 1}/${batches.length}:`, err.message);
        if (retries > 0) await new Promise(r => setTimeout(r, 2000));
        else {
          for (let j = 0; j < batch.length; j++) allEmbeddings.push([]);
        }
      }
    }
    // Delay between batches
    await new Promise(r => setTimeout(r, 350));
  }

  return allEmbeddings;
}


// ─── 1_high Curriculum Definitions ───────────────────────────────────────────

export const HIGH_1_DEFINITIONS = [
  // ─── 1_high التاريخ ────────────────────────────────────────────────────────
  {
    grade_level: '1_high',
    subject_name: 'التاريخ',
    file_name: 'التاريخ.md',
    units: [
      {
        id: '1_high_his_u1',
        title: 'الوحدة 1: مدخل لدراسة حضارة مصر والعالم القديم',
        unitNumber: 1,
        lessons: [
          {
            id: '1_high_his_u1_l1',
            title: 'الدرس الأول: مفهوم الحضارة والتاريخ وأهميتهما',
            lessonNumber: 1,
            unitId: '1_high_his_u1',
            unitTitle: 'الوحدة 1: مدخل لدراسة حضارة مصر والعالم القديم',
            subtopics: ['مفهوم الحضارة ونظرية ويل ديورانت في نشأة الحضارات', 'مفهوم علم التاريخ وأهمية دراسته (استخلاص العبر، إبراز القدوة، تنمية الشعور بالمسؤولية، الابتعاد عن التعصب)', 'العصور التاريخية (القديمة، الوسطى، الحديثة، المعاصرة) وسماتها']
          },
          {
            id: '1_high_his_u1_l2',
            title: 'الدرس الثاني: مصادر دراسة الحضارات (المصادر الأولية والمراجع)',
            lessonNumber: 2,
            unitId: '1_high_his_u1',
            unitTitle: 'الوحدة 1: مدخل لدراسة حضارة مصر والعالم القديم',
            subtopics: ['المصادر الأولية (الآثار، النقوش، البرديات، الأوستراكا، النقود والمسكوكات، كتابات المؤرخين القدماء)', 'المراجع والمصادر الثانوية (كتابات الفلاسفة والشعراء والأساطير)', 'أهمية المصادر في التوثيق التاريخي والدقة العلمية']
          },
          {
            id: '1_high_his_u1_l3',
            title: 'الدرس الثالث: عوامل قيام حضارات العالم القديم',
            lessonNumber: 3,
            unitId: '1_high_his_u1',
            unitTitle: 'الوحدة 1: مدخل لدراسة حضارة مصر والعالم القديم',
            subtopics: ['العوامل الطبيعية (الأنهار، الموقع الجغرافي المتميز، اعتدال المناخ، الموارد الطبيعية والصخور والمعادن، الحدود الطبيعية الآمنة)', 'العامل البشري (كفاح الإنسان وجهوده المستمرة)', 'مصر هبة النيل والمصريين']
          }
        ]
      },
      {
        id: '1_high_his_u2',
        title: 'الوحدة 2: حضارة مصر القديمة (الفرعونية)',
        unitNumber: 2,
        lessons: [
          {
            id: '1_high_his_u2_l1',
            title: 'الدرس الأول: ملامح من تاريخ مصر القديمة (العصور التاريخية والأسرات)',
            lessonNumber: 1,
            unitId: '1_high_his_u2',
            unitTitle: 'الوحدة 2: حضارة مصر القديمة (الفرعونية)',
            subtopics: ['العصر العتيق (الأسرتان 1-2) ومينا موحد القطرين', 'عصر الدولة القديمة (بناة الأهرام) والاضمحلال الأول', 'عصر الدولة الوسطى (الرخاء الاقتصادي) والاضمحلال الثاني وغزو الهكسوس', 'عصر الدولة الحديثة (المجد الحربي) والإمبراطورية والعصر المتأخر']
          },
          {
            id: '1_high_his_u2_l2',
            title: 'الدرس الثاني: الحياة الاقتصادية (الزراعة، الصناعة، التجارة)',
            lessonNumber: 2,
            unitId: '1_high_his_u2',
            unitTitle: 'الوحدة 2: حضارة مصر القديمة (الفرعونية)',
            subtopics: ['الزراعة ومشاريع الري والصوامع والملكية الزراعية', 'الصناعة وأسرار الصانع المصري والمهارة الحرفية (صناعات حجرية، فخارية، زجاجية، معدنية، خشبية، نسيجية)', 'التجارة الداخلية والخارجية وطرق النقل ودور الدولة والرقابة']
          },
          {
            id: '1_high_his_u2_l3',
            title: 'الدرس الثالث: الحياة السياسية والإدارية ونظام الحكم',
            lessonNumber: 3,
            unitId: '1_high_his_u2',
            unitTitle: 'الوحدة 2: حضارة مصر القديمة (الفرعونية)',
            subtopics: ['منصب الفرعون (الملك) ومهامه وسلطاته', 'الوزير ومهامه وشروط اختياره والإدارة المركزية والمحلية (حكام الأقاليم)', 'القضاء والقانون والشرطة والجيش والأسطول العسكري وأخلاقيات المقاتل المصري']
          },
          {
            id: '1_high_his_u2_l4',
            title: 'الدرس الرابع: الحياة الاجتماعية وطبقات المجتمع المصري القديم',
            lessonNumber: 4,
            unitId: '1_high_his_u2',
            unitTitle: 'الوحدة 2: حضارة مصر القديمة (الفرعونية)',
            subtopics: ['طبقات المجتمع المصري القديم والهرم الاجتماعي', 'الأسرة والتربية ومكانة المرأة وحقوقها القانونية والاقتصادية والدينية', 'المسكن والأثاث والملابس وأدوات الزينة والأعياد والاحتفالات']
          },
          {
            id: '1_high_his_u2_l5',
            title: 'الدرس الخامس: الحياة الدينية وخصائص الديانة المصرية القديمة',
            lessonNumber: 5,
            unitId: '1_high_his_u2',
            unitTitle: 'الوحدة 2: حضارة مصر القديمة (الفرعونية)',
            subtopics: ['تعدد الآلهة والرموز الدينية', 'الاعتقاد في البعث والخلود والتحنيط وبناء المقابر الحصينة', 'الاعتقاد في الحساب بعد الموت ومحكمة أوزوريس والسمو إلى التوحيد (ثورة إخناتون الدينية)']
          },
          {
            id: '1_high_his_u2_l6',
            title: 'الدرس السادس: الحياة الثقافية والفكرية والعلوم والعمارة والفنون',
            lessonNumber: 6,
            unitId: '1_high_his_u2',
            unitTitle: 'الوحدة 2: حضارة مصر القديمة (الفرعونية)',
            subtopics: ['الكتابة وأدواتها (الهيروغليفية، الهيراتيقية، الديموطيقية، القبطية) ومراكز العلم', 'الأدب وأنواعه (الديني، القصصي، التهذيبي، المدح)', 'العلوم (الحساب، الهندسة، الفلك، الطب، الكيمياء) والعمارة (المقابر، المعابد) والفنون (النحت، النقش، الرسم)']
          }
        ]
      }
    ]
  },

  // ─── 1_high الرياضيات ───────────────────────────────────────────────────────
  {
    grade_level: '1_high',
    subject_name: 'الرياضيات',
    file_name: 'الرياضيات.md',
    units: [
      {
        id: '1_high_math_u1',
        title: 'الوحدة 1: الجبر والعلاقات والدوال والمعادلات التربيعية',
        unitNumber: 1,
        lessons: [
          {
            id: '1_high_math_u1_l1',
            title: 'الدرس الأول: مقدمة عن الأعداد المركبة والعمليات عليها',
            lessonNumber: 1,
            unitId: '1_high_math_u1',
            unitTitle: 'الوحدة 1: الجبر والعلاقات والدوال والمعادلات التربيعية',
            subtopics: ['العدد التخيلي ت وقوى ت الصحيحة', 'العدد المركب وصورته الجبرية ع = أ + ب ت والعمليات (جمع، طرح، ضرب)', 'العددان المترافقان وقسمة الأعداد المركبة وتساوي عددين مركبين']
          },
          {
            id: '1_high_math_u1_l2',
            title: 'الدرس الثاني: تحديد نوع جذري المعادلة التربيعية بالمميز',
            lessonNumber: 2,
            unitId: '1_high_math_u1',
            unitTitle: 'الوحدة 1: الجبر والعلاقات والدوال والمعادلات التربيعية',
            subtopics: ['قانون المميز (ب² - 4 أ جـ)', 'الحالات الثلاث: حقيقيان مختلفان (> 0)، حقيقيان متساويان (= 0)، مركبان غير حقيقيين (< 0)', 'التطبيقات الجبرية والبيانية على المميز']
          },
          {
            id: '1_high_math_u1_l3',
            title: 'الدرس الثالث: العلاقة بين جذري معادلة الدرجة الثانية ومعاملات حدودها',
            lessonNumber: 3,
            unitId: '1_high_math_u1',
            unitTitle: 'الوحدة 1: الجبر والعلاقات والدوال والمعادلات التربيعية',
            subtopics: ['مجموع الجذرين ل + م = -ب / أ', 'حاصل ضرب الجذرين ل × م = جـ / أ', 'تكوين المعادلة التربيعية بمعلومية جذريها: س² - (ل + م) س + (ل م) = 0 ومتطابقات الجذور']
          },
          {
            id: '1_high_math_u1_l4',
            title: 'الدرس الرابع: إشارة الدوال وبحث إشارة الدالة',
            lessonNumber: 4,
            unitId: '1_high_math_u1',
            unitTitle: 'الوحدة 1: الجبر والعلاقات والدوال والمعادلات التربيعية',
            subtopics: ['إشارة الدالة الثابتة د(س) = جـ', 'إشارة الدالة الخطية د(س) = أ س + ب', 'إشارة الدالة التربيعية د(س) = أ س² + ب س + جـ بحسب إشارة المميز']
          },
          {
            id: '1_high_math_u1_l5',
            title: 'الدرس الخامس: متباينات الدرجة الثانية في مجهول واحد',
            lessonNumber: 5,
            unitId: '1_high_math_u1',
            unitTitle: 'الوحدة 1: الجبر والعلاقات والدوال والمعادلات التربيعية',
            subtopics: ['خطوات حل متباينة الدرجة الثانية بيانياً وجبرياً', 'كتابة مجموعة الحل في صورة فترات', 'حل مسائل وتطبيقات حياتية']
          }
        ]
      },
      {
        id: '1_high_math_u2',
        title: 'الوحدة 2: حساب المثلثات والزوايا الموجهة والدوال الدائرية',
        unitNumber: 2,
        lessons: [
          {
            id: '1_high_math_u2_l1',
            title: 'الدرس الأول: الزاوية الموجهة وقياسها وموقعها في الأرباع',
            lessonNumber: 1,
            unitId: '1_high_math_u2',
            unitTitle: 'الوحدة 2: حساب المثلثات والزوايا الموجهة والدوال الدائرية',
            subtopics: ['تعريف الزاوية الموجهة (ضلع ابتدائي وضلع نهائي ورأس)', 'الوضع القياسي للزاوية الموجهة', 'القياس الموجب والسالب والزوايا المتكافئة وتحديد الربع']
          },
          {
            id: '1_high_math_u2_l2',
            title: 'الدرس الثاني: القياس الستيني والدائري لزاوية وطول القوس',
            lessonNumber: 2,
            unitId: '1_high_math_u2',
            unitTitle: 'الوحدة 2: حساب المثلثات والزوايا الموجهة والدوال الدائرية',
            subtopics: ['الراديان (القياس الدائري هـ د) والعلاقة: هـ د = ل / نق', 'التحويل بين القياسين الستيني والدائري (س° / 180° = هـ د / ط)', 'حساب طول القوس ومساحة القطاع الدائري']
          },
          {
            id: '1_high_math_u2_l3',
            title: 'الدرس الثالث: الدوال المثلثية الأساسية ومقلوباتها ودائرة الوحدة',
            lessonNumber: 3,
            unitId: '1_high_math_u2',
            unitTitle: 'الوحدة 2: حساب المثلثات والزوايا الموجهة والدوال الدائرية',
            subtopics: ['دائرة الوحدة س² + ص² = 1 والنقطة المثلثية (جتا هـ ، جا هـ)', 'الدوال الأساسية (جا ، جتا ، ظا) ومقلوباتها (قتا ، قا ، ظتا)', 'إشارات الدوال المثلثية في الأرباع الأربعة ومتطابقة فيثاغورس الأساسية']
          },
          {
            id: '1_high_math_u2_l4',
            title: 'الدرس الرابع: الزوايا المنتسبة وإيجاد النسب بدلالتها',
            lessonNumber: 4,
            unitId: '1_high_math_u2',
            unitTitle: 'الوحدة 2: حساب المثلثات والزوايا الموجهة والدوال الدائرية',
            subtopics: ['الزوايا (180° ± هـ) و (360° - هـ) و (-هـ)', 'الزوايا (90° ± هـ) و (270° ± هـ) وتغير الدالة المثلثية بالتاء', 'تبسيط المقادير المثلثية وإثبات صحة المتطابقات']
          },
          {
            id: '1_high_math_u2_l5',
            title: 'الدرس الخامس: التمثيل البياني للدوال المثلثية والحل العام للمعادلات',
            lessonNumber: 5,
            unitId: '1_high_math_u2',
            unitTitle: 'الوحدة 2: حساب المثلثات والزوايا الموجهة والدوال الدائرية',
            subtopics: ['منحنى دالة الجيب د(س) = جا س ومداها [-1 ، 1] ودورتها 2 ط', 'منحنى دالة جيب التمام د(س) = جتا س ومداها ودورتها', 'الحل العام للمعادلات المثلثية وإيجاد قيم الزوايا']
          }
        ]
      },
      {
        id: '1_high_math_u3',
        title: 'الوحدة 3: التشابه وتطبيقاته في الهندسة المستوية والدائرة',
        unitNumber: 3,
        lessons: [
          {
            id: '1_high_math_u3_l1',
            title: 'الدرس الأول: تشابه المضلعات والمثلثات وحالات التشابه',
            lessonNumber: 1,
            unitId: '1_high_math_u3',
            unitTitle: 'الوحدة 3: التشابه وتطبيقاته في الهندسة المستوية والدائرة',
            subtopics: ['شروط تشابه مضلعين ومعامل التشابه ونسب الأضلاع والمحيطات', 'حالات تشابه المثلثات (تساوي زاويتين، تناسب الأضلاع الثلاثة، تناسب ضلعين وتساوي الزاوية المحصورة)', 'نتائج إقليدس والمثلث القائم']
          },
          {
            id: '1_high_math_u3_l2',
            title: 'الدرس الثاني: العلاقة بين مساحتي سطحي مضلعين متشابهين',
            lessonNumber: 2,
            unitId: '1_high_math_u3',
            unitTitle: 'الوحدة 3: التشابه وتطبيقاته في الهندسة المستوية والدائرة',
            subtopics: ['النسبة بين مساحتي مثلثين متشابهين = مربع نسبة التشابه', 'النسبة بين مساحتي مضلعين متشابهين ومسائل تطبيقية', 'المقارنة بين نسب المحيطات ونسب المساحات']
          },
          {
            id: '1_high_math_u3_l3',
            title: 'الدرس الثالث: تطبيقات التشابه في الدائرة وقوة نقطة',
            lessonNumber: 3,
            unitId: '1_high_math_u3',
            unitTitle: 'الوحدة 3: التشابه وتطبيقاته في الهندسة المستوية والدائرة',
            subtopics: ['تقاطع وترين داخل دائرة: هـ أ × هـ ب = هـ جـ × هـ د', 'تقاطع قاطعين أو قاطع ومماس خارج دائرة: هـ م² = هـ أ × هـ ب', 'قوة نقطة بالنسبة لدائرة ق د(أ) = أ م² - نق² وتحديد موضع النقطة']
          }
        ]
      },
      {
        id: '1_high_math_u4',
        title: 'الوحدة 4: نظريات التناسب في المثلث والمستقيمات المتوازية',
        unitNumber: 4,
        lessons: [
          {
            id: '1_high_math_u4_l1',
            title: 'الدرس الأول: المستقيمات المتوازية والأجزاء المتناسبة ونظرية طاليس',
            lessonNumber: 1,
            unitId: '1_high_math_u4',
            unitTitle: 'الوحدة 4: نظريات التناسب في المثلث والمستقيمات المتوازية',
            subtopics: ['نظرية التناسب في المثلث إذا وازى مستقيم أحد أضلاع مثلث', 'نظرية طاليس العامة للمستقيمات المتوازية وقواطعها', 'نظرية طاليس الخاصة (الأجزاء المتساوية)']
          },
          {
            id: '1_high_math_u4_l2',
            title: 'الدرس الثاني: منصفا الزاوية والأجزاء المتناسبة',
            lessonNumber: 2,
            unitId: '1_high_math_u4',
            unitTitle: 'الوحدة 4: نظريات التناسب في المثلث والمستقيمات المتوازية',
            subtopics: ['نظرية المنصف الداخلي لزاوية رأس مثلث والنسبة بين جزأي القاعدة', 'نظرية المنصف الخارجي لزاوية رأس مثلث', 'حساب طول المنصف الداخلي والخارجي']
          }
        ]
      }
    ]
  },

  // ─── 1_high الفلسفة ────────────────────────────────────────────────────────
  {
    grade_level: '1_high',
    subject_name: 'الفلسفة',
    file_name: 'الفلسفة.md',
    units: [
      {
        id: '1_high_phi_u1',
        title: 'الوحدة 1: مبادئ التفكير الفلسفي والموقف الفلسفي',
        unitNumber: 1,
        lessons: [
          {
            id: '1_high_phi_u1_l1',
            title: 'الدرس الأول: مفهوم التفكير الإنساني وخصائصه وأساليبه',
            lessonNumber: 1,
            unitId: '1_high_phi_u1',
            unitTitle: 'الوحدة 1: مبادئ التفكير الفلسفي والموقف الفلسفي',
            subtopics: ['مفهوم التفكير كهبة إلهية عظمى ميزت الإنسان', 'خصائص التفكير الإنساني وأهميته (المنفعة العملية، المنفعة العامة، الصحة النفسية، التحليل والتقويم)', 'أساليب التفكير (الخرافي، الديني، الفلسفي، العلمي، الإبداعي)']
          },
          {
            id: '1_high_phi_u1_l2',
            title: 'الدرس الثاني: عوامل الوقوع في أخطاء التفكير وطرق تجنبها',
            lessonNumber: 2,
            unitId: '1_high_phi_u1',
            unitTitle: 'الوحدة 1: مبادئ التفكير الفلسفي والموقف الفلسفي',
            subtopics: ['العوامل الذاتية (تغليب العاطفة على العقل، القابلية للاستهواء، التسرع في إصدار الأحكام، التعصب والتطرف)', 'العوامل الموضوعية (عدم الدقة في استخدام اللغة، نقص المعلومات، الهيمنة والسلطة، صعوبة المشكلة)']
          },
          {
            id: '1_high_phi_u1_l3',
            title: 'الدرس الثالث: نشأة الفلسفة وتعريفها وأهميتها للفرد والمجتمع',
            lessonNumber: 3,
            unitId: '1_high_phi_u1',
            unitTitle: 'الوحدة 1: مبادئ التفكير الفلسفي والموقف الفلسفي',
            subtopics: ['نشأة الفلسفة في بلاد الشرق القديم واليونان القديمة عند طاليس وسقراط وأفلاطون وأرسطو', 'المعنى اللغوي (فيلوسوفيا = محبة الحكمة) والتعريف العام', 'أهمية التفكير الفلسفي للإنسان (تكوين فلسفة خاصة، غرس محبة المعرفة، إعطاء معنى للحياة) وللمجتمع (غرس قيم جديدة، نقد قيم هدامة، التنسيق بين الثقافات)']
          },
          {
            id: '1_high_phi_u1_l4',
            title: 'الدرس الرابع: خصائص التفكير الفلسفي ومهاراته الأساسية',
            lessonNumber: 4,
            unitId: '1_high_phi_u1',
            unitTitle: 'الوحدة 1: مبادئ التفكير الفلسفي والموقف الفلسفي',
            subtopics: ['خصائص التفكير الفلسفي (الدهشة وإثارة التساؤل، الاستقلال، التأمل، الدقة المنطقية)', 'مهارات التفكير الفلسفي: مهارة الشك (المذهبي والمنهجي عند ديكارت والغزالي)', 'مهارات النقد (المحكم والضعيف)، الحوار (الإيجابي والسلبي)، التسامح الفكري، والتحليل والتركيب والتجريد والتعميم']
          }
        ]
      },
      {
        id: '1_high_phi_u2',
        title: 'الوحدة 2: مبادئ المنطق والتفكير الناقد والاستدلال',
        unitNumber: 2,
        lessons: [
          {
            id: '1_high_phi_u2_l1',
            title: 'الدرس الأول: مدخل إلى علم المنطق والحدود المنطقية',
            lessonNumber: 1,
            unitId: '1_high_phi_u2',
            unitTitle: 'الوحدة 2: مبادئ المنطق والتفكير الناقد والاستدلال',
            subtopics: ['تعريف علم المنطق وأهميته وفائدته للباحث والإنسان العادي والعلاقة بين المنطق واللغة', 'الحد المنطقي وأنواعه من حيث الكم (حد كلي، حد جزئي، اسم العلم، جمعي) ومن حيث الكيف (موجب وسالب)', 'تحويل الحد الكلي إلى جزئي والعكس']
          },
          {
            id: '1_high_phi_u2_l2',
            title: 'الدرس الثاني: القضايا المنطقية وتركيبها وتصنيفها',
            lessonNumber: 2,
            unitId: '1_high_phi_u2',
            unitTitle: 'الوحدة 2: مبادئ المنطق والتفكير الناقد والاستدلال',
            subtopics: ['مفهوم القضية المنطقية (جملة خبرية تحتمل الصدق أو الكذب) ومكوناتها (موضوع، محمول، رابطة)', 'أنواع القضايا من حيث التركيب (بسيطة ومركبة) ومن حيث الناحية المنطقية (تكرارية، متناقضة، عرضية)', 'القضايا الحملية الأربعة (ك.م ، ك.س ، ج.م ، ج.س) وقواعد الاستغراق في الحدود']
          },
          {
            id: '1_high_phi_u2_l3',
            title: 'الدرس الثالث: الاستدلال المباشر والتقابل بين القضايا (مربع أرسطو)',
            lessonNumber: 3,
            unitId: '1_high_phi_u2',
            unitTitle: 'الوحدة 2: مبادئ المنطق والتفكير الناقد والاستدلال',
            subtopics: ['مفهوم الاستدلال المباشر بالتقابل وشروطه (اتفاق الموضوع والمحمول واختلاف الكم أو الكيف أو كليهما)', 'أحكام التقابل بالتناقض (لا يصدقان معاً ولا يكذبان معاً)', 'أحكام التضاد والدخول تحت التضاد والتداخل على مربع أرسطو وحل التدريبات']
          }
        ]
      }
    ]
  },

  // ─── 1_high اللغة العربية ───────────────────────────────────────────────────
  {
    grade_level: '1_high',
    subject_name: 'اللغة العربية',
    file_name: 'اللغة العربية.md',
    units: [
      {
        id: '1_high_ar_u1',
        title: 'الوحدة 1: القراءة والنصوص الأدبية المقررة',
        unitNumber: 1,
        lessons: [
          {
            id: '1_high_ar_u1_l1',
            title: 'الدرس الأول: القراءة (مكارم الأخلاق وحاتم الطائي وقيم الكرم العربي)',
            lessonNumber: 1,
            unitId: '1_high_ar_u1',
            unitTitle: 'الوحدة 1: القراءة والنصوص الأدبية المقررة',
            subtopics: ['سيرة حاتم الطائي ومكانته في الجاهلية كمضرب للأمثال في الجود', 'تحليل المفردات اللغوية والمضادات والمعاني السياقية', 'استنباط الفكر الرئيسة والقيم الإنسانية السامية']
          },
          {
            id: '1_high_ar_u1_l2',
            title: 'الدرس الثاني: القراءة (قيم اجتماعية وبناء المجتمع - للدكتور شوقي ضيف)',
            lessonNumber: 2,
            unitId: '1_high_ar_u1',
            unitTitle: 'الوحدة 1: القراءة والنصوص الأدبية المقررة',
            subtopics: ['أثر الإسلام في تهذيب المجتمع العربي وتأسيس دعائم العدالة والمساواة', 'حقوق الفرد والأسرة والتكافل الاجتماعي', 'التحليل النقدي والاستيعابي للنص']
          },
          {
            id: '1_high_ar_u1_l3',
            title: 'الدرس الثالث: القراءة (تكنولوجيا المعلومات وتحديات العصر - للدكتور نبيل علي)',
            lessonNumber: 3,
            unitId: '1_high_ar_u1',
            unitTitle: 'الوحدة 1: القراءة والنصوص الأدبية المقررة',
            subtopics: ['ثورة المعلومات وتأثير الثورة الرقمية في الثقافة واللغة العربية', 'فرص وتحديات الرقمنة والذكاء الاصطناعي في التعليم', 'المصطلحات التكنولوجية الحديثة وصياغة الرؤى المستقبلية']
          },
          {
            id: '1_high_ar_u1_l4',
            title: 'الدرس الرابع: النصوص الشعرية (شعر العصور الجاهلي وصدر الإسلام والأموي)',
            lessonNumber: 4,
            unitId: '1_high_ar_u1',
            unitTitle: 'الوحدة 1: القراءة والنصوص الأدبية المقررة',
            subtopics: ['شرح وتحليل نص السموأل (شباب تسامى للعلا وكهول)', 'نص كعب بن زهير (العفو مأمول) وقصيدة البردة', 'نص أبي الأسود الدؤلي (ابدأ بنفسك) في الحكمة والأخلاق', 'استخراج مواطن الجمال والموسيقى والصور الخيالية']
          },
          {
            id: '1_high_ar_u1_l5',
            title: 'الدرس الخامس: النصوص النثرية (الوصايا، الخطب، والرسائل)',
            lessonNumber: 5,
            unitId: '1_high_ar_u1',
            unitTitle: 'الوحدة 1: القراءة والنصوص الأدبية المقررة',
            subtopics: ['وصية أمامة بنت الحارث لابنتها (قيم الحياة الزوجية)', 'النص القرآني الكريم (من أجل حياة كريمة)', 'رسالة عبد الحميد الكاتب (آداب صناعة الكتّاب) وتحليل الأساليب الإنشائية والخبرية']
          }
        ]
      },
      {
        id: '1_high_ar_u2',
        title: 'الوحدة 2: البلاغة العربية وتاريخ الأدب العربي',
        unitNumber: 2,
        lessons: [
          {
            id: '1_high_ar_u2_l1',
            title: 'الدرس الأول: مدخل إلى البلاغة (الحقيقة والمجاز)',
            lessonNumber: 1,
            unitId: '1_high_ar_u2',
            unitTitle: 'الوحدة 2: البلاغة العربية وتاريخ الأدب العربي',
            subtopics: ['مفهوم التعبير الحقيقي والتعبير المجازي وأمثلة تطبيقية', 'أهمية دراسة علوم البلاغة الثلاثة (البيان، البديع، المعاني)', 'الذوق الأدبي في التفريق بين الحقيقة والخيال']
          },
          {
            id: '1_high_ar_u2_l2',
            title: 'الدرس الثاني: علم البيان (التشبيه بأنواعه والاستعارة المكنية والتصريحية)',
            lessonNumber: 2,
            unitId: '1_high_ar_u2',
            unitTitle: 'الوحدة 2: البلاغة العربية وتاريخ الأدب العربي',
            subtopics: ['أركان التشبيه الأربعة وأنواعه (المفصل، المجمل، المؤكد، البليغ، التمثيلي، الضمني)', 'الاستعارة المكنية والاستعارة التصريحية وسر جمالهما (التشخيص، التجسيم، التوضيح)', 'تدريبات بلاغية مكثفة على أبيات الشعر العربي']
          },
          {
            id: '1_high_ar_u2_l3',
            title: 'الدرس الثالث: علم البديع (المحسنات اللفظية والمعنوية) وعلم المعاني',
            lessonNumber: 3,
            unitId: '1_high_ar_u2',
            unitTitle: 'الوحدة 2: البلاغة العربية وتاريخ الأدب العربي',
            subtopics: ['المحسنات المعنوية (الطباق، المقابلة، التورية، مراعاة النظير)', 'المحسنات اللفظية (الجناس، السجع، التصريع، حسن التقسيم، الازدواج)', 'علم المعاني: الأسلوب الخبري والأسلوب الإنشائي وأغراضهما البلاغية']
          },
          {
            id: '1_high_ar_u2_l4',
            title: 'الدرس الرابع: تاريخ الأدب (الأدب الجاهلي، عصر صدر الإسلام، والعصر الأموي)',
            lessonNumber: 4,
            unitId: '1_high_ar_u2',
            unitTitle: 'الوحدة 2: البلاغة العربية وتاريخ الأدب العربي',
            subtopics: ['بيئة العصر الجاهلي وخصائص الشعر والنثر والمعلقات السبع', 'أثر الإسلام والقرآن الكريم في لغة وأغراض الشعر والخطابة', 'الأدب في العصر الأموي وتطور فنون الغزل والنقائض والرسائل']
          }
        ]
      },
      {
        id: '1_high_ar_u3',
        title: 'الوحدة 3: قواعد النحو والتعبير وقصة عنترة بن شداد',
        unitNumber: 3,
        lessons: [
          {
            id: '1_high_ar_u3_l1',
            title: 'الدرس الأول: النحو (الأفعال الناقصة والتامة - كان وأخواتها)',
            lessonNumber: 1,
            unitId: '1_high_ar_u3',
            unitTitle: 'الوحدة 3: قواعد النحو والتعبير وقصة عنترة بن شداد',
            subtopics: ['كان وأخواتها الناقصة وعملها في رفع المبتدأ ونصب الخبر وأنواع الخبر', 'كان التامة وأخواتها ومعناها وإعراب ما بعدها فاعلاً', 'شروط تمام ونقصان الأفعال الناسخة']
          },
          {
            id: '1_high_ar_u3_l2',
            title: 'الدرس الثاني: النحو (أفعال المقاربة والرجاء والشروع - كاد وأخواتها)',
            lessonNumber: 2,
            unitId: '1_high_ar_u3',
            unitTitle: 'الوحدة 3: قواعد النحو والتعبير وقصة عنترة بن شداد',
            subtopics: ['أقسام كاد وأخواتها (المقاربة: كاد، كرب، أوشك - الرجاء: عسى، حرى، اخلولق - الشروع: شرع، بدأ، أخذ، طفق، أنشأ، جعل)', 'شروط عملها واشترط أن يكون خبرها جملة فعلية فعلها مضارع', 'أحكام اقتران خبر كاد وأخواتها بـ (أن) وتطبيقات إعرابية شاملة']
          },
          {
            id: '1_high_ar_u3_l3',
            title: 'الدرس الثالث: النحو (إعمال المشتقات العاملة عمل فعلها)',
            lessonNumber: 3,
            unitId: '1_high_ar_u3',
            unitTitle: 'الوحدة 3: قواعد النحو والتعبير وقصة عنترة بن شداد',
            subtopics: ['إعمال اسم الفاعل وصوغه وشروط عمله المحلى بـ أل والمجرد المنون', 'إعمال صيغ المبالغة القياسية وشروط عملها وإعراب معمولها', 'إعمال اسم المفعول وصوغه ورفع معموله نائباً للفاعل']
          },
          {
            id: '1_high_ar_u3_l4',
            title: 'الدرس الرابع: التعبير الوظيفي والإبداعي والقصة المقررة (عنترة بن شداد)',
            lessonNumber: 4,
            unitId: '1_high_ar_u3',
            unitTitle: 'الوحدة 3: قواعد النحو والتعبير وقصة عنترة بن شداد',
            subtopics: ['فنون التعبير الوظيفي (التعليق، الإعلان، بطاقة الدعوة، الرسالة، التلخيص والسط)، وضوابط التعبير الإبداعي', 'قصة (وا إسلاماه / عنترة بن شداد): الشخصيات والأحداث والصراع الدرامي', 'نماذج امتحانات وتطبيقات شاملة على منهج الصف الأول الثانوي']
          }
        ]
      }
    ]
  },

  // ─── 1_high اللغة الإنجليزية ────────────────────────────────────────────────
  {
    grade_level: '1_high',
    subject_name: 'اللغة الإنجليزية',
    file_name: 'اللغة الانجليزية.md',
    units: [
      {
        id: '1_high_eng_u1',
        title: 'Unit 1: Egyptian Heritage & Pride (تراث مصر ومصادر الفخر الوطني)',
        unitNumber: 1,
        lessons: [
          {
            id: '1_high_eng_u1_l1',
            title: 'Lessons 1 & 2: Taking Pride in Our Beloved Egypt — Moments That Shaped Us',
            lessonNumber: 1,
            unitId: '1_high_eng_u1',
            unitTitle: 'Unit 1: Egyptian Heritage & Pride (تراث مصر ومصادر الفخر الوطني)',
            subtopics: ['Core vocabulary: Heritage, monuments, ancient civilizations, cultural identity, preservation', 'Past simple and past continuous in historical narratives', 'Collocations with national pride and historical achievements']
          },
          {
            id: '1_high_eng_u1_l2',
            title: 'Lessons 3 & 4: Now Starts Long Ago & Egyptian Inventions',
            lessonNumber: 2,
            unitId: '1_high_eng_u1',
            unitTitle: 'Unit 1: Egyptian Heritage & Pride (تراث مصر ومصادر الفخر الوطني)',
            subtopics: ['Reading text: Ancient Egyptian innovations in medicine, engineering, and astronomy', 'Used to vs. would for past habits and states', 'Suffixes forming nouns and adjectives of nationality and historical eras']
          },
          {
            id: '1_high_eng_u1_l3',
            title: 'Lessons 5 & 6: Where Pride Begins & Writing an Essay on Technology and Heritage',
            lessonNumber: 3,
            unitId: '1_high_eng_u1',
            unitTitle: 'Unit 1: Egyptian Heritage & Pride (تراث مصر ومصادر الفخر الوطني)',
            subtopics: ['Speaking: Discussing modern Egyptian achievements and archaeological discoveries', 'Writing an essay on preserving historical heritage using cutting-edge technology', 'Unit review and vocabulary quiz']
          }
        ]
      },
      {
        id: '1_high_eng_u2',
        title: 'Unit 2: Community Service & Environmental Action (خدمة المجتمع والعمل التطوعي)',
        unitNumber: 2,
        lessons: [
          {
            id: '1_high_eng_u2_l1',
            title: 'Lessons 1 & 2: Planting Trees, Growing Myself & Green Initiatives',
            lessonNumber: 1,
            unitId: '1_high_eng_u2',
            unitTitle: 'Unit 2: Community Service & Environmental Action (خدمة المجتمع والعمل التطوعي)',
            subtopics: ['Key vocabulary: Volunteerism, community outreach, reforestation, ecological balance, civic duty', 'Present perfect vs. present perfect continuous with for, since, lately', 'Phrasal verbs in volunteering and teamwork']
          },
          {
            id: '1_high_eng_u2_l2',
            title: 'Lessons 3 & 4: Community Work in Times of Crisis & First Aid',
            lessonNumber: 2,
            unitId: '1_high_eng_u2',
            unitTitle: 'Unit 2: Community Service & Environmental Action (خدمة المجتمع والعمل التطوعي)',
            subtopics: ['Reading: Youth organizations providing emergency relief and local community support', 'Modal verbs for obligation and necessity (must, have to, need to, should)', 'Medical vocabulary for basic first aid']
          },
          {
            id: '1_high_eng_u2_l3',
            title: 'Lessons 5 & 6: Serving the Community & Writing a Formal Report',
            lessonNumber: 3,
            unitId: '1_high_eng_u2',
            unitTitle: 'Unit 2: Community Service & Environmental Action (خدمة المجتمع والعمل التطوعي)',
            subtopics: ['Speaking: Proposing a neighbourhood tree-planting and cleanup initiative', 'Writing a structured formal report recommending youth volunteering programs', 'Unit grammar practice']
          }
        ]
      },
      {
        id: '1_high_eng_u3',
        title: 'Unit 3: Truth vs. Lies (الحقيقة والزيف في العصر الرقمي)',
        unitNumber: 3,
        lessons: [
          {
            id: '1_high_eng_u3_l1',
            title: 'Lessons 1 & 2: When Appearances Lie & Wise Choices in a Digital World',
            lessonNumber: 1,
            unitId: '1_high_eng_u3',
            unitTitle: 'Unit 3: Truth vs. Lies (الحقيقة والزيف في العصر الرقمي)',
            subtopics: ['Vocabulary: Misinformation, deceptive, authentic, clickbait, critical discernment', 'Defining and non-defining relative clauses (who, which, that, where, whose)', 'Identifying misleading headlines and digital traps']
          },
          {
            id: '1_high_eng_u3_l2',
            title: 'Lessons 3 & 4: Identifying Misinformation & Online Media Ethics',
            lessonNumber: 2,
            unitId: '1_high_eng_u3',
            unitTitle: 'Unit 3: Truth vs. Lies (الحقيقة والزيف في العصر الرقمي)',
            subtopics: ['Reading: Case studies on deepfakes and algorithmic bias in social feeds', 'Quantifiers and determiners (each, every, all, both, either, neither)', 'Fact-checking tools and critical media literacy']
          },
          {
            id: '1_high_eng_u3_l3',
            title: 'Lessons 5 & 6: The Truth Trap & Writing an Argumentative Essay',
            lessonNumber: 3,
            unitId: '1_high_eng_u3',
            unitTitle: 'Unit 3: Truth vs. Lies (الحقيقة والزيف في العصر الرقمي)',
            subtopics: ['Speaking: Debating the ethical responsibilities of social media platforms', 'Writing an argumentative essay on digital honesty and verifying news sources', 'Unit consolidation']
          }
        ]
      },
      {
        id: '1_high_eng_u4',
        title: 'Unit 4: Save and Shine (الاستدامة والتوفير وحماية الكوكب)',
        unitNumber: 4,
        lessons: [
          {
            id: '1_high_eng_u4_l1',
            title: 'Lessons 1 & 2: Go Green — One Bag at a Time & Sustainable Living',
            lessonNumber: 1,
            unitId: '1_high_eng_u4',
            unitTitle: 'Unit 4: Save and Shine (الاستدامة والتوفير وحماية الكوكب)',
            subtopics: ['Key vocabulary: Biodegradable, carbon footprint, renewable energy, zero waste, recycling', 'Countable and uncountable nouns with much, many, few, little, plenty of', 'Everyday habits for reducing plastic consumption']
          },
          {
            id: '1_high_eng_u4_l2',
            title: 'Lessons 3 & 4: Small Actions Making Big Environmental Differences',
            lessonNumber: 2,
            unitId: '1_high_eng_u4',
            unitTitle: 'Unit 4: Save and Shine (الاستدامة والتوفير وحماية الكوكب)',
            subtopics: ['Reading text: Innovative clean-energy start-ups launched by high school students', 'Conditional sentences (Zero, First, Second, and Third Conditionals)', 'Expressing regrets and future environmental predictions']
          },
          {
            id: '1_high_eng_u4_l3',
            title: 'Lessons 5 & 6: Helping Our Community & Writing an Email Proposal',
            lessonNumber: 3,
            unitId: '1_high_eng_u4',
            unitTitle: 'Unit 4: Save and Shine (الاستدامة والتوفير وحماية الكوكب)',
            subtopics: ['Speaking: Presenting an energy-saving plan for schools and homes', 'Writing a formal email proposal requesting solar panel installations', 'Unit review']
          }
        ]
      },
      {
        id: '1_high_eng_u5',
        title: 'Unit 5: Technology & Foreign Languages (التكنولوجيا واللغات العالمية)',
        unitNumber: 5,
        lessons: [
          {
            id: '1_high_eng_u5_l1',
            title: 'Lessons 1 & 2: Why Learning a Foreign Language Matters in the AI Age',
            lessonNumber: 1,
            unitId: '1_high_eng_u5',
            unitTitle: 'Unit 5: Technology & Foreign Languages (التكنولوجيا واللغات العالمية)',
            subtopics: ['Vocabulary: Multilingual, fluency, cultural bridge, automated translation, cognitive benefits', 'Future continuous vs. future perfect tense (will be doing vs. will have done)', 'Language learning applications and digital immersion']
          },
          {
            id: '1_high_eng_u5_l2',
            title: 'Lessons 3 & 4: Digital Tools for Language Acquisition & Communication',
            lessonNumber: 2,
            unitId: '1_high_eng_u5',
            unitTitle: 'Unit 5: Technology & Foreign Languages (التكنولوجيا واللغات العالمية)',
            subtopics: ['Reading: How AI voice assistants and speech synthesis assist language learners', 'Direct and indirect questions and polite request forms', 'Idiomatic expressions in international business English']
          },
          {
            id: '1_high_eng_u5_l3',
            title: 'Lessons 5 & 6: Ramy\'s Journey with English & Writing an Informal Email',
            lessonNumber: 3,
            unitId: '1_high_eng_u5',
            unitTitle: 'Unit 5: Technology & Foreign Languages (التكنولوجيا واللغات العالمية)',
            subtopics: ['Speaking: Sharing personal milestones in learning English', 'Writing an informal email recounting travel and language exchange experiences', 'Vocabulary check']
          }
        ]
      },
      {
        id: '1_high_eng_u6',
        title: 'Unit 6: Career Readiness & Job Hunting (سوق العمل والاستعداد المهني)',
        unitNumber: 6,
        lessons: [
          {
            id: '1_high_eng_u6_l1',
            title: 'Lessons 1 & 2: The Modern Job Hunt, Interviews & Professional Skills',
            lessonNumber: 1,
            unitId: '1_high_eng_u6',
            unitTitle: 'Unit 6: Career Readiness & Job Hunting (سوق العمل والاستعداد المهني)',
            subtopics: ['Key terms: Job interview, qualifications, soft skills, transferable skills, freelance, recruiter', 'Passive voice in all tenses (present, past, future, modal verbs)', 'Answering common behavioral job interview questions']
          },
          {
            id: '1_high_eng_u6_l2',
            title: 'Lessons 3 & 4: Writing a Winning Resume / Curriculum Vitae (CV) & Cover Letter',
            lessonNumber: 2,
            unitId: '1_high_eng_u6',
            unitTitle: 'Unit 6: Career Readiness & Job Hunting (سوق العمل والاستعداد المهني)',
            subtopics: ['Reading: Formatting a modern CV with education, experience, and key competencies', 'Action verbs in professional achievement descriptions', 'Writing an effective cover letter tailored to a job posting']
          },
          {
            id: '1_high_eng_u6_l3',
            title: 'Lessons 5 & 6: Workplace Ethics, Future Careers & Comprehensive Examination Practice',
            lessonNumber: 3,
            unitId: '1_high_eng_u6',
            unitTitle: 'Unit 6: Career Readiness & Job Hunting (سوق العمل والاستعداد المهني)',
            subtopics: ['Speaking: Simulating a mock job interview with peer evaluation', 'Workplace etiquette, teamwork, and continuous professional development', 'Full term examination practice questions and test strategies']
          }
        ]
      }
    ]
  },

  // ─── 1_high العلوم (العلوم المتكاملة) ───────────────────────────────────────────
  {
    grade_level: '1_high',
    subject_name: 'العلوم',
    file_name: 'العلوم.md',
    units: [
      {
        id: '1_high_sci_u1',
        title: 'الوحدة 1: النظام البيئي المائي',
        unitNumber: 1,
        lessons: [
          {
            id: '1_high_sci_u1_l1',
            title: 'الدرس 1: الغلاف المائي على كوكب الأرض',
            lessonNumber: 1,
            unitId: '1_high_sci_u1',
            unitTitle: 'الوحدة 1: النظام البيئي المائي',
            subtopics: [
              'مفهوم النظام البيئي ومكوناته الحيوية وغير الحيوية',
              'أغلفة البيئة الطبيعية وتوزيع المياه على كوكب الأرض (المالحة والعذبة والجليدية)',
              'دورة الماء في الطبيعة (التبخر، التكثف، الترسيب، تسرب المياه، النتح)'
            ]
          },
          {
            id: '1_high_sci_u1_l2',
            title: 'الدرس 2: الخواص الكيميائية للماء',
            lessonNumber: 2,
            unitId: '1_high_sci_u1',
            unitTitle: 'الوحدة 1: النظام البيئي المائي',
            subtopics: [
              'التركيب الكيميائي للماء والروابط التساهمية الأحادية والزاوية 104.5°',
              'قطبية جزيء الماء والسالبية الكهربية وخواص الماء كمذيب عام',
              'الاتزان الأيوني والتأين الذاتي للماء والرقم الهيدروجيني (pH)'
            ]
          },
          {
            id: '1_high_sci_u1_l3',
            title: 'الدرس 3: الخواص الفيزيائية للماء',
            lessonNumber: 3,
            unitId: '1_high_sci_u1',
            unitTitle: 'الوحدة 1: النظام البيئي المائي',
            subtopics: [
              'شذوذ كثافة الماء وتناقصها بين 4°C و 0°C وأهميته للحياة المائية',
              'الحرارة النوعية المرتفعة للماء وتأثيرها في تنظيم المناخ',
              'الحرارة الكامنة للانصهار والتصعيد والتوتر السطحي للماء'
            ]
          },
          {
            id: '1_high_sci_u1_l4',
            title: 'الدرس 4: المحاليل المائية وخواصها',
            lessonNumber: 4,
            unitId: '1_high_sci_u1',
            unitTitle: 'الوحدة 1: النظام البيئي المائي',
            subtopics: [
              'مفهوم المحلول وأنواعه وطرق التعبير عن التركيز (المولارية والمولالية والنسبة المئوية)',
              'الخواص الجمعية للمحاليل (انخفاض الضغط البخاري، ارتفاع درجة الغليان، انخفاض درجة التجمد)',
              'الضغط الأسموزي وتطبيقاته في البيئة المائية'
            ]
          },
          {
            id: '1_high_sci_u1_l5',
            title: 'الدرس 5: الأهمية البيولوجية للماء',
            lessonNumber: 5,
            unitId: '1_high_sci_u1',
            unitTitle: 'الوحدة 1: النظام البيئي المائي',
            subtopics: [
              'دور الماء في الحفاظ على التركيب والوظائف الخلوية',
              'الماء كوسيط للتفاعلات الكيميائية الحيوية والنقل داخل الكائنات الحية',
              'نسبة الماء في أنسجة وأجسام الكائنات الحية والتوازن المائي'
            ]
          },
          {
            id: '1_high_sci_u1_l6',
            title: 'الدرس 6: التكيفات البيولوجية للكائنات الحية في البيئة المائية',
            lessonNumber: 6,
            unitId: '1_high_sci_u1',
            unitTitle: 'الوحدة 1: النظام البيئي المائي',
            subtopics: [
              'التكيفات التركيبية والتشريحية للأسماك والكائنات المائية (الشكل الانسيابي، الزعانف، الخياشيم)',
              'التكيفات الفسيولوجية والوظيفة الأسموزية في المياه العذبة والمالحة',
              'التكيفات السلوكية للهجرة والتغذية والحماية'
            ]
          },
          {
            id: '1_high_sci_u1_l7',
            title: 'الدرس 7: تأثير غازات الهواء الجوي على البيئات المائية',
            lessonNumber: 7,
            unitId: '1_high_sci_u1',
            unitTitle: 'الوحدة 1: النظام البيئي المائي',
            subtopics: [
              'ذوبانية غازي الأكسجين (O2) وثاني أكسيد الكربون (CO2) في الماء وعواملها',
              'أهمية الأكسجين المذاب لتنفس الكائنات البحرية ومخاطر نقصه',
              'دور ثاني أكسيد الكربون المذاب في البناء الضوئي وحمضية المحيطات'
            ]
          },
          {
            id: '1_high_sci_u1_l8',
            title: 'الدرس 8: تأثير الضوء والإشعاع الشمسي على البيئات المائية',
            lessonNumber: 8,
            unitId: '1_high_sci_u1',
            unitTitle: 'الوحدة 1: النظام البيئي المائي',
            subtopics: [
              'اختراق الضوء لطبقات المياه وتكون المناطق الضوئية (السطحية والعميقة)',
              'دور الإشعاع الشمسي في عملية البناء الضوئي للعوالق النباتية والشعاب المرجانية',
              'تأثير الإشعاع الشمسي على التيارات المحيطية والمناخ'
            ]
          },
          {
            id: '1_high_sci_u1_l9',
            title: 'الدرس 9: تأثير الضغط المائي على الكائنات الحية',
            lessonNumber: 9,
            unitId: '1_high_sci_u1',
            unitTitle: 'الوحدة 1: النظام البيئي المائي',
            subtopics: [
              'قانون الضغط عند نقطة في باطن سائل (P = ρ g h) والعوامل المؤثرة',
              'تدرج الضغط مع العمق في المحيطات',
              'التكيفات التشريحية والفسيولوجية لكائنات الأعماق لتحمل الضغط العالي'
            ]
          },
          {
            id: '1_high_sci_u1_l10',
            title: 'الدرس 10: التوازن البيئي ودور الإنسان في استدامة الحياة المائية',
            lessonNumber: 10,
            unitId: '1_high_sci_u1',
            unitTitle: 'الوحدة 1: النظام البيئي المائي',
            subtopics: [
              'مفهوم التوازن البيئي في النظم المائية ودورات العناصر الغذائية',
              'الآثار السلبية للأنشطة البشرية (التلوث المائي، الصيد الجائر، تغير المناخ)',
              'استراتيجيات الحفاظ على الموارد المائية واستدامة النظم البيئية'
            ]
          }
        ]
      },
      {
        id: '1_high_sci_u2',
        title: 'الوحدة 2: الغلاف الجوي',
        unitNumber: 2,
        lessons: [
          {
            id: '1_high_sci_u2_l1',
            title: 'الدرس 1: مكونات وطبقات الغلاف الجوي',
            lessonNumber: 1,
            unitId: '1_high_sci_u2',
            unitTitle: 'الوحدة 2: الغلاف الجوي',
            subtopics: [
              'المكونات الغازية للغلاف الجوي ونسب الغازات (النيتروجين، الأكسجين، ثاني أكسيد الكربون)',
              'طبقات الغلاف الجوي (التروبوسفير، الستراتوسفير، الميزوسفير، الثرموسفير، الأكسوسفير)',
              'المناطق الانتقالية (التروبوبوز، الستراتوبوز، الميزوبوز) وسرعة الإفلات'
            ]
          },
          {
            id: '1_high_sci_u2_l2',
            title: 'الدرس 2: التفاعلات الكيميائية في الغلاف الجوي',
            lessonNumber: 2,
            unitId: '1_high_sci_u2',
            unitTitle: 'الوحدة 2: الغلاف الجوي',
            subtopics: [
              'تكون طبقة الأوزون في الستراتوسفير بتأثير الأشعة فوق البنفسجية',
              'أسباب وآليات تآكل طبقة الأوزون (مركبات CFCs والهالونات)',
              'الأمطار الحمضية وتفاعلات أكاسيد النيتروجين والكبريت في الهواء'
            ]
          },
          {
            id: '1_high_sci_u2_l3',
            title: 'الدرس 3: العوامل الفيزيائية وتأثيرها في الغلاف الجوي',
            lessonNumber: 3,
            unitId: '1_high_sci_u2',
            unitTitle: 'الوحدة 2: الغلاف الجوي',
            subtopics: [
              'درجة الحرارة ومقاييسها وتأثير الإشعاع الشمسي على طبقات الجو',
              'الضغط الجوي وتغيره مع الارتفاع وأجهزة قياسه',
              'الرياح والرطوبة وتكيف الكائنات الحية مع العوامل الفيزيائية الجوية'
            ]
          },
          {
            id: '1_high_sci_u2_l4',
            title: 'الدرس 4: الغلاف الجوي ودور العلم في استدامته',
            lessonNumber: 4,
            unitId: '1_high_sci_u2',
            unitTitle: 'الوحدة 2: الغلاف الجوي',
            subtopics: [
              'ظاهرة الاحتباس الحراري والغازات الدفيئة وتغير المناخ العالمي',
              'ملوثات الهواء الصناعية وأثرها على الصحة والبيئة',
              'دور التكنولوجيا والاتفاقيات الدولية (بروتوكول مونتريال) في حماية الغلاف الجوي'
            ]
          }
        ]
      }
    ]
  }
];

// ─── Main Execution ──────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting 1_high Curricula Upload & Indexing Pipeline...');
  console.log(`Target: 6 Curricula for 1_high`);

  const outputBase = path.resolve(__dirname, '../../Curriculum Generator/output/1_high');
  const uploaded1HighIds = [];

  for (const currDef of HIGH_1_DEFINITIONS) {
    const filePath = path.join(outputBase, currDef.file_name);
    console.log(`\n===============================================================`);
    console.log(`Processing: [${currDef.grade_level}] ${currDef.subject_name}`);
    console.log(`File: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      continue;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    console.log(`File size: ${(fileContent.length / 1024).toFixed(1)} KB`);

    // 1. Hierarchical chunking
    console.log(`1. Chunking Markdown hierarchically...`);
    const { parents, children } = chunkMarkdownHierarchical(fileContent);
    console.log(`   Created ${parents.length} parent chunks and ${children.length} child chunks.`);

    // 2. Generate Vector Embeddings
    console.log(`2. Generating text embeddings for ${children.length} child chunks via EdenAI...`);
    const childTexts = children.map(c => `${c.heading}\n${c.content}`);
    const embeddings = await generateEmbeddingBatch(childTexts);
    const validEmbeddingsCount = embeddings.filter(e => e && e.length > 0).length;
    console.log(`   Generated ${validEmbeddingsCount}/${children.length} valid 768-dim embeddings.`);

    // 3. Prepare All Chunks
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
        const matchingParent = parentWithIds.find(p => p.heading === c.parentHeading);
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

    // 4. Overwrite in Supabase
    console.log(`3. Overwriting Curriculum & ${allChunks.length} Chunks in Supabase...`);
    
    // Delete existing
    const { data: existingRows } = await supabase
      .from('curriculums')
      .select('id')
      .eq('grade_level', currDef.grade_level)
      .eq('subject_name', currDef.subject_name);

    if (existingRows && existingRows.length > 0) {
      for (const row of existingRows) {
        console.log(`   Removing previous curriculum record: ${row.id}`);
        await supabase.from('curriculums').delete().eq('id', row.id);
      }
    }

    const newCurriculumId = crypto.randomUUID();
    const curriculumRow = {
      id: newCurriculumId,
      grade_level: currDef.grade_level,
      subject_name: currDef.subject_name,
      file_name: currDef.file_name,
      units: currDef.units,
      created_at: new Date().toISOString()
    };

    const { error: currError } = await supabase.from('curriculums').insert(curriculumRow);
    if (currError) {
      console.error(`❌ Failed to insert curriculum:`, currError);
      continue;
    }

    // Insert chunks in batches of 100
    const formattedChunks = allChunks.map(c => ({
      id: c.id,
      curriculum_id: newCurriculumId,
      content: c.content,
      heading: c.heading,
      chunk_level: c.chunk_level,
      parent_id: c.parent_id,
      position_index: c.position_index,
      embedding: c.embedding
    }));

    const BATCH_SIZE = 100;
    for (let i = 0; i < formattedChunks.length; i += BATCH_SIZE) {
      const batch = formattedChunks.slice(i, i + BATCH_SIZE);
      const { error: chunkError } = await supabase.from('curriculum_chunks').insert(batch);
      if (chunkError) {
        console.error(`❌ Error inserting chunk batch ${i / BATCH_SIZE + 1}:`, chunkError);
      }
    }

    console.log(`✅ Uploaded [${currDef.grade_level}] ${currDef.subject_name} (ID: ${newCurriculumId}) with ${currDef.units.length} units and ${currDef.units.reduce((a, u) => a + u.lessons.length, 0)} lessons.`);
    uploaded1HighIds.push(newCurriculumId);
  }

  // 5. Update system_settings with all uploaded curriculum IDs
  console.log(`\n===============================================================`);
  console.log(`Updating System Settings (active_curriculum_ids & active_grade_levels)...`);

  const { data: allCurriculumsInDb } = await supabase.from('curriculums').select('id');
  const allIds = allCurriculumsInDb ? allCurriculumsInDb.map(c => c.id) : uploaded1HighIds;

  const { error: setErr } = await supabase
    .from('system_settings')
    .upsert({
      key: 'active_curriculum_ids',
      value: JSON.stringify(allIds)
    });

  if (setErr) console.error('Failed to update active_curriculum_ids:', setErr);
  else console.log(`✅ Updated active_curriculum_ids with all ${allIds.length} active curricula.`);

  const { error: gradeErr } = await supabase
    .from('system_settings')
    .upsert({
      key: 'active_grade_levels',
      value: JSON.stringify(['1_middle', '2_middle', '3_middle', '1_high', '2_high', '3_high'])
    });

  if (gradeErr) console.error('Failed to update active_grade_levels:', gradeErr);
  else console.log(`✅ Updated active_grade_levels with all grades.`);

  // 6. Update local db_data.json
  console.log(`Updating local db_data.json...`);
  const localDbPath = path.resolve(__dirname, '../db_data.json');
  try {
    let localData = { curriculums: [], curriculum_chunks: [], system_settings: [] };
    if (fs.existsSync(localDbPath)) {
      try {
        localData = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
      } catch (e) {}
    }
    
    // Fetch fresh curriculums from Supabase
    const { data: allSupabaseCurriculums } = await supabase.from('curriculums').select('*');
    if (allSupabaseCurriculums) {
      localData.curriculums = allSupabaseCurriculums;
      fs.writeFileSync(localDbPath, JSON.stringify(localData, null, 2), 'utf8');
      console.log(`✅ Local db_data.json synchronized with ${allSupabaseCurriculums.length} curriculums.`);
    }
  } catch (err) {
    console.warn(`Local db_data.json sync notice:`, err.message);
  }

  console.log(`\n🎉 All 5 Curricula for 1_high uploaded, embedded, indexed, and activated successfully!`);
}

main().catch(err => {
  console.error('Fatal pipeline error:', err);
  process.exit(1);
});
