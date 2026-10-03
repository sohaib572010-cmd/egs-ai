import { buildTurnMessage, buildTutorSystemPrompt, type ChatMode, type LessonMode } from './tutor_prompts';

export type { ChatMode, LessonMode } from './tutor_prompts';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

function getDeepSeekApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY || '';
  if (!key && process.env.NODE_ENV === 'production') {
    throw new Error('DEEPSEEK_API_KEY environment variable must be set in production.');
  }
  return key;
}

/**
 * Serves a fixed reply in the same SSE shape as the DeepSeek stream, so the chat route can
 * reuse its streaming, billing (zero tokens), and persistence path without calling the model.
 */
export function staticChatCompletionStream(text: string): Response {
  const events = [
    { choices: [{ delta: { content: text } }] },
    { choices: [], usage: { prompt_tokens: 0, completion_tokens: 0 } }
  ];
  const body = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}

export interface ChatTurn {
  studentMessage: string;
  context: string;
  history: { sender: 'user' | 'ai'; message: string }[];
  thinkingEnabled: boolean;
  mode: ChatMode;
  lessonMode: LessonMode;
  subjectName?: string;
  gradeLevel?: string;
}

/**
 * Messages of one chat turn. The system prompt and the earlier turns form a stable prefix that DeepSeek
 * caches; the textbook material and per-turn instructions travel only in the last user message.
 */
export function buildChatMessages(turn: ChatTurn): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  return [
    { role: 'system', content: buildTutorSystemPrompt({ subjectName: turn.subjectName, gradeLevel: turn.gradeLevel, mode: turn.mode }) },
    ...turn.history.map(msg => ({ role: msg.sender === 'user' ? 'user' as const : 'assistant' as const, content: msg.message })),
    { role: 'user', content: buildTurnMessage(turn.studentMessage, turn.context, turn.lessonMode) }
  ];
}

export async function generateChatResponseStream(turn: ChatTurn): Promise<Response> {
  return fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getDeepSeekApiKey()}`,
      'Accept-Encoding': 'identity'
    },
    body: JSON.stringify({
      model: 'deepseek-flash',
      messages: buildChatMessages(turn),
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 8192,
      thinking: { type: turn.thinkingEnabled ? 'enabled' : 'disabled' }
    })
  });
}
