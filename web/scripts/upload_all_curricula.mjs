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

  let currentUnit = '';
  let currentLesson = '';
  let currentHeading = 'مقدمة المنهج';
  let currentLines = [];

  const buildBreadcrumb = (unit, lesson, heading) => {
    const raw = [unit, lesson, heading].map(s => (s || '').trim()).filter(Boolean);
    const parts = raw.filter((v, i, a) => i === 0 || v !== a[i - 1]);
    return parts.join(' > ') || heading || 'مقدمة المنهج';
  };

  for (const line of lines) {
    const unitMatch = line.match(/^#\s+(.+)$/);
    const lessonMatch = line.match(/^##\s+(.+)$/);
    const subMatch = line.match(/^###\s+(.+)$/);
    const genericHeadingMatch = line.match(/^(#{4,6})\s+(.+)$/);

    if (unitMatch) {
      if (currentLines.join('\n').trim().length > 10) {
        rawSections.push({ heading: buildBreadcrumb(currentUnit, currentLesson, currentHeading), contentLines: [...currentLines] });
      }
      currentUnit = unitMatch[1].trim();
      currentLesson = '';
      currentHeading = currentUnit;
      currentLines = [];
    } else if (lessonMatch) {
      if (currentLines.join('\n').trim().length > 10) {
        rawSections.push({ heading: buildBreadcrumb(currentUnit, currentLesson, currentHeading), contentLines: [...currentLines] });
      }
      currentLesson = lessonMatch[1].trim();
      currentHeading = currentLesson;
      currentLines = [];
    } else if (subMatch) {
      if (currentLines.join('\n').trim().length > 10) {
        rawSections.push({ heading: buildBreadcrumb(currentUnit, currentLesson, currentHeading), contentLines: [...currentLines] });
      }
      currentHeading = subMatch[1].trim();
      currentLines = [];
    } else if (genericHeadingMatch) {
      if (currentLines.join('\n').trim().length > 10) {
        rawSections.push({ heading: buildBreadcrumb(currentUnit, currentLesson, currentHeading), contentLines: [...currentLines] });
      }
      currentHeading = genericHeadingMatch[2].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.join('\n').trim().length > 10) {
    rawSections.push({ heading: buildBreadcrumb(currentUnit, currentLesson, currentHeading), contentLines: currentLines });
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

async function generateEmbeddingBatch(texts) {
  if (!EDENAI_API_KEY || texts.length === 0) return texts.map(() => []);

  const BATCH_SIZE = 20;
  const batches = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE).map(t => t.slice(0, 8000)));
  }

  const allEmbeddings = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    let retries = 3;
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
        console.warn(`Retry ${3 - retries}/3 for embedding batch ${i + 1}/${batches.length}:`, err.message);
        if (retries > 0) await new Promise(r => setTimeout(r, 1500));
        else {
          for (let j = 0; j < batch.length; j++) allEmbeddings.push([]);
        }
      }
    }
    // Rate limit delay between batches
    await new Promise(r => setTimeout(r, 300));
  }

  return allEmbeddings;
}

// ─── Curriculum Units & Lessons Structure Definitions ────────────────────────

export const CURRICULA_DEFINITIONS = [
  // =========================================================================
  // 1_middle (الصف الأول الإعدادي)
  // =========================================================================
  {
    grade_level: '1_middle',
    subject_name: 'الدراسات الإجتماعية',
    file_name: 'الدراسات الإجتماعية.md',
    units: [
      {
        id: '1_middle_soc_u1',
        title: 'الوحدة 1: الملامح الطبيعية لقارة إفريقيا وحضاراتها القديمة',
        unitNumber: 1,
        lessons: [
          {
            id: '1_middle_soc_u1_l1',
            title: 'الدرس الأول: موقع قارة إفريقيا ومظاهر سطحها',
            lessonNumber: 1,
            unitId: '1_middle_soc_u1',
            unitTitle: 'الوحدة 1: الملامح الطبيعية لقارة إفريقيا وحضاراتها القديمة',
            subtopics: ['الموقع الفلكي والجغرافي لقارة إفريقيا', 'الجبال والهضاب والسهول والبحيرات', 'أهمية نهر النيل وروافده']
          },
          {
            id: '1_middle_soc_u1_l2',
            title: 'الدرس الثاني: المناخ والنبات الطبيعي في قارة إفريقيا',
            lessonNumber: 2,
            unitId: '1_middle_soc_u1',
            unitTitle: 'الوحدة 1: الملامح الطبيعية لقارة إفريقيا وحضاراتها القديمة',
            subtopics: ['العوامل المؤثرة في مناخ إفريقيا', 'الأقاليم المناخية والنباتية', 'الغابات الاستوائية والمدارية وحشائش السافانا والإستبس']
          },
          {
            id: '1_middle_soc_u1_l3',
            title: 'الدرس الثالث: الحضارات الإفريقية القديمة',
            lessonNumber: 3,
            unitId: '1_middle_soc_u1',
            unitTitle: 'الوحدة 1: الملامح الطبيعية لقارة إفريقيا وحضاراتها القديمة',
            subtopics: ['حضارة بلاد بونت (الصومال قديماً)', 'حضارة كوش (النوبة القديمة)', 'حضارة أكسوم (إثيوبيا)']
          }
        ]
      },
      {
        id: '1_middle_soc_u2',
        title: 'الوحدة 2: الحضارة المصرية القديمة وعلاقتها بحضارات إفريقيا',
        unitNumber: 2,
        lessons: [
          {
            id: '1_middle_soc_u2_l1',
            title: 'الدرس الأول: الملامح الحضارية للمصريين القدماء',
            lessonNumber: 1,
            unitId: '1_middle_soc_u2',
            unitTitle: 'الوحدة 2: الحضارة المصرية القديمة وعلاقتها بحضارات إفريقيا',
            subtopics: ['عوامل قيام الحضارة المصرية القديمة', 'مظاهر الحياة السياسية والدينية والاقتصادية', 'الإبداع في العمارة والفنون']
          },
          {
            id: '1_middle_soc_u2_l2',
            title: 'الدرس الثاني: العلاقات السياسية والتجارية والعسكرية بين مصر وإفريقيا',
            lessonNumber: 2,
            unitId: '1_middle_soc_u2',
            unitTitle: 'الوحدة 2: الحضارة المصرية القديمة وعلاقتها بحضارات إفريقيا',
            subtopics: ['الرحلات التجارية إلى بلاد بونت والنوبة', 'تأمين الحدود الجنوبية وإنشاء القلاع', 'التحالفات السياسية والعسكرية القديمة']
          },
          {
            id: '1_middle_soc_u2_l3',
            title: 'الدرس الثالث: التأثير والتأثر الحضاري بين مصر وإفريقيا',
            lessonNumber: 3,
            unitId: '1_middle_soc_u2',
            unitTitle: 'الوحدة 2: الحضارة المصرية القديمة وعلاقتها بحضارات إفريقيا',
            subtopics: ['انتقال الفنون والمعتقدات الدينية', 'التبادل الثقافي والحرفي', 'دور مصر كبوابة لنقل الحضارة لإفريقيا']
          }
        ]
      },
      {
        id: '1_middle_soc_u3',
        title: 'الوحدة 3: النظم البيئية في قارة إفريقيا',
        unitNumber: 3,
        lessons: [
          {
            id: '1_middle_soc_u3_l1',
            title: 'الدرس الأول: النظام البيئي الحار',
            lessonNumber: 1,
            unitId: '1_middle_soc_u3',
            unitTitle: 'الوحدة 3: النظم البيئية في قارة إفريقيا',
            subtopics: ['الغابات الاستوائية والمدارية', 'حشائش السافانا وحياة الحيوانات البرية', 'الصحاري الإفريقية الحارة والتكيف البيئي']
          },
          {
            id: '1_middle_soc_u3_l2',
            title: 'الدرس الثاني: النظام البيئي المعتدل والبارد',
            lessonNumber: 2,
            unitId: '1_middle_soc_u3',
            unitTitle: 'الوحدة 3: النظم البيئية في قارة إفريقيا',
            subtopics: ['إقليم البحر المتوسط في شمال وجنوب إفريقيا', 'النباتات والحيوانات المعتدلة', 'المناطق الجبلية المرتفعة']
          },
          {
            id: '1_middle_soc_u3_l3',
            title: 'الدرس الثالث: المشكلات البيئية في إفريقيا وجهود التنمية المستدامة',
            lessonNumber: 3,
            unitId: '1_middle_soc_u3',
            unitTitle: 'الوحدة 3: النظم البيئية في قارة إفريقيا',
            subtopics: ['التصحر وندرة المياه والجفاف', 'إزالة الغابات والتغير المناخي', 'مبادرات التنمية المستدامة والطاقة المتجددة']
          }
        ]
      },
      {
        id: '1_middle_soc_u4',
        title: 'الوحدة 4: علاقة مصر بإفريقيا خلال العصور الوسطى',
        unitNumber: 4,
        lessons: [
          {
            id: '1_middle_soc_u4_l1',
            title: 'الدرس الأول: انتشار الإسلام في إفريقيا',
            lessonNumber: 1,
            unitId: '1_middle_soc_u4',
            unitTitle: 'الوحدة 4: علاقة مصر بإفريقيا خلال العصور الوسطى',
            subtopics: ['معابر انتقال الإسلام (البحر الأحمر، شمال إفريقيا، القوافل التجارية)', 'الفتوحات الإسلامية في بلاد المغرب والسودان', 'تأثير الإسلام في الثقافة واللغة']
          },
          {
            id: '1_middle_soc_u4_l2',
            title: 'الدرس الثاني: دور مصر الحضاري والتجاري في العصور الوسطى',
            lessonNumber: 2,
            unitId: '1_middle_soc_u4',
            unitTitle: 'الوحدة 4: علاقة مصر بإفريقيا خلال العصور الوسطى',
            subtopics: ['طرق التجارة وقوافل الحج والتجارة الإفريقية', 'دور الأزهر الشريف والعلماء المصريين', 'المراكز التعليمية والثقافية']
          },
          {
            id: '1_middle_soc_u4_l3',
            title: 'الدرس الثالث: رحلات الاستكشاف والتبادل الثقافي',
            lessonNumber: 3,
            unitId: '1_middle_soc_u4',
            unitTitle: 'الوحدة 4: علاقة مصر بإفريقيا خلال العصور الوسطى',
            subtopics: ['رحلات الرحالة المسلمين والمصريين في إفريقيا', 'الآثار المعمارية والإسلامية المشتركة', 'ترسيخ الروابط الأخوية والتاريخية']
          }
        ]
      }
    ]
  },

  // ─── 1_middle الرياضيات ─────────────────────────────────────────────────────
  {
    grade_level: '1_middle',
    subject_name: 'الرياضيات',
    file_name: 'الرياضيات.md',
    units: [
      {
        id: '1_middle_math_u1',
        title: 'الوحدة 1: النسبة والتناسب والعمليات على الأعداد',
        unitNumber: 1,
        lessons: [
          {
            id: '1_middle_math_u1_l1',
            title: 'الدرس الأول: التناسب والنسب المتكافئة ومعدل الوحدة',
            lessonNumber: 1,
            unitId: '1_middle_math_u1',
            unitTitle: 'الوحدة 1: النسبة والتناسب والعمليات على الأعداد',
            subtopics: ['مفهوم النسبة وحدّا النسبة', 'النسب المتكافئة وخط الأعداد المزدوج', 'المعدل ومعدل الوحدة']
          },
          {
            id: '1_middle_math_u1_l2',
            title: 'الدرس الثاني: تطبيقات النسبة والتناسب (مقياس الرسم)',
            lessonNumber: 2,
            unitId: '1_middle_math_u1',
            unitTitle: 'الوحدة 1: النسبة والتناسب والعمليات على الأعداد',
            subtopics: ['قانون مقياس الرسم = الطول في الرسم / الطول الحقيقي', 'التكبير والتصغير', 'حل مسائل حياتية على الخرائط والصور']
          },
          {
            id: '1_middle_math_u1_l3',
            title: 'الدرس الثالث: تطبيقات النسبة والتناسب (التقسيم التناسبي)',
            lessonNumber: 3,
            unitId: '1_middle_math_u1',
            unitTitle: 'الوحدة 1: النسبة والتناسب والعمليات على الأعداد',
            subtopics: ['تقسيم مقدار بنسبة معينة معلومة', 'مسائل الشركات وتوزيع الأرباح والخسائر', 'مسائل التركات وتوزيع الميراث']
          },
          {
            id: '1_middle_math_u1_l4',
            title: 'الدرس الرابع: تطبيقات النسبة المئوية والخصم والفائدة',
            lessonNumber: 4,
            unitId: '1_middle_math_u1',
            unitTitle: 'الوحدة 1: النسبة والتناسب والعمليات على الأعداد',
            subtopics: ['حساب النسبة المئوية لمقدار', 'حساب مقدار الخصم وسعر البيع بعد الخصم', 'الزيادة ومكسب التجارة والضريبة']
          },
          {
            id: '1_middle_math_u1_l5',
            title: 'الدرس الخامس: المجموعات والعمليات عليها',
            lessonNumber: 5,
            unitId: '1_middle_math_u1',
            unitTitle: 'الوحدة 1: النسبة والتناسب والعمليات على الأعداد',
            subtopics: ['التعبير عن المجموعة بطريقة السرد والصفة المميزة', 'الانتماء والاحتواء', 'التقاطع والاتحاد والفرق والمكملة']
          },
          {
            id: '1_middle_math_u1_l6',
            title: 'الدرس السادس: العمليات على الأعداد الصحيحة',
            lessonNumber: 6,
            unitId: '1_middle_math_u1',
            unitTitle: 'الوحدة 1: النسبة والتناسب والعمليات على الأعداد',
            subtopics: ['جمع وطرح الأعداد الصحيحة وخواصها', 'ضرب وقسمة الأعداد الصحيحة وقواعد الإشارات', 'الأسس المتكررة للأعداد الصحيحة']
          },
          {
            id: '1_middle_math_u1_l7',
            title: 'الدرس السابع: العمليات على الأعداد النسبية',
            lessonNumber: 7,
            unitId: '1_middle_math_u1',
            unitTitle: 'الوحدة 1: النسبة والتناسب والعمليات على الأعداد',
            subtopics: ['مفهوم العدد النسبي وشروطه', 'جمع وطرح وضرب وقسمة الأعداد النسبية', 'كثافة الأعداد النسبية']
          }
        ]
      },
      {
        id: '1_middle_math_u2',
        title: 'الوحدة 2: الجبر والمقادير والمعادلات',
        unitNumber: 2,
        lessons: [
          {
            id: '1_middle_math_u2_l1',
            title: 'الدرس الأول: التعبيرات والصيغ الرياضية وجمع وطرح الحدود الجبرية',
            lessonNumber: 1,
            unitId: '1_middle_math_u2',
            unitTitle: 'الوحدة 2: الجبر والمقادير والمعادلات',
            subtopics: ['الحد الجبري ومعامله ودرجته', 'الحدود الجبرية المتشابهة', 'جمع وطرح الحدود الجبرية المتشابهة']
          },
          {
            id: '1_middle_math_u2_l2',
            title: 'الدرس الثاني: جمع وطرح المقادير الجبرية',
            lessonNumber: 2,
            unitId: '1_middle_math_u2',
            unitTitle: 'الوحدة 2: الجبر والمقادير والمعادلات',
            subtopics: ['المقدار الجبري ودرجته', 'جمع المقادير الجبرية بالطريقة الأفقية والرأسية', 'طرح المقادير الجبرية وتغيير إشارات المطروح']
          },
          {
            id: '1_middle_math_u2_l3',
            title: 'الدرس الثالث: ضرب وقسمة الحدود والمقادير الجبرية',
            lessonNumber: 3,
            unitId: '1_middle_math_u2',
            unitTitle: 'الوحدة 2: الجبر والمقادير والمعادلات',
            subtopics: ['ضرب حد جبري في حد جبري آخر', 'ضرب حد جبري في مقدار جبري', 'ضرب مقدارين جبريين كل منهما من حدين وقسمة مقدار على حد']
          },
          {
            id: '1_middle_math_u2_l4',
            title: 'الدرس الرابع: المعادلات الخطية في متغير واحد',
            lessonNumber: 4,
            unitId: '1_middle_math_u2',
            unitTitle: 'الوحدة 2: الجبر والمقادير والمعادلات',
            subtopics: ['حل معادلات الدرجة الأولى في ط وص ون', 'خواص علاقة التساوي (الإضافة والحذف والضرب والقسمة)', 'مسائل لفظية وتطبيقات حياتية على المعادلات']
          }
        ]
      },
      {
        id: '1_middle_math_u3',
        title: 'الوحدة 3: الهندسة والقياس والمضلعات',
        unitNumber: 3,
        lessons: [
          {
            id: '1_middle_math_u3_l1',
            title: 'الدرس الأول: أنواع الزوايا والعلاقات بين الزوايا',
            lessonNumber: 1,
            unitId: '1_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والقياس والمضلعات',
            subtopics: ['القطعة المستقيمة والشعاع والخط المستقيم والزاوية', 'أنواع الزوايا (حادة، قائمة، منفرجة، مستقيمة، منعكسة)', 'الزوايا المتجاورة']
          },
          {
            id: '1_middle_math_u3_l2',
            title: 'الدرس الثاني: الزوايا المتتامة والمتكاملة والمتقابلة بالرأس',
            lessonNumber: 2,
            unitId: '1_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والقياس والمضلعات',
            subtopics: ['الزاويتان المتتامتان (مجموعهما 90°)', 'الزاويتان المتكاملتان (مجموعهما 180°)', 'الزاويتان المتقابلتان بالرأس والزوايا المتجمعة حول نقطة (360°)']
          },
          {
            id: '1_middle_math_u3_l3',
            title: 'الدرس الثالث: المثلث ونظريات الزوايا',
            lessonNumber: 3,
            unitId: '1_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والقياس والمضلعات',
            subtopics: ['مجموع قياسات الزوايا الداخلة للمثلث = 180°', 'الزاوية الخارجة للمثلث وقياسها', 'تصنيف المثلثات بالنسبة لأضلاعها وزواياها']
          },
          {
            id: '1_middle_math_u3_l4',
            title: 'الدرس الرابع: التوازي والعلاقات بين زوايا القاطع',
            lessonNumber: 4,
            unitId: '1_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والقياس والمضلعات',
            subtopics: ['المستقيمان المتوازيان وقاطع لهما', 'الزاويتان المتبادلتان والمتناظرتان والداخلتان', 'شروط توازي مستقيمين']
          },
          {
            id: '1_middle_math_u3_l5',
            title: 'الدرس الخامس: الأشكال الرباعية وخواص متوازي الأضلاع',
            lessonNumber: 5,
            unitId: '1_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والقياس والمضلعات',
            subtopics: ['مجموع قياسات الزوايا الداخلة للشكل الرباعي = 360°', 'تعريف متوازي الأضلاع وخواصه الأساسية', 'حساب الأطوال والزوايا المجهولة']
          },
          {
            id: '1_middle_math_u3_l6',
            title: 'الدرس السادس: الحالات الخاصة لمتوازي الأضلاع',
            lessonNumber: 6,
            unitId: '1_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والقياس والمضلعات',
            subtopics: ['المستطيل وخواصه وقطراه', 'المعين وخواصه ومحاور تماثله', 'المربع وخواصه الشاملة']
          },
          {
            id: '1_middle_math_u3_l7',
            title: 'الدرس السابع: المضلعات المنتظمة والمحدبة والمقعرة',
            lessonNumber: 7,
            unitId: '1_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والقياس والمضلعات',
            subtopics: ['مجموع قياسات الزوايا الداخلة لأي مضلع (ن - 2) × 180°', 'قياس زاوية المضلع المنتظم', 'مجموع قياسات الزوايا الخارجة لأي مضلع = 360°']
          },
          {
            id: '1_middle_math_u3_l8',
            title: 'الدرس الثامن: الإحداثيات والمستوى الإحداثي الثنائي',
            lessonNumber: 8,
            unitId: '1_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والقياس والمضلعات',
            subtopics: ['المستوى الإحداثي المتعامد والأرباع الأربعة', 'تحديد وتمثيل النقاط والأزواج المرتبة', 'رسم الأشكال الهندسية وإيجاد أطوال القطع الأفقية والرأسية']
          }
        ]
      },
      {
        id: '1_middle_math_u4',
        title: 'الوحدة 4: الإحصاء ومقاييس النزعة المركزية',
        unitNumber: 4,
        lessons: [
          {
            id: '1_middle_math_u4_l1',
            title: 'الدرس الأول: تنظيم وعرض البيانات ومخطط النقاط',
            lessonNumber: 1,
            unitId: '1_middle_math_u4',
            unitTitle: 'الوحدة 4: الإحصاء ومقاييس النزعة المركزية',
            subtopics: ['جمع البيانات وتنظيمها في جداول تفريغ', 'مخطط النقاط والمدرج التكراري', 'قراءة وتفسير المخططات البيانية']
          },
          {
            id: '1_middle_math_u4_l2',
            title: 'الدرس الثاني: مقاييس النزعة المركزية (المنوال والوسيط والربيعان)',
            lessonNumber: 2,
            unitId: '1_middle_math_u4',
            unitTitle: 'الوحدة 4: الإحصاء ومقاييس النزعة المركزية',
            subtopics: ['المنوال (القيمة الأكثر شيوعاً)', 'الوسيط لمجموعة قيم فردية وزوجية', 'الربيع الأدنى والربيع الأعلى ومخطط الصندوق']
          },
          {
            id: '1_middle_math_u4_l3',
            title: 'الدرس الثالث: الوسط الحسابي (المتوسط)',
            lessonNumber: 3,
            unitId: '1_middle_math_u4',
            unitTitle: 'الوحدة 4: الإحصاء ومقاييس النزعة المركزية',
            subtopics: ['قانون الوسط الحسابي = مجموع القيم / عددها', 'إيجاد القيمة المجهولة بمعلومية الوسط', 'تأثير القيم المتطرفة على الوسط والوسيط']
          },
          {
            id: '1_middle_math_u4_l4',
            title: 'الدرس الرابع: القطاعات الدائرية وتفسير البيانات',
            lessonNumber: 4,
            unitId: '1_middle_math_u4',
            unitTitle: 'الوحدة 4: الإحصاء ومقاييس النزعة المركزية',
            subtopics: ['حساب قياس الزاوية المركزية للقطاع = النسبة × 360°', 'تمثيل البيانات بالقطاعات الدائرية بالفرجار والمنقلة', 'تفسير وحل مسائل على القطاعات الدائرية']
          }
        ]
      }
    ]
  },

  // ─── 1_middle العلوم ────────────────────────────────────────────────────────
  {
    grade_level: '1_middle',
    subject_name: 'العلوم',
    file_name: 'العلوم.md',
    units: [
      {
        id: '1_middle_sci_u1',
        title: 'الوحدة 1: المادة وتركيب الذرة والجدول الدوري',
        unitNumber: 1,
        lessons: [
          {
            id: '1_middle_sci_u1_l1',
            title: 'الدرس الأول: تركيب الذرة ومكونات النواة ومستويات الطاقة',
            lessonNumber: 1,
            unitId: '1_middle_sci_u1',
            unitTitle: 'الوحدة 1: المادة وتركيب الذرة والجدول الدوري',
            subtopics: ['الجسيمات دون الذرية (البروتونات، النيوترونات، الإلكترونات)', 'العدد الذري والعدد الكتلي والنظائر', 'قواعد التوزيع الإلكتروني في مستويات الطاقة (K, L, M, N)']
          },
          {
            id: '1_middle_sci_u1_l2',
            title: 'الدرس الثاني: الجدول الدوري لتصنيف العناصر وتدرج الخواص',
            lessonNumber: 2,
            unitId: '1_middle_sci_u1',
            unitTitle: 'الوحدة 1: المادة وتركيب الذرة والجدول الدوري',
            subtopics: ['محاولات تصنيف العناصر (مندليف وموزلي والجدول الدوري الحديث)', 'الدورات والمجموعات وفئات الجدول (s, p, d, f)', 'تدرج الحجم الذري والسالبية الكهربية والخاصية الفلزية']
          },
          {
            id: '1_middle_sci_u1_l3',
            title: 'الدرس الثالث: الروابط الكيميائية وتكوين المركبات',
            lessonNumber: 3,
            unitId: '1_middle_sci_u1',
            unitTitle: 'الوحدة 1: المادة وتركيب الذرة والجدول الدوري',
            subtopics: ['الأيون الموجب والأيون السالب', 'الرابطة الأيونية وتكوين الأملاح', 'الرابطة التساهمية (أحادية، ثنائية، ثلاثية)']
          }
        ]
      },
      {
        id: '1_middle_sci_u2',
        title: 'الوحدة 2: مجالات القوى والكهربية والمغناطيسية',
        unitNumber: 2,
        lessons: [
          {
            id: '1_middle_sci_u2_l1',
            title: 'الدرس الأول: القوى الكهربية والمجال الكهربي والكهربية الساكنة',
            lessonNumber: 1,
            unitId: '1_middle_sci_u2',
            unitTitle: 'الوحدة 2: مجالات القوى والكهربية والمغناطيسية',
            subtopics: ['الشحنات الكهربية الساكنة وطرق الشحن (الدلك، اللمس، التأثير)', 'قانون التجاذب والتنافر للشحنات', 'مفهوم المجال الكهربي والكشاف الكهربي']
          },
          {
            id: '1_middle_sci_u2_l2',
            title: 'الدرس الثاني: القوى المغناطيسية والمجال المغناطيسي',
            lessonNumber: 2,
            unitId: '1_middle_sci_u2',
            unitTitle: 'الوحدة 2: مجالات القوى والكهربية والمغناطيسية',
            subtopics: ['المغناطيس الطبيعي والصناعي وقطبا المغناطيس', 'تخطيط خطوط المجال المغناطيسي بالبرادة والبوصلة', 'المغناطيس الكهربي واستخداماته التكنولوجية']
          },
          {
            id: '1_middle_sci_u2_l3',
            title: 'الدرس الثالث: قوى الجاذبية وحركة الأجسام في الفضاء',
            lessonNumber: 3,
            unitId: '1_middle_sci_u2',
            unitTitle: 'الوحدة 2: مجالات القوى والكهربية والمغناطيسية',
            subtopics: ['قانون الجذب العام لنيوتن', 'الكتلة والوزن وعجلة الجاذبية الأرضية', 'أثر الجاذبية على استقرار الكواكب والأقمار في مداراتها']
          }
        ]
      },
      {
        id: '1_middle_sci_u3',
        title: 'الوحدة 3: الكائنات الحية تركيبها وعملياتها',
        unitNumber: 3,
        lessons: [
          {
            id: '1_middle_sci_u3_l1',
            title: 'الدرس الأول: الكائنات وحيدة الخلية والكائنات عديدة الخلايا',
            lessonNumber: 1,
            unitId: '1_middle_sci_u3',
            unitTitle: 'الوحدة 3: الكائنات الحية تركيبها وعملياتها',
            subtopics: ['مقارنة بين الكائنات وحيدة الخلية وعديدة الخلايا', 'أمثلة (الأميبا، البراميسيوم، اليوجلينا)', 'الخلية كوحدة بناء ووظيفة']
          },
          {
            id: '1_middle_sci_u3_l2',
            title: 'الدرس الثاني: تمايز وتخصص الخلايا والأنسجة الحية',
            lessonNumber: 2,
            unitId: '1_middle_sci_u3',
            unitTitle: 'الوحدة 3: الكائنات الحية تركيبها وعملياتها',
            subtopics: ['تخصص الخلايا في النباتات (الخلايا البرنشيمية، الكولنشيمية، الإسكلرنشيمية)', 'تخصص الخلايا في الحيوان (الخلايا العصبية، العضلية، الدموية)', 'مستويات التعضي (خلية -> نسيج -> عضو -> جهاز)']
          },
          {
            id: '1_middle_sci_u3_l3',
            title: 'الدرس الثالث: العمليات الحيوية الأساسية في الكائنات الحية',
            lessonNumber: 3,
            unitId: '1_middle_sci_u3',
            unitTitle: 'الوحدة 3: الكائنات الحية تركيبها وعملياتها',
            subtopics: ['التغذية الذاتية وغير الذاتية', 'النقل والدوران في النبات والحيوان', 'الإخراج والتخلص من الفضلات الأيضية']
          }
        ]
      },
      {
        id: '1_middle_sci_u4',
        title: 'الوحدة 4: نظام الأرض - الشمس - القمر والفضاء',
        unitNumber: 4,
        lessons: [
          {
            id: '1_middle_sci_u4_l1',
            title: 'الدرس الأول: كواكب المجموعة الشمسية وخصائصها',
            lessonNumber: 1,
            unitId: '1_middle_sci_u4',
            unitTitle: 'الوحدة 4: نظام الأرض - الشمس - القمر والفضاء',
            subtopics: ['الكواكب الداخلية الصخرية (عطارد، الزهرة، الأرض، المريخ)', 'الكواكب الخارجية الغازية (المشتري، زحل، أورانوس، نبتون)', 'الشمس وخصائصها كمركز للمجموعة الشمسية']
          },
          {
            id: '1_middle_sci_u4_l2',
            title: 'الدرس الثاني: ظواهر نظام الأرض والشمس والقمر',
            lessonNumber: 2,
            unitId: '1_middle_sci_u4',
            unitTitle: 'الوحدة 4: نظام الأرض - الشمس - القمر والفضاء',
            subtopics: ['دوران الأرض حول محورها (تعاقب الليل والنهار)', 'دوران الأرض حول الشمس (تعاقب فصول السنة الأربعة)', 'أطوار القمر وظاهرتي كسوف الشمس وخسوف القمر']
          }
        ]
      }
    ]
  },

  // ─── 1_middle اللغة الإنجليزية ──────────────────────────────────────────────
  {
    grade_level: '1_middle',
    subject_name: 'اللغة الإنجليزية',
    file_name: 'اللغة الإنجليزية.md',
    units: [
      {
        id: '1_middle_eng_u1',
        title: 'Unit 1: My Digital Life (حياتي الرقمية)',
        unitNumber: 1,
        lessons: [
          {
            id: '1_middle_eng_u1_l1',
            title: 'Lesson 1: Digital Technology & Key Vocabulary',
            lessonNumber: 1,
            unitId: '1_middle_eng_u1',
            unitTitle: 'Unit 1: My Digital Life (حياتي الرقمية)',
            subtopics: ['Digital devices (smartphones, tablets, laptops)', 'Everyday technology terms & definitions', 'Collocations & word formation']
          },
          {
            id: '1_middle_eng_u1_l2',
            title: 'Lesson 2: Vocabulary in Context & Irregular Verbs',
            lessonNumber: 2,
            unitId: '1_middle_eng_u1',
            unitTitle: 'Unit 1: My Digital Life (حياتي الرقمية)',
            subtopics: ['Conjugation of common irregular verbs', 'Synonyms and antonyms', 'Prefixes and suffixes in tech terminology']
          },
          {
            id: '1_middle_eng_u1_l3',
            title: 'Lesson 3: Reading & Listening: Social Media and Apps',
            lessonNumber: 3,
            unitId: '1_middle_eng_u1',
            unitTitle: 'Unit 1: My Digital Life (حياتي الرقمية)',
            subtopics: ['Reading comprehension on modern communication', 'Listening to teens discussing online habits', 'Extracting specific details and main ideas']
          },
          {
            id: '1_middle_eng_u1_l4',
            title: 'Lesson 4: Grammar: Present Simple Tense & Adverbs of Frequency',
            lessonNumber: 4,
            unitId: '1_middle_eng_u1',
            unitTitle: 'Unit 1: My Digital Life (حياتي الرقمية)',
            subtopics: ['Present Simple form, negatives and question forms', 'Adverbs of frequency (always, usually, often, sometimes, never)', 'Describing digital daily routines']
          },
          {
            id: '1_middle_eng_u1_l5',
            title: 'Lessons 5 & 6: Speaking & Writing: Expressing Identity Online',
            lessonNumber: 5,
            unitId: '1_middle_eng_u1',
            unitTitle: 'Unit 1: My Digital Life (حياتي الرقمية)',
            subtopics: ['Speaking: Talking about favorite digital tools', 'Writing a paragraph about online safety rules', 'Unit review and language practice']
          }
        ]
      },
      {
        id: '1_middle_eng_u2',
        title: 'Unit 2: Learning to Learn (تعلم كيف تتعلم)',
        unitNumber: 2,
        lessons: [
          {
            id: '1_middle_eng_u2_l1',
            title: 'Lesson 1: Study Skills, Strategies & Mind Maps',
            lessonNumber: 1,
            unitId: '1_middle_eng_u2',
            unitTitle: 'Unit 2: Learning to Learn (تعلم كيف تتعلم)',
            subtopics: ['Effective revision methods and time management', 'Mind mapping and visual learning vocabulary', 'Understanding study schedules']
          },
          {
            id: '1_middle_eng_u2_l2',
            title: 'Lesson 2: Vocabulary & Grammar: Present Continuous Tense',
            lessonNumber: 2,
            unitId: '1_middle_eng_u2',
            unitTitle: 'Unit 2: Learning to Learn (تعلم كيف تتعلم)',
            subtopics: ['Present Continuous formation (am/is/are + verb-ing)', 'Action verbs vs. State verbs (know, understand, like)', 'Expressing actions happening now']
          },
          {
            id: '1_middle_eng_u2_l3',
            title: 'Lesson 3: Reading: Effective Learning Techniques',
            lessonNumber: 3,
            unitId: '1_middle_eng_u2',
            unitTitle: 'Unit 2: Learning to Learn (تعلم كيف تتعلم)',
            subtopics: ['Article: How successful students learn', 'Scanning for information and vocabulary in context', 'Summarizing short texts']
          },
          {
            id: '1_middle_eng_u2_l4',
            title: 'Lesson 4: Listening & Speaking: Problem Solving & Collaboration',
            lessonNumber: 4,
            unitId: '1_middle_eng_u2',
            unitTitle: 'Unit 2: Learning to Learn (تعلم كيف تتعلم)',
            subtopics: ['Dialogue: Discussing difficult school subjects', 'Giving advice on exam preparation', 'Group work and active listening phrases']
          },
          {
            id: '1_middle_eng_u2_l5',
            title: 'Lessons 5 & 6: Writing Skills & Study Planner Project',
            lessonNumber: 5,
            unitId: '1_middle_eng_u2',
            unitTitle: 'Unit 2: Learning to Learn (تعلم كيف تتعلم)',
            subtopics: ['Writing an email to a friend about study tips', 'Creating an organized weekly study schedule', 'Unit vocabulary and grammar review']
          }
        ]
      },
      {
        id: '1_middle_eng_u3',
        title: 'Unit 3: Role Models (القدوة والنماذج الإيجابية)',
        unitNumber: 3,
        lessons: [
          {
            id: '1_middle_eng_u3_l1',
            title: 'Lesson 1: Inspiring People and Everyday Heroes',
            lessonNumber: 1,
            unitId: '1_middle_eng_u3',
            unitTitle: 'Unit 3: Role Models (القدوة والنماذج الإيجابية)',
            subtopics: ['Personality adjectives (brave, generous, intelligent, hardworking)', 'Key biographical vocabulary', 'Describing admirable achievements']
          },
          {
            id: '1_middle_eng_u3_l2',
            title: 'Lesson 2: Vocabulary & Past Simple Tense',
            lessonNumber: 2,
            unitId: '1_middle_eng_u3',
            unitTitle: 'Unit 3: Role Models (القدوة والنماذج الإيجابية)',
            subtopics: ['Past Simple regular (-ed) and irregular verbs', 'Past time expressions (yesterday, ago, in 2020)', 'Forming past questions and negatives with did/did not']
          },
          {
            id: '1_middle_eng_u3_l3',
            title: 'Lesson 3: Reading & Listening: Egyptian and Global Role Models',
            lessonNumber: 3,
            unitId: '1_middle_eng_u3',
            unitTitle: 'Unit 3: Role Models (القدوة والنماذج الإيجابية)',
            subtopics: ['Biographical text: Famous Egyptian scientists and sports stars', 'Listening to an interview about a charitable hero', 'Comprehension questions and vocabulary analysis']
          },
          {
            id: '1_middle_eng_u3_l4',
            title: 'Lesson 4: Speaking: Describing Admired Personalities',
            lessonNumber: 4,
            unitId: '1_middle_eng_u3',
            unitTitle: 'Unit 3: Role Models (القدوة والنماذج الإيجابية)',
            subtopics: ['Expressing admiration and giving reasons (I admire ... because)', 'Presenting a brief speech about a family member or teacher', 'Pronunciation focus: regular past endings (-ed)']
          },
          {
            id: '1_middle_eng_u3_l5',
            title: 'Lessons 5 & 6: Writing a Short Biography & Unit Project',
            lessonNumber: 5,
            unitId: '1_middle_eng_u3',
            unitTitle: 'Unit 3: Role Models (القدوة والنماذج الإيجابية)',
            subtopics: ['Structure of a biography (early life, achievements, legacy)', 'Writing a biography of an Egyptian role model', 'Consolidation exercises and review test']
          }
        ]
      },
      {
        id: '1_middle_eng_u4',
        title: 'Unit 4: Taking Care (العناية بالصحة والبيئة)',
        unitNumber: 4,
        lessons: [
          {
            id: '1_middle_eng_u4_l1',
            title: 'Lesson 1: Healthy Habits and Balanced Nutrition',
            lessonNumber: 1,
            unitId: '1_middle_eng_u4',
            unitTitle: 'Unit 4: Taking Care (العناية بالصحة والبيئة)',
            subtopics: ['Food groups and healthy lifestyle vocabulary', 'Countable and uncountable food nouns', 'Expressions of quantity (much, many, a lot of, a few, a little)']
          },
          {
            id: '1_middle_eng_u4_l2',
            title: 'Lesson 2: Vocabulary & Modal Verbs for Advice and Rules',
            lessonNumber: 2,
            unitId: '1_middle_eng_u4',
            unitTitle: 'Unit 4: Taking Care (العناية بالصحة والبيئة)',
            subtopics: ['Giving advice with Should / Shouldn\'t', 'Obligation and necessity with Must / Mustn\'t and Have to', 'Health and safety signage vocabulary']
          },
          {
            id: '1_middle_eng_u4_l3',
            title: 'Lesson 3: Reading: Environmental Care & Recycling',
            lessonNumber: 3,
            unitId: '1_middle_eng_u4',
            unitTitle: 'Unit 4: Taking Care (العناية بالصحة والبيئة)',
            subtopics: ['Article: Protecting local wildlife and nature reserves', 'Recycling plastic, paper, and saving energy', 'Reading for cause and effect']
          },
          {
            id: '1_middle_eng_u4_l4',
            title: 'Lesson 4: Listening & Speaking: Doctor Visits and Daily Wellness',
            lessonNumber: 4,
            unitId: '1_middle_eng_u4',
            unitTitle: 'Unit 4: Taking Care (العناية بالصحة والبيئة)',
            subtopics: ['Dialogue: At the clinic / explaining symptoms', 'Asking for and offering assistance', 'Role-playing healthy living conversations']
          },
          {
            id: '1_middle_eng_u4_l5',
            title: 'Lessons 5 & 6: Writing a Healthy Living Guide & Unit Review',
            lessonNumber: 5,
            unitId: '1_middle_eng_u4',
            unitTitle: 'Unit 4: Taking Care (العناية بالصحة والبيئة)',
            subtopics: ['Writing a pamphlet about maintaining physical health and green habits', 'Using bullet points and clear imperative instructions', 'Unit language assessment']
          }
        ]
      },
      {
        id: '1_middle_eng_u5',
        title: 'Unit 5: Making Good Decisions (اتخاذ القرارات السليمة)',
        unitNumber: 5,
        lessons: [
          {
            id: '1_middle_eng_u5_l1',
            title: 'Lesson 1: Smart Choices and Critical Thinking',
            lessonNumber: 1,
            unitId: '1_middle_eng_u5',
            unitTitle: 'Unit 5: Making Good Decisions (اتخاذ القرارات السليمة)',
            subtopics: ['Decision-making verbs and collocations (weigh options, make up mind)', 'Evaluating pros and cons vocabulary', 'Real-life ethical dilemma scenarios']
          },
          {
            id: '1_middle_eng_u5_l2',
            title: 'Lesson 2: Vocabulary & First Conditional Sentences',
            lessonNumber: 2,
            unitId: '1_middle_eng_u5',
            unitTitle: 'Unit 5: Making Good Decisions (اتخاذ القرارات السليمة)',
            subtopics: ['First conditional structure (If + present simple, will + infinitive)', 'Predicting outcomes of actions', 'Questions in first conditional']
          },
          {
            id: '1_middle_eng_u5_l3',
            title: 'Lesson 3: Reading: Stories of Wise Choices',
            lessonNumber: 3,
            unitId: '1_middle_eng_u5',
            unitTitle: 'Unit 5: Making Good Decisions (اتخاذ القرارات السليمة)',
            subtopics: ['Reading a narrative about overcoming a tough dilemma', 'Analyzing characters\' motivations and outcomes', 'Inferring implied meanings']
          },
          {
            id: '1_middle_eng_u5_l4',
            title: 'Lesson 4: Speaking & Debating Daily Choices',
            lessonNumber: 4,
            unitId: '1_middle_eng_u5',
            unitTitle: 'Unit 5: Making Good Decisions (اتخاذ القرارات السليمة)',
            subtopics: ['Phrases for expressing and justifying opinions (In my view, I think that)', 'Agreeing and politely disagreeing in a class debate', 'Reaching a consensus in group tasks']
          },
          {
            id: '1_middle_eng_u5_l5',
            title: 'Lessons 5 & 6: Writing an Opinion Article & Term Review',
            lessonNumber: 5,
            unitId: '1_middle_eng_u5',
            unitTitle: 'Unit 5: Making Good Decisions (اتخاذ القرارات السليمة)',
            subtopics: ['Structuring an opinion paragraph (topic sentence, evidence, conclusion)', 'Using connectors of cause and result (because, therefore, as a result)', 'Comprehensive term exam review']
          }
        ]
      }
    ]
  },

  // ─── 1_middle اللغة العربية ────────────────────────────────────────────────
  {
    grade_level: '1_middle',
    subject_name: 'اللغة العربية',
    file_name: 'اللغة العربية.md',
    units: [
      {
        id: '1_middle_ar_u1',
        title: 'الوحدة 1: أنا مصريٌّ (الهوية والانتماء)',
        unitNumber: 1,
        lessons: [
          {
            id: '1_middle_ar_u1_l1',
            title: 'الدرس الأول: نص الاستماع (الهوية والانتماء الوطني)',
            lessonNumber: 1,
            unitId: '1_middle_ar_u1',
            unitTitle: 'الوحدة 1: أنا مصريٌّ (الهوية والانتماء)',
            subtopics: ['الاستماع والتفاعل مع النص المسموع', 'مفهوم المواطنة والاعتزاز بالتراث المصري', 'استخلاص الفكر الرئيسة والفرعية']
          },
          {
            id: '1_middle_ar_u1_l2',
            title: 'الدرس الثاني: نص القراءة (مصر مهد الحضارات والأصالة)',
            lessonNumber: 2,
            unitId: '1_middle_ar_u1',
            unitTitle: 'الوحدة 1: أنا مصريٌّ (الهوية والانتماء)',
            subtopics: ['قراءة النص قراءة جهرية معبرة', 'معاني المفردات والسياقات المتعددة والمضاد والجمع', 'الفهم والاستيعاب والأسئلة التحليلية']
          },
          {
            id: '1_middle_ar_u1_l3',
            title: 'الدرس الثالث: النص الشعري (في حب مصر)',
            lessonNumber: 3,
            unitId: '1_middle_ar_u1',
            unitTitle: 'الوحدة 1: أنا مصريٌّ (الهوية والانتماء)',
            subtopics: ['شرح الأبيات الشعرية ومقاصد الشاعر', 'مواطن الجمال والتصوير البلاغي', 'الأساليب الإنشائية والخبرية ودلالاتها']
          },
          {
            id: '1_middle_ar_u1_l4',
            title: 'الدرس الرابع: النحو (المعرب والمبني من الأسماء وعلامات الإعراب)',
            lessonNumber: 4,
            unitId: '1_middle_ar_u1',
            unitTitle: 'الوحدة 1: أنا مصريٌّ (الهوية والانتماء)',
            subtopics: ['تعريف المعرب والمبني والفرق بينهما', 'الأسماء المبنية (الضمائر، أسماء الإشارة، الأسماء الموصولة، أسماء الاستفهام، أسماء الشرط، بعض الظروف)', 'علامات الإعراب الأصلية والفرعية للأسماء']
          },
          {
            id: '1_middle_ar_u1_l5',
            title: 'الدرس الخامس: الإملاء والتعبير الكتابي (كتابة فقرة ومقال وصفي)',
            lessonNumber: 5,
            unitId: '1_middle_ar_u1',
            unitTitle: 'الوحدة 1: أنا مصريٌّ (الهوية والانتماء)',
            subtopics: ['قواعد همزة الوصل وهمزة القطع', 'عناصر كتابة الفقرة والمقال الوصفي المتكامل', 'علامات الترقيم وتطبيقها الصحيح']
          }
        ]
      },
      {
        id: '1_middle_ar_u2',
        title: 'الوحدة 2: أَصْنَعُ مُسْتَقْبَلِي (العمل والاجتهاد)',
        unitNumber: 2,
        lessons: [
          {
            id: '1_middle_ar_u2_l1',
            title: 'الدرس الأول: نص الاستماع (التخطيط للمستقبل وقيمة الوقت)',
            lessonNumber: 1,
            unitId: '1_middle_ar_u2',
            unitTitle: 'الوحدة 2: أَصْنَعُ مُسْتَقْبَلِي (العمل والاجتهاد)',
            subtopics: ['أهمية إدارة الوقت والتخطيط للأهداف', 'استنتاج العبر والرسائل التربوية من النص المسموع', 'مناقشة مهارات النجاح وصناعة المستقبل']
          },
          {
            id: '1_middle_ar_u2_l2',
            title: 'الدرس الثاني: نص القراءة (رواد الأعمال وبناء المستقبل)',
            lessonNumber: 2,
            unitId: '1_middle_ar_u2',
            unitTitle: 'الوحدة 2: أَصْنَعُ مُسْتَقْبَلِي (العمل والاجتهاد)',
            subtopics: ['نماذج مصرية ناجحة في الابتكار والريادة', 'تحليل المفردات والتراكيب اللغوية', 'الفكر الرئيسة والفرعية ونقد الأفكار']
          },
          {
            id: '1_middle_ar_u2_l3',
            title: 'الدرس الثالث: النص الشعري (العمل والأمل)',
            lessonNumber: 3,
            unitId: '1_middle_ar_u2',
            unitTitle: 'الوحدة 2: أَصْنَعُ مُسْتَقْبَلِي (العمل والاجتهاد)',
            subtopics: ['الأفكار الرئيسة للأبيات ومكانة العمل في رفعة الأمم', 'الجماليات والتعبيرات البلاغية والترادف والتضاد', 'الإيقاع الموسيقي والقافية']
          },
          {
            id: '1_middle_ar_u2_l4',
            title: 'الدرس الرابع: النحو (الفعل اللازم والفعل المتعدي والمبني للمجهول)',
            lessonNumber: 4,
            unitId: '1_middle_ar_u2',
            unitTitle: 'الوحدة 2: أَصْنَعُ مُسْتَقْبَلِي (العمل والاجتهاد)',
            subtopics: ['الفعل اللازم والفعل المتعدي لمفعول به واحد أو أكثر', 'بناء الفعل الماضي والمضارع للمجهول', 'إعراب نائب الفاعل وعلامات رفعه']
          },
          {
            id: '1_middle_ar_u2_l5',
            title: 'الدرس الخامس: التعبير الكتابي (كتابة سيرة غيرية ورسالة رسمية)',
            lessonNumber: 5,
            unitId: '1_middle_ar_u2',
            unitTitle: 'الوحدة 2: أَصْنَعُ مُسْتَقْبَلِي (العمل والاجتهاد)',
            subtopics: ['خطوات كتابة السيرة الغيرية لشخصية ملهمة', 'عناصر الرسالة الرسمية والودية', 'قواعد كتابة الألف اللينة في أواخر الكلمات']
          }
        ]
      },
      {
        id: '1_middle_ar_u3',
        title: 'الوحدة 3: مواقف إنسانية (القيم والأخلاق النبيلة)',
        unitNumber: 3,
        lessons: [
          {
            id: '1_middle_ar_u3_l1',
            title: 'الدرس الأول: نص الاستماع (التعاطف والتكافل الإنساني)',
            lessonNumber: 1,
            unitId: '1_middle_ar_u3',
            unitTitle: 'الوحدة 3: مواقف إنسانية (القيم والأخلاق النبيلة)',
            subtopics: ['الاستماع وتحليل المواقف الإنسانية النبيلة', 'قيم العطاء ومساعدة الضعفاء والمحتاجين', 'استخلاص الدروس المستفادة وتطبيقها في الحياة']
          },
          {
            id: '1_middle_ar_u3_l2',
            title: 'الدرس الثاني: نص القراءة (قصص من التراث الإنساني الخالد)',
            lessonNumber: 2,
            unitId: '1_middle_ar_u3',
            unitTitle: 'الوحدة 3: مواقف إنسانية (القيم والأخلاق النبيلة)',
            subtopics: ['قراءة وتحليل القصة الأدبية وعناصرها (الشخصيات، العقدة، الحل)', 'قاموس المفردات اللغوية والتعبيرات التراثية', 'استنباط القيم والمغزى الأخلاقي للقصة']
          },
          {
            id: '1_middle_ar_u3_l3',
            title: 'الدرس الثالث: النص الشعري (مكارم الأخلاق والقيم الإنسانية)',
            lessonNumber: 3,
            unitId: '1_middle_ar_u3',
            unitTitle: 'الوحدة 3: مواقف إنسانية (القيم والأخلاق النبيلة)',
            subtopics: ['شرح النص واستيعاب معانيه الإنسانية السامية', 'الصور الجمالية والتشبيهات البلاغية البديعة', 'دلالات الألفاظ واستخدام المحسنات البديعية']
          },
          {
            id: '1_middle_ar_u3_l4',
            title: 'الدرس الرابع: النحو (ظن وأخواتها والأفعال المتعدية لمفعولين)',
            lessonNumber: 4,
            unitId: '1_middle_ar_u3',
            unitTitle: 'الوحدة 3: مواقف إنسانية (القيم والأخلاق النبيلة)',
            subtopics: ['أفعال الرجحان واليقين والتحويل (ظن، حسب، زعم، خال، علم، وجد، رأى، جعل)', 'الأفعال المتعدية لمفعولين ليس أصلهما المبتدأ والخبر (أعطى، منح، منع، كسا، ألبس)', 'الضمائر المتصلة والمنفصلة وإعرابها']
          },
          {
            id: '1_middle_ar_u3_l5',
            title: 'الدرس الخامس: التعبير والمراجعة الشاملة لقواعد الفصل الدراسي',
            lessonNumber: 5,
            unitId: '1_middle_ar_u3',
            unitTitle: 'الوحدة 3: مواقف إنسانية (القيم والأخلاق النبيلة)',
            subtopics: ['كتابة مقال إنساني عن التعاون والتسامح', 'مراجعة شاملة لجميع دروس النحو المقررة', 'تدريبات ونماذج امتحانات شاملة']
          }
        ]
      }
    ]
  },

  // =========================================================================
  // 2_middle (الصف الثاني الإعدادي)
  // =========================================================================
  {
    grade_level: '2_middle',
    subject_name: 'الدراسات الإجتماعية',
    file_name: 'الدراسات الإجتماعية.md',
    units: [
      {
        id: '2_middle_soc_u1',
        title: 'الوحدة 1: المفاهيم الجغرافية وسكان العالم والبيئة',
        unitNumber: 1,
        lessons: [
          {
            id: '2_middle_soc_u1_l1',
            title: 'الدرس الأول: أهم المفاهيم الجغرافية وموقع قارتي آسيا وأوروبا ومظاهر سطحهما',
            lessonNumber: 1,
            unitId: '2_middle_soc_u1',
            unitTitle: 'الوحدة 1: المفاهيم الجغرافية وسكان العالم والبيئة',
            subtopics: ['الموقع الجغرافي والفلكي لقارتي آسيا وأوروبا', 'أهم السلاسل الجبلية والهضاب والسهول الفيضية والساحلية', 'الممرات المائية والمضايق الاستراتيجية']
          },
          {
            id: '2_middle_soc_u1_l2',
            title: 'الدرس الثاني: المناخ والأقاليم المناخية والنبات الطبيعي والتنوع البيولوجي',
            lessonNumber: 2,
            unitId: '2_middle_soc_u1',
            unitTitle: 'الوحدة 1: المفاهيم الجغرافية وسكان العالم والبيئة',
            subtopics: ['الأقاليم الحارة والمعتدلة والباردة في قارات العالم', 'العوامل الجغرافية المؤثرة في درجات الحرارة والأمطار', 'توزيع الغابات والمراعي والتنوع البيولوجي النباتي والحيواني']
          },
          {
            id: '2_middle_soc_u1_l3',
            title: 'الدرس الثالث: المعادن ومصادر الطاقة والتعدين في آسيا وأوروبا',
            lessonNumber: 3,
            unitId: '2_middle_soc_u1',
            unitTitle: 'الوحدة 1: المفاهيم الجغرافية وسكان العالم والبيئة',
            subtopics: ['أهم الثروات المعدنية (الحديد، النحاس، البوكسيت، الذهب)', 'مصادر الطاقة غير المتجددة (البترول، الغاز الطبيعي، الفحم)', 'التحول نحو الطاقة النظيفة والمتجددة']
          },
          {
            id: '2_middle_soc_u1_l4',
            title: 'الدرس الرابع: الموارد الطبيعية والتنمية المستدامة والنظام البيئي',
            lessonNumber: 4,
            unitId: '2_middle_soc_u1',
            unitTitle: 'الوحدة 1: المفاهيم الجغرافية وسكان العالم والبيئة',
            subtopics: ['مفهوم النظام البيئي ومكوناته الحية وغير الحية', 'التوازن البيئي وأسباب حدوث الخلل البيئي', 'استراتيجيات التنمية المستدامة والحفاظ على الموارد للأجيال القادمة']
          }
        ]
      },
      {
        id: '2_middle_soc_u2',
        title: 'الوحدة 2: الحضارات القديمة في قارة آسيا وعلاقتها بمصر',
        unitNumber: 2,
        lessons: [
          {
            id: '2_middle_soc_u2_l1',
            title: 'الدرس الأول: نماذج للحضارات القديمة بالشرق الأدنى (بلاد الرافدين وفينيقيا)',
            lessonNumber: 1,
            unitId: '2_middle_soc_u2',
            unitTitle: 'الوحدة 2: الحضارات القديمة في قارة آسيا وعلاقتها بمصر',
            subtopics: ['حضارة بلاد ما بين النهرين (السومرية، البابلية، الآشورية)', 'قوانين حمورابي والكتابة المسمارية', 'الحضارة الفينيقية والتجارة البحرية واختراع الأبجدية']
          },
          {
            id: '2_middle_soc_u2_l2',
            title: 'الدرس الثاني: نماذج لحضارات بلاد اليمن القديم',
            lessonNumber: 2,
            unitId: '2_middle_soc_u2',
            unitTitle: 'الوحدة 2: الحضارات القديمة في قارة آسيا وعلاقتها بمصر',
            subtopics: ['ممالك اليمن القديمة (سبأ، معين، حمير)', 'سد مأرب وأهميته الاقتصادية والزراعية', 'طرق التجارة العالمية القديمة (طريق البخور)']
          },
          {
            id: '2_middle_soc_u2_l3',
            title: 'الدرس الثالث: نماذج للحضارات القديمة بالشرق الأقصى (الهند والصين القديمة)',
            lessonNumber: 3,
            unitId: '2_middle_soc_u2',
            unitTitle: 'الوحدة 2: الحضارات القديمة في قارة آسيا وعلاقتها بمصر',
            subtopics: ['حضارة وادي السند والهند القديمة وإسهاماتها الفكرية والعلمية', 'حضارة الصين القديمة، سور الصين العظيم، وطريق الحرير', 'العلوم والآداب والفلسفة الشرقية القديمة']
          },
          {
            id: '2_middle_soc_u2_l4',
            title: 'الدرس الرابع: العلاقات التاريخية والحضارية والتجارية مع مصر',
            lessonNumber: 4,
            unitId: '2_middle_soc_u2',
            unitTitle: 'الوحدة 2: الحضارات القديمة في قارة آسيا وعلاقتها بمصر',
            subtopics: ['معاهدات السلام والتحالفات السياسية القديمة (معاهدة قادش)', 'التبادل التجاري والسلع المتبادلة بين مصر وآسيا', 'التأثير الفني والمعماري المتبادل']
          }
        ]
      },
      {
        id: '2_middle_soc_u3',
        title: 'الوحدة 3: عصور الخلافة الإسلامية والدول المستقلة',
        unitNumber: 3,
        lessons: [
          {
            id: '2_middle_soc_u3_l1',
            title: 'الدرس الأول: نشأة الدولة الإسلامية وتأسيس الخلافة الراشدة',
            lessonNumber: 1,
            unitId: '2_middle_soc_u3',
            unitTitle: 'الوحدة 3: عصور الخلافة الإسلامية والدول المستقلة',
            subtopics: ['الخلفاء الراشدون وأسس نظام الشورى والعدالة', 'الفتوحات الإسلامية الكبرى ونشر راية الإسلام', 'فتح مصر وتأسيس مدينة الفسطاط']
          },
          {
            id: '2_middle_soc_u3_l2',
            title: 'الدرس الثاني: الدولة الأموية وأهم خلفائها وإنجازاتها',
            lessonNumber: 2,
            unitId: '2_middle_soc_u3',
            unitTitle: 'الوحدة 3: عصور الخلافة الإسلامية والدول المستقلة',
            subtopics: ['تأسيس الدولة الأموية وأبرز الخلفاء (معاوية، عبد الملك، الوليد، عمر بن عبد العزيز)', 'حركة التعريب وسك العملة وبناء المسجد الأموي وقبة الصخرة', 'امتداد رقعة الدولة الإسلامية من الأندلس غرباً حتى السند شرقاً']
          },
          {
            id: '2_middle_soc_u3_l3',
            title: 'الدرس الثالث: الدولة العباسية والنهضة العلمية والثقافية',
            lessonNumber: 3,
            unitId: '2_middle_soc_u3',
            unitTitle: 'الوحدة 3: عصور الخلافة الإسلامية والدول المستقلة',
            subtopics: ['العصر العباسي الأول (عصر القوة والازدهار) والعصر العباسي الثاني', 'بيت الحكمة ببغداد وحركة الترجمة الكبرى', 'إسهامات علماء المسلمين في الطب والفلك والرياضيات والفيزياء']
          },
          {
            id: '2_middle_soc_u3_l4',
            title: 'الدرس الرابع: الدول المستقلة في مصر ودورها التاريخي',
            lessonNumber: 4,
            unitId: '2_middle_soc_u3',
            unitTitle: 'الوحدة 3: عصور الخلافة الإسلامية والدول المستقلة',
            subtopics: ['الدولة الطولونية والإخشيدية', 'الدولة الفاطمية وتأسيس مدينة القاهرة وبناء الأزهر الشريف', 'الدولة الأيوبية وصلاح الدين الأيوبي ومعركة حطين', 'دولة المماليك والتصدي للمغول في معركة عين جالوت وللصليبيين']
          },
          {
            id: '2_middle_soc_u3_l5',
            title: 'الدرس الخامس: روائع الحضارة الإسلامية في النظام السياسي والاجتماعي والفنون',
            lessonNumber: 5,
            unitId: '2_middle_soc_u3',
            unitTitle: 'الوحدة 3: عصور الخلافة الإسلامية والدول المستقلة',
            subtopics: ['النظام الإداري والقضائي والمالي في الدولة الإسلامية', 'المؤسسات التعليمية والمكتبات والبيمارستانات', 'العمارة والزخرفة الإسلامية والأرابيسك والخط العربي']
          }
        ]
      }
    ]
  },

  // ─── 2_middle الرياضيات ─────────────────────────────────────────────────────
  {
    grade_level: '2_middle',
    subject_name: 'الرياضيات',
    file_name: 'الرياضيات.md',
    units: [
      {
        id: '2_middle_math_u1',
        title: 'الوحدة 1: الأعداد الحقيقية والعمليات عليها والفترات',
        unitNumber: 1,
        lessons: [
          {
            id: '2_middle_math_u1_l1',
            title: 'الدرس الأول: مجموعة الأعداد الحقيقية والتمثيل على خط الأعداد',
            lessonNumber: 1,
            unitId: '2_middle_math_u1',
            unitTitle: 'الوحدة 1: الأعداد الحقيقية والعمليات عليها والفترات',
            subtopics: ['الأعداد غير النسبية (الجذور الصامتة والنسبة التقريبية π والنسبة الذهبية)', 'اتحاد الأعداد النسبية وغير النسبية لتكوين مجموعة الأعداد الحقيقية ح', 'تمثيل الأعداد الحقيقية هندسياً على خط الأعداد ومقارنتها']
          },
          {
            id: '2_middle_math_u1_l2',
            title: 'الدرس الثاني: الفترات المحدودة وغير المحدودة والعمليات عليها',
            lessonNumber: 2,
            unitId: '2_middle_math_u1',
            unitTitle: 'الوحدة 1: الأعداد الحقيقية والعمليات عليها والفترات',
            subtopics: ['الفترات المغلقة والمفتوحة ونصف المفتوحة', 'الفترات غير المحدودة (مع المالانهاية الموجبة والسالبة)', 'العمليات على الفترات (الاتحاد، التقاطع، الفرق، المكملة) على خط الأعداد']
          },
          {
            id: '2_middle_math_u1_l3',
            title: 'الدرس الثالث: العمليات على الأعداد الحقيقية وخواصها',
            lessonNumber: 3,
            unitId: '2_middle_math_u1',
            unitTitle: 'الوحدة 1: الأعداد الحقيقية والعمليات عليها والفترات',
            subtopics: ['خواص جمع وضرب الأعداد الحقيقية (الانغلاق، الإبدال، الدمج، المحايد، المعكوس)', 'خاصية توزيع الضرب على الجمع', 'تبسيط المقادير العددية التي تتضمن جذوراً']
          },
          {
            id: '2_middle_math_u1_l4',
            title: 'الدرس الرابع: قوانين الجذور التربيعية والتكعيبية وإنطاق المقام',
            lessonNumber: 4,
            unitId: '2_middle_math_u1',
            unitTitle: 'الوحدة 1: الأعداد الحقيقية والعمليات عليها والفترات',
            subtopics: ['قوانين العمليات على الجذور التربيعية والتكعيبية', 'جعل المقام عدداً صحيحاً (إنطاق المقام والضرب في المرافق)', 'العددان المترافقان وحاصل ضربهما ومجموعهما']
          },
          {
            id: '2_middle_math_u1_l5',
            title: 'الدرس الخامس: قوانين الأسس والعمليات على الأسس في ح',
            lessonNumber: 5,
            unitId: '2_middle_math_u1',
            unitTitle: 'الوحدة 1: الأعداد الحقيقية والعمليات عليها والفترات',
            subtopics: ['الأسس الصحيحة غير السالبة والسالبة', 'قوانين ضرب وقسمة ورفع القوى ذات الأساسات المتشابهة', 'الأسس الكسرية والجذور النونية']
          },
          {
            id: '2_middle_math_u1_l6',
            title: 'الدرس السادس: حل المعادلات والمتباينات من الدرجة الأولى في ح',
            lessonNumber: 6,
            unitId: '2_middle_math_u1',
            unitTitle: 'الوحدة 1: الأعداد الحقيقية والعمليات عليها والفترات',
            subtopics: ['حل معادلات الدرجة الأولى في ح', 'حل المتباينات الخطية في ح وتمثيل مجموعة الحل على خط الأعداد كفترة', 'مسائل وتطبيقات حياتية']
          }
        ]
      },
      {
        id: '2_middle_math_u2',
        title: 'الوحدة 2: المقادير الجبرية والتحليل وحل المعادلات',
        unitNumber: 2,
        lessons: [
          {
            id: '2_middle_math_u2_l1',
            title: 'الدرس الأول: التحليل بإخراج العامل المشترك الأكبر (ع.م.أ)',
            lessonNumber: 1,
            unitId: '2_middle_math_u2',
            unitTitle: 'الوحدة 2: المقادير الجبرية والتحليل وحل المعادلات',
            subtopics: ['تحديد العامل المشترك العددي والرمزي للمقدار', 'إخراج العامل المشترك وتبسيط الناتج', 'التحليل الكامل للمقدار']
          },
          {
            id: '2_middle_math_u2_l2',
            title: 'الدرس الثاني: تحليل المقدار الثلاثي البسيط وغير البسيط',
            lessonNumber: 2,
            unitId: '2_middle_math_u2',
            unitTitle: 'الوحدة 2: المقادير الجبرية والتحليل وحل المعادلات',
            subtopics: ['تحليل المقدار الثلاثي على صورة س² + ب س + جـ', 'تحليل المقدار الثلاثي غير البسيط أ س² + ب س + جـ (بطريقة المقص أو التجميع)', 'قواعد الإشارات عند التحليل']
          },
          {
            id: '2_middle_math_u2_l3',
            title: 'الدرس الثالث: تحليل المقدار الثلاثي المربع الكامل',
            lessonNumber: 3,
            unitId: '2_middle_math_u2',
            unitTitle: 'الوحدة 2: المقادير الجبرية والتحليل وحل المعادلات',
            subtopics: ['شروط المقدار الثلاثي المربع الكامل', 'إيجاد الحد الناقص (الأول، الأوسط، الأخير)', 'قاعدة تحليل المربع الكامل: (جذر الأول ± جذر الثالث)²']
          },
          {
            id: '2_middle_math_u2_l4',
            title: 'الدرس الرابع: تحليل الفرق بين مربعين',
            lessonNumber: 4,
            unitId: '2_middle_math_u2',
            unitTitle: 'الوحدة 2: المقادير الجبرية والتحليل وحل المعادلات',
            subtopics: ['صورة الفرق بين مربعين: س² - ص² = (س - ص)(س + ص)', 'استخدام التحليل في الحساب العقلي السريع', 'التحليل التكراري للمقادير']
          },
          {
            id: '2_middle_math_u2_l5',
            title: 'الدرس الخامس: تحليل مجموع المكعبين والفرق بينهما',
            lessonNumber: 5,
            unitId: '2_middle_math_u2',
            unitTitle: 'الوحدة 2: المقادير الجبرية والتحليل وحل المعادلات',
            subtopics: ['قاعدة القوس الصغير والقوس الكبير: س³ ± ص³ = (س ± ص)(س² ∓ س ص + ص²)', 'تطبيق القاعدة على الحدود الجبرية والأعداد', 'تحليل المقادير المركبة']
          },
          {
            id: '2_middle_math_u2_l6',
            title: 'الدرس السادس: التحليل بالتقسيم وإكمال المربع',
            lessonNumber: 6,
            unitId: '2_middle_math_u2',
            unitTitle: 'الوحدة 2: المقادير الجبرية والتحليل وحل المعادلات',
            subtopics: ['تحليل المقدار الرباعي بالتقسيم (2 + 2 أو 3 + 1)', 'تحليل المقدار بإكمال المربع', 'إخراج العامل المشترك بعد التقسيم']
          },
          {
            id: '2_middle_math_u2_l7',
            title: 'الدرس السابع: حل معادلات الدرجة الثانية في متغير واحد بالتحليل',
            lessonNumber: 7,
            unitId: '2_middle_math_u2',
            unitTitle: 'الوحدة 2: المقادير الجبرية والتحليل وحل المعادلات',
            subtopics: ['خاصية إذا كان أ × ب = 0 فإن أ = 0 أو ب = 0', 'خطوات حل المعادلة التربيعية جبرياً بالتحليل في ح', 'مسائل لفظية وتطبيقات هندسية وحياتية']
          }
        ]
      },
      {
        id: '2_middle_math_u3',
        title: 'الوحدة 3: الهندسة والمساحات والتشابه والنظريات الهندسية',
        unitNumber: 3,
        lessons: [
          {
            id: '2_middle_math_u3_l1',
            title: 'الدرس الأول: تساوي مساحتي متوازيي أضلاع وتساوي مساحتي مثلثين',
            lessonNumber: 1,
            unitId: '2_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والمساحات والتشابه والنظريات الهندسية',
            subtopics: ['نظرية تساوي مساحتي متوازيي الأضلاع المشتركين في قاعدة ومحصورين بين مستقيمين متوازيين', 'نظرية تساوي مساحتي المثلثين المشتركين في قاعدة', 'متوسط المثلث يقسم سطحه إلى مثلثين متساويين في المساحة']
          },
          {
            id: '2_middle_math_u3_l2',
            title: 'الدرس الثاني: مساحات بعض الأشكال الهندسية',
            lessonNumber: 2,
            unitId: '2_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والمساحات والتشابه والنظريات الهندسية',
            subtopics: ['مساحة المعين بدلالة طول قطريه = ½ × حاصل ضرب القطرين', 'مساحة المربع بدلالة طول قطره', 'مساحة شبه المنحرف بدلالة القاعدتين المتوازيتين والقاعدة المتوسطة والارتفاع']
          },
          {
            id: '2_middle_math_u3_l3',
            title: 'الدرس الثالث: تشابه المضلعات وتشابه المثلثات',
            lessonNumber: 3,
            unitId: '2_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والمساحات والتشابه والنظريات الهندسية',
            subtopics: ['شروط تشابه مضلعين (تناسب الأضلاع وتساوي الزوايا)', 'معامل التشابه (نسبة التكبير والتصغير والتطابق)', 'حالات تشابه المثلثات وتطبيقاتها لحساب الأطوال والارتفاعات']
          },
          {
            id: '2_middle_math_u3_l4',
            title: 'الدرس الرابع: المساقط ونظرية فيثاغورس وعكسها',
            lessonNumber: 4,
            unitId: '2_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والمساحات والتشابه والنظريات الهندسية',
            subtopics: ['مسقط نقطة وقطعة مستقيمة وشعاع ومستقيم على خط مستقيم', 'نظرية فيثاغورس في المثلث القائم: مربع الوتر = مجموع مربعي ضلعي القائمة', 'عكس نظرية فيثاغورس لإثبات أن المثلث قائم الزاوية']
          },
          {
            id: '2_middle_math_u3_l5',
            title: 'الدرس الخامس: نظرية إقليدس في المثلث القائم',
            lessonNumber: 5,
            unitId: '2_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والمساحات والتشابه والنظريات الهندسية',
            subtopics: ['نص نظرية إقليدس وقوانينها الأربعة لحساب أطوال الأضلاع والعمود الساقط من رأس القائمة', 'العلاقة بين المساقط وأضلاع القائمة والوتر', 'تمارين وبراهين هندسية على إقليدس']
          },
          {
            id: '2_middle_math_u3_l6',
            title: 'الدرس السادس: التعرف على نوع المثلث بالنسبة لقياسات زواياه',
            lessonNumber: 6,
            unitId: '2_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والمساحات والتشابه والنظريات الهندسية',
            subtopics: ['مقارنة مربع أطول أضلاع المثلث بمجموع مربعي الضلعين الآخرين', 'تحديد نوع المثلث (حاد الزوايا، قائم الزاوية، منفرج الزاوية)', 'تطبيقات وبراهين شاملة']
          }
        ]
      },
      {
        id: '2_middle_math_u4',
        title: 'الوحدة 4: الإحصاء والاحتمال',
        unitNumber: 4,
        lessons: [
          {
            id: '2_middle_math_u4_l1',
            title: 'الدرس الأول: الجداول التكرارية المتجمعة (الصاعد والهابط) والتمثيل البياني',
            lessonNumber: 1,
            unitId: '2_middle_math_u4',
            unitTitle: 'الوحدة 4: الإحصاء والاحتمال',
            subtopics: ['تكوين الجدول التكراري المتجمع الصاعد والجدول التكراري المتجمع الهابط', 'رسم المنحنى الصاعد والمنحنى الهابط', 'نقطة تقاطع المنحنيين الصاعد والهابط ودلالتها']
          },
          {
            id: '2_middle_math_u4_l2',
            title: 'الدرس الثاني: إيجاد الوسيط بيانياً وحسابياً للجداول التكرارية',
            lessonNumber: 2,
            unitId: '2_middle_math_u4',
            unitTitle: 'الوحدة 4: الإحصاء والاحتمال',
            subtopics: ['ترتيب الوسيط = مجموع التكرارات / 2', 'تعيين قيمة الوسيط من الرسم البياني للمنحنى المتجمع', 'الربيعات وتوزيع البيانات']
          },
          {
            id: '2_middle_math_u4_l3',
            title: 'الدرس الثالث: الوسط الحسابي والمنوال للجداول التكرارية ذات المجموعات',
            lessonNumber: 3,
            unitId: '2_middle_math_u4',
            unitTitle: 'الوحدة 4: الإحصاء والاحتمال',
            subtopics: ['حساب مراكز المجموعات', 'قانون الوسط الحسابي للجداول التكرارية = مجـ (م × ك) / مجـ ك', 'إيجاد المنوال بيانياً باستخدام المدرج التكراري']
          },
          {
            id: '2_middle_math_u4_l4',
            title: 'الدرس الرابع: الاحتمال النظري والتجريبي والعمليات على الأحداث',
            lessonNumber: 4,
            unitId: '2_middle_math_u4',
            unitTitle: 'الوحدة 4: الإحصاء والاحتمال',
            subtopics: ['فضاء العينة وتجربة الاحتمال العشوائية', 'أنواع الأحداث (المؤكد، المستحيل، الممكن)', 'قوانين احتمال وقوع الأحداث ومكملة الحدث والعمليات']
          }
        ]
      }
    ]
  },

  // ─── 2_middle العلوم ────────────────────────────────────────────────────────
  {
    grade_level: '2_middle',
    subject_name: 'العلوم',
    file_name: 'العلوم.md',
    units: [
      {
        id: '2_middle_sci_u1',
        title: 'الوحدة 1: المادة وحالاتها ونظرية الجسيمات والطاقة',
        unitNumber: 1,
        lessons: [
          {
            id: '2_middle_sci_u1_l1',
            title: 'الدرس الأول: حالات المادة والنموذج الجسيمي وسلوك الجسيمات',
            lessonNumber: 1,
            unitId: '2_middle_sci_u1',
            unitTitle: 'الوحدة 1: المادة وحالاتها ونظرية الجسيمات والطاقة',
            subtopics: ['حالات المادة الثلاث (الصلبة، السائلة، الغازية) والموائع', 'فروض نظرية الجسيمات للمادة والحركة البراونية', 'المسافات البينية وقوى التماسك والترابط الجزيئي بين الجسيمات']
          },
          {
            id: '2_middle_sci_u1_l2',
            title: 'الدرس الثاني: تغير حالات المادة والانصهار والغليان والتسامي',
            lessonNumber: 2,
            unitId: '2_middle_sci_u1',
            unitTitle: 'الوحدة 1: المادة وحالاتها ونظرية الجسيمات والطاقة',
            subtopics: ['أثر الحرارة على حركة وطاقة جسيمات المادة', 'الانصهار والتجمد والتبخر والتكاثف والتسامي', 'المنحنى الحراري لتغير الحالة ودرجة الغليان']
          },
          {
            id: '2_middle_sci_u1_l3',
            title: 'الدرس الثالث: النظام ودرجة الحرارة والطاقة الحرارية',
            lessonNumber: 3,
            unitId: '2_middle_sci_u1',
            unitTitle: 'الوحدة 1: المادة وحالاتها ونظرية الجسيمات والطاقة',
            subtopics: ['مفهوم النظام والوسط المحيط وحدود النظام', 'الفرق بين درجة الحرارة والطاقة الحرارية', 'الاتزان الحراري ومقاييس درجات الحرارة']
          },
          {
            id: '2_middle_sci_u1_l4',
            title: 'الدرس الرابع: طرق انتقال الحرارة وتطبيقاتها التكنولوجية',
            lessonNumber: 4,
            unitId: '2_middle_sci_u1',
            unitTitle: 'الوحدة 1: المادة وحالاتها ونظرية الجسيمات والطاقة',
            subtopics: ['انتقال الحرارة بالتوصيل في المواد الصلبة والموصلات والعوازل', 'انتقال الحرارة بالحمل في السوائل والغازات وتيارات الحمل', 'انتقال الحرارة بالإشعاع في الأوساط المادية والفراغ وتطبيقات الطاقة الشمسية']
          }
        ]
      },
      {
        id: '2_middle_sci_u2',
        title: 'الوحدة 2: التفاعلات الكيميائية والمعادلات وكيمياء التغذية',
        unitNumber: 2,
        lessons: [
          {
            id: '2_middle_sci_u2_l1',
            title: 'الدرس الأول: التفاعلات الكيميائية وأنواعها الأساسية',
            lessonNumber: 1,
            unitId: '2_middle_sci_u2',
            unitTitle: 'الوحدة 2: التفاعلات الكيميائية والمعادلات وكيمياء التغذية',
            subtopics: ['مفهوم التفاعل الكيميائي وكسر وتكوين الروابط', 'تفاعلات الانحلال الحراري وتفاعلات الإحلال البسيط والمزدوج', 'تفاعلات الأكسدة والاختزال']
          },
          {
            id: '2_middle_sci_u2_l2',
            title: 'الدرس الثاني: المعادلة الكيميائية وقوانين الاتحاد الكيميائي',
            lessonNumber: 2,
            unitId: '2_middle_sci_u2',
            unitTitle: 'الوحدة 2: التفاعلات الكيميائية والمعادلات وكيمياء التغذية',
            subtopics: ['كتابة ووزن المعادلات الكيميائية الرمزية', 'قانون بقاء المادة وقانون النسب الثابتة', 'الحساب الكيميائي وتطبيقات التفاعلات الكيميائية']
          },
          {
            id: '2_middle_sci_u2_l3',
            title: 'الدرس الثالث: كيمياء التغذية والهضم والمواد الغذائية',
            lessonNumber: 3,
            unitId: '2_middle_sci_u2',
            unitTitle: 'الوحدة 2: التفاعلات الكيميائية والمعادلات وكيمياء التغذية',
            subtopics: ['التركيب الكيميائي للمواد الغذائية (الكربوهيدرات، البروتينات، الدهون، الفيتامينات)', 'دور الإنزيمات الحيوية في تسريع وتسهيل عمليات الهضم والامتصاص', 'السعرات الحرارية والتغذية المتوازنة والصحة']
          }
        ]
      },
      {
        id: '2_middle_sci_u3',
        title: 'الوحدة 3: العمليات الحيوية في الكائنات الحية',
        unitNumber: 3,
        lessons: [
          {
            id: '2_middle_sci_u3_l1',
            title: 'الدرس الأول: عملية البناء الضوئي في النباتات الخضراء',
            lessonNumber: 1,
            unitId: '2_middle_sci_u3',
            unitTitle: 'الوحدة 3: العمليات الحيوية في الكائنات الحية',
            subtopics: ['تركيب البلاستيدة الخضراء وصبغ الكلوروفيل', 'معادلة البناء الضوئي والشروط اللازمة (ضوء، ماء، ثاني أكسيد الكربون)', 'إنتاج سكر الجلوكوز وانطلاق غاز الأكسجين']
          },
          {
            id: '2_middle_sci_u3_l2',
            title: 'الدرس الثاني: عملية التنفس الخلوي في الكائنات الحية',
            lessonNumber: 2,
            unitId: '2_middle_sci_u3',
            unitTitle: 'الوحدة 3: العمليات الحيوية في الكائنات الحية',
            subtopics: ['مفهوم التنفس الخلوي الهوائي ودور الميتوكوندريا', 'معادلة التنفس وتحرير الطاقة في صورة جزيئات ATP', 'مقارنة بين التنفس الخلوي والتبادل الغازي']
          },
          {
            id: '2_middle_sci_u3_l3',
            title: 'الدرس الثالث: التكامل والتوازن الحيوي بين البناء الضوئي والتنفس',
            lessonNumber: 3,
            unitId: '2_middle_sci_u3',
            unitTitle: 'الوحدة 3: العمليات الحيوية في الكائنات الحية',
            subtopics: ['دورة الأكسجين وثاني أكسيد الكربون في الطبيعة', 'ثبات نسب الغازات في الغلاف الجوي', 'أهمية الحفاظ على الغطاء النباتي الأخضر للتوازن البيئي']
          }
        ]
      },
      {
        id: '2_middle_sci_u4',
        title: 'الوحدة 4: ديناميكية الأرض وتغير سطحها وتكوين الصخور',
        unitNumber: 4,
        lessons: [
          {
            id: '2_middle_sci_u4_l1',
            title: 'الدرس الأول: العوامل المؤثرة في تغيير سطح الأرض',
            lessonNumber: 1,
            unitId: '2_middle_sci_u4',
            unitTitle: 'الوحدة 4: ديناميكية الأرض وتغير سطحها وتكوين الصخور',
            subtopics: ['التجوية الميكانيكية والتجوية الكيميائية وتفتيت الصخور', 'التعرية المائية والريحية والجليدية ونقل الفتات', 'الترسيب وتكوين المظاهر التضاريسية السطحية']
          },
          {
            id: '2_middle_sci_u4_l2',
            title: 'الدرس الثاني: تكوين المعادن والصخور والتربة وأهميتها البيئية',
            lessonNumber: 2,
            unitId: '2_middle_sci_u4',
            unitTitle: 'الوحدة 4: ديناميكية الأرض وتغير سطحها وتكوين الصخور',
            subtopics: ['أنواع الصخور (النارية، الرسوبية، المتحولة) ودورة الصخور', 'مفهوم المعدن والخصائص الفيزيائية للمعادن (الصلادة، المخدش، البريق)', 'تكون التربة وطبقاتها وأهميتها لدعم الحياة والزراعة']
          }
        ]
      }
    ]
  },

  // ─── 2_middle اللغة الإنجليزية ──────────────────────────────────────────────
  {
    grade_level: '2_middle',
    subject_name: 'اللغة الإنجليزية',
    file_name: 'اللغة الإنجليزية.md',
    units: [
      {
        id: '2_middle_eng_u1',
        title: 'Unit 1: Gen Alpha (جيل ألفا والحياة الرقمية)',
        unitNumber: 1,
        lessons: [
          {
            id: '2_middle_eng_u1_l1',
            title: 'Lesson 1: Gen Alpha\'s Digital Life & Key Vocabulary',
            lessonNumber: 1,
            unitId: '2_middle_eng_u1',
            unitTitle: 'Unit 1: Gen Alpha (جيل ألفا والحياة الرقمية)',
            subtopics: ['Characteristics of Generation Alpha', 'Digital devices and connectivity vocabulary', 'Collocations with make, take, and do']
          },
          {
            id: '2_middle_eng_u1_l2',
            title: 'Lesson 2: Vocabulary in Depth & Irregular Verbs Conjugation',
            lessonNumber: 2,
            unitId: '2_middle_eng_u1',
            unitTitle: 'Unit 1: Gen Alpha (جيل ألفا والحياة الرقمية)',
            subtopics: ['Irregular verb tables (Infinitive, Past Simple, Past Participle)', 'Word formation: noun and adjective suffixes (-tion, -ful, -able)', 'Synonyms and antonyms in digital context']
          },
          {
            id: '2_middle_eng_u1_l3',
            title: 'Lesson 3: Reading & Listening: The Digital Bridge',
            lessonNumber: 3,
            unitId: '2_middle_eng_u1',
            unitTitle: 'Unit 1: Gen Alpha (جيل ألفا والحياة الرقمية)',
            subtopics: ['Reading text on how technology connects generations', 'Listening to parents and teens discussing screen time', 'True/False and detailed comprehension questions']
          },
          {
            id: '2_middle_eng_u1_l4',
            title: 'Lesson 4: Grammar: Present Simple vs. Present Continuous',
            lessonNumber: 4,
            unitId: '2_middle_eng_u1',
            unitTitle: 'Unit 1: Gen Alpha (جيل ألفا والحياة الرقمية)',
            subtopics: ['Permanent habits vs. temporary actions', 'Time expressions for both tenses (every day vs. right now/at the moment)', 'Correcting common tense confusion errors']
          },
          {
            id: '2_middle_eng_u1_l5',
            title: 'Lessons 5 & 6: Speaking & Writing: Expressing Identity Online',
            lessonNumber: 5,
            unitId: '2_middle_eng_u1',
            unitTitle: 'Unit 1: Gen Alpha (جيل ألفا والحياة الرقمية)',
            subtopics: ['Speaking: Debating positive and negative aspects of tech', 'Writing an essay on balancing online and offline life', 'Unit assessment and vocabulary consolidation']
          }
        ]
      },
      {
        id: '2_middle_eng_u2',
        title: 'Unit 2: Digital Communication & Online Safety (التواصل الرقمي والأمان)',
        unitNumber: 2,
        lessons: [
          {
            id: '2_middle_eng_u2_l1',
            title: 'Lesson 1: Protecting Your Privacy in the Digital Age',
            lessonNumber: 1,
            unitId: '2_middle_eng_u2',
            unitTitle: 'Unit 2: Digital Communication & Online Safety (التواصل الرقمي والأمان)',
            subtopics: ['Cybersecurity vocabulary (passwords, phishing, malware, encryption)', 'Protecting personal information on public platforms', 'Identifying fake messages and suspicious links']
          },
          {
            id: '2_middle_eng_u2_l2',
            title: 'Lesson 2: Staying Safe Online & Managing Passwords',
            lessonNumber: 2,
            unitId: '2_middle_eng_u2',
            unitTitle: 'Unit 2: Digital Communication & Online Safety (التواصل الرقمي والأمان)',
            subtopics: ['Guidelines for creating strong multi-character passwords', 'Two-factor authentication and security settings', 'Expressions & prepositions for online behavior']
          },
          {
            id: '2_middle_eng_u2_l3',
            title: 'Lesson 3: Managing Your Online Data & Digital Footprint',
            lessonNumber: 3,
            unitId: '2_middle_eng_u2',
            unitTitle: 'Unit 2: Digital Communication & Online Safety (التواصل الرقمي والأمان)',
            subtopics: ['Understanding the permanent digital footprint', 'Cloud storage and data backups', 'Reading comprehension: The Digital Detective']
          },
          {
            id: '2_middle_eng_u2_l4',
            title: 'Lesson 4: Grammar: Modals of Advice and Obligation (Should, Must, Ought to)',
            lessonNumber: 4,
            unitId: '2_middle_eng_u2',
            unitTitle: 'Unit 2: Digital Communication & Online Safety (التواصل الرقمي والأمان)',
            subtopics: ['Should / Shouldn\'t for advice and recommendations', 'Must / Mustn\'t for rules and vital necessities', 'Have to / Don\'t have to for external rules']
          },
          {
            id: '2_middle_eng_u2_l5',
            title: 'Lessons 5 & 6: Digital Detectives & Writing Online Safety Guidelines',
            lessonNumber: 5,
            unitId: '2_middle_eng_u2',
            unitTitle: 'Unit 2: Digital Communication & Online Safety (التواصل الرقمي والأمان)',
            subtopics: ['Speaking: Solving cyber safety case studies', 'Writing a code of conduct poster for school computer labs', 'Unit review quiz']
          }
        ]
      },
      {
        id: '2_middle_eng_u3',
        title: 'Unit 3: Sports and Challenges (الرياضة ومواجهة التحديات)',
        unitNumber: 3,
        lessons: [
          {
            id: '2_middle_eng_u3_l1',
            title: 'Lesson 1: Courage, Determination and Heroic Athletes',
            lessonNumber: 1,
            unitId: '2_middle_eng_u3',
            unitTitle: 'Unit 3: Sports and Challenges (الرياضة ومواجهة التحديات)',
            subtopics: ['Extreme sports and Olympic athletic events vocabulary', 'Adjectives describing courage, resilience and perseverance', 'Collocations with play, do, and go in sports']
          },
          {
            id: '2_middle_eng_u3_l2',
            title: 'Lesson 2: Advice for Facing Challenges & Vocabulary',
            lessonNumber: 2,
            unitId: '2_middle_eng_u3',
            unitTitle: 'Unit 3: Sports and Challenges (الرياضة ومواجهة التحديات)',
            subtopics: ['Phrasal verbs related to effort (give up, carry on, work out)', 'Important prepositions in competitive sports', 'Reading: Soha\'s Challenge']
          },
          {
            id: '2_middle_eng_u3_l3',
            title: 'Lesson 3: Facing Traffic Challenges & Everyday Problems',
            lessonNumber: 3,
            unitId: '2_middle_eng_u3',
            unitTitle: 'Unit 3: Sports and Challenges (الرياضة ومواجهة التحديات)',
            subtopics: ['Urban transport challenges and creative solutions', 'Listening: Overcoming physical and environmental barriers', 'Extracting gist and specific details']
          },
          {
            id: '2_middle_eng_u3_l4',
            title: 'Lesson 4: Grammar: Past Simple vs. Past Continuous Tense',
            lessonNumber: 4,
            unitId: '2_middle_eng_u3',
            unitTitle: 'Unit 3: Sports and Challenges (الرياضة ومواجهة التحديات)',
            subtopics: ['Past Continuous formation (was/were + verb-ing)', 'Connecting past actions with While, As, and When', 'Simultaneous past actions vs. interrupted actions']
          },
          {
            id: '2_middle_eng_u3_l5',
            title: 'Lessons 5 & 6: The Power of Facing Challenges & Project Presentation',
            lessonNumber: 5,
            unitId: '2_middle_eng_u3',
            unitTitle: 'Unit 3: Sports and Challenges (الرياضة ومواجهة التحديات)',
            subtopics: ['Speaking: Presenting an inspiring Egyptian champion', 'Writing a motivational story about turning failure into victory', 'Unit grammar and vocabulary revision']
          }
        ]
      },
      {
        id: '2_middle_eng_u4',
        title: 'Unit 4: Exploring Art and Creativity (استكشاف الفنون والإبداع)',
        unitNumber: 4,
        lessons: [
          {
            id: '2_middle_eng_u4_l1',
            title: 'Lesson 1: A World of Imagination & Interview with an Artist',
            lessonNumber: 1,
            unitId: '2_middle_eng_u4',
            unitTitle: 'Unit 4: Exploring Art and Creativity (استكشاف الفنون والإبداع)',
            subtopics: ['Art styles and techniques (painting, sculpture, photography, calligraphy)', 'Descriptive art vocabulary (vibrant, intricate, abstract, realistic)', 'Listening to a famous painter interview']
          },
          {
            id: '2_middle_eng_u4_l2',
            title: 'Lesson 2: Exploring Art Forms: Listen Up!',
            lessonNumber: 2,
            unitId: '2_middle_eng_u4',
            unitTitle: 'Unit 4: Exploring Art and Creativity (استكشاف الفنون والإبداع)',
            subtopics: ['Traditional vs. modern digital arts', 'Museum and art gallery visitor vocabulary', 'Useful collocations and idioms in artistic expression']
          },
          {
            id: '2_middle_eng_u4_l3',
            title: 'Lesson 3: An Article about an Artist & Creative Expression',
            lessonNumber: 3,
            unitId: '2_middle_eng_u4',
            unitTitle: 'Unit 4: Exploring Art and Creativity (استكشاف الفنون والإبداع)',
            subtopics: ['Reading text: Egyptian artists who inspired the world', 'Analyzing artist biographies and artistic inspirations', 'Answering inference and evaluation questions']
          },
          {
            id: '2_middle_eng_u4_l4',
            title: 'Lesson 4: Grammar: Defining Relative Clauses (Who, Which, Where, Whose)',
            lessonNumber: 4,
            unitId: '2_middle_eng_u4',
            unitTitle: 'Unit 4: Exploring Art and Creativity (استكشاف الفنون والإبداع)',
            subtopics: ['Using Who / That for people', 'Using Which / That for things and animals', 'Using Where for places and Whose for possession']
          },
          {
            id: '2_middle_eng_u4_l5',
            title: 'Lessons 5 & 6: Speaking & Writing: Art Reviews & Exhibition Project',
            lessonNumber: 5,
            unitId: '2_middle_eng_u4',
            unitTitle: 'Unit 4: Exploring Art and Creativity (استكشاف الفنون والإبداع)',
            subtopics: ['Speaking: Describing and critiquing a piece of artwork', 'Writing a review of an art exhibition or museum visit', 'Unit consolidation exercises']
          }
        ]
      },
      {
        id: '2_middle_eng_u5',
        title: 'Unit 5: Travel and Adventures Around the World (السفر والمغامرات)',
        unitNumber: 5,
        lessons: [
          {
            id: '2_middle_eng_u5_l1',
            title: 'Lesson 1: A Blogger\'s Journey (Japan, Morocco and Beyond)',
            lessonNumber: 1,
            unitId: '2_middle_eng_u5',
            unitTitle: 'Unit 5: Travel and Adventures Around the World (السفر والمغامرات)',
            subtopics: ['Travel, tourism, luggage, and destination vocabulary', 'Cultural traditions and international etiquette', 'Reading travel blog excerpts']
          },
          {
            id: '2_middle_eng_u5_l2',
            title: 'Lesson 2: A Tour Around Cairo & Historical Landmarks',
            lessonNumber: 2,
            unitId: '2_middle_eng_u5',
            unitTitle: 'Unit 5: Travel and Adventures Around the World (السفر والمغامرات)',
            subtopics: ['Vocabulary for famous Egyptian historical and cultural monuments', 'Asking for and giving directions in tourist hotspots', 'Compound nouns in tourism']
          },
          {
            id: '2_middle_eng_u5_l3',
            title: 'Lesson 3: Around the World in Four Amazing Places (Luxor & Beyond)',
            lessonNumber: 3,
            unitId: '2_middle_eng_u5',
            unitTitle: 'Unit 5: Travel and Adventures Around the World (السفر والمغامرات)',
            subtopics: ['Reading text: What can you see and do in Luxor?', 'Comparing tourist destinations worldwide', 'Comprehension and fact-finding skills']
          },
          {
            id: '2_middle_eng_u5_l4',
            title: 'Lesson 4: Grammar: Comparative and Superlative Adjectives & As...As',
            lessonNumber: 4,
            unitId: '2_middle_eng_u5',
            unitTitle: 'Unit 5: Travel and Adventures Around the World (السفر والمغامرات)',
            subtopics: ['Short and long comparative adjectives (-er than / more...than)', 'Superlative adjectives (the -est / the most...)', 'Equative comparisons with as + adjective + as']
          },
          {
            id: '2_middle_eng_u5_l5',
            title: 'Lessons 5 & 6: Writing a Travel Blog Post & Egyptian Adventure Story',
            lessonNumber: 5,
            unitId: '2_middle_eng_u5',
            unitTitle: 'Unit 5: Travel and Adventures Around the World (السفر والمغامرات)',
            subtopics: ['Writing an engaging social media travel post', 'Using descriptive sensory language and sequencing connectors', 'Unit vocabulary and grammar review']
          }
        ]
      },
      {
        id: '2_middle_eng_u6',
        title: 'Unit 6: Inspiring Innovators and Changemakers (المبتكرون وصناع التغيير)',
        unitNumber: 6,
        lessons: [
          {
            id: '2_middle_eng_u6_l1',
            title: 'Lesson 1 & 2: Making Your Ideas Happen – Inspiring Innovators',
            lessonNumber: 1,
            unitId: '2_middle_eng_u6',
            unitTitle: 'Unit 6: Inspiring Innovators and Changemakers (المبتكرون وصناع التغيير)',
            subtopics: ['Invention, innovation, patents, and scientific discovery terms', 'Phrasal verbs of development (come up with, figure out, set up)', 'Reading about teenage science contest winners']
          },
          {
            id: '2_middle_eng_u6_l2',
            title: 'Lesson 3: A Man of Impact & Science Inventions',
            lessonNumber: 2,
            unitId: '2_middle_eng_u6',
            unitTitle: 'Unit 6: Inspiring Innovators and Changemakers (المبتكرون وصناع التغيير)',
            subtopics: ['Listening to a documentary segment on revolutionary inventions', 'Vocabulary for technological breakthroughs and societal impact', 'Summarizing listening passages']
          },
          {
            id: '2_middle_eng_u6_l3',
            title: 'Lesson 4: Grammar: First and Second Conditionals (If Sentences)',
            lessonNumber: 3,
            unitId: '2_middle_eng_u6',
            unitTitle: 'Unit 6: Inspiring Innovators and Changemakers (المبتكرون وصناع التغيير)',
            subtopics: ['First conditional for real future possibilities (If + present, will)', 'Second conditional for imaginary/hypothetical situations (If + past, would)', 'Forming hypothetical questions (What would you invent if...?)']
          },
          {
            id: '2_middle_eng_u6_l4',
            title: 'Lesson 5: Biography of Ahmed Idris & Young Innovators',
            lessonNumber: 4,
            unitId: '2_middle_eng_u6',
            unitTitle: 'Unit 6: Inspiring Innovators and Changemakers (المبتكرون وصناع التغيير)',
            subtopics: ['Reading text: The heroic contribution of Ahmed Idris in the October 1973 war (Nubian code)', 'Young Arab inventors solving water and energy challenges', 'Analytical reading questions']
          },
          {
            id: '2_middle_eng_u6_l5',
            title: 'Lesson 6: Writing an Inspiring Biography & Final Term Exam Review',
            lessonNumber: 5,
            unitId: '2_middle_eng_u6',
            unitTitle: 'Unit 6: Inspiring Innovators and Changemakers (المبتكرون وصناع التغيير)',
            subtopics: ['Writing a complete 4-paragraph biography of a pioneer', 'Speaking presentation on a personal invention idea', 'Comprehensive end-of-term revision test']
          }
        ]
      }
    ]
  },

  // ─── 2_middle اللغة العربية ────────────────────────────────────────────────
  {
    grade_level: '2_middle',
    subject_name: 'اللغة العربية',
    file_name: 'اللغة العربية.md',
    units: [
      {
        id: '2_middle_ar_u1',
        title: 'الوحدة 1: المهارات اللغوية والقراءة والتضحية الوطنية',
        unitNumber: 1,
        lessons: [
          {
            id: '2_middle_ar_u1_l1',
            title: 'الدرس الأول: مراجعة عامة على مهارات القراءة والنصوص والتذوق البلاغي',
            lessonNumber: 1,
            unitId: '2_middle_ar_u1',
            unitTitle: 'الوحدة 1: المهارات اللغوية والقراءة والتضحية الوطنية',
            subtopics: ['الفكرة الرئيسة والفكر الفرعية والتفاصيل الداعمة', 'السياقات اللغوية المتعددة والمعنى المباشر والضمني', 'التشبيه وعناصره وأثره الجمالي']
          },
          {
            id: '2_middle_ar_u1_l2',
            title: 'الدرس الثاني: نص القراءة (العبور إلى المستقبل - نصر أكتوبر 1973م)',
            lessonNumber: 2,
            unitId: '2_middle_ar_u1',
            unitTitle: 'الوحدة 1: المهارات اللغوية والقراءة والتضحية الوطنية',
            subtopics: ['الاستعداد لمعركة العبور وتحطيم خط بارليف', 'بطولات الجيش المصري وإرادة النصر واسترداد الكرامة', 'قاموس المفردات والأسئلة التحليلية للنص']
          },
          {
            id: '2_middle_ar_u1_l3',
            title: 'الدرس الثالث: نص القراءة (من صقور الوطنية - الشهيد البطل محمد مبروك)',
            lessonNumber: 3,
            unitId: '2_middle_ar_u1',
            unitTitle: 'الوحدة 1: المهارات اللغوية والقراءة والتضحية الوطنية',
            subtopics: ['نموذج وطني مشرف في التضحية والفداء', 'حماية مقدرات الوطن والتصدي للإرهاب', 'استخلاص القيم الوطنية والعبر المستفادة']
          },
          {
            id: '2_middle_ar_u1_l4',
            title: 'الدرس الرابع: النص الشعري (مصر التي في خاطري - للشاعر أحمد رامي)',
            lessonNumber: 4,
            unitId: '2_middle_ar_u1',
            unitTitle: 'الوحدة 1: المهارات اللغوية والقراءة والتضحية الوطنية',
            subtopics: ['شرح وتحليل الأبيات الشعرية ومكانة مصر في وجدان أبنائها', 'الجماليات والتصوير الفني والصور الحسية الحركية', 'دلالات الألفاظ والأساليب الإنشائية والخبرية']
          },
          {
            id: '2_middle_ar_u1_l5',
            title: 'الدرس الخامس: النحو (المعرب والمبني من الأسماء والأفعال)',
            lessonNumber: 5,
            unitId: '2_middle_ar_u1',
            unitTitle: 'الوحدة 1: المهارات اللغوية والقراءة والتضحية الوطنية',
            subtopics: ['المعرب والمبني من الأسماء (الضمائر، الإشارة، الموصول، الاستفهام، الشرط، الظروف)', 'بناء الفعل الماضي والأمر والمضارع المتصل بنون النسوة أو التوكيد', 'إعراب الفعل المضارع (الرفع، النصب، الجزم)']
          },
          {
            id: '2_middle_ar_u1_l6',
            title: 'الدرس السادس: التعبير الكتابي (كتابة مقال تحليلي وسيرة بطل وطني)',
            lessonNumber: 6,
            unitId: '2_middle_ar_u1',
            unitTitle: 'الوحدة 1: المهارات اللغوية والقراءة والتضحية الوطنية',
            subtopics: ['عناصر المقال التحليلي والربط المنطقي بين الأفكار', 'كتابة سيرة بطل مع مراعاة التسلسل الزمني', 'علامات الترقيم وضبط القواعد الإملائية']
          }
        ]
      },
      {
        id: '2_middle_ar_u2',
        title: 'الوحدة 2: من عمرنا وجهدنا والبيئة والتنمية المستدامة',
        unitNumber: 2,
        lessons: [
          {
            id: '2_middle_ar_u2_l1',
            title: 'الدرس الأول: نص الاستماع (أقدم وديعة في يد المصري)',
            lessonNumber: 1,
            unitId: '2_middle_ar_u2',
            unitTitle: 'الوحدة 2: من عمرنا وجهدنا والبيئة والتنمية المستدامة',
            subtopics: ['الاستماع الفعال وتحليل النص المسموع', 'قدسية نهر النيل وأهمية الحفاظ على الموارد الطبيعية', 'حقوق الأجيال القادمة والمسؤولية المجتمعية']
          },
          {
            id: '2_middle_ar_u2_l2',
            title: 'الدرس الثاني: نص القراءة (من أجل غدٍ - التنمية المستدامة والمشروعات القومية)',
            lessonNumber: 2,
            unitId: '2_middle_ar_u2',
            unitTitle: 'الوحدة 2: من عمرنا وجهدنا والبيئة والتنمية المستدامة',
            subtopics: ['الجهود الوطنية لترشيد الاستهلاك واستثمار الطاقات', 'المشروعات الخضراء وحماية البيئة من التلوث', 'تحليل المفردات والتراكيب واستيعاب النص']
          },
          {
            id: '2_middle_ar_u2_l3',
            title: 'الدرس الثالث: نص القراءة (واحة مصرية صديقة للبيئة - مدينة الخارجة)',
            lessonNumber: 3,
            unitId: '2_middle_ar_u2',
            unitTitle: 'الوحدة 2: من عمرنا وجهدنا والبيئة والتنمية المستدامة',
            subtopics: ['مدينة الخارجة عاصمة البيئة العربية ونموذج المدن الخضراء', 'استخدام الطاقة النظيفة وتدوير المخلفات والحرف التراثية', 'استخلاص الفكر الرئيسة والفرعية']
          },
          {
            id: '2_middle_ar_u2_l4',
            title: 'الدرس الرابع: النص الشعري (ريفنا المصري - للشاعر محمود غنيم)',
            lessonNumber: 4,
            unitId: '2_middle_ar_u2',
            unitTitle: 'الوحدة 2: من عمرنا وجهدنا والبيئة والتنمية المستدامة',
            subtopics: ['شرح الأبيات وتصوير جمال الريف المصري وأصالة أهله', 'الصور البلاغية والجمالية والتجانس اللفظي والموسيقى الشعرية', 'المعاني الضمنية وحب الجمال الطبيعي الحقيقي']
          },
          {
            id: '2_middle_ar_u2_l5',
            title: 'الدرس الخامس: النحو (الفعل اللازم والمتعدي والأفعال المتعدية لمفعولين)',
            lessonNumber: 5,
            unitId: '2_middle_ar_u2',
            unitTitle: 'الوحدة 2: من عمرنا وجهدنا والبيئة والتنمية المستدامة',
            subtopics: ['التمييز بين الفعل اللازم والمتعدي لمفعول واحد', 'الأفعال المتعدية لمفعولين أصلهما المبتدأ والخبر (ظن وأخواتها)', 'الأفعال المتعدية لمفعولين ليس أصلهما المبتدأ والخبر (منح، منع، أعطى، كسا، ألبس)']
          },
          {
            id: '2_middle_ar_u2_l6',
            title: 'الدرس السادس: الإملاء والتعبير (كتابة تقرير صحفي ومقال إقناعي عن البيئة)',
            lessonNumber: 6,
            unitId: '2_middle_ar_u2',
            unitTitle: 'الوحدة 2: من عمرنا وجهدنا والبيئة والتنمية المستدامة',
            subtopics: ['كتابة التقرير الصحفي (العنوان، التقديم، الوقائع، التوصيات)', 'أساليب الإقناع والأدلة والبراهين في المقال البيئي', 'رسم الهمزة المتوسطة والمتطرفة بدقة']
          }
        ]
      },
      {
        id: '2_middle_ar_u3',
        title: 'الوحدة 3: العلم والمعرفة وبناء الشخصية والاجتهاد',
        unitNumber: 3,
        lessons: [
          {
            id: '2_middle_ar_u3_l1',
            title: 'الدرس الأول: نص الاستماع (إنسان أم ظل إنسان - قيمة القراءة والوعي)',
            lessonNumber: 1,
            unitId: '2_middle_ar_u3',
            unitTitle: 'الوحدة 3: العلم والمعرفة وبناء الشخصية والاجتهاد',
            subtopics: ['أثر القراءة في بناء العقل وصقل الشخصية الإنسانية', 'التفكير النقدي وعدم الانجراف وراء الشائعات', 'استخلاص العبر من النص المسموع']
          },
          {
            id: '2_middle_ar_u3_l2',
            title: 'الدرس الثاني: نص القراءة (عالم الرياضيات المسلم - الخوارزمي مؤسس علم الجبر)',
            lessonNumber: 2,
            unitId: '2_middle_ar_u3',
            unitTitle: 'الوحدة 3: العلم والمعرفة وبناء الشخصية والاجتهاد',
            subtopics: ['نشأة الخوارزمي وابتكار الصفر وتأسيس علم الجبر والخوارزميات', 'إسهامات علماء الحضارة الإسلامية في نهضة العلم العالمي', 'قاموس المفردات والتحليل الفكري']
          },
          {
            id: '2_middle_ar_u3_l3',
            title: 'الدرس الثالث: نص القراءة (القراءة حياة وتنمية العقول)',
            lessonNumber: 3,
            unitId: '2_middle_ar_u3',
            unitTitle: 'الوحدة 3: العلم والمعرفة وبناء الشخصية والاجتهاد',
            subtopics: ['القراءة تنقل تجارب الآخرين وتضاعف عمر الإنسان الفكري', 'أنواع القراءة (الاستكشافية، السريعة، التحليلية الناقدة)', 'التطبيق العملي للقراءة المنتجة']
          },
          {
            id: '2_middle_ar_u3_l4',
            title: 'الدرس الرابع: النص الشعري (الكد سبيل المعالي - للإمام الشافعي)',
            lessonNumber: 4,
            unitId: '2_middle_ar_u3',
            unitTitle: 'الوحدة 3: العلم والمعرفة وبناء الشخصية والاجتهاد',
            subtopics: ['شرح أبيات الحكمة للإمام الشافعي في فضل السعي وطلب العلا', 'بقدر الكد تكتسب المعالي ومن طلب العلا سهر الليالي', 'الجماليات والتشبيهات والأساليب البلاغية المؤكدة']
          },
          {
            id: '2_middle_ar_u3_l5',
            title: 'الدرس الخامس: النحو (أسلوب الشرط وأدوات الشرط الجازمة وغير الجازمة)',
            lessonNumber: 5,
            unitId: '2_middle_ar_u3',
            unitTitle: 'الوحدة 3: العلم والمعرفة وبناء الشخصية والاجتهاد',
            subtopics: ['أركان أسلوب الشرط (أداة الشرط + فعل الشرط + جواب الشرط)', 'أدوات الشرط الجازمة (إنْ، مَنْ، ما، مهما، متى، أينما) وعلامات جزم الفعل المضارع', 'أدوات الشرط غير الجازمة (إذا، لو، لولا، كلما)']
          },
          {
            id: '2_middle_ar_u3_l6',
            title: 'الدرس السادس: التعبير والمراجعة العامة والامتحانات الشاملة',
            lessonNumber: 6,
            unitId: '2_middle_ar_u3',
            unitTitle: 'الوحدة 3: العلم والمعرفة وبناء الشخصية والاجتهاد',
            subtopics: ['كتابة سيرة ذاتية وبحث علمي مبسط مدعم بالمراجع', 'مراجعة شاملة لجميع قواعد النحو والإملاء والبلاغة', 'حل نماذج امتحانات الفصل الدراسي الشاملة']
          }
        ]
      }
    ]
  }
];

// ─── Main Execution ──────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting Full Curricula Upload & Processing Pipeline...');
  console.log(`Target: 10 Curricula across 1_middle and 2_middle`);

  const outputBase = path.resolve(__dirname, '../../Curriculum Generator/output');
  const uploadedCurriculaIds = [];

  for (const currDef of CURRICULA_DEFINITIONS) {
    const filePath = path.join(outputBase, currDef.grade_level, currDef.file_name);
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

    // 4. Upsert into Supabase (Delete old version of this curriculum if exists)
    console.log(`3. Saving Curriculum & ${allChunks.length} Chunks to Supabase...`);
    
    // Check existing
    const { data: existingRows } = await supabase
      .from('curriculums')
      .select('id, units')
      .eq('grade_level', currDef.grade_level)
      .eq('subject_name', currDef.subject_name);

    if (existingRows && existingRows.length > 0) {
      const existingId = existingRows[0].id;
      // Check chunk count
      const { count } = await supabase
        .from('curriculum_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('curriculum_id', existingId);

      if (count && count > 0) {
        console.log(`⚡ Curriculum [${currDef.grade_level}] ${currDef.subject_name} already uploaded with ${count} chunks. Skipping.`);
        // Update units if needed
        await supabase.from('curriculums').update({ units: currDef.units }).eq('id', existingId);
        uploadedCurriculaIds.push(existingId);
        continue;
      } else {
        for (const row of existingRows) {
          console.log(`   Removing incomplete previous curriculum record: ${row.id}`);
          await supabase.from('curriculums').delete().eq('id', row.id);
        }
      }
    }

    const newCurriculumId = crypto.randomUUID();
    const curriculumRow = {
      id: newCurriculumId,
      grade_level: currDef.grade_level,
      subject_name: currDef.subject_name,
      file_name: currDef.file_name,
      content: fileContent,
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
    uploadedCurriculaIds.push(newCurriculumId);
  }

  // 5. Update system_settings with all uploaded curriculum IDs
  console.log(`\n===============================================================`);
  console.log(`Updating System Settings (active_curriculum_ids & active_grade_levels)...`);

  const { error: setErr } = await supabase
    .from('system_settings')
    .upsert({
      key: 'active_curriculum_ids',
      value: JSON.stringify(uploadedCurriculaIds)
    });

  if (setErr) console.error('Failed to update active_curriculum_ids:', setErr);
  else console.log(`✅ Updated active_curriculum_ids with ${uploadedCurriculaIds.length} active curricula.`);

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

  console.log(`\n🎉 All 10 Curricula uploaded, embedded, indexed, and activated successfully!`);
}

main().catch(err => {
  console.error('Fatal pipeline error:', err);
  process.exit(1);
});
