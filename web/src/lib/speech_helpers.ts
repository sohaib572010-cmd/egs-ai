/**
 * English Text-to-Speech (TTS) Speech Synthesis Utility
 * Uses native Web Speech API for zero-latency, high-clarity English pronunciation.
 */

import { isEnglishText } from './subject_helpers';

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopSpeech(): void {
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
  }
}

/**
 * Checks if a string is a clean English vocabulary word or short phrasal term (1-4 words).
 */
export function isPureEnglishVocab(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 45) return false;
  // Must start and end with an English letter
  if (!/^[A-Za-z]/.test(trimmed) || !/[A-Za-z.]$/.test(trimmed)) return false;
  // Disallow Arabic characters or numbers or math symbols
  if (/[\u0600-\u06FF\d$+=#*_~<>{}[\]\\]/.test(trimmed)) return false;
  // Must consist only of English letters, spaces, hyphens, and apostrophes
  if (!/^[A-Za-z][A-Za-z\s'\-.]*$/.test(trimmed)) return false;
  // Must have between 1 and 4 words
  const words = trimmed.split(/\s+/);
  return words.length >= 1 && words.length <= 4;
}

/**
 * Thoroughly strips markup, protocol tags, Arabic annotations, and non-spoken symbols
 * (such as slashes, hyphens, parentheses, brackets, and quotes) so speech synthesis
 * engines pronounce only natural English words and educational pauses without vocalizing punctuation.
 */
export function sanitizeEnglishForSpeech(text: string): string {
  if (!text) return '';

  return text
    // Remove markdown code fences and inline code
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Remove markdown link wrappers (keep link text)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove block and inline LaTeX formulas
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/\\\[[\s\S]*?\\\]/g, '')
    .replace(/\$[^$]+\$/g, '')
    .replace(/\\\([^)]+\\\)/g, '')
    .replace(/\\begin\{[a-z*]+\}[\s\S]*?\\end\{[a-z*]+\}/gi, '')
    // Remove protocol tags like [QUIZ_QUESTION], [CREATE_EXAM], [LISTEN_PASSAGE], etc.
    .replace(/\[[A-Z_]+(?::[^\]]*)?\][\s\S]*?\[\/[A-Z_]+\]/g, '')
    .replace(/\[[A-Z_]+(?::[^\]]*)?\]/g, '')
    .replace(/\[\/[A-Z_]+\]/g, '')
    // Replace ampersand with 'and' for natural vocalization
    .replace(/&/g, ' and ')
    // Remove symbols that TTS engines read aloud as words:
    // Slashes (/ \), hyphens/dashes (- – — −), brackets/parentheses (( ) [ ] { } < > « » ‹ ›)
    .replace(/[\/\\]+/g, ' ')
    .replace(/[\u2010-\u2015\u2212\-]+/g, ' ')
    .replace(/[()[\]{}<>«»‹›]/g, ' ')
    // Replace colons and semicolons with commas for a natural pause rather than speaking "colon"
    .replace(/[:;]+/g, ', ')
    // Remove math operators and symbols that TTS engines vocalize as words
    .replace(/[+=±×÷≠≤≥~^%°|_#*@]/g, ' ')
    // Remove bullet characters and decorative markers
    .replace(/[•◦▪▫►▸▶✓✔✕✖★☆§©®™]/g, ' ')
    // Remove quotation marks (preserve apostrophes inside contractions like don't)
    .replace(/["“”«»`]/g, ' ')
    // Normalize curly single quotes
    .replace(/[\u2018\u2019]/g, "'")
    // Remove single quotes/apostrophes that are not inside words (e.g. 'hello' -> hello, but don't -> don't)
    .replace(/(?<![A-Za-z])'|'(?![A-Za-z])/g, ' ')
    // Remove Arabic characters and Arabic punctuation
    .replace(/[\u0600-\u06FF]+/g, ' ')
    .replace(/[،؛؟]/g, ' ')
    // Clean up ellipsis and punctuation sequences
    .replace(/\.{2,}/g, '.')
    .replace(/,\s*,+/g, ', ')
    .replace(/,\s*\./g, '.')
    // Attach punctuation directly to preceding word
    .replace(/\s+([,.:?!])/g, '$1')
    // Remove leading punctuation at line starts
    .replace(/(?:^|\n)\s*[,.]\s*/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determines whether a given text contains genuine English content suitable for English speech synthesis.
 */
export function isEnglishSpeechEligible(text?: string): boolean {
  if (!text) return false;
  if (!isEnglishText(text)) return false;
  const clean = sanitizeEnglishForSpeech(text);
  return clean.length >= 3 && /[A-Za-z]{2,}/.test(clean);
}

/**
 * Pronounces English words and sentences aloud at an educational pace (rate 0.88).
 */
export function speakEnglish(
  rawText: string,
  onStart?: () => void,
  onEnd?: () => void
): boolean {
  if (!isSpeechSynthesisSupported()) {
    return false;
  }

  if (!isEnglishText(rawText)) {
    return false;
  }

  const cleanText = sanitizeEnglishForSpeech(rawText);
  if (!cleanText || cleanText.length < 2 || !/[A-Za-z]/.test(cleanText)) {
    return false;
  }


  try {
    // Cancel any active speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = 0.88; // Comfortable educational tempo for students
    utterance.pitch = 1.0;

    // Try to find a premium/natural English voice
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const preferredVoice = voices.find(
        v => (v.lang.startsWith('en-US') || v.lang.startsWith('en-GB')) &&
             (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Karen') || v.default)
      ) || voices.find(v => v.lang.startsWith('en'));

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
    }

    utterance.onstart = () => {
      if (onStart) onStart();
    };

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      // Ignore normal interruptions
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('Speech synthesis error:', e);
      }
      if (onEnd) onEnd();
    };

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    console.error('Failed to trigger speech synthesis:', err);
    if (onEnd) onEnd();
    return false;
  }
}
