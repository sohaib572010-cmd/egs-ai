import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const config = {};
envContent.split('\n').forEach(line => {
  const t = line.trim();
  if (t && !t.startsWith('#')) {
    const idx = t.indexOf('=');
    if (idx !== -1) {
      let v = t.substring(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      config[t.substring(0, idx).trim()] = v;
    }
  }
});

const supabase = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

const outputDir = 'c:/myapp/Curriculum Generator/output';

// Subject name to file mapping
const FILE_MAP = {
  '1_high': {
    'التاريخ': 'التاريخ.md',
    'الرياضيات': 'الرياضيات.md',
    'العلوم': 'العلوم.md',
    'الفلسفة': 'الفلسفة.md',
    'اللغة الإنجليزية': 'اللغة الانجليزية.md',
    'اللغة العربية': 'اللغة العربية.md'
  },
  '1_middle': {
    'الدراسات الإجتماعية': 'الدراسات الإجتماعية.md',
    'الرياضيات': 'الرياضيات.md',
    'العلوم': 'العلوم.md',
    'اللغة الإنجليزية': 'اللغة الإنجليزية.md',
    'اللغة العربية': 'اللغة العربية.md'
  },
  '2_high': {
    'التاريخ المصري': 'Egyptian History.md'
  },
  '2_middle': {
    'الدراسات الإجتماعية': 'الدراسات الإجتماعية.md',
    'الرياضيات': 'الرياضيات.md',
    'العلوم': 'العلوم.md',
    'اللغة الإنجليزية': 'اللغة الإنجليزية.md',
    'اللغة العربية': 'اللغة العربية.md'
  },
  '3_middle': {
    'الدراسات الإجتماعية': 'الدراسات 3ع.md',
    'الرياضيات': 'الرياضيات 3ع.md',
    'اللغة العربية': 'العربي 3 ع.md',
    'العلوم': 'العلوم.md',
    'اللغة الإنجليزية': 'اللغة الانجليزية 3 ع.md'
  }
};

async function main() {
  console.log('Fetching curriculums from Supabase...');
  const { data: curriculums, error: currErr } = await supabase.from('curriculums').select('*');
  if (currErr) {
    console.error('Error:', currErr);
    return;
  }

  console.log(`Found ${curriculums.length} curriculums in Supabase.`);
  let updatedCount = 0;

  for (const curr of curriculums) {
    if (curr.is_placeholder) {
      console.log(`- Skipping placeholder: [${curr.grade_level}] "${curr.subject_name}"`);
      continue;
    }

    const gradeFiles = FILE_MAP[curr.grade_level];
    if (!gradeFiles || !gradeFiles[curr.subject_name]) {
      console.log(`- No local file mapped for [${curr.grade_level}] "${curr.subject_name}"`);
      continue;
    }

    const fileName = gradeFiles[curr.subject_name];
    const fullPath = path.join(outputDir, curr.grade_level, fileName);

    if (!fs.existsSync(fullPath)) {
      console.warn(`! File not found: ${fullPath}`);
      continue;
    }

    const fileContent = fs.readFileSync(fullPath, 'utf8');
    console.log(`Processing [${curr.grade_level}] "${curr.subject_name}" (${(fileContent.length / 1024).toFixed(1)} KB)...`);

    // 1. Delete existing __RAW_MARKDOWN__ chunk if any
    await supabase
      .from('curriculum_chunks')
      .delete()
      .eq('curriculum_id', curr.id)
      .eq('heading', '__RAW_MARKDOWN__');

    // 2. Insert new __RAW_MARKDOWN__ chunk
    const rawChunk = {
      id: crypto.randomUUID(),
      curriculum_id: curr.id,
      content: fileContent,
      heading: '__RAW_MARKDOWN__',
      chunk_level: 'parent',
      parent_id: null,
      position_index: -99,
      embedding: null
    };

    const { error: insertErr } = await supabase.from('curriculum_chunks').insert(rawChunk);
    if (insertErr) {
      console.error(`  Error inserting __RAW_MARKDOWN__ chunk for ${curr.subject_name}:`, insertErr);
    } else {
      console.log(`  Stored exact raw markdown chunk (${fileContent.length} chars).`);
      updatedCount++;
    }

    // 3. Try to update content column on curriculums table too if present
    await supabase.from('curriculums').update({ content: fileContent }).eq('id', curr.id);
  }

  console.log(`\nSuccessfully updated ${updatedCount} curriculums with exact raw Markdown in Supabase.`);

  // 4. Also update local db_data.json
  const localDbPath = path.resolve(__dirname, '../db_data.json');
  if (fs.existsSync(localDbPath)) {
    try {
      const localData = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
      if (Array.isArray(localData.curriculums)) {
        for (const curr of localData.curriculums) {
          const gradeFiles = FILE_MAP[curr.grade_level];
          if (gradeFiles && gradeFiles[curr.subject_name]) {
            const fileName = gradeFiles[curr.subject_name];
            const fullPath = path.join(outputDir, curr.grade_level, fileName);
            if (fs.existsSync(fullPath)) {
              curr.content = fs.readFileSync(fullPath, 'utf8');
            }
          }
        }
      }
      fs.writeFileSync(localDbPath, JSON.stringify(localData, null, 2), 'utf8');
      console.log('Synchronized db_data.json with raw content.');
    } catch (err) {
      console.warn('Notice syncing local db_data.json:', err.message);
    }
  }
}

main().catch(console.error);
