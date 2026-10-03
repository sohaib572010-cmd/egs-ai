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

// ─── 3_middle Curriculum Definitions ─────────────────────────────────────────

export const MIDDLE_3_DEFINITIONS = [
  // ─── 3_middle الدراسات الإجتماعية ──────────────────────────────────────────
  {
    grade_level: '3_middle',
    subject_name: 'الدراسات الإجتماعية',
    file_name: 'الدراسات 3ع.md',
    units: [
      {
        id: '3_middle_soc_u1',
        title: 'الوحدة 1: الملامح الطبيعية والحضارية لقارات العالم الجديد',
        unitNumber: 1,
        lessons: [
          {
            id: '3_middle_soc_u1_l1',
            title: 'الدرس الأول: الموقع ومظاهر السطح في قارات العالم الجديد',
            lessonNumber: 1,
            unitId: '3_middle_soc_u1',
            unitTitle: 'الوحدة 1: الملامح الطبيعية والحضارية لقارات العالم الجديد',
            subtopics: ['الموقع الجغرافي والفلكي لأمريكا الشمالية وأمريكا الجنوبية وأستراليا', 'السلاسل الجبلية الكبرى والهضاب والسهول الفيضية والساحلية', 'الأنهار الكبرى (المسيسيبي، الأمازون، مري ودارلنج)']
          },
          {
            id: '3_middle_soc_u1_l2',
            title: 'الدرس الثاني: المناخ والنبات الطبيعي في قارات العالم الجديد',
            lessonNumber: 2,
            unitId: '3_middle_soc_u1',
            unitTitle: 'الوحدة 1: الملامح الطبيعية والحضارية لقارات العالم الجديد',
            subtopics: ['العوامل المؤثرة في مناخ قارات العالم الجديد', 'توزيع الأقاليم المناخية والنباتية (الاستوائي، المداري، الموسمي، الصيني، البحر المتوسط، التندرا)', 'الغابات النفضية والمخروطية وحشائش البراري']
          },
          {
            id: '3_middle_soc_u1_l3',
            title: 'الدرس الثالث: الحضارات القديمة في الأمريكتين',
            lessonNumber: 3,
            unitId: '3_middle_soc_u1',
            unitTitle: 'الوحدة 1: الملامح الطبيعية والحضارية لقارات العالم الجديد',
            subtopics: ['حضارة المايا في أمريكا الوسطى وإسهاماتها الفلكية والمعمارية', 'حضارة الأزتيك في المكسيك القديمة', 'حضارة الإنكا في جبال الأنديز بأمريكا الجنوبية والري والزراعة المدرجة']
          }
        ]
      },
      {
        id: '3_middle_soc_u2',
        title: 'الوحدة 2: مصر في عصر محمد علي وخلفائه',
        unitNumber: 2,
        lessons: [
          {
            id: '3_middle_soc_u2_l1',
            title: 'الدرس الأول: تولي محمد علي حكم مصر وتوطيد سيادته',
            lessonNumber: 1,
            unitId: '3_middle_soc_u2',
            unitTitle: 'الوحدة 2: مصر في عصر محمد علي وخلفائه',
            subtopics: ['ثورة الشعب المصري وتعيين محمد علي والياً 1805م', 'التخلص من المنافسين (حملة فريزر، الزعامة الشعبية، مذبحة القلعة)', 'تأمين الجبهة الداخلية وتثبيت الحكم']
          },
          {
            id: '3_middle_soc_u2_l2',
            title: 'الدرس الثاني: سياسة محمد علي الداخلية والخارجية (بناء الدولة الحديثة)',
            lessonNumber: 2,
            unitId: '3_middle_soc_u2',
            unitTitle: 'الوحدة 2: مصر في عصر محمد علي وخلفائه',
            subtopics: ['نظام الاحتكار في الزراعة والصناعة والتجارة', 'بناء الجيش والأسطول والتعليم والبعثات والترجمة', 'الحروب الخارجية (شبه الجزيرة العربية، السودان، اليونان، بلاد الشام) ومعاهدة لندن 1840م']
          },
          {
            id: '3_middle_soc_u2_l3',
            title: 'الدرس الثالث: مصر في عصر خلفاء محمد علي والتدخل الأجنبي',
            lessonNumber: 3,
            unitId: '3_middle_soc_u2',
            unitTitle: 'الوحدة 2: مصر في عصر محمد علي وخلفائه',
            subtopics: ['عصر عباس باشا الأول وسعيد باشا وامتياز حفر قناة السويس', 'عصر إسماعيل والنهضة العمرانية ومشروع الإمبراطورية الإفريقية', 'الأزمة المالية والتدخل الأجنبي وصندوق الدين والوزارة المختلطة وعزل إسماعيل']
          }
        ]
      },
      {
        id: '3_middle_soc_u3',
        title: 'الوحدة 3: النظم البيئية في قارات العالم الجديد والتغير المناخي',
        unitNumber: 3,
        lessons: [
          {
            id: '3_middle_soc_u3_l1',
            title: 'الدرس الأول: نظم الغابات والحشائش في قارات العالم الجديد',
            lessonNumber: 1,
            unitId: '3_middle_soc_u3',
            unitTitle: 'الوحدة 3: النظم البيئية في قارات العالم الجديد والتغير المناخي',
            subtopics: ['حوض الأمازون والغابات الاستوائية المطيرة وتنوع الحياة البرية', 'السهول الوسطى وحشائش البراري والأراضي الرعوية والزراعية', 'الغابات المعتدلة والباردة والتنوع الإيكولوجي']
          },
          {
            id: '3_middle_soc_u3_l2',
            title: 'الدرس الثاني: النظم البيئية الصحراوية والمائية في قارات العالم الجديد',
            lessonNumber: 2,
            unitId: '3_middle_soc_u3',
            unitTitle: 'الوحدة 3: النظم البيئية في قارات العالم الجديد والتغير المناخي',
            subtopics: ['الصحاري الحارة والمعتدلة وصحراء أتاكاما والصحاري الجليدية', 'النظم البيئية المائية العذبة والبحيرات العظمى والشعاب المرجانية بأستراليا', 'المحميات الطبيعية وحماية التنوع البيولوجي']
          },
          {
            id: '3_middle_soc_u3_l3',
            title: 'الدرس الثالث: التغير المناخي وتأثيره على النظم البيئية والتنمية المستدامة',
            lessonNumber: 3,
            unitId: '3_middle_soc_u3',
            unitTitle: 'الوحدة 3: النظم البيئية في قارات العالم الجديد والتغير المناخي',
            subtopics: ['أسباب الاحتباس الحراري وارتفاع درجات الحرارة العالمية', 'ذوبان الجليد وارتفاع منسوب البحار والمحيطات والحرائق الغابية', 'الجهود والمؤتمرات الدولية للحد من الانبعاثات والتحول للأخضر']
          }
        ]
      },
      {
        id: '3_middle_soc_u4',
        title: 'الوحدة 4: الحركة الوطنية في مواجهة الاحتلال البريطاني',
        unitNumber: 4,
        lessons: [
          {
            id: '3_middle_soc_u4_l1',
            title: 'الدرس الأول: مصر في عهد الخديو توفيق والثورة العرابية',
            lessonNumber: 1,
            unitId: '3_middle_soc_u4',
            unitTitle: 'الوحدة 4: الحركة الوطنية في مواجهة الاحتلال البريطاني',
            subtopics: ['أسباب الثورة العرابية وحادثة قصر النيل ومظاهرة عابدين 1881م', 'معركة كفر الدوار ومعركة التل الكبير واحتلال القاهرة 1882م', 'سياسة الاحتلال البريطاني في مصر وسيطرة المعتمد البريطاني']
          },
          {
            id: '3_middle_soc_u4_l2',
            title: 'الدرس الثاني: كفاح الحركة الوطنية وبناء الوعي الوطني (مصطفى كامل ومحمد فريد)',
            lessonNumber: 2,
            unitId: '3_middle_soc_u4',
            unitTitle: 'الوحدة 4: الحركة الوطنية في مواجهة الاحتلال البريطاني',
            subtopics: ['دور مصطفى كامل في إيقاظ الوعي القومي وحادثة دنشواي وتأسيس جريدة اللواء والحزب الوطني', 'كفاح محمد فريد وتأسيس نقابات العمال ومدارس الشعب الليلية ومقاومة مد امتياز قناة السويس', 'التحولات السياسية قبيل الحرب العالمية الأولى']
          },
          {
            id: '3_middle_soc_u4_l3',
            title: 'الدرس الثالث: ثورة 1919م ومراحل التطور الوطني حتى الاستقلال',
            lessonNumber: 3,
            unitId: '3_middle_soc_u4',
            unitTitle: 'الوحدة 4: الحركة الوطنية في مواجهة الاحتلال البريطاني',
            subtopics: ['مقدمات ثورة 1919م والوفد المصري ونفي سعد زغلول ورفاقه', 'أحداث الثورة والشعبية العارمة ومشاركة المرأة ولجنة ملنر', 'تصريح 28 فبراير 1922م ودستور 1923م ومعاهدة 1936م']
          }
        ]
      }
    ]
  },

  // ─── 3_middle الرياضيات ─────────────────────────────────────────────────────
  {
    grade_level: '3_middle',
    subject_name: 'الرياضيات',
    file_name: 'الرياضيات 3ع.md',
    units: [
      {
        id: '3_middle_math_u1',
        title: 'الوحدة 1: الأعداد والعمليات عليها والمعادلات',
        unitNumber: 1,
        lessons: [
          {
            id: '3_middle_math_u1_l1',
            title: 'الدرس الأول: الأسس الكسرية وقوانين القوى في ح',
            lessonNumber: 1,
            unitId: '3_middle_math_u1',
            unitTitle: 'الوحدة 1: الأعداد والعمليات عليها والمعادلات',
            subtopics: ['الجذور والأسس الكسرية والتحويل بين الصورة الجذرية والأسية', 'قوانين ضرب وقسمة ورفع القوى في ح', 'تبسيط المقادير العددية والرمزية']
          },
          {
            id: '3_middle_math_u1_l2',
            title: 'الدرس الثاني: المعادلات الأسية وتطبيقاتها',
            lessonNumber: 2,
            unitId: '3_middle_math_u1',
            unitTitle: 'الوحدة 1: الأعداد والعمليات عليها والمعادلات',
            subtopics: ['قواعد حل المعادلات الأسية (أ^س = أ^ص فإن س = ص)', 'حالة أ^س = ب^س (إما أ = ب أو س = 0)', 'حل تدريبات ومسائل تطبيقية متنوعة']
          }
        ]
      },
      {
        id: '3_middle_math_u2',
        title: 'الوحدة 2: الجبر ودوال كثيرات الحدود والكسور الجبرية',
        unitNumber: 2,
        lessons: [
          {
            id: '3_middle_math_u2_l1',
            title: 'الدرس الأول: الدالة التربيعية وتمثيلها بيانياً',
            lessonNumber: 1,
            unitId: '3_middle_math_u2',
            unitTitle: 'الوحدة 2: الجبر ودوال كثيرات الحدود والكسور الجبرية',
            subtopics: ['الصورة العامة للدالة التربيعية د(س) = أ س² + ب س + جـ', 'رسم منحنى الدالة وتحديد نقطة رأس المنحنى ومحور التماثل', 'القيمة العظمى والصغرى ونقاط التقاطع مع المحاور']
          },
          {
            id: '3_middle_math_u2_l2',
            title: 'الدرس الثاني: مجموعة الأصفار الحقيقية لدوال كثيرات الحدود',
            lessonNumber: 2,
            unitId: '3_middle_math_u2',
            unitTitle: 'الوحدة 2: الجبر ودوال كثيرات الحدود والكسور الجبرية',
            subtopics: ['تعريف ص(د) مجموعة أصفار الدالة', 'إيجاد أصفار الدالة الخطية والتربيعية والتكعيبية بالتحليل', 'استنتاج الأصفار من الرسم البياني']
          },
          {
            id: '3_middle_math_u2_l3',
            title: 'الدرس الثالث: دالة الكسر الجبري ومجالها ومجالها المشترك',
            lessonNumber: 3,
            unitId: '3_middle_math_u2',
            unitTitle: 'الوحدة 2: الجبر ودوال كثيرات الحدود والكسور الجبرية',
            subtopics: ['تعريف الكسر الجبري ومجال الدالة الكسرية الجبرية = ح - أصفار المقام', 'المجال المشترك لكسرين جبريين أو أكثر', 'إيجاد المجال في الحالات المختلفة']
          },
          {
            id: '3_middle_math_u2_l4',
            title: 'الدرس الرابع: تساوي كسرين جبريين واختزال الكسر الجبري',
            lessonNumber: 4,
            unitId: '3_middle_math_u2',
            unitTitle: 'الوحدة 2: الجبر ودوال كثيرات الحدود والكسور الجبرية',
            subtopics: ['شروط اختزال وتبسيط الكسر الجبري لأبسط صورة', 'شروط تساوي كسرين جبريين (تساوي المجالين وتساوي الكسرين بعد الاختزال)', 'التساوي في المجال المشترك']
          },
          {
            id: '3_middle_math_u2_l5',
            title: 'الدرس الخامس: العمليات على الكسور الجبرية النسبية (الجمع والطرح والضرب والقسمة)',
            lessonNumber: 5,
            unitId: '3_middle_math_u2',
            unitTitle: 'الوحدة 2: الجبر ودوال كثيرات الحدود والكسور الجبرية',
            subtopics: ['خطوات جمع وطرح الكسور الجبرية وتوحيد المقامات ومجال الناتج', 'ضرب الكسور الجبرية ومجال الضرب', 'المعكوس الضربي للكسر الجبري وقسمة الكسور الجبرية ومجال القسمة']
          }
        ]
      },
      {
        id: '3_middle_math_u3',
        title: 'الوحدة 3: الهندسة والنسب المثلثية والتشابه',
        unitNumber: 3,
        lessons: [
          {
            id: '3_middle_math_u3_l1',
            title: 'الدرس الأول: تشابه المضلعات ومعامل التشابه',
            lessonNumber: 1,
            unitId: '3_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والنسب المثلثية والتشابه',
            subtopics: ['شروط تشابه مضلعين (تناسب الأضلاع وتساوي الزوايا المتناظرة)', 'معامل التشابه وتصنيف التكبير والتصغير والتطابق', 'النسبة بين محيطي مضلعين متشابهين']
          },
          {
            id: '3_middle_math_u3_l2',
            title: 'الدرس الثاني: تشابه المثلثات وحالاته',
            lessonNumber: 2,
            unitId: '3_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والنسب المثلثية والتشابه',
            subtopics: ['الحالة الأولى: تساوي زاويتين في مثلث مع نظائرهما', 'الحالة الثانية: تناسب أطوال الأضلاع المتناظرة', 'الحالة الثالثة: زاوية وتناسب الضلعين الحاويين لها ونتائج إقليدس']
          },
          {
            id: '3_middle_math_u3_l3',
            title: 'الدرس الثالث: التمدد والتحويلات الهندسية',
            lessonNumber: 3,
            unitId: '3_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والنسب المثلثية والتشابه',
            subtopics: ['مفهوم التمدد في المستوى الإحداثي ومركزه ومعامله', 'خواص التمدد وتأثيره على المسافات والزوايا والتوازي', 'تطبيقات هندسية على التمدد']
          },
          {
            id: '3_middle_math_u3_l4',
            title: 'الدرس الرابع: النسب المثلثية الأساسية للزاوية الحادة',
            lessonNumber: 4,
            unitId: '3_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والنسب المثلثية والتشابه',
            subtopics: ['جيب الزاوية (جا / sin) = المقابل / الوتر', 'جيب تمام الزاوية (جتا / cos) = المجاور / الوتر', 'ظل الزاوية (ظا / tan) = المقابل / المجاور = جا / جتا', 'العلاقة بين جا وجتا للزاويتين المتتامتين']
          },
          {
            id: '3_middle_math_u3_l5',
            title: 'الدرس الخامس: النسب المثلثية لبعض الزوايا الخاصة (30°، 45°، 60°)',
            lessonNumber: 5,
            unitId: '3_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والنسب المثلثية والتشابه',
            subtopics: ['حساب قيم النسب للزوايا 30°، 60°، 45°', 'إيجاد قياس الزاوية بمعلومية إحدى نسبها المثلثية', 'إثبات صحة المعادلات والمتطابقات المثلثية']
          },
          {
            id: '3_middle_math_u3_l6',
            title: 'الدرس السادس: العلاقة بين ميلي المستقيمين المتوازيين والمتعامدين',
            lessonNumber: 6,
            unitId: '3_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والنسب المثلثية والتشابه',
            subtopics: ['قانون الميل = فرق الصادات / فرق السينات = ظا هـ', 'شرط توازي مستقيمين: م1 = م2', 'شرط تعامد مستقيمين: م1 × م2 = -1 وإثبات التعامد والتوازي']
          },
          {
            id: '3_middle_math_u3_l7',
            title: 'الدرس السابع: معادلة الخط المستقيم بدلالة ميله والجزء المقطوع من محور الصادات',
            lessonNumber: 7,
            unitId: '3_middle_math_u3',
            unitTitle: 'الوحدة 3: الهندسة والنسب المثلثية والتشابه',
            subtopics: ['الصورة العامة للمعادلة: ص = م س + جـ', 'إيجاد معادلة الخط المستقيم بمعلومية نقطة وميل أو نقطتين', 'حساب طول الجزء المقطوع من محوري الإحداثيات']
          }
        ]
      },
      {
        id: '3_middle_math_u4',
        title: 'الوحدة 4: الإحصاء ومقاييس التشتت',
        unitNumber: 4,
        lessons: [
          {
            id: '3_middle_math_u4_l1',
            title: 'الدرس الأول: مقاييس التشتت (المدى والمدى الربيعي ومخطط الصندوق)',
            lessonNumber: 1,
            unitId: '3_middle_math_u4',
            unitTitle: 'الوحدة 4: الإحصاء ومقاييس التشتت',
            subtopics: ['مفهوم التشتت والتجانس لمجموعة من البيانات', 'المدى = أكبر قيمة - أصغر قيمة ومزاياه وعيوبه', 'المدى الربيعي = الربيع الأعلى - الربيع الأدنى ومخطط الصندوق']
          },
          {
            id: '3_middle_math_u4_l2',
            title: 'الدرس الثاني: مقاييس التشتت (الانحراف المعياري وحسابه)',
            lessonNumber: 2,
            unitId: '3_middle_math_u4',
            unitTitle: 'الوحدة 4: الإحصاء ومقاييس التشتت',
            subtopics: ['الانحراف المعياري (سيجما σ) كمقياس أدق للتشتت', 'حساب الانحراف المعياري لمجموعة مفردات', 'حساب الانحراف المعياري للتوزيعات التكرارية ذات المجموعات']
          }
        ]
      }
    ]
  },

  // ─── 3_middle اللغة العربية ────────────────────────────────────────────────
  {
    grade_level: '3_middle',
    subject_name: 'اللغة العربية',
    file_name: 'العربي 3 ع.md',
    units: [
      {
        id: '3_middle_ar_u1',
        title: 'الوحدة 1: قيم تحمي شبابنا (التربية والأخلاق)',
        unitNumber: 1,
        lessons: [
          {
            id: '3_middle_ar_u1_l1',
            title: 'الدرس الأول: نص الاستماع (آداب التعامل مع الوالدين وصلة الأرحام)',
            lessonNumber: 1,
            unitId: '3_middle_ar_u1',
            unitTitle: 'الوحدة 1: قيم تحمي شبابنا (التربية والأخلاق)',
            subtopics: ['الاستماع الفعال وحقوق الوالدين في الإسلام والقيم الإنسانية', 'استخلاص الفكر الرئيسة والفرعية', 'بر الوالدين وأثره في استقرار المجتمع وصلاح الفرد']
          },
          {
            id: '3_middle_ar_u1_l2',
            title: 'الدرس الثاني: نص القراءة (أغلى من الذهب وقيمة الوقت)',
            lessonNumber: 2,
            unitId: '3_middle_ar_u1',
            unitTitle: 'الوحدة 1: قيم تحمي شبابنا (التربية والأخلاق)',
            subtopics: ['استثمار الوقت وتنظيم الأولويات في حياة الشباب', 'قاموس المفردات اللغوية والسياقات المتعددة والمضاد والجمع', 'الفهم والاستيعاب والأسئلة التحليلية للنص']
          },
          {
            id: '3_middle_ar_u1_l3',
            title: 'الدرس الثالث: نص القراءة (الصداقة - للدكتور شوقي ضيف)',
            lessonNumber: 3,
            unitId: '3_middle_ar_u1',
            unitTitle: 'الوحدة 1: قيم تحمي شبابنا (التربية والأخلاق)',
            subtopics: ['مفهوم الصداقة الحقيقية ومعايير اختيار الأصدقاء', 'حقوق الصديق وواجباته في الشدة والرخاء', 'تحليل المفردات والأساليب البلاغية في النص']
          },
          {
            id: '3_middle_ar_u1_l4',
            title: 'الدرس الرابع: النص الشعري (تحيَّةٌ للشَّباب - لأمير الشعراء أحمد شوقي)',
            lessonNumber: 4,
            unitId: '3_middle_ar_u1',
            unitTitle: 'الوحدة 1: قيم تحمي شبابنا (التربية والأخلاق)',
            subtopics: ['شرح الأبيات الشعرية ورسالة شوقي للشباب صناع المجد', 'مواطن الجمال والتصوير البلاغي والصور البيانية', 'دلالات الألفاظ والأساليب الإنشائية ودور الشباب في النهضة']
          },
          {
            id: '3_middle_ar_u1_l5',
            title: 'الدرس الخامس: النحو (المشتقات: اسم الفاعل وصيغ المبالغة)',
            lessonNumber: 5,
            unitId: '3_middle_ar_u1',
            unitTitle: 'الوحدة 1: قيم تحمي شبابنا (التربية والأخلاق)',
            subtopics: ['صوغ اسم الفاعل من الفعل الثلاثي (على وزن فاعِل) ومن غير الثلاثي (مُستخرِج)', 'أوزان صيغ المبالغة القياسية الخمسة (فَعّال، مِفْعال، فَعُول، فَعِيل، فَعِل)', 'إعراب المعمول وشروط الإعمال وتطبيقات إعرابية شاملة']
          },
          {
            id: '3_middle_ar_u1_l6',
            title: 'الدرس السادس: التعبير والإملاء (كتابة مقال توجيهي وتطبيقات إملائية)',
            lessonNumber: 6,
            unitId: '3_middle_ar_u1',
            unitTitle: 'الوحدة 1: قيم تحمي شبابنا (التربية والأخلاق)',
            subtopics: ['عناصر المقال التوجيهي والإرشادي للشباب', 'قواعد كتابة الهمزات المتوسطة والمتطرفة وضبط علامات الترقيم', 'تطبيقات الخط العربي والتذوق البلاغي']
          }
        ]
      },
      {
        id: '3_middle_ar_u2',
        title: 'الوحدة 2: نحو تفكير سليم (العقل والمعرفة)',
        unitNumber: 2,
        lessons: [
          {
            id: '3_middle_ar_u2_l1',
            title: 'الدرس الأول: نص الاستماع (ثمرة القراءة وبناء الوعي)',
            lessonNumber: 1,
            unitId: '3_middle_ar_u2',
            unitTitle: 'الوحدة 2: نحو تفكير سليم (العقل والمعرفة)',
            subtopics: ['أهمية الاستماع المركز لاكتساب المعرفة', 'أثر القراءة الواعية في صقل شخصية الفرد وتوسيع مداركه', 'استخلاص الفكرة الرئيسة وتلخيص المسموع']
          },
          {
            id: '3_middle_ar_u2_l2',
            title: 'الدرس الثاني: نص القراءة (أَفْضَلُ النِّعَمِ - نعمة العقل والفكر)',
            lessonNumber: 2,
            unitId: '3_middle_ar_u2',
            unitTitle: 'الوحدة 2: نحو تفكير سليم (العقل والمعرفة)',
            subtopics: ['العقل كأعظم نعمة ميز الله بها الإنسان لعمارة الأرض', 'تحليل المفردات والتراكيب اللغوية والتناغم النصي', 'استخلاص الدروس والعبر الفكرية']
          },
          {
            id: '3_middle_ar_u2_l3',
            title: 'الدرس الثالث: نص القراءة (خَيرُ جَلِيس - القراءة سبيل النجاح)',
            lessonNumber: 3,
            unitId: '3_middle_ar_u2',
            unitTitle: 'الوحدة 2: نحو تفكير سليم (العقل والمعرفة)',
            subtopics: ['الكتاب صديق مخلص يمد القارئ بالمعرفة والخبرات', 'القراءة سبيل النجاح والارتقاء الثقافي والإنساني', 'التحليل الأدبي والفكري لنصوص القراءة']
          },
          {
            id: '3_middle_ar_u2_l4',
            title: 'الدرس الرابع: النص الشعري (تاج الفضائل - للإمام علي بن أبي طالب رضي الله عنه)',
            lessonNumber: 4,
            unitId: '3_middle_ar_u2',
            unitTitle: 'الوحدة 2: نحو تفكير سليم (العقل والمعرفة)',
            subtopics: ['شرح أبيات الحكمة وفضل العقل والأدب على المال والنسب', 'الجماليات والتصوير البديعي والتجانس والطباق', 'القيم التربوية والأخلاقية الرفيعة']
          },
          {
            id: '3_middle_ar_u2_l5',
            title: 'الدرس الخامس: النحو (المشتقات: اسم المفعول، واسما الزمان والمكان، واسم الآلة)',
            lessonNumber: 5,
            unitId: '3_middle_ar_u2',
            unitTitle: 'الوحدة 2: نحو تفكير سليم (العقل والمعرفة)',
            subtopics: ['صوغ اسم المفعول من الثلاثي (مفعول) ومن غير الثلاثي (مُستخرَج)', 'صوغ اسمي الزمان والمكان على وزني (مَفْعَل ومَفْعِل) ومن غير الثلاثي', 'اسم الآلة المشتق القياسي (مِفْعال، مِفْعَل، مِفْعَلة، فَعّالة) والجامد السماعي']
          },
          {
            id: '3_middle_ar_u2_l6',
            title: 'الدرس السادس: التعبير الكتابي (كتابة تقرير صحفي وبحث مصغر)',
            lessonNumber: 6,
            unitId: '3_middle_ar_u2',
            unitTitle: 'الوحدة 2: نحو تفكير سليم (العقل والمعرفة)',
            subtopics: ['خطوات إعداد التقرير المكتمل الأركان', 'صياغة البحث العلمي وتوثيق المراجع والفقرات', 'الضبط النحوي والإملائي السليم']
          }
        ]
      },
      {
        id: '3_middle_ar_u3',
        title: 'الوحدة 3: أنا والمستقبل (العمل والإنتاج والريادة)',
        unitNumber: 3,
        lessons: [
          {
            id: '3_middle_ar_u3_l1',
            title: 'الدرس الأول: نص الاستماع (بناء المستقبل في عصر الآلة والذكاء الاصطناعي)',
            lessonNumber: 1,
            unitId: '3_middle_ar_u3',
            unitTitle: 'الوحدة 3: أنا والمستقبل (العمل والإنتاج والريادة)',
            subtopics: ['الاستعداد للمستقبل ومهارات القرن الحادي والعشرين', 'الذكاء الاصطناعي كأداة لخدمة الإنسانية والإنتاج', 'استيعاب المتغيرات التكنولوجية الحديثة']
          },
          {
            id: '3_middle_ar_u3_l2',
            title: 'الدرس الثاني: نص القراءة (حِرفتُكَ بين يديك وقيمة العمل المهني)',
            lessonNumber: 2,
            unitId: '3_middle_ar_u3',
            unitTitle: 'الوحدة 3: أنا والمستقبل (العمل والإنتاج والريادة)',
            subtopics: ['شرف العمل الحرفي واليدوي في بناء الاقتصاد الوطني', 'التعليم الفني والتكنولوجي ومواكبة متطلبات العصر', 'قاموس المفردات والأسئلة الاستيعابية للنص']
          },
          {
            id: '3_middle_ar_u3_l3',
            title: 'الدرس الثالث: نص القراءة (مستقبل مصر في الزراعة والمشروعات الحديثة)',
            lessonNumber: 3,
            unitId: '3_middle_ar_u3',
            unitTitle: 'الوحدة 3: أنا والمستقبل (العمل والإنتاج والريادة)',
            subtopics: ['المشروعات القومية الزراعية واستصلاح الأراضي والدلتا الجديدة', 'الأمن الغذائي المصري واستخدام نظم الري الحديثة', 'تحليل الفكر الرئيسة والفرعية']
          },
          {
            id: '3_middle_ar_u3_l4',
            title: 'الدرس الرابع: النص الشعري (اصنع بيديك مجدك - للشاعر معروف الرصافي)',
            lessonNumber: 4,
            unitId: '3_middle_ar_u3',
            unitTitle: 'الوحدة 3: أنا والمستقبل (العمل والإنتاج والريادة)',
            subtopics: ['شرح الأبيات وحث الشاعر على العلم والعمل والصناعة لا التغني بالماضي فقط', 'الصور الجمالية والتراكيب البلاغية المؤثرة', 'العاطفة والموسيقى الشعرية الصادقة']
          },
          {
            id: '3_middle_ar_u3_l5',
            title: 'الدرس الخامس: النحو (اسم التفضيل، أسلوب التفضيل، والممنوع من الصرف)',
            lessonNumber: 5,
            unitId: '3_middle_ar_u3',
            unitTitle: 'الوحدة 3: أنا والمستقبل (العمل والإنتاج والريادة)',
            subtopics: ['أركان أسلوب التفضيل (المفضل + اسم التفضيل + المفضل عليه) وشروط صوغه على وزن أفعل', 'الممنوع من الصرف لعلة واحدة (صيغة منتهى الجموع، ألف التأنيث المقصورة والممدودة)', 'الممنوع من الصرف لعلتين (العلمية + 6 علل، الوصفية + 3 علل) وإعرابه']
          },
          {
            id: '3_middle_ar_u3_l6',
            title: 'الدرس السادس: التعبير والمراجعة العامة والامتحانات الشاملة',
            lessonNumber: 6,
            unitId: '3_middle_ar_u3',
            unitTitle: 'الوحدة 3: أنا والمستقبل (العمل والإنتاج والريادة)',
            subtopics: ['كتابة سيرة ذاتية ورؤية مستقبلية واضحة للأهداف المهنية', 'مراجعة شاملة لجميع دروس المشتقات والنحو والبلاغة', 'حل اختبارات ونماذج امتحانات الشهادة الإعدادية الشاملة']
          }
        ]
      }
    ]
  },

  // ─── 3_middle العلوم ────────────────────────────────────────────────────────
  {
    grade_level: '3_middle',
    subject_name: 'العلوم',
    file_name: 'العلوم.md',
    units: [
      {
        id: '3_middle_sci_u1',
        title: 'الوحدة 1: التفاعلات الكيميائية وآثارها البيئية وسرعة التفاعل',
        unitNumber: 1,
        lessons: [
          {
            id: '3_middle_sci_u1_l1',
            title: 'الدرس الأول: أنواع التفاعلات الكيميائية الأساسية',
            lessonNumber: 1,
            unitId: '3_middle_sci_u1',
            unitTitle: 'الوحدة 1: التفاعلات الكيميائية وآثارها البيئية وسرعة التفاعل',
            subtopics: ['متسلسلة النشاط الكيميائي وترتيب الفلزات تنازلياً حسب درجة نشاطها', 'تفاعلات الانحلال الحراري وتفاعلات الإحلال البسيط والإحلال المزدوج والتعادل', 'تفاعلات الأكسدة والاختزال بالمفهوم التقليدي والمفهوم الإلكتروني الحديث']
          },
          {
            id: '3_middle_sci_u1_l2',
            title: 'الدرس الثاني: سرعة التفاعل الكيميائي والعوامل المؤثرة فيها',
            lessonNumber: 2,
            unitId: '3_middle_sci_u1',
            unitTitle: 'الوحدة 1: التفاعلات الكيميائية وآثارها البيئية وسرعة التفاعل',
            subtopics: ['مفهوم سرعة التفاعل الكيميائي وتغير تركيز المتفاعلات والنواتج بمرور الزمن', 'العوامل المؤثرة: طبيعة المتفاعلات (نوع الترابط ومساحة السطح المعرض للتفاعل)', 'تأثير تركيز المتفاعلات، ودرجة الحرارة، والعوامل الحفازة والإنزيمات']
          },
          {
            id: '3_middle_sci_u1_l3',
            title: 'الدرس الثالث: تفاعلات الاحتراق والتلوث البيئي ومخاطر التدخين',
            lessonNumber: 3,
            unitId: '3_middle_sci_u1',
            unitTitle: 'الوحدة 1: التفاعلات الكيميائية وآثارها البيئية وسرعة التفاعل',
            subtopics: ['نواتج احتراق الوقود والأكاسيد الضارة (أكاسيد الكربون، الكبريت، النيتروجين)', 'التأثيرات الصحية والبيئية للغازات السامة والأمطار الحامضية', 'المخاطر الكيميائية والفيزيولوجية للتدخين والإدمان على أجهزة الجسم']
          }
        ]
      },
      {
        id: '3_middle_sci_u2',
        title: 'الوحدة 2: الكهربية والمغناطيسية والنشاط الإشعاعي',
        unitNumber: 2,
        lessons: [
          {
            id: '3_middle_sci_u2_l1',
            title: 'الدرس الأول: الخصائص الفيزيائية للتيار الكهربي وقانون أوم',
            lessonNumber: 1,
            unitId: '3_middle_sci_u2',
            unitTitle: 'الوحدة 2: الكهربية والمغناطيسية والنشاط الإشعاعي',
            subtopics: ['شدة التيار الكهربي (الأمبير) وجهاز الأميتر', 'فرق الجهد والقوة الدافعة الكهربية (الفولت) وجهاز الفولتميتر', 'المقاومة الكهربية (الأوم) وقانون أوم (جـ = ت × م) والريوستات المنزلق']
          },
          {
            id: '3_middle_sci_u2_l2',
            title: 'الدرس الثاني: الأعمدة والدوائر الكهربية وطرق التوصيل',
            lessonNumber: 2,
            unitId: '3_middle_sci_u2',
            unitTitle: 'الوحدة 2: الكهربية والمغناطيسية والنشاط الإشعاعي',
            subtopics: ['مصادر التيار الكهربي (الخلايا الكهروكيميائية والمولدات الكهربية)', 'مقارنة بين التيار الكهربي المستمر والتيار الكهربي المتردد', 'طرق توصيل الأعمدة الكهربية في الدوائر (على التوالي وعلى التوازي) وحساب ق.د.ك الكلية']
          },
          {
            id: '3_middle_sci_u2_l3',
            title: 'الدرس الثالث: القوى الكهربية والمغناطيسية والنشاط الإشعاعي والطاقة النووية',
            lessonNumber: 3,
            unitId: '3_middle_sci_u2',
            unitTitle: 'الوحدة 2: الكهربية والمغناطيسية والنشاط الإشعاعي',
            subtopics: ['ظاهرة النشاط الإشعاعي الطبيعي والصناعي واكتشاف هنري بيكريل', 'الاستخدامات السلمية للطاقة النووية في الطب والزراعة والصناعة وتوليد الكهرباء', 'التلوث الإشعاعي، أضرار الإشعاع، وطرق الوقاية والجرعات الآمنة']
          }
        ]
      },
      {
        id: '3_middle_sci_u3',
        title: 'الوحدة 3: علم الوراثة وتنوع الصفات الحيوية',
        unitNumber: 3,
        lessons: [
          {
            id: '3_middle_sci_u3_l1',
            title: 'الدرس الأول: المبادئ الأساسية للوراثة وتجارب مندل',
            lessonNumber: 1,
            unitId: '3_middle_sci_u3',
            unitTitle: 'الوحدة 3: علم الوراثة وتنوع الصفات الحيوية',
            subtopics: ['تجارب مندل على نبات بسلة الخضر وأسباب اختياره', 'القانون الأول لمندل (قانون انعزال العوامل) والصفة السائدة والمتنحية', 'القانون الثاني لمندل (قانون التوزيع الحر للعوامل الوراثية)']
          },
          {
            id: '3_middle_sci_u3_l2',
            title: 'الدرس الثاني: الجينات والحمض النووي DNA والصفات الوراثية في الإنسان',
            lessonNumber: 2,
            unitId: '3_middle_sci_u3',
            unitTitle: 'الوحدة 3: علم الوراثة وتنوع الصفات الحيوية',
            subtopics: ['تركيب الكروموسوم والتركيب الكيميائي للحمض النووي DNA', 'نموذج واتسون وكريك والجينات كأجزاء من DNA تتحكم في إظهار الصفات', 'آلية عمل الجين وإفراز الإنزيمات والبروتينات وتطبيقات الهندسة الوراثية']
          },
          {
            id: '3_middle_sci_u3_l3',
            title: 'الدرس الثالث: الانتخاب الطبيعي والانتخاب الصناعي والتنوع الحيوي',
            lessonNumber: 3,
            unitId: '3_middle_sci_u3',
            unitTitle: 'الوحدة 3: علم الوراثة وتنوع الصفات الحيوية',
            subtopics: ['مفهوم الانتخاب الطبيعي والبقاء للأصلح والتكيف البيئي', 'الانتخاب الصناعي والتهجين وتحسين السلالات النباتية والحيوانية', 'الحفاظ على التنوع الوراثي وبنوك الجينات']
          }
        ]
      },
      {
        id: '3_middle_sci_u4',
        title: 'الوحدة 4: تأريخ كوكب الأرض والسجل الحفري والتطور',
        unitNumber: 4,
        lessons: [
          {
            id: '3_middle_sci_u4_l1',
            title: 'الدرس الأول: الحفريات وتأريخ الأرض والسجل الحفري',
            lessonNumber: 1,
            unitId: '3_middle_sci_u4',
            unitTitle: 'الوحدة 4: تأريخ كوكب الأرض والسجل الحفري والتطور',
            subtopics: ['أنواع الحفريات (كائن كامل، قالب، طابع، متحجرة) وشروط تكوّنها', 'أهمية الحفريات في تحديد العمر النسبي للصخور والتنقيب عن البترول', 'السجل الحفري ودراسة تسلسل وتطور الحياة من البسيط إلى المعقد']
          },
          {
            id: '3_middle_sci_u4_l2',
            title: 'الدرس الثاني: الأزمنة الجيولوجية والانقراض وتاريخ الأرض',
            lessonNumber: 2,
            unitId: '3_middle_sci_u4',
            unitTitle: 'الوحدة 4: تأريخ كوكب الأرض والسجل الحفري والتطور',
            subtopics: ['تقسيم تاريخ الأرض إلى أحقاب وعصور وأزمنة جيولوجية', 'مفهوم الانقراض وأسبابه القديمة (النيازك، الحركات الأرضية) والحديثة', 'أثر الانقراض على التوازن البيئي وطرق حماية الأنواع المهددة']
          }
        ]
      }
    ]
  },

  // ─── 3_middle اللغة الإنجليزية ──────────────────────────────────────────────
  {
    grade_level: '3_middle',
    subject_name: 'اللغة الإنجليزية',
    file_name: 'اللغة الانجليزية 3 ع.md',
    units: [
      {
        id: '3_middle_eng_u1',
        title: 'Unit 1: Personal Identity (الهوية الشخصية وتطوير الذات)',
        unitNumber: 1,
        lessons: [
          {
            id: '3_middle_eng_u1_l1',
            title: 'Lessons 1 & 2: Personal Identity & Self-discovery',
            lessonNumber: 1,
            unitId: '3_middle_eng_u1',
            unitTitle: 'Unit 1: Personal Identity (الهوية الشخصية وتطوير الذات)',
            subtopics: ['Core values, beliefs, self-respect, and unique strengths', 'Adjectives describing personality traits and emotional intelligence', 'Definitions and collocations with identity and personal growth']
          },
          {
            id: '3_middle_eng_u1_l2',
            title: 'Lessons 3 & 4: The Mirror Moment & Overcoming Challenges',
            lessonNumber: 2,
            unitId: '3_middle_eng_u1',
            unitTitle: 'Unit 1: Personal Identity (الهوية الشخصية وتطوير الذات)',
            subtopics: ['Reading text: The Mirror Moment and discovering inner resilience', 'Present Perfect Simple vs. Past Simple in life narratives', 'Word formation and suffixes (-ness, -ity, -tion)']
          },
          {
            id: '3_middle_eng_u1_l3',
            title: 'Lessons 5 & 6: Respecting Personal Identity & Writing a Profile',
            lessonNumber: 3,
            unitId: '3_middle_eng_u1',
            unitTitle: 'Unit 1: Personal Identity (الهوية الشخصية وتطوير الذات)',
            subtopics: ['Speaking: Discussing personal growth and ethical choices', 'Writing a personal bio and self-reflection essay', 'Unit review and language practice']
          }
        ]
      },
      {
        id: '3_middle_eng_u2',
        title: 'Unit 2: Family and Friends Communication (التواصل وبناء العلاقات)',
        unitNumber: 2,
        lessons: [
          {
            id: '3_middle_eng_u2_l1',
            title: 'Lessons 1 & 2: Communication, Challenges and Solutions',
            lessonNumber: 1,
            unitId: '3_middle_eng_u2',
            unitTitle: 'Unit 2: Family and Friends Communication (التواصل وبناء العلاقات)',
            subtopics: ['Vocabulary for interpersonal communication and active listening', 'Phrasal verbs in social relationships (get along with, make up, count on)', 'Identifying root causes of teenage misunderstandings']
          },
          {
            id: '3_middle_eng_u2_l2',
            title: 'Lessons 3 & 4: Effective Communication & Past Sequences',
            lessonNumber: 2,
            unitId: '3_middle_eng_u2',
            unitTitle: 'Unit 2: Family and Friends Communication (التواصل وبناء العلاقات)',
            subtopics: ['Past Perfect Tense with time linkers (After, Before, By the time)', 'Reading: Connecting with family and resolving conflicts', 'Prepositions with communication verbs']
          },
          {
            id: '3_middle_eng_u2_l3',
            title: 'Lessons 5 & 6: Connecting with Others & Writing Advice',
            lessonNumber: 3,
            unitId: '3_middle_eng_u2',
            unitTitle: 'Unit 2: Family and Friends Communication (التواصل وبناء العلاقات)',
            subtopics: ['Role-playing constructive conversations', 'Writing an advice email to resolve peer friction', 'Unit vocabulary and grammar consolidation']
          }
        ]
      },
      {
        id: '3_middle_eng_u3',
        title: 'Unit 3: Artificial Intelligence (الذكاء الاصطناعي ومستقبل التكنولوجيا)',
        unitNumber: 3,
        lessons: [
          {
            id: '3_middle_eng_u3_l1',
            title: 'Lessons 1 & 2: Artificial Intelligence (AI) Fundamentals',
            lessonNumber: 1,
            unitId: '3_middle_eng_u3',
            unitTitle: 'Unit 3: Artificial Intelligence (الذكاء الاصطناعي ومستقبل التكنولوجيا)',
            subtopics: ['Key terms: AI technology, algorithms, robots, machine learning, virtual reality', 'How AI transforms industry, smart homes, and surgery', 'Collocations with modern computing']
          },
          {
            id: '3_middle_eng_u3_l2',
            title: 'Lessons 3 & 4: AI in Everyday Life & Future Predictions',
            lessonNumber: 2,
            unitId: '3_middle_eng_u3',
            unitTitle: 'Unit 3: Artificial Intelligence (الذكاء الاصطناعي ومستقبل التكنولوجيا)',
            subtopics: ['Grammar: Future Forms (Will, Going to, Present Continuous)', 'Reading: Smart medical assistants and personalized digital tutors', 'Automation and the future of job markets']
          },
          {
            id: '3_middle_eng_u3_l3',
            title: 'Lessons 5 & 6: The Future of AI: Debate & Essay Writing',
            lessonNumber: 3,
            unitId: '3_middle_eng_u3',
            unitTitle: 'Unit 3: Artificial Intelligence (الذكاء الاصطناعي ومستقبل التكنولوجيا)',
            subtopics: ['Staging a class debate on AI ethics and human creativity', 'Writing a balanced pros-and-cons essay on artificial intelligence', 'Unit assessment quiz']
          }
        ]
      },
      {
        id: '3_middle_eng_u4',
        title: 'Unit 4: Screen Time & Digital Well-being (وقت الشاشة والتوازن الرقمي)',
        unitNumber: 4,
        lessons: [
          {
            id: '3_middle_eng_u4_l1',
            title: 'Lessons 1 & 2: Screen Time & Habits',
            lessonNumber: 1,
            unitId: '3_middle_eng_u4',
            unitTitle: 'Unit 4: Screen Time & Digital Well-being (وقت الشاشة والتوازن الرقمي)',
            subtopics: ['Vocabulary: Screen time, smart citizens, digital fatigue, distractions', 'Health side effects of late-night scrolling on eyesight and sleep', 'Phrasal verbs with tech devices (switch off, log out, cut down on)']
          },
          {
            id: '3_middle_eng_u4_l2',
            title: 'Lessons 3 & 4: Digital Well-being & Passive Voice',
            lessonNumber: 2,
            unitId: '3_middle_eng_u4',
            unitTitle: 'Unit 4: Screen Time & Digital Well-being (وقت الشاشة والتوازن الرقمي)',
            subtopics: ['Grammar: Passive Voice in Present Simple and Past Simple', 'Reading: Guidelines for a healthy digital detox', 'Adjectives describing mindfulness vs. distraction']
          },
          {
            id: '3_middle_eng_u4_l3',
            title: 'Lessons 5 & 6: Balancing Screen Time & Opinion Essay',
            lessonNumber: 3,
            unitId: '3_middle_eng_u4',
            unitTitle: 'Unit 4: Screen Time & Digital Well-being (وقت الشاشة والتوازن الرقمي)',
            subtopics: ['Speaking: Presenting a daily digital wellness schedule', 'Writing an opinion essay on managing device usage during study time', 'Unit review']
          }
        ]
      },
      {
        id: '3_middle_eng_u5',
        title: 'Unit 5: Design Thinking (التفكير التصميمي وحل المشكلات)',
        unitNumber: 5,
        lessons: [
          {
            id: '3_middle_eng_u5_l1',
            title: 'Lessons 1 & 2: Think Like a Designer',
            lessonNumber: 1,
            unitId: '3_middle_eng_u5',
            unitTitle: 'Unit 5: Design Thinking (التفكير التصميمي وحل المشكلات)',
            subtopics: ['Key terms: Empathy, define, ideate, prototype, test', 'Creative brainstorming techniques and user-centered design', 'Vocabulary of product innovation and engineering']
          },
          {
            id: '3_middle_eng_u5_l2',
            title: 'Lessons 3 & 4: Problem Solving & Innovation',
            lessonNumber: 2,
            unitId: '3_middle_eng_u5',
            unitTitle: 'Unit 5: Design Thinking (التفكير التصميمي وحل المشكلات)',
            subtopics: ['Modal verbs for possibility and necessity (must, can, should, might)', 'Reading: Real-world engineering solutions created by young inventors', 'Collaborative project planning']
          },
          {
            id: '3_middle_eng_u5_l3',
            title: 'Lessons 5 & 6: Design Thinking in Action & Project Presentation',
            lessonNumber: 3,
            unitId: '3_middle_eng_u5',
            unitTitle: 'Unit 5: Design Thinking (التفكير التصميمي وحل المشكلات)',
            subtopics: ['Speaking: Pitching an innovative school or community solution', 'Writing a design proposal report with diagrammatic stages', 'Unit vocabulary review']
          }
        ]
      },
      {
        id: '3_middle_eng_u6',
        title: 'Unit 6: Why We Love Stories (لماذا نحب القصص؟ وقوة السرد)',
        unitNumber: 6,
        lessons: [
          {
            id: '3_middle_eng_u6_l1',
            title: 'Lessons 1 & 2: Stories Shape Our Thinking',
            lessonNumber: 1,
            unitId: '3_middle_eng_u6',
            unitTitle: 'Unit 6: Why We Love Stories (لماذا نحب القصص؟ وقوة السرد)',
            subtopics: ['Literary vocabulary: Moral, empathy, conflict, point of view, narrator', 'How storytelling fosters social awareness and emotional resilience', 'Action verbs in dramatic narratives']
          },
          {
            id: '3_middle_eng_u6_l2',
            title: 'Lessons 3 & 4: Elements of a Story & Reported Speech',
            lessonNumber: 2,
            unitId: '3_middle_eng_u6',
            unitTitle: 'Unit 6: Why We Love Stories (لماذا نحب القصص؟ وقوة السرد)',
            subtopics: ['Grammar: Reported Speech (Statements and Questions with tense backshifts)', 'Reading: A story that changed a student’s perspective on courage', 'Character development and plot climax analysis']
          },
          {
            id: '3_middle_eng_u6_l3',
            title: 'Lessons 5 & 6: The Power of Stories & Final Examination Practice',
            lessonNumber: 3,
            unitId: '3_middle_eng_u6',
            unitTitle: 'Unit 6: Why We Love Stories (لماذا نحب القصص؟ وقوة السرد)',
            subtopics: ['Writing a captivating short story with dialogue and an inspiring moral', 'Retelling historical and modern folktales', 'Comprehensive end-of-term examination revision']
          }
        ]
      }
    ]
  }
];

// ─── Main Execution ──────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting 3_middle Curricula Re-upload & Indexing Pipeline...');
  console.log(`Target: 5 Curricula for 3_middle (Clean Overwrite)`);

  const outputBase = path.resolve(__dirname, '../../Curriculum Generator/output/3_middle');
  const uploaded3MiddleIds = [];

  for (const currDef of MIDDLE_3_DEFINITIONS) {
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
    uploaded3MiddleIds.push(newCurriculumId);
  }

  // 5. Update system_settings with all uploaded curriculum IDs
  console.log(`\n===============================================================`);
  console.log(`Updating System Settings (active_curriculum_ids & active_grade_levels)...`);

  const { data: allCurriculumsInDb } = await supabase.from('curriculums').select('id');
  const allIds = allCurriculumsInDb ? allCurriculumsInDb.map(c => c.id) : uploaded3MiddleIds;

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

  console.log(`\n🎉 All 5 Curricula for 3_middle re-uploaded, re-embedded, indexed, and activated successfully!`);
}

main().catch(err => {
  console.error('Fatal pipeline error:', err);
  process.exit(1);
});
