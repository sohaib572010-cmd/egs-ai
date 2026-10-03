#!/usr/bin/env node
/**
 * Validates a curriculum Markdown file against the EGS AI canonical format:
 *   # منهج <subject>
 *   # الوحدة N: ...        (group heading: directly followed by its chapters)
 *   # الفصل N: ...         (teaching block: holds at least one lesson)
 *   ## الدرس N: ...        (lessons numbered 1..n inside each block)
 *   ### / ####             (sections inside a lesson)
 * An optional "# مقدمات أساسية" block holds unnumbered "## <title>" introductory sections.
 */
import fs from 'fs';
import path from 'path';

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}]/gu;

function validate(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const errors = [];
  const warnings = [];

  const headings = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
  });

  if (!headings[0] || headings[0].level !== 1 || !headings[0].text.startsWith('منهج')) {
    errors.push('L1: the file must start with "# منهج <subject>".');
  }

  const blocks = [];
  for (let i = 1; i < headings.length; i++) {
    const h = headings[i];
    if (!h.text) errors.push(`L${h.line}: empty heading.`);
    if (h.level === 1) {
      const next = headings[i + 1];
      const between = next ? lines.slice(h.line, next.line - 1).join('').trim() : 'x';
      const isGroup = !!next && next.level === 1 && between === '';
      blocks.push({ ...h, isGroup, isIntro: h.text === 'مقدمات أساسية', lessons: [] });
    } else if (h.level === 2) {
      const block = blocks[blocks.length - 1];
      if (!block) {
        errors.push(`L${h.line}: lesson before any unit or chapter: "${h.text}"`);
        continue;
      }
      const m = h.text.match(/^(?:الدرس|Lesson)\s+(\d{1,2})\s*:\s*(.+)$/i);
      if (!m && !block.isIntro) errors.push(`L${h.line}: level-2 heading must be "## الدرس N: title": "${h.text}"`);
      block.lessons.push({ number: m ? Number(m[1]) : null, line: h.line, text: h.text });
    }
  }

  for (const b of blocks) {
    if (b.isGroup) continue;
    if (b.lessons.length === 0) errors.push(`L${b.line}: "${b.text}" has no lessons.`);
    if (b.isIntro) continue;
    b.lessons.forEach((l, i) => {
      if (l.number !== i + 1) errors.push(`L${l.line}: expected lesson ${i + 1} in "${b.text}", found "${l.text}"`);
    });
  }

  const comments = (content.match(/<!--/g) || []).length;
  if (comments > 0) warnings.push(`${comments} HTML comment(s) left in the content (page markers should be removed).`);
  const emojis = content.match(EMOJI) || [];
  if (emojis.length > 0) errors.push(`${emojis.length} emoji(s) found.`);
  const displayMath = (content.match(/\$\$/g) || []).length;
  if (displayMath % 2 !== 0) errors.push(`Unbalanced display math: ${displayMath} "$$" delimiters.`);
  lines.forEach((line, i) => {
    const singles = line.replace(/\$\$/g, '').replace(/\\\$/g, '').match(/\$/g) || [];
    if (singles.length % 2 !== 0) warnings.push(`L${i + 1}: odd number of inline "$" delimiters.`);
  });
  if (content.length < 5000) warnings.push(`Suspiciously small file (${content.length} chars).`);

  const teaching = blocks.filter((b) => !b.isGroup);
  console.log(`File: ${filePath}`);
  console.log(`Groups: ${blocks.filter((b) => b.isGroup).length}, blocks: ${teaching.length}, lessons: ${teaching.reduce((n, b) => n + b.lessons.length, 0)}`);
  for (const b of blocks) {
    console.log(`${b.isGroup ? '' : '  '}${b.text}`);
    for (const l of b.lessons) console.log(`      ${l.text}`);
  }
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    warnings.slice(0, 15).forEach((w) => console.log(`  - ${w}`));
  }
  if (errors.length) {
    console.error(`\nFailed with ${errors.length} error(s):`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
  console.log('\nPassed.');
}

const target = process.argv[2];
if (!target) {
  console.error('Usage: npm run verify -- <path/to/curriculum.md>');
  process.exit(1);
}
validate(path.resolve(target));
