import { callDeepSeekVision } from '@/lib/gemini';

const EDENAI_VQA_URL = 'https://api.edenai.run/v2/image/question_answer';

const TRANSCRIBE_PROMPT = `You are a precise OCR transcriber for photos sent by Egyptian school students (textbook pages, worksheets, exam papers, notebooks, handwriting, whiteboards, screenshots). Your only job is to copy what is in the image exactly. Do NOT solve, explain, summarize, translate, or correct anything.

Numbers and math:
- Copy every digit, sign, decimal point, fraction, exponent, root, subscript, unit and variable exactly as written. Never round, compute, simplify, or "fix" a value that looks wrong.
- Keep each number in the digit style used in the image (Eastern Arabic ٠-٩ or Western 0-9) and in its exact digit order; multi-digit numbers are written left to right even inside Arabic text.
- Check easily confused shapes against their context before writing them: ٢/٣, ٤/٣, ٦/٧, ٥/0, ٠/decimal point, 1/7, 5/S, 0/O, x/×, minus/dash, = vs -, 2 vs z, and which number is a superscript or subscript.
- Keep Arabic variable letters (س، ص، ع، م، ن ...) as written; do not replace them with x or y.
- Write each expression in its original order. Write fractions as numerator/denominator (numerator first), powers as base^exponent, roots as √(...).

Layout and order:
- Read Arabic pages right to left, top to bottom; on multi-column pages finish the right column before the left one. English pages read left to right.
- Keep every question number and letter exactly as printed (1، 2، أ، ب، (i) ...). One question per paragraph, in the original order. Never merge, split, reorder, or drop questions.
- Keep each multiple-choice option with its own label, and each "complete" blank as "......".
- Write tables as Markdown tables with the same rows, columns, and cell values in reading order.
- If both printed text and the student's handwriting appear, put the handwriting under a separate line "كتابة الطالب:".

Figures: under "الأشكال:" describe every diagram, graph, or geometric figure with all its labels and values, stating which value belongs to which side, angle, point, or axis.

Uncertainty: if a character or value is unclear, write your best reading followed by [؟]. If text is cut off at the edge, write [مقطوع]. Never fill gaps by guessing silently.

If the image contains no text (an object, an experiment, a scene), describe precisely what is visible.

Keep the words in the language of the image. Reply using exactly this structure and nothing else:
نوع الصورة: <short type>
النص:
<full transcription>
الأشكال: <figures, or لا يوجد>
ملاحظات القراءة: <unclear or cut-off parts, or لا يوجد>`;

const verifyPrompt = (draft: string) => `Below is a draft transcription of the attached image. Check it against the image line by line:
- every number digit by digit, every sign and operator, every exponent, subscript, fraction, and unit;
- question numbers, option labels, and the order of the questions;
- every table cell and every label on the figures.
Fix every mismatch, add anything missing, and remove anything that is not in the image. Do not solve or explain anything. Keep the same structure and rules (original digit style, [؟] for unclear values, [مقطوع] for cut-off text). Reply with the corrected full transcription only.

Draft:
${draft}`;

async function readWithEdenAI(base64: string, mimeType: string): Promise<string> {
  const apiKey = process.env.EDENAI_API_KEY || '';
  if (!apiKey) return '';
  try {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const formData = new FormData();
    formData.append('providers', 'google');
    formData.append('fallback_providers', 'openai');
    formData.append('file', new Blob([bytes], { type: mimeType }), `image.${mimeType.split('/')[1] || 'jpg'}`);
    formData.append('question', TRANSCRIBE_PROMPT);
    const response = await fetch(EDENAI_VQA_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData
    });
    if (!response.ok) {
      console.error('EdenAI VQA error:', response.status);
      return '';
    }
    const data = await response.json();
    return (data?.google?.answers?.[0] || data?.openai?.answers?.[0] || data?.google?.answer || data?.openai?.answer || '').trim();
  } catch (err) {
    console.error('EdenAI VQA failed:', err);
    return '';
  }
}

/**
 * Transcribes a student's photo with DeepSeek vision, then runs a second pass that checks the draft
 * against the image (digits, signs, numbering, order). Falls back to EdenAI VQA. Returns '' on failure.
 */
export async function readStudentImage(base64: string, mimeType: string = 'image/jpeg'): Promise<string> {
  if (!base64) return '';
  const mime = mimeType || 'image/jpeg';
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const draft = await callDeepSeekVision(base64, mime, TRANSCRIBE_PROMPT);
      if (draft) {
        try {
          const verified = await callDeepSeekVision(base64, mime, verifyPrompt(draft));
          if (verified.includes('النص:') || verified.length >= draft.length * 0.6) return verified;
        } catch (verifyErr) {
          console.warn('Image transcription check pass failed, using draft:', verifyErr);
        }
        return draft;
      }
    } catch (err) {
      console.warn('DeepSeek vision failed, falling back to EdenAI:', err);
    }
  }
  return readWithEdenAI(base64, mime);
}
