'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FunctionCall, LiveServerMessage, Session } from '@google/genai';
import {
  ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleStop, Clock, FileText, FlaskConical,
  Headphones, Languages, Loader2, Mic, MicOff, Phone, Search, Send, SlidersHorizontal, Star, Wallet, X, Zap
} from 'lucide-react';
import { VOICE_FEEDBACK_TAGS, VOICE_LIMITS, voiceForeignLanguage, type VoiceUsageSummary } from '@/lib/voice_policy';

type CallState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'searching' | 'speaking' | 'reconnecting' | 'ended' | 'error';
type Dialect = 'egyptian' | 'msa';
type Teacher = 'male' | 'female';
type Entry = { id: number; role: 'student' | 'teacher' | 'search'; text: string; at: string; done?: boolean; interrupted?: boolean; sources?: string[] };
type ConnectOptions = { handle: string | null; reconnect: boolean; dropReason?: string };
type FeedbackStep = 'rate' | 'sent';
type SettingsRow = 'subject' | 'dialect' | 'about';

interface VoiceTutorProps {
  authToken: string | null;
  subjects: string[];
  initialSubject: string;
  gradeName: string;
  onSubjectChange: (subject: string) => void;
  onBack: () => void;
  onLoginRequired: () => void;
  onUpgrade: () => void;
}

const PREFS_KEY = 'egs_voice_prefs';
const FEEDBACK_KEY = 'egs_voice_feedback_at';
const FEEDBACK_PAUSE_MS = 3 * 24 * 60 * 60 * 1000;
const MIN_RATED_CALL_SECONDS = 30;
const HEARTBEAT_MS = 30_000;
const MAX_RECONNECTS = 4;
const RECAP_LINES = 10;
// Quiet time after the teacher finishes before each hidden silence note; the teacher checks in, then waits.
const SILENCE_NUDGES_MS = [15_000, 30_000];
const SPEECH_LEVEL = 0.03;
const OUTPUT_RATE = 24000;
const STARTERS = ['اشرحلي الدرس الأول', 'اسألني سؤال على آخر درس', 'عندي مسألة مش فاهمها', 'لخصلي أهم النقط'];
const VOICES: { key: Teacher; name: string; tone: string }[] = [
  { key: 'male', name: 'الأستاذ', tone: 'هادي وواضح' },
  { key: 'female', name: 'الأستاذة', tone: 'مبهجة وصبورة' }
];
const LANGUAGE_STARTERS = ['اشرحلي الدرس الأول', 'ترجملي جملة', 'صحّحلي نطقي', 'اسألني على كلمات الدرس'];

// Downmixes the mic to 16 kHz mono PCM16 and posts 50 ms chunks with their RMS level.
const CAPTURE_WORKLET = `
class EgsCapture extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.pos = 0; this.sum = 0; this.count = 0; this.buf = new Int16Array(800); this.n = 0; this.energy = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i]; this.count++; this.energy += ch[i] * ch[i]; this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.sum / this.count));
        this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        this.sum = 0; this.count = 0;
        if (this.n === this.buf.length) {
          this.port.postMessage({ pcm: this.buf.buffer, level: Math.sqrt(this.energy / (this.n * this.ratio)) }, [this.buf.buffer]);
          this.buf = new Int16Array(800); this.n = 0; this.energy = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('egs-capture', EgsCapture);
`;

const STATE_LABELS: Record<CallState, string> = {
  idle: '',
  connecting: 'جاري الاتصال بالمعلم...',
  listening: 'بيسمعك، اتكلم براحتك',
  thinking: 'بيفكر في ردك...',
  searching: 'بيدور في كتابك المدرسي...',
  speaking: 'بيشرح، قاطعه في أي وقت',
  reconnecting: 'بنكمل المكالمة...',
  ended: 'انتهت المكالمة',
  error: 'حصلت مشكلة في المكالمة'
};

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function pcmToFloat(b64: string): Float32Array<ArrayBuffer> {
  const raw = atob(b64);
  const out = new Float32Array(raw.length >> 1);
  for (let i = 0; i < out.length; i++) {
    const v = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
    out[i] = (v >= 0x8000 ? v - 0x10000 : v) / 32768;
  }
  return out;
}

function readPrefs(): { dialect: Dialect; teacher: Teacher } {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return { dialect: saved.dialect === 'msa' ? 'msa' : 'egyptian', teacher: saved.teacher === 'female' ? 'female' : 'male' };
  } catch {
    return { dialect: 'egyptian', teacher: 'male' };
  }
}

function feedbackPaused(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(FEEDBACK_KEY) || 0) < FEEDBACK_PAUSE_MS;
  } catch {
    return false;
  }
}

const formatTime = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const minutesAr = (m: number) => (m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : m <= 10 ? `${m} دقائق` : `${m} دقيقة`);

