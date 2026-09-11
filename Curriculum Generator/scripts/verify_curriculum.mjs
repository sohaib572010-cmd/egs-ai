#!/usr/bin/env node
/**
 * Automated Curriculum Markdown Quality & Integrity Validator
 * Enforces zero emojis, sequential lesson numbering, unit hierarchy,
 * balanced LaTeX and brackets, and flags known OCR errors.
 */

import fs from 'fs';
import path from 'path';

function validateCurriculum(filePath) {
  console.log(`\n🔍 Validating Curriculum: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const errors = [];
  const warnings = [];

  // 1. File Size Check
  if (content.length < 5000) {
    errors.push(`File is suspiciously small (${content.length} bytes).`);
  }

  // 2. Unit (#) and Lesson (##) Structure
  const units = [];
  const lessonsByUnit = new Map();
  let currentUnit = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Check Unit header
    if (line.startsWith('# ') && !line.startsWith('# منهج')) {
      const uMatch = line.match(/^#\s+(?:(الوحدة|الفصل|Unit|Chapter)\s+([^\s:]+))(?:\s*[:\-]\s*(.*))?$/i);
      if (uMatch) {
        currentUnit = {
          lineNum,
          type: uMatch[1],
          numStr: uMatch[2],
          title: uMatch[3] || '',
          raw: line
        };
        units.push(currentUnit);
        lessonsByUnit.set(currentUnit, []);
      } else if (!line.startsWith('# قسم') && !line.startsWith('# القصة')) {
        warnings.push(`L${lineNum}: Non-standard top-level heading: "${line}"`);
      }
    }

    // Check Lesson header
    if (line.startsWith('## ')) {
      const lMatch = line.match(/^##\s+(?:(الدرس|الموضوع|Lesson)\s+(\d{1,2}))(?:\s*[:\-]\s*(.*))?$/i);
      if (lMatch) {
        const lesson = {
          lineNum,
          lessonNum: parseInt(lMatch[2], 10),
          title: lMatch[3] || '',
          raw: line
        };
        if (!currentUnit) {
          errors.push(`L${lineNum}: Lesson declared before any Unit header: "${line}"`);
        } else {
          lessonsByUnit.get(currentUnit).push(lesson);
        }
      } else {
        warnings.push(`L${lineNum}: Level 2 heading does not follow "## الدرس [رقم]: [عنوان]": "${line}"`);
      }
    }
  }

  if (units.length === 0) {
    errors.push('No Unit (# الوحدة / # الفصل) headers found in document.');
  }

  // Verify sequential lesson numbering in each unit
  let totalLessons = 0;
  for (const [unit, lessons] of lessonsByUnit.entries()) {
    totalLessons += lessons.length;
    if (lessons.length === 0) {
      warnings.push(`L${unit.lineNum}: Unit "${unit.raw}" contains 0 lessons.`);
      continue;
    }

    for (let j = 0; j < lessons.length; j++) {
      const expectedNum = j + 1;
      const actualNum = lessons[j].lessonNum;
      if (actualNum !== expectedNum) {
        errors.push(
          `L${lessons[j].lineNum}: Lesson numbering sequence broken in ${unit.raw}. Expected lesson ${expectedNum}, found ${actualNum} ("${lessons[j].raw}")`
        );
      }
    }
  }

  // 3. Emojis Check (CODING_GUIDELINES Rule 1 & 4)
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}⚠️⭐💡🤔🔎👆®™©]/gu;
  const emojiMatches = content.match(emojiRegex) || [];
  if (emojiMatches.length > 0) {
    errors.push(`Found ${emojiMatches.length} prohibited emoji(s) in content: [${emojiMatches.slice(0, 5).join(', ')}${emojiMatches.length > 5 ? '...' : ''}]`);
  }

  // 4. Bracket Balance Check
  const openBrackets = (content.match(/\[/g) || []).length;
  const closeBrackets = (content.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    errors.push(`Mismatched markdown brackets: ${openBrackets} '[' vs ${closeBrackets} ']'.`);
  }

  // 5. LaTeX Syntax Balance
  const inlineOpen = (content.match(/\\\(/g) || []).length;
  const inlineClose = (content.match(/\\\)/g) || []).length;
  if (inlineOpen !== inlineClose) {
    errors.push(`Mismatched inline LaTeX math tags: ${inlineOpen} '\\(' vs ${inlineClose} '\\)'.`);
  }

  const blockOpen = (content.match(/\\\[/g) || []).length;
  const blockClose = (content.match(/\\\]/g) || []).length;
  if (blockOpen !== blockClose) {
    errors.push(`Mismatched block LaTeX math tags: ${blockOpen} '\\[' vs ${blockClose} '\\]'.`);
  }

  // 6. Known OCR Typo Patterns
  const typoPatterns = [
    { regex: /دقيقة أساسية/g, label: 'دقيقة أساسية (should be حقيقة أساسية)' },
    { regex: /حقيبة أساسية/g, label: 'حقيبة أساسية (should be حقيقة أساسية)' },
    { regex: /منطقة الحل/g, label: 'منطقة الحل (should be منطقية الحل)' },
    { regex: /كنتب البيانات/g, label: 'كنتب البيانات (should be كتيب البيانات)' },
    { regex: /طبعة العلم/g, label: 'طبعة العلم (should be طبيعة العلم)' },
    { regex: /طبيعة العالم:\s*النماذج/g, label: 'طبيعة العالم: النماذج (should be طبيعة العلم)' },
    { regex: /عيّارة/g, label: 'عيّارة (should be عبّارة)' },
    { regex: /مطارين العرب/g, label: 'مطارين العرب (should be مطار برج العرب)' }
  ];

  for (const t of typoPatterns) {
    const matches = content.match(t.regex);
    if (matches) {
      errors.push(`Found ${matches.length} occurrence(s) of OCR typo: ${t.label}`);
    }
  }

  // Summary Report
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Validation Report:`);
  console.log(`   • Units Found:    ${units.length}`);
  console.log(`   • Total Lessons:  ${totalLessons}`);
  console.log(`   • Emojis Count:   ${emojiMatches.length}`);
  console.log(`   • LaTeX Blocks:   ${blockOpen} block, ${inlineOpen} inline`);
  console.log(`   • Warnings:       ${warnings.length}`);
  console.log(`   • Errors:         ${errors.length}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  if (warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    warnings.slice(0, 10).forEach(w => console.log(`   ${w}`));
  }

  if (errors.length > 0) {
    console.error(`\n❌ Validation Failed with ${errors.length} error(s):`);
    errors.forEach(e => console.error(`   - ${e}`));
    process.exit(1);
  }

  console.log(`\n✅ Curriculum Passed All Integrity & Formatting Checks!`);
}

const defaultTarget = fs.existsSync('output/2_high/الفيزياء.md')
  ? 'output/2_high/الفيزياء.md'
  : (fs.existsSync('Curriculum Generator/output/2_high/الفيزياء.md')
    ? 'Curriculum Generator/output/2_high/الفيزياء.md'
    : path.join(process.cwd(), 'output/2_high/الفيزياء.md'));
const targetFile = process.argv[2] || defaultTarget;
validateCurriculum(path.resolve(targetFile));