// Lets a fresh session (another key, or a lost resumption handle) continue the conversation naturally.
function buildRecap(entries: Entry[], teacherName: string): string | null {
  const lines = entries.filter(e => e.role !== 'search' && e.text.trim()).slice(-RECAP_LINES)
    .map(e => `${e.role === 'student' ? 'الطالب' : teacherName}: ${e.text.trim().slice(0, 300)}`);
  if (!lines.length) return null;
  return `[ملاحظة من النظام: الاتصال اتنقل لخط جديد. ده آخر جزء من المكالمة:\n${lines.join('\n')}\nكمّل مع الطالب بشكل طبيعي من النقطة اللي وقفتوا عندها، من غير ما تقول إن الاتصال اتقطع ومن غير ما ترحب من الأول.]`;
}

class LimitError extends Error {
  constructor(message: string, public usage?: VoiceUsageSummary) { super(message); }
}

export default function VoiceTutor({ authToken, subjects, initialSubject, gradeName, onSubjectChange, onBack, onLoginRequired, onUpgrade }: VoiceTutorProps) {
  const [pickedSubject, setSubject] = useState(initialSubject);
  const [dialect, setDialect] = useState<Dialect>(() => readPrefs().dialect);
  const [teacher, setTeacher] = useState<Teacher>(() => readPrefs().teacher);
  const [callState, setCallState] = useState<CallState>('idle');
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [muted, setMuted] = useState(false);
  const [callLeft, setCallLeft] = useState(0);
  const [typed, setTyped] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [openRow, setOpenRow] = useState<SettingsRow | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [usage, setUsage] = useState<VoiceUsageSummary | null>(null);
  const [feedback, setFeedback] = useState<{ step: FeedbackStep; seconds: number } | null>(null);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const genRef = useRef(0);
  const handleRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callEndsAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const reconnectsRef = useRef(0);
  const reconnectingRef = useRef(false);
  const closingRef = useRef(false);
  const mutedRef = useRef(false);
  const skipTurnRef = useRef(false);
  const inCtxRef = useRef<AudioContext | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const nextTimeRef = useRef(0);
  const micLevelRef = useRef(0);
  const cancelledRef = useRef(new Set<string>());
  const entryIdRef = useRef(0);
  const orbRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const connectRef = useRef<(opts: ConnectOptions) => Promise<void>>(async () => {});
  const entriesRef = useRef<Entry[]>([]);
  const sentUpToRef = useRef(0);
  const lastCallIdRef = useRef<string | null>(null);
  const usedHandleRef = useRef(false);
  const finishRef = useRef<(reason: 'user' | 'time' | 'replaced', message?: string) => void>(() => {});
  const callStateRef = useRef<CallState>('idle');
  const lastActivityRef = useRef(0);
  const nudgesRef = useRef(0);

  const subject = subjects.includes(pickedSubject) ? pickedSubject : subjects[0] || '';
  const inCall = callState !== 'idle' && callState !== 'ended' && callState !== 'error';
  const teacherName = teacher === 'female' ? 'الأستاذة' : 'الأستاذ';
  const limitReached = !!usage && usage.remaining_seconds < 30;
  const starters = voiceForeignLanguage(subject) ? LANGUAGE_STARTERS : STARTERS;

  const refreshUsage = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/voice/usage', { headers: { Authorization: `Bearer ${authToken}` } });
      const data = await res.json();
      if (res.ok && data.usage) setUsage(data.usage);
    } catch {}
  }, [authToken]);

  useEffect(() => {
    void import('@google/genai').catch(() => {});
    if (!authToken) return;
    fetch('/api/voice/usage', { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(data => { if (data.usage) setUsage(data.usage); })
      .catch(() => {});
  }, [authToken]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const markStudentActive = useCallback(() => {
    lastActivityRef.current = Date.now();
    nudgesRef.current = 0;
  }, []);

  // While the student stays quiet after the teacher finishes, tell the model so it can check in naturally.
  const checkSilence = useCallback(() => {
    const session = sessionRef.current;
    const now = Date.now();
    if (!session || mutedRef.current || reconnectingRef.current || callStateRef.current !== 'listening' || sourcesRef.current.size) {
      lastActivityRef.current = now;
      return;
    }
    const wait = SILENCE_NUDGES_MS[nudgesRef.current];
    const quiet = now - lastActivityRef.current;
    if (!wait || quiet < wait) return;
    nudgesRef.current++;
    lastActivityRef.current = now;
    session.sendRealtimeInput({ text: `[ملاحظة من النظام: الطالب ساكت بقاله ${Math.round(quiet / 1000)} ثانية]` });
  }, []);

  useEffect(() => {
    if (!inCall) return;
    const t = setInterval(() => {
      checkSilence();
      elapsedRef.current += 1;
      const left = Math.ceil((callEndsAtRef.current - Date.now()) / 1000);
      setCallLeft(left);
      if (left <= 0) finishRef.current('time');
    }, 1000);
    return () => clearInterval(t);
  }, [inCall, checkSilence]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, showTranscript]);

  const sendUsage = useCallback((ended: boolean) => {
    const callId = callIdRef.current;
    if (!callId || !authToken) return Promise.resolve(null);
    const batch = entriesRef.current.filter(e => e.id > sentUpToRef.current && (ended || e.done)).slice(0, 60);
    if (batch.length) sentUpToRef.current = batch[batch.length - 1].id;
    return fetch('/api/voice/usage', {
      method: 'POST',
      keepalive: ended,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        call_id: callId,
        ended,
        entries: batch.map(({ role, text, at, interrupted, sources }) => ({ role, text: text.slice(0, 2000), at, interrupted, sources }))
      })
    }).then(r => r.json()).catch(() => null);
  }, [authToken]);

  useEffect(() => {
    if (!inCall) return;
    const t = setInterval(async () => {
      const data = await sendUsage(false);
      if (data && data.active === false) finishRef.current('replaced');
    }, HEARTBEAT_MS);
    const onHide = () => { void sendUsage(true); };
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(t);
      window.removeEventListener('pagehide', onHide);
    };
  }, [inCall, sendUsage]);

  const pushText = useCallback((role: Entry['role'], text: string, extra: Partial<Entry> = {}) => {
    setEntries(prev => {
      const last = prev[prev.length - 1];
      if (role !== 'search' && last && last.role === role && !last.done) {
        return [...prev.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [...prev.map(e => (e.role === 'search' || e.done ? e : { ...e, done: true })), { id: ++entryIdRef.current, role, text, at: new Date().toISOString(), ...extra }];
    });
  }, []);

  const closeTeacherEntry = useCallback((interrupted: boolean) => {
    setEntries(prev => prev.map(e => (e.role === 'teacher' && !e.done ? { ...e, done: true, interrupted } : e)));
  }, []);

  const stopPlayback = useCallback(() => {
    for (const src of sourcesRef.current) {
      try { src.stop(); } catch {}
    }
    sourcesRef.current.clear();
    nextTimeRef.current = 0;
  }, []);

  const playChunk = useCallback((b64: string) => {
    const ctx = outCtxRef.current;
    const analyser = analyserRef.current;
    if (!ctx || !analyser) return;
    const samples = pcmToFloat(b64);
    if (!samples.length) return;
    const buffer = ctx.createBuffer(1, samples.length, OUTPUT_RATE);
    buffer.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(analyser);
    const start = Math.max(ctx.currentTime + 0.03, nextTimeRef.current);
    src.start(start);
    nextTimeRef.current = start + buffer.duration;
    sourcesRef.current.add(src);
    src.onended = () => {
      sourcesRef.current.delete(src);
      if (!sourcesRef.current.size) setCallState(s => (s === 'speaking' ? 'listening' : s));
    };
  }, []);

  const teardown = useCallback(() => {
    genRef.current++;
    try { sessionRef.current?.close(); } catch {}
    sessionRef.current = null;
    stopPlayback();
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    inCtxRef.current?.close().catch(() => {});
    outCtxRef.current?.close().catch(() => {});
    inCtxRef.current = null;
    outCtxRef.current = null;
    analyserRef.current = null;
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, [stopPlayback]);

  useEffect(() => () => {
    if (callIdRef.current) void sendUsage(true);
    callIdRef.current = null;
    teardown();
  }, [teardown, sendUsage]);

  const finishCall = useCallback((reason: 'user' | 'time' | 'replaced' | 'error', message?: string) => {
    if (closingRef.current && reason !== 'error') return;
    closingRef.current = true;
    const hadCall = !!callIdRef.current;
    lastCallIdRef.current = callIdRef.current;
    if (hadCall) void sendUsage(true).then(() => refreshUsage());
    callIdRef.current = null;
    teardown();
    closeTeacherEntry(false);
    const seconds = elapsedRef.current;
    if (reason === 'error') {
      setNotice({ tone: 'danger', text: message || 'حصلت مشكلة في المكالمة. حاول تاني بعد شوية.' });
      setCallState('error');
    } else {
      setNotice({
        tone: 'info',
        text: reason === 'time'
          ? 'خلص وقت المكالمة المتاح. تقدر تبدأ مكالمة جديدة لو لسه فاضل لك دقائق النهارده.'
          : reason === 'replaced'
            ? 'المكالمة اتقفلت لأنك بدأت مكالمة تانية من مكان تاني.'
            : `انتهت المكالمة بعد ${formatTime(seconds)}.`
      });
      setCallState('ended');
    }
    if (hadCall && seconds >= MIN_RATED_CALL_SECONDS && !feedbackPaused()) {
      setRating(0);
      setTags([]);
      setComment('');
      setFeedback({ step: 'rate', seconds });
    }
  }, [sendUsage, refreshUsage, teardown, closeTeacherEntry]);

  useEffect(() => {
    finishRef.current = finishCall;
  }, [finishCall]);

  const requestToken = useCallback(async ({ handle, reconnect, dropReason }: ConnectOptions) => {
    const res = await fetch('/api/voice/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        subject_name: subject,
        dialect,
        teacher,
        ...(reconnect ? { call_id: callIdRef.current, reconnect: true, resume_handle: handle || undefined, drop_reason: dropReason?.slice(0, 300) } : {})
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) onLoginRequired();
    if (data.usage) setUsage(data.usage);
    if (data.code === 'voice_limit_reached') throw new LimitError(data.error, data.usage);
    if (!res.ok || !data.token) throw new Error(data.error || 'تعذر بدء المكالمة الآن.');
    if (!reconnect) {
      callIdRef.current = data.call_id;
      callEndsAtRef.current = Date.now() + data.call_seconds * 1000;
      setCallLeft(data.call_seconds);
    }
    return data as { token: string; model: string; resumed: boolean };
  }, [authToken, subject, dialect, teacher, onLoginRequired]);

  const runTools = useCallback(async (calls: FunctionCall[], gen: number) => {
    setCallState('searching');
    const responses = await Promise.all(calls.map(async call => {
      const args = (call.args || {}) as Record<string, unknown>;
      const label = String(args.query || args.lesson_title || 'الكتاب المدرسي');
      const entryId = ++entryIdRef.current;
      setEntries(prev => [...prev, { id: entryId, role: 'search', text: label, at: new Date().toISOString() }]);
      let result = 'The textbook search failed. Tell the student you could not check the book this time.';
      let sources: string[] = [];
      try {
        const res = await fetch('/api/voice/tool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ name: call.name, args, subject_name: subject })
        });
        const data = await res.json().catch(() => ({}));
        if (typeof data.result === 'string') result = data.result;
        if (Array.isArray(data.sources)) sources = data.sources;
      } catch {}
      setEntries(prev => prev.map(e => (e.id === entryId ? { ...e, done: true, sources } : e)));
      return { id: call.id, name: call.name, response: { result } };
    }));
    if (gen !== genRef.current) return;
    const live = responses.filter(r => !r.id || !cancelledRef.current.has(r.id));
    if (live.length) sessionRef.current?.sendToolResponse({ functionResponses: live });
    setCallState(s => (s === 'searching' ? 'thinking' : s));
  }, [authToken, subject]);

  // Reconnects without the student noticing: same key with the resumption handle when possible, otherwise
  // the server moves the call to another key and the client replays the recent transcript.
  const reconnect = useCallback(async (dropReason?: string) => {
    if (reconnectingRef.current || closingRef.current) return;
    if (callEndsAtRef.current - Date.now() < 10_000) {
      finishCall('time');
      return;
    }
    if (!callIdRef.current || reconnectsRef.current >= MAX_RECONNECTS) {
      finishCall('error', 'المكالمة انقطعت. ابدأ مكالمة جديدة وكمّل من مكانك.');
      return;
    }
    reconnectsRef.current++;
    reconnectingRef.current = true;
    setCallState('reconnecting');
    try {
      await connectRef.current({ handle: handleRef.current, reconnect: true, dropReason });
    } catch (err) {
      finishCall(err instanceof LimitError ? 'time' : 'error', 'المكالمة انقطعت. ابدأ مكالمة جديدة وكمّل من مكانك.');
    } finally {
      reconnectingRef.current = false;
    }
  }, [finishCall]);

  const handleMessage = useCallback((m: LiveServerMessage, gen: number) => {
    if (gen !== genRef.current) return;
    if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) handleRef.current = m.sessionResumptionUpdate.newHandle;
    if (m.goAway) void reconnect();
    if (m.toolCallCancellation?.ids) m.toolCallCancellation.ids.forEach(id => cancelledRef.current.add(id));
    if (m.toolCall?.functionCalls?.length) void runTools(m.toolCall.functionCalls, gen);

    const sc = m.serverContent;
    if (!sc) return;
    if (sc.interrupted) {
      stopPlayback();
      skipTurnRef.current = false;
      closeTeacherEntry(true);
      setCallState('listening');
    }
    if (sc.inputTranscription?.text) {
      markStudentActive();
      pushText('student', sc.inputTranscription.text);
    }
    if (sc.outputTranscription?.text && !skipTurnRef.current) pushText('teacher', sc.outputTranscription.text);
    for (const part of sc.modelTurn?.parts || []) {
      if (part.inlineData?.data && !skipTurnRef.current) {
        playChunk(part.inlineData.data);
        setCallState('speaking');
      }
    }
    if (sc.turnComplete) {
      skipTurnRef.current = false;
      closeTeacherEntry(false);
      if (!sourcesRef.current.size) setCallState(s => (s === 'searching' ? s : 'listening'));
    }
  }, [reconnect, runTools, stopPlayback, closeTeacherEntry, pushText, playChunk, markStudentActive]);

  const connect = useCallback(async (opts: ConnectOptions) => {
    const [{ token, model, resumed }, { GoogleGenAI, Modality }] = await Promise.all([requestToken(opts), import('@google/genai')]);
    const gen = ++genRef.current;
    const previous = sessionRef.current;
    usedHandleRef.current = resumed;
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
    const onEnd = (reason?: string) => {
      if (gen !== genRef.current || closingRef.current) return;
      if (reason && /expired/i.test(reason)) {
        finishCall('time');
        return;
      }
      if (usedHandleRef.current && reason && /not found|invalid/i.test(reason)) handleRef.current = null;
      void reconnect(reason);
    };
    const session = await ai.live.connect({
      model,
      config: { responseModalities: [Modality.AUDIO] },
      callbacks: {
        onmessage: msg => handleMessage(msg, gen),
        onerror: e => onEnd(e?.message),
        onclose: e => onEnd(e.reason)
      }
    });
    if (gen !== genRef.current) {
      session.close();
      return;
    }
    sessionRef.current = session;
    try { previous?.close(); } catch {}
    if (!resumed) {
      handleRef.current = null;
      const recap = opts.reconnect ? buildRecap(entriesRef.current, teacherName) : null;
      session.sendRealtimeInput({ text: recap || 'بدأت المكالمة الآن.' });
    }
    setCallState(s => (s === 'connecting' || s === 'reconnecting' ? 'thinking' : s));
  }, [requestToken, handleMessage, reconnect, finishCall, teacherName]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const startMeter = useCallback(() => {
    const data = new Uint8Array(512);
    const tick = () => {
      let teacherLevel = 0;
      if (analyserRef.current) {
        analyserRef.current.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        teacherLevel = Math.sqrt(sum / data.length);
      }
      const level = Math.min(1, Math.max(teacherLevel * 4, micLevelRef.current * 6));
      orbRef.current?.style.setProperty('--voice-level', level.toFixed(3));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startCall = async () => {
    if (!authToken) {
      onLoginRequired();
      return;
    }
    if (!subject || limitReached) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      setNotice({ tone: 'danger', text: 'المتصفح ده مش بيدعم المكالمات الصوتية. جرّب Chrome أو Edge أو Safari حديث.' });
      setCallState('error');
      return;
    }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ dialect, teacher })); } catch {}

    closingRef.current = false;
    reconnectsRef.current = 0;
    handleRef.current = null;
    callIdRef.current = null;
    lastCallIdRef.current = null;
    sentUpToRef.current = 0;
    entriesRef.current = [];
    callEndsAtRef.current = Date.now() + 60_000;
    elapsedRef.current = 0;
    cancelledRef.current.clear();
    skipTurnRef.current = false;
    nudgesRef.current = 0;
    setEntries([]);
    setNotice(null);
    setFeedback(null);
    setMuted(false);
    setShowSettings(false);
    mutedRef.current = false;
    setCallState('connecting');

    const inCtx = new AudioContext();
    const outCtx = new AudioContext({ sampleRate: OUTPUT_RATE });
    inCtxRef.current = inCtx;
    outCtxRef.current = outCtx;
    void inCtx.resume();
    void outCtx.resume();
    const analyser = outCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.connect(outCtx.destination);
    analyserRef.current = analyser;

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      });
    } catch {
      finishCall('error', 'محتاجين إذن الميكروفون علشان المعلم يسمعك. اسمح بيه من إعدادات المتصفح وجرّب تاني.');
      return;
    }

    try {
      const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }));
      await inCtx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(inCtx, 'egs-capture');
      const sink = inCtx.createGain();
      sink.gain.value = 0;
      inCtx.createMediaStreamSource(streamRef.current).connect(node);
      node.connect(sink).connect(inCtx.destination);
      node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
        micLevelRef.current = mutedRef.current ? 0 : e.data.level;
        if (mutedRef.current) return;
        if (e.data.level > SPEECH_LEVEL && !sourcesRef.current.size) markStudentActive();
        sessionRef.current?.sendRealtimeInput({ audio: { data: toBase64(e.data.pcm), mimeType: 'audio/pcm;rate=16000' } });
      };
      startMeter();
      navigator.wakeLock?.request('screen').then(lock => { wakeLockRef.current = lock; }).catch(() => {});
      try {
        await connect({ handle: null, reconnect: false });
      } catch (err) {
        if (err instanceof LimitError || !callIdRef.current) throw err;
        await connect({ handle: null, reconnect: true, dropReason: err instanceof Error ? err.message : 'connect_failed' });
      }
    } catch (err) {
      if (err instanceof LimitError) {
        teardown();
        setNotice({ tone: 'info', text: err.message });
        setCallState('ended');
        return;
      }
      finishCall('error', err instanceof Error && err.message ? err.message : 'تعذر بدء المكالمة الآن. حاول مرة أخرى.');
    }
  };

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
  }, []);

  useEffect(() => {
    if (!inCall) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'm' || e.key === 'M' || e.key === 'ة') toggleMute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inCall, toggleMute]);

  const stopTeacher = () => {
    stopPlayback();
    skipTurnRef.current = true;
    closeTeacherEntry(true);
    setCallState('listening');
  };

  const sendText = (raw: string) => {
    const text = raw.trim().slice(0, 1000);
    if (!text || !sessionRef.current) return;
    stopPlayback();
    closeTeacherEntry(true);
    markStudentActive();
    pushText('student', text, { done: true });
    sessionRef.current.sendRealtimeInput({ text });
    setCallState('thinking');
  };

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    sendText(typed);
    setTyped('');
  };

  const closeFeedback = (sent: boolean) => {
    try { localStorage.setItem(FEEDBACK_KEY, String(Date.now())); } catch {}
    if (sent) setFeedback(f => (f ? { ...f, step: 'sent' } : f));
    else setFeedback(null);
  };

  const submitFeedback = async () => {
    if (!rating || sending || !feedback) return;
    setSending(true);
    try {
      await fetch('/api/voice/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ rating, tags, comment, subject, call_seconds: feedback.seconds, call_id: lastCallIdRef.current })
      });
    } catch {}
    setSending(false);
    closeFeedback(true);
  };

  const teacherSpeaking = callState === 'speaking';
  const lastTeacher = [...entries].reverse().find(e => e.role === 'teacher');
  const caption = lastTeacher ? (lastTeacher.text.length > 220 ? `...${lastTeacher.text.slice(-220)}` : lastTeacher.text) : '';
  const studentSpoke = entries.some(e => e.role === 'student');
  const remainingMinutes = usage ? Math.floor(usage.remaining_seconds / 60) : 0;
  const tagOptions = rating >= 4 ? VOICE_FEEDBACK_TAGS.good : VOICE_FEEDBACK_TAGS.bad;

  const voiceIndex = VOICES.findIndex(v => v.key === teacher);
  const activeVoice = VOICES[voiceIndex];
  const shiftVoice = (step: number) => setTeacher(VOICES[(voiceIndex + step + VOICES.length) % VOICES.length].key);
  const toggleRow = (row: SettingsRow) => setOpenRow(r => (r === row ? null : row));

  const renderFeedback = () => feedback && (
    <div className="voice-feedback" role="region" aria-label="تقييم المكالمة">
      {feedback.step === 'sent' ? (
        <div className="voice-feedback-done">
          <span className="voice-feedback-check"><Check size={22} /></span>
          <strong>شكراً، رأيك وصلنا</strong>
          <span>كل اقتراح بنقرأه وبيساعدنا نطوّر المعلم الصوتي.</span>
          <button type="button" className="voice-link-btn" onClick={() => setFeedback(null)}>تمام</button>
        </div>
      ) : (
        <>
          <div className="voice-feedback-head">
            <strong>إيه رأيك في المكالمة؟</strong>
            <span>المكالمة خلصت بعد <bdi dir="ltr">{formatTime(feedback.seconds)}</bdi>. تقييمك بياخد ثواني وبيفرق معانا جداً.</span>
          </div>
          <div className="voice-stars" role="radiogroup" aria-label="التقييم من 5">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} من 5`}
                className={n <= rating ? 'on' : ''}
                onClick={() => { setRating(n); setTags([]); }}
              >
                <Star size={28} />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <>
              <div className="voice-chips center">
                {tagOptions.map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`voice-chip small ${tags.includes(t) ? 'active' : ''}`}
                    aria-pressed={tags.includes(t)}
                    onClick={() => setTags(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]))}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                className="voice-feedback-text"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="عندك اقتراح أو فكرة تخلي المعلم أحسن؟ (اختياري)"
                maxLength={2000}
                rows={3}
              />
            </>
          )}
          <div className="voice-feedback-actions">
            <button type="button" className="btn-primary" onClick={submitFeedback} disabled={!rating || sending}>
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} إرسال التقييم
            </button>
            <button type="button" className="voice-link-btn" onClick={() => closeFeedback(false)}>مش دلوقتي</button>
          </div>
        </>
      )}
    </div>
  );

  const renderSettings = () => (
    <div className="vx-sheet-overlay" onClick={() => setShowSettings(false)}>
      <div className="vx-sheet" role="dialog" aria-modal="true" aria-label="إعدادات المكالمة" onClick={e => e.stopPropagation()}>
        <button type="button" className="vx-sheet-handle" onClick={() => setShowSettings(false)} aria-label="إغلاق الإعدادات" />
        <div className="vx-voice-pick">
          <button type="button" className="vx-arrow" onClick={() => shiftVoice(-1)} disabled={inCall} aria-label="الصوت السابق"><ChevronRight size={20} /></button>
          <div className="vx-voice-name">
            <strong>{activeVoice.name}</strong>
            <span>{activeVoice.tone}</span>
          </div>
          <button type="button" className="vx-arrow" onClick={() => shiftVoice(1)} disabled={inCall} aria-label="الصوت التالي"><ChevronLeft size={20} /></button>
        </div>
        <div className="vx-dots" aria-hidden="true">
          {VOICES.map(v => <span key={v.key} className={v.key === teacher ? 'on' : ''} />)}
        </div>
        {inCall && <p className="vx-sheet-note">التغييرات بتتطبق من المكالمة الجاية.</p>}

        <div className="vx-rows">
          <div className={`vx-row ${openRow === 'subject' ? 'open' : ''}`}>
            <button type="button" className="vx-row-head" onClick={() => toggleRow('subject')} aria-expanded={openRow === 'subject'}>
              <BookOpen size={20} />
              <span className="vx-row-text"><strong>المادة</strong><span>{subject || 'اختار المادة'} · {gradeName}</span></span>
              <ChevronDown size={18} className="vx-row-chevron" />
            </button>
            {openRow === 'subject' && (
              <div className="vx-row-body">
                {subjects.length ? subjects.map(s => (
                  <button key={s} type="button" disabled={inCall} className={`vx-option ${s === subject ? 'active' : ''}`} onClick={() => { setSubject(s); onSubjectChange(s); }} aria-pressed={s === subject}>
                    <span>{s}</span>
                    {s === subject && <Check size={16} />}
                  </button>
                )) : <span className="voice-muted">لا توجد مواد متاحة لصفك حالياً.</span>}
              </div>
            )}
          </div>
          <div className={`vx-row ${openRow === 'dialect' ? 'open' : ''}`}>
            <button type="button" className="vx-row-head" onClick={() => toggleRow('dialect')} aria-expanded={openRow === 'dialect'}>
              <Languages size={20} />
              <span className="vx-row-text"><strong>أسلوب الكلام</strong><span>{dialect === 'msa' ? 'فصحى مبسطة' : 'عامية مصرية'}</span></span>
              <ChevronDown size={18} className="vx-row-chevron" />
            </button>
            {openRow === 'dialect' && (
              <div className="vx-row-body">
                {([['egyptian', 'عامية مصرية'], ['msa', 'فصحى مبسطة']] as const).map(([key, label]) => (
                  <button key={key} type="button" disabled={inCall} className={`vx-option ${dialect === key ? 'active' : ''}`} onClick={() => setDialect(key)} aria-pressed={dialect === key}>
                    <span>{label}</span>
                    {dialect === key && <Check size={16} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={`vx-row ${openRow === 'about' ? 'open' : ''}`}>
            <button type="button" className="vx-row-head" onClick={() => toggleRow('about')} aria-expanded={openRow === 'about'}>
              <FlaskConical size={20} />
              <span className="vx-row-text"><strong>ميزة تجريبية</strong><span>{usage ? `متبقي ${usage.remaining_seconds < 60 ? 'أقل من دقيقة' : minutesAr(remainingMinutes)} النهارده` : `${minutesAr(VOICE_LIMITS.free.dailyMinutes)} يومياً مجاناً`}</span></span>
              <ChevronDown size={18} className="vx-row-chevron" />
            </button>
            {openRow === 'about' && (
              <ul className="vx-about">
                <li><Clock size={15} /> {minutesAr(VOICE_LIMITS.free.dailyMinutes)} يومياً للحساب المجاني و{minutesAr(VOICE_LIMITS.subscriber.dailyMinutes)} للمشتركين.</li>
                <li><Wallet size={15} /> مش بتخصم أي نقاط من رصيدك.</li>
                <li><Search size={15} /> كل شرح مبني على كتابك المدرسي، وتقدر تقاطع المعلم في أي وقت.</li>
                <li><Headphones size={15} /> السماعة بتدي أوضح صوت وبتمنع الصدى.</li>
                <li><FileText size={15} /> نص المكالمة بيتحفظ في سجلك ويُستخدم لتحسين الخدمة حسب إعدادات الخصوصية.</li>
                <li><Zap size={15} /> ممكن تقف أو تتغير في أي وقت خلال فترة التجربة.</li>
                {usage?.tier === 'free' && (
                  <li><button type="button" className="voice-link-btn" onClick={onUpgrade}>المشتركين ليهم {minutesAr(VOICE_LIMITS.subscriber.dailyMinutes)} يومياً، اعرف الباقات</button></li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`voice-page vx ${inCall ? 'in-call' : ''}`}>
      <div className="vx-top">
        <button type="button" className="vx-round" onClick={inCall ? () => finishCall('user') : onBack} aria-label={inCall ? 'إنهاء المكالمة والرجوع' : 'الرجوع للدردشة'}>
          <ArrowRight size={20} />
        </button>
        <div className="vx-top-center">
          <span className="vx-title">{inCall ? `${teacherName} · ${subject}` : 'المعلم الصوتي'}</span>
          {inCall
            ? <span className={`vx-timer num ${callLeft <= 60 ? 'warn' : ''}`} title="الوقت المتبقي في المكالمة"><bdi dir="ltr">{formatTime(callLeft)}</bdi></span>
            : <span className="vx-beta">تجريبي</span>}
        </div>
        <div className="vx-top-end">
          {inCall && (
            <button type="button" className={`vx-round ${showTranscript ? 'active' : ''}`} onClick={() => setShowTranscript(v => !v)} aria-pressed={showTranscript} aria-label="نص المكالمة">
              <FileText size={19} />
            </button>
          )}
          <button type="button" className="vx-round" onClick={() => setShowSettings(true)} aria-label="إعدادات المكالمة">
            <SlidersHorizontal size={19} />
          </button>
        </div>
      </div>

      <div className="vx-stage">
        {feedback && !inCall ? renderFeedback() : (
          <>
            <div ref={orbRef} className={`vx-orb state-${callState} voice-${teacher}`} aria-hidden="true">
              <span className="vx-orb-cloud" />
              {(callState === 'connecting' || callState === 'reconnecting') && <Loader2 size={30} className="animate-spin vx-orb-icon" />}
              {callState === 'searching' && <Search size={30} className="vx-orb-icon" />}
            </div>
            <div className="vx-status" aria-live="polite">
              {inCall ? (
                <>
                  <strong>{muted && !teacherSpeaking ? 'المايك مقفول، اضغط عليه علشان تتكلم' : STATE_LABELS[callState]}</strong>
                  {caption && !showTranscript && <p className="vx-caption" dir="auto">{caption}</p>}
                  {callLeft > 0 && callLeft <= 60 && <span className="vx-warn">باقي أقل من دقيقة في المكالمة</span>}
                </>
              ) : (
                <>
                  <strong>{activeVoice.name} جاهز يذاكر معاك {subject}</strong>
                  <p>اتكلم براحتك واسأل عن أي درس، والمعلم بيرجع لكتابك المدرسي قبل ما يشرح.</p>
                  {notice && <div className={`voice-notice ${notice.tone === 'danger' ? 'danger' : ''}`} role="status">{notice.text}</div>}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {inCall && showTranscript && (
        <div ref={transcriptRef} className="voice-transcript vx-transcript custom-scrollbar" aria-live="polite">
          {entries.length === 0 && <p className="voice-muted center">هنا هيظهر نص المكالمة أول بأول.</p>}
          {entries.map(e => e.role === 'search' ? (
            <div key={e.id} className="voice-search-entry">
              {e.done ? <Search size={14} /> : <Loader2 size={14} className="animate-spin" />}
              <span className="voice-search-text">{e.done ? 'بحث في الكتاب' : 'بيدور في الكتاب'}: {e.text}</span>
              {!!e.sources?.length && <span className="voice-sources">{e.sources.map(s => <span key={s}>{s}</span>)}</span>}
            </div>
          ) : (
            <div key={e.id} className={`voice-line ${e.role}`}>
              <span className="voice-line-who">{e.role === 'student' ? 'أنت' : teacherName}</span>
              <p dir="auto">{e.text}{e.interrupted && <span className="voice-cut"> (اتقاطع)</span>}</p>
            </div>
          ))}
        </div>
      )}

      {inCall && !studentSpoke && callState !== 'connecting' && (
        <div className="vx-starters">
          {starters.map(s => <button key={s} type="button" className="voice-chip small" onClick={() => sendText(s)}>{s}</button>)}
        </div>
      )}

      <div className="vx-bottom">
        {inCall ? (
          <>
            <button type="button" className="vx-end" onClick={() => finishCall('user')} aria-label="إنهاء المكالمة"><X size={24} /></button>
            <button type="button" className={`vx-round lg ${muted ? 'on' : ''}`} onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'افتح المايك' : 'اقفل المايك'} title="اختصار: حرف M">
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            {teacherSpeaking && (
              <button type="button" className="vx-round lg" onClick={stopTeacher} aria-label="وقّف الشرح" title="وقّف الشرح">
                <CircleStop size={22} />
              </button>
            )}
            <form className="vx-ask" onSubmit={submitTyped}>
              <input
                value={typed}
                onChange={e => { setTyped(e.target.value); markStudentActive(); }}
                placeholder="اسأل EGS AI"
                maxLength={1000}
                aria-label="اكتب سؤالك للمعلم"
              />
              <button type="submit" disabled={!typed.trim()} aria-label="إرسال"><ArrowUp size={18} /></button>
            </form>
          </>
        ) : (
          <>
            <button type="button" className="vx-end" onClick={onBack} aria-label="الرجوع للدردشة"><X size={24} /></button>
            <button type="button" className="vx-start" onClick={startCall} disabled={!subject || limitReached}>
              <Phone size={19} />
              <span>{!authToken ? 'سجّل دخولك وابدأ المكالمة' : limitReached ? 'خلصت دقائق النهارده' : 'ابدأ المكالمة'}</span>
            </button>
          </>
        )}
      </div>
      {!inCall && limitReached && usage?.tier === 'free' && (
        <button type="button" className="voice-link-btn vx-upgrade" onClick={onUpgrade}>اشترك وخد {minutesAr(VOICE_LIMITS.subscriber.dailyMinutes)} يومياً</button>
      )}

      {showSettings && renderSettings()}
    </div>
  );
}
