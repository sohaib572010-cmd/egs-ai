import { createClient } from '@supabase/supabase-js';
import { getCairoDateString, toPreciseCoins } from './currency_verifier';
import { CurriculumEntity, CurriculumRelation, extractEntitiesAndRelationsFromChunk, KnowledgeGraphEngine } from './graph_rag';
import { BM25Index } from './bm25';
import { CATALOG_SETTING_KEY, EducationCatalog, legacyActiveLists, loadCatalog, resolveCurriculum } from './education_catalog';
import { registerStageCatalog } from './subject_helpers';

export type { CurriculumEntity, CurriculumRelation } from './graph_rag';

// Cutoff timestamp for existing accounts eligible for apology & compensation:
// Accounts created on or before this cutoff are existing accounts; accounts created after are new accounts.
export const APOLOGY_CUTOFF_DATE = '2026-09-10T16:00:00.000Z';

export function isExistingAccountForApology(profile: { created_at?: string; terms_accepted_at?: string | null }): boolean {
  const timestamp = profile.created_at || profile.terms_accepted_at;
  if (!timestamp) return true; // Legacy profiles without timestamp are existing accounts
  return new Date(timestamp).getTime() <= new Date(APOLOGY_CUTOFF_DATE).getTime();
}

// Types
export interface VoiceUsageRow {
  user_id: string;
  date: string;
  seconds_used: number;
  calls: number;
  active_call_id: string | null;
  call_started_at: string | null;
  call_reserved: number;
  last_beat_at: string | null;
  key_slot?: number | null;
  updated_at?: string;
}

export interface VoiceCallEntry {
  role: 'student' | 'teacher' | 'search';
  text: string;
  at: string;
  interrupted?: boolean;
  sources?: string[];
}

export interface VoiceCallRow {
  id: string;
  user_id: string;
  subject_name: string;
  grade_level: string;
  dialect: string;
  teacher: string;
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number | null;
  rating?: number | null;
  transcript: VoiceCallEntry[];
}

export interface Profile {
  id: string;
  phone?: string;
  email?: string;
  name: string;
  grade_level: string; // '1_middle', '2_middle', '3_middle', '1_high', '2_high'
  track_id?: string | null; // 'medicine_life_sciences' | 'engineering_cs' | 'business' | 'arts_literature'
  elective_subject?: string | null;
  plan_type: 'free' | 'pro' | 'pro_1m' | 'pro_2m' | 'pro_3m' | 'max';
  subscription_status?: 'active' | 'expired' | 'inactive';
  subscription_start_date?: string | null;
  subscription_end_date?: string | null;
  subscription_plan_id?: string | null;
  role: 'student' | 'admin' | 'security';
  password_hash: string;
  created_at: string;
  coins?: number;
  points?: number;
  last_active_date?: string;
  unlimited_credit?: boolean;
  terms_accepted_at?: string | null;
  study_streak?: number;
  is_banned?: boolean;
  ban_reason?: string;
  messages_sent_count?: number;
  active_chat_days_count?: number;
  exams_created_count?: number;
  exams_completed_count?: number;
  flashcard_decks_count?: number;
  flashcards_created_count?: number;
  welcome_reward_claimed?: boolean;
  free_plan_claimed?: boolean;
  apology_compensation_claimed?: boolean;
  apology_dismissed?: boolean;
  pwa_installed?: boolean;
  pwa_installed_at?: string | null;
  pwa_platform?: 'android' | 'ios' | 'desktop' | 'unknown' | null;
  improve_ai_opt_in?: boolean;
  streak_shields?: number;
  coin_debt?: number;
  sub_cost_egp?: number;
  ai_busy_until?: string | null;
}

export interface PendingRegistration {
  email: string;
  phone?: string;
  name: string;
  grade_level: string;
  track_id?: string | null;
  elective_subject?: string | null;
  password_hash: string;
  otp: string;
  created_at: string;
  terms_accepted_at?: string | null;
  expires_at?: string | null;
}

export interface PasswordReset {
  user_id: string;
  otp: string;
  expires_at: string;
  created_at: string;
}

export interface AccountDeletion {
  user_id: string;
  email: string;
  otp: string;
  expires_at: string;
  created_at?: string;
}

export interface Report {
  id: string;
  user_id?: string | null;
  device_id?: string | null;
  message_id?: string | null;
  session_id?: string | null;
  reported_content: string;
  user_query?: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'dismissed' | 'action_taken';
  action_taken?: string | null;
  admin_notes?: string | null;
  created_at: string;
}

export interface ContactMessage {
  id: string;
  user_id?: string | null;
  name: string;
  contact_info: string;
  category: string;
  message: string;
  status: 'pending' | 'replied' | 'resolved' | 'dismissed';
  admin_notes?: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id?: string | null;
  title: string;
  body: string;
  type: 'info' | 'success' | 'warning' | 'maintenance';
  target: 'both' | 'web' | 'phone';
  active: boolean;
  created_at: string;
}

export interface AppVersion {
  id: string;
  platform: 'android' | 'ios';
  version_code: number;
  version_name: string;
  release_notes: string;
  download_url: string;
  mandatory: boolean;
  active: boolean;
  created_at: string;
}

export interface DeviceGuest {
  device_id: string;
  free_message_count: number;
  last_message_date: string;
  coins?: number;
}

export interface FreeTrialGrant {
  id: string;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  browser_fingerprint?: string;
  device_id?: string;
  platform: 'web' | 'mobile';
  coins_granted: number;
  created_at: string;
}

export interface CurriculumLesson {
  id: string;
  title: string;
  lessonNumber: number;
  unitTitle?: string;
  unitId?: string;
  subtopics?: string[];
  startPage?: number;
}

export interface CurriculumUnit {
  id: string;
  title: string;
  unitNumber: number;
  groupTitle?: string;
  startPage?: number;
  lessons: CurriculumLesson[];
}

export interface Curriculum {
  id: string;
  grade_level: string;
  subject_name: string;
  file_name: string;
  content?: string | null;
  units?: CurriculumUnit[];
  is_placeholder?: boolean;
  track_id?: string | null;
  is_elective?: boolean;
  created_at: string;
}

export interface CurriculumChunk {
  id: string;
  curriculum_id: string;
  content: string;
  heading: string;
  // v2 — hierarchical parent-child structure
  chunk_level?: 'parent' | 'child';
  parent_id?: string | null;
  position_index?: number;
  embedding?: number[] | null; // 768-dim vector (child chunks only)
}

export interface ChatMessage {
  id: string;
  user_id?: string;
  device_id?: string;
  session_id?: string;
  sender: 'user' | 'ai';
  message: string;
  created_at: string;
  coins_cost?: number;
}

export type ChatMode = 'socratic' | 'detailed' | 'summary';

export interface ChatSession {
  id: string;
  user_id?: string;
  device_id?: string;
  title: string;
  subject_name: string;
  grade_level: string;
  mode?: ChatMode;
  created_at: string;
  engagement_points_awarded?: boolean;
}

export interface ExamQuestion {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'essay';
  question: string;
  options?: string[];
  correct_answer: string;
  explanation: string;
}

export interface Exam {
  id: string;
  title: string;
  subject_name: string;
  grade_level: string;
  questions: ExamQuestion[];
  created_at: string;
  session_id?: string;
  user_id?: string;
  device_id?: string;
}

export interface ExamSubmission {
  id: string;
  exam_id: string;
  user_id?: string;
  device_id?: string;
  answers: Record<string, string>;
  score: number;
  evaluation: string;
  submitted_at: string;
  points_awarded?: number;
  is_first_attempt?: boolean;
}

export interface FlashcardDeck {
  id: string;
  user_id: string;
  subject_name: string;
  grade_level: string;
  title: string;
  created_at: string;
}

export interface Flashcard {
  id: string;
  deck_id: string;
  question: string;
  answer: string;
  box: number;
  next_review_at: string;
  created_at: string;
}

export interface PaymentTransaction {
  id: string;
  user_id?: string | null;
  order_id: string;
  plan_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'success' | 'failed' | 'refunded';
  provider: string;
  transaction_id?: string | null;
  payment_method?: string | null;
  raw_response?: any;
  created_at: string;
  updated_at: string;
}

export interface UserDevice {
  id: string;
  user_id: string;
  device_id: string;
  session_token?: string;
  device_name: string;
  device_type: 'web' | 'mobile' | 'tablet' | 'desktop';
  browser_fingerprint?: string;
  ip_address?: string;
  user_agent?: string;
  is_active: boolean;
  last_active_at: string;
  created_at: string;
}

export interface UserLessonProgress {
  id?: string;
  user_id: string;
  grade_level: string;
  subject_name: string;
  unit_id: string;
  lesson_id: string;
  status: 'completed' | 'in_progress';
  quiz_score?: number;
  completed_at?: string;
}

export interface StudyNotebookItem {
  id: string;
  user_id: string;
  subject_name: string;
  grade_level: string;
  title: string;
  content: string;
  note_type: 'formula' | 'definition' | 'solution' | 'law' | 'general';
  session_id?: string | null;
  message_id?: string | null;
  created_at: string;
}

export interface DailyQuestItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  current: number;
  completed: boolean;
  rewardPoints: number;
  claimed: boolean;
}

export interface DailyQuestProgress {
  date: string;
  quests: DailyQuestItem[];
  allCompleted: boolean;
  streakDays: number;
}

// Serverless hosts have a read-only filesystem: keep the local fallback store in memory there
const NO_DISK_DB = process.env.NEXT_RUNTIME === 'edge' || !!process.env.VERCEL;

// Initialize local DB file if missing
function initLocalDB() {
  if (NO_DISK_DB) return;
  cleanupOrphanedTmpFiles();
  const fs = require('fs');
  const DB_FILE = './db_data.json';
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      profiles: [
        {
          id: 'admin-id-1234567890',
          phone: '01147814652',
          email: 'admin@egsaiedu.com',
          name: 'مدير النظام',
          grade_level: '1_high',
          plan_type: 'max',
          role: 'admin',
          password_hash: '343f7ea65b1d1ed5b5980d214808c2e06379a8b97586db4d6c97874d4440c174',
          created_at: new Date().toISOString(),
          coins: 1000.0,
          last_active_date: new Date().toISOString().split('T')[0],
          unlimited_credit: true
        }
      ],
      pending_registrations: [],
      password_resets: [],
      device_guests: [],
      curriculums: [],
      curriculum_chunks: [],
      chat_history: [],
      chat_sessions: [],
      system_settings: [
        { key: 'website_link', value: 'http://localhost:3000' }
      ],
      exams: [],
      exam_submissions: [],
      reports: [],
      notifications: [],
      app_versions: [],
      flashcard_decks: [],
      flashcards: [],
      payment_transactions: [],
      free_trial_grants: [],
      user_devices: [],
      curriculum_entities: [],
      curriculum_relations: [],
      user_lesson_progress: [],
      study_notebook: [],
      claimed_daily_quests: [],
      voice_usage: [],
      voice_calls: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

declare global {
  var __egs_memory_db: any;
}

function getMemoryDB(): any {
  if (!globalThis.__egs_memory_db) {
    globalThis.__egs_memory_db = {
      profiles: [
        {
          id: 'admin-id-1234567890',
          phone: '01147814652',
          email: 'admin@egsaiedu.com',
          name: 'مدير النظام',
          grade_level: '1_high',
          plan_type: 'max',
          role: 'admin',
          password_hash: '343f7ea65b1d1ed5b5980d214808c2e06379a8b97586db4d6c97874d4440c174',
          created_at: new Date().toISOString(),
          coins: 1000.0,
          last_active_date: new Date().toISOString().split('T')[0],
          unlimited_credit: true
        },
        {
          id: 'f0000000-0000-4000-a000-000000000001',
          phone: '01000000000',
          email: 'test@egsaiedu.com',
          name: 'حساب اختباري (Test Account)',
          grade_level: '1_high',
          plan_type: 'max',
          role: 'admin',
          unlimited_credit: true,
          coins: 10000,
          points: 0,
          study_streak: 1,
          password_hash: 'pbkdf2$100000$h0SjDuidjcSD8T3EPG1nRA==$pKLZrAFUqLdoMTyheDcKFq9o02smj/kIrJu03RWzHM8=',
          created_at: '2026-07-30T13:35:52.543Z',
          last_active_date: new Date().toISOString().split('T')[0]
        }
      ],
      pending_registrations: [],
      password_resets: [],
      device_guests: [],
      curriculums: [],
      curriculum_chunks: [],
      chat_history: [],
      chat_sessions: [],
      system_settings: [
        { key: 'website_link', value: 'http://localhost:3000' }
      ],
      exams: [],
      exam_submissions: [],
      reports: [],
      notifications: [],
      app_versions: [],
      flashcard_decks: [],
      flashcards: [],
      payment_transactions: [],
      free_trial_grants: [],
      user_devices: [],
      contact_messages: [],
      curriculum_entities: [],
      curriculum_relations: [],
      user_lesson_progress: [],
      study_notebook: [],
      claimed_daily_quests: [],
      voice_usage: [],
      voice_calls: []
    };
  }
  return globalThis.__egs_memory_db;
}

// Startup sweep: clean up any orphaned .tmp files left by unexpected crashes or restarts
export function cleanupOrphanedTmpFiles() {
  if (NO_DISK_DB) return;
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = '.';
    const files = fs.readdirSync(/*turbopackIgnore: true*/ dir);
    for (const file of files) {
      if (file.startsWith('db_data.json.tmp')) {
        try {
          fs.unlinkSync(path.join(/*turbopackIgnore: true*/ dir, file));
        } catch {
          // Ignore unlink errors on locked files
        }
      }
    }
  } catch {
    // Ignore directory read errors
  }
}

// Local DB in-memory master store and atomic asynchronous disk flusher
let localDbMemoryStore: any = null;
let flushTimer: any = null;
let flushQueuePromise: Promise<void> = Promise.resolve();

export function flushDiskSync() {
  if (NO_DISK_DB || !localDbMemoryStore) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const fs = require('fs');
  const DB_FILE = './db_data.json';
  const TMP_FILE = './db_data.json.tmp.sync';
  try {
    const dataToWrite = localDbMemoryStore;
    fs.writeFileSync(TMP_FILE, JSON.stringify(dataToWrite, null, 2), 'utf8');
    fs.renameSync(TMP_FILE, DB_FILE);
  } catch (err) {
    console.error('Error in synchronous disk flush:', err);
    try {
      if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE);
    } catch {}
  }
}

export async function flushDiskAsync(): Promise<void> {
  if (NO_DISK_DB) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return executeAsyncDiskFlush();
}

async function executeAsyncDiskFlush(): Promise<void> {
  if (NO_DISK_DB || !localDbMemoryStore) return;

  // Chain write task to queue promise to guarantee sequential execution without race conditions
  flushQueuePromise = flushQueuePromise.then(async () => {
    const fs = require('fs');
    const DB_FILE = './db_data.json';
    const uniqueTmp = './db_data.json.tmp.' + Date.now() + '.' + Math.random().toString(36).slice(2, 9);
    // Read the most recent memory store state at execution time
    const dataToWrite = localDbMemoryStore;
    if (!dataToWrite) return;

    let renamed = false;
    try {
      const serialized = JSON.stringify(dataToWrite, null, 2);
      await fs.promises.writeFile(uniqueTmp, serialized, 'utf8');
      await fs.promises.rename(uniqueTmp, DB_FILE);
      renamed = true;
    } catch (err) {
      console.error('Error in asynchronous disk flush:', err);
    } finally {
      if (!renamed) {
        try {
          if (fs.existsSync(uniqueTmp)) {
            await fs.promises.unlink(uniqueTmp);
          }
        } catch (cleanupErr) {
          // Suppress secondary cleanup errors
        }
      }
    }
  }).catch(err => {
    console.error('Unhandled error in disk flush queue:', err);
  });

  await flushQueuePromise;
}

function scheduleDiskFlush(data?: any) {
  if (NO_DISK_DB) return;
  if (data) {
    localDbMemoryStore = data;
  }
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    executeAsyncDiskFlush().catch(err => {
      console.error('Unhandled error in executeAsyncDiskFlush:', err);
    });
  }, 25);
}

// Initial sweep on module load
if (typeof process !== 'undefined' && !NO_DISK_DB) {
  cleanupOrphanedTmpFiles();
  const proc = process as unknown as { on?: (event: string, cb: () => void) => void };
  if (typeof proc?.on === 'function') {
    proc.on('beforeExit', () => flushDiskSync());
    proc.on('exit', () => {
      flushDiskSync();
      cleanupOrphanedTmpFiles();
    });
  }
}

// Read local DB with in-memory master cache
function readLocalDB() {
  if (NO_DISK_DB) {
    return getMemoryDB();
  }
  if (localDbMemoryStore) {
    return localDbMemoryStore;
  }
  const fs = require('fs');
  const DB_FILE = './db_data.json';
  initLocalDB();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    let changed = false;

    const tables = [
      'contact_messages', 'payment_transactions', 'chat_sessions',
      'exams', 'exam_submissions', 'reports', 'notifications',
      'app_versions', 'password_resets', 'curriculum_entities',
      'curriculum_relations', 'free_trial_grants', 'user_devices',
      'user_lesson_progress', 'study_notebook', 'claimed_daily_quests', 'voice_usage', 'voice_calls'
    ];
    for (const table of tables) {
      if (!parsed[table]) {
        parsed[table] = [];
        changed = true;
      }
    }

    if (parsed.profiles) {
      parsed.profiles.forEach((p: any) => {
        if (p.coins === undefined) {
          p.coins = p.plan_type === 'pro' ? 500.0 : (p.plan_type === 'max' ? 1000.0 : 50.0);
          changed = true;
        }
        if (p.points === undefined) {
          p.points = 0;
          changed = true;
        }
        if (p.study_streak === undefined) {
          p.study_streak = 1;
          changed = true;
        }
        if (p.last_active_date === undefined) {
          p.last_active_date = new Date().toISOString().split('T')[0];
          changed = true;
        }
        if (p.unlimited_credit === undefined) {
          p.unlimited_credit = p.role === 'admin';
          changed = true;
        }
      });
    }

    if (parsed.device_guests) {
      parsed.device_guests.forEach((dg: any) => {
        if (dg.coins === undefined) {
          dg.coins = 5.0;
          changed = true;
        }
      });
    }

    if (parsed.chat_history) {
      parsed.chat_history.forEach((ch: any) => {
        if (ch.coins_cost === undefined) {
          ch.coins_cost = 0.0;
          changed = true;
        }
      });
    }

    localDbMemoryStore = parsed;
    if (changed) {
      scheduleDiskFlush(localDbMemoryStore);
    }
    return localDbMemoryStore;
  } catch (e) {
    console.error("Error reading local DB, falling back to memory store without resetting file:", e);
    if (localDbMemoryStore) return localDbMemoryStore;
    localDbMemoryStore = getMemoryDB();
    return localDbMemoryStore;
  }
}

// Write local DB (synchronous memory update + atomic scheduled disk flush)
function writeLocalDB(data: any) {
  if (NO_DISK_DB) {
    globalThis.__egs_memory_db = data;
    return;
  }
  localDbMemoryStore = data;
  scheduleDiskFlush(data);
}

// Supabase client setup (optional)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const isSupabaseEnabled = supabaseUrl !== '' && supabaseServiceKey !== '';

const supabase = isSupabaseEnabled
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

export const supabaseAdmin = supabase;


// last_active_at is informational (device list); writing it on every request is wasted I/O.
const DEVICE_ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const deviceActivityWrites = new Map<string, number>();

async function deleteUserMedia(userId: string): Promise<void> {
  if (!supabase) return;
  const bucket = supabase.storage.from('chat-media');
  const { data: folders } = await bucket.list(userId, { limit: 1000 });
  for (const folder of folders || []) {
    const prefix = `${userId}/${folder.name}`;
    const { data: files } = await bucket.list(prefix, { limit: 1000 });
    const paths = (files || []).map(f => `${prefix}/${f.name}`);
    if (paths.length) await bucket.remove(paths);
  }
}

if (isSupabaseEnabled) {
  console.log("Database Mode: Supabase Cloud Database Connected.");
} else {
  console.log("Database Mode: Local JSON File Database Enabled.");
}

export function normalizePlanId(rawPlanId?: string | null): {
  planType: 'pro_1m' | 'pro_2m' | 'pro_3m';
  durationDays: number;
  dailyCap: number;
  planTitle: string;
} {
  const clean = (rawPlanId || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (
    clean === 'pro_3m' ||
    clean === 'pro_3' ||
    clean === '3_months' ||
    clean === '3_month' ||
    clean === '3months' ||
    clean === '3month' ||
    clean === '3m' ||
    clean === 'term' ||
    clean === 'max'
  ) {
    return {
      planType: 'pro_3m',
      durationDays: 90,
      dailyCap: 120.0,
      planTitle: 'باقة 3 أشهر (120 نقطة يومياً متجددة)'
    };
  }
  if (
    clean === 'pro_2m' ||
    clean === 'pro_2' ||
    clean === '2_months' ||
    clean === '2_month' ||
    clean === '2months' ||
    clean === '2month' ||
    clean === '2m'
  ) {
    return {
      planType: 'pro_2m',
      durationDays: 60,
      dailyCap: 90.0,
      planTitle: 'باقة شهرين (90 نقطة يومياً متجددة)'
    };
  }
  return {
    planType: 'pro_1m',
    durationDays: 30,
    dailyCap: 80.0,
    planTitle: 'باقة شهر (80 نقطة يومياً متجددة)'
  };
}

// Daily coin caps per plan. Replenishment tops the balance UP TO the cap on the
// first request of a new day — it never reduces a balance already above the cap.
// Note: free accounts receive a trial grant, plus a daily freemium lifeline of 5.0 coins.
export const DAILY_COIN_CAPS: Record<string, number> = {
  free: 5.0, // Sustainable daily freemium lifeline for fast queries
  pro: 80.0,
  pro_1m: 80.0,
  pro_2m: 90.0,
  pro_3m: 120.0,
  max: 120.0
};

// In-memory dashboard stats caching (30s TTL)
let cachedDashboardStats: any = null;
let lastDashboardStatsTime = 0;
const DASHBOARD_CACHE_TTL_MS = 30000; // 30 seconds

export function invalidateDashboardStatsCache() {
  cachedDashboardStats = null;
  lastDashboardStatsTime = 0;
}

// In-memory public system configuration caching (30s TTL fallback)
let cachedPublicConfig: {
  websiteLink: string;
  activeGradeLevels: string[];
  activeTracks: string[];
  activeCurriculumIds: string[];
  allCurriculums: Curriculum[];
  educationCatalog: EducationCatalog;
} | null = null;
let lastPublicConfigTime = 0;
const PUBLIC_CONFIG_CACHE_TTL_MS = 30000; // 30 seconds fallback

export function invalidatePublicConfigCache() {
  invalidateCurriculumsCache();
}

export function getPublicConfigVersion(): number {
  return lastPublicConfigTime;
}

// In-memory notifications caching (60s TTL)
let cachedBroadcastNotifications: { target: string; data: AppNotification[]; time: number } | null = null;
const BROADCAST_NOTIF_CACHE_TTL_MS = 60000;
const cachedUserNotifications = new Map<string, { data: AppNotification[]; time: number }>();
const USER_NOTIF_CACHE_TTL_MS = 60000;

export function invalidateNotificationsCache() {
  cachedBroadcastNotifications = null;
  cachedUserNotifications.clear();
}

// In-memory leaderboard caching (15s TTL)
const cachedLeaderboardMap = new Map<string, { data: any[]; time: number }>();
const LEADERBOARD_CACHE_TTL_MS = 15000;

export function invalidateLeaderboardCache() {
  cachedLeaderboardMap.clear();
  invalidateUserRankCache();
}

// In-memory curriculums list caching (30s TTL fallback)
let cachedCurriculums: { data: Curriculum[]; time: number } | null = null;
const CURRICULUMS_CACHE_TTL_MS = 30000; // 30 seconds fallback

const curriculumInvalidators = new Set<() => void>();
export function registerCurriculumInvalidator(fn: () => void) {
  curriculumInvalidators.add(fn);
}

export function invalidateCurriculumsCache() {
  cachedCurriculums = null;
  cachedPublicConfig = null;
  lastPublicConfigTime = Date.now();
  corpusCache.clear();
  for (const fn of curriculumInvalidators) {
    try {
      fn();
    } catch {}
  }
}

/**
 * Whole-curriculum retrieval corpus kept in memory: every parent section and child chunk, a BM25 index
 * over the children and the knowledge graph. Loaded once per curriculum and reused by every chat turn.
 */
export interface CurriculumCorpus {
  curriculumId: string;
  parents: Map<string, CurriculumChunk>;
  parentsByPosition: CurriculumChunk[];
  children: Map<string, CurriculumChunk>;
  index: BM25Index;
  graph: KnowledgeGraphEngine;
  loadedAt: number;
}

const CORPUS_CACHE_LIMIT = 12;
const CORPUS_TTL_MS = 30 * 60 * 1000;
const corpusCache = new Map<string, Promise<CurriculumCorpus>>();

async function fetchAllRows<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await build(page * 1000, page * 1000 + 999);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function loadCurriculumCorpus(curriculumId: string): Promise<CurriculumCorpus> {
  let chunks: CurriculumChunk[];
  let entities: CurriculumEntity[];
  let relations: CurriculumRelation[];
  if (supabase) {
    [chunks, entities, relations] = await Promise.all([
      fetchAllRows<CurriculumChunk>((from, to) => supabase
        .from('curriculum_chunks')
        .select('id, content, heading, curriculum_id, chunk_level, parent_id, position_index')
        .eq('curriculum_id', curriculumId)
        .gte('position_index', 0)
        .order('position_index', { ascending: true })
        .range(from, to)),
      fetchAllRows<CurriculumEntity>((from, to) => supabase
        .from('curriculum_entities')
        .select('id, curriculum_id, name, normalized_name, category, description, aliases, chunk_ids, importance_score')
        .eq('curriculum_id', curriculumId)
        .order('id')
        .range(from, to)).catch(() => []),
      fetchAllRows<CurriculumRelation>((from, to) => supabase
        .from('curriculum_relations')
        .select('id, curriculum_id, source_entity_id, target_entity_id, relation_type, description, weight')
        .eq('curriculum_id', curriculumId)
        .order('id')
        .range(from, to)).catch(() => [])
    ]);
  } else {
    const data = readLocalDB();
    chunks = data.curriculum_chunks.filter((c: CurriculumChunk) => c.curriculum_id === curriculumId && (c.position_index ?? 0) >= 0);
    entities = (data.curriculum_entities || []).filter((e: CurriculumEntity) => e.curriculum_id === curriculumId);
    relations = (data.curriculum_relations || []).filter((r: CurriculumRelation) => r.curriculum_id === curriculumId);
  }

  const parents = new Map<string, CurriculumChunk>();
  const children = new Map<string, CurriculumChunk>();
  for (const c of chunks) {
    if (c.heading.startsWith('__')) continue;
    (c.chunk_level === 'child' ? children : parents).set(c.id, c);
  }
  const parentsByPosition = [...parents.values()].sort((a, b) => (a.position_index ?? 0) - (b.position_index ?? 0));
  relinkChildrenToOwnSections(parentsByPosition, children);

  const covered = new Set([...children.values()].map(c => c.parent_id));
  const docs = [...children.values(), ...parentsByPosition.filter(p => !covered.has(p.id))];
  const index = new BM25Index(docs.map(c => ({
    id: c.id,
    heading: c.heading,
    content: c.content,
    parent_id: c.parent_id,
    position_index: c.position_index
  })));
  return {
    curriculumId,
    parents,
    parentsByPosition,
    children,
    index,
    graph: new KnowledgeGraphEngine(entities, relations),
    loadedAt: Date.now()
  };
}

const flatText = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Older uploads linked each child to the FIRST parent carrying the same breadcrumb, so a child of a repeated
 * section ("أمثلة", split parts) pointed at an unrelated section. The owner is the parent whose text contains
 * the child's text; same-heading parents are checked first, then any parent.
 */
function relinkChildrenToOwnSections(parents: CurriculumChunk[], children: Map<string, CurriculumChunk>) {
  const flatParents = new Map(parents.map(p => [p.id, flatText(p.content)]));
  const byHeading = new Map<string, CurriculumChunk[]>();
  for (const p of parents) {
    const list = byHeading.get(p.heading);
    if (list) list.push(p);
    else byHeading.set(p.heading, [p]);
  }
  for (const child of children.values()) {
    const probe = flatText(child.content).slice(0, 80);
    if (!probe) continue;
    const current = child.parent_id ? flatParents.get(child.parent_id) : undefined;
    if (current?.includes(probe)) continue;
    const owner = (byHeading.get(child.heading) || []).find(p => flatParents.get(p.id)!.includes(probe))
      || parents.find(p => flatParents.get(p.id)!.includes(probe));
    if (owner) children.set(child.id, { ...child, parent_id: owner.id });
  }
}

export function getCurriculumCorpus(curriculumId: string): Promise<CurriculumCorpus> {
  const cached = corpusCache.get(curriculumId);
  if (cached) {
    corpusCache.delete(curriculumId);
    corpusCache.set(curriculumId, cached);
    return cached;
  }
  const pending = loadCurriculumCorpus(curriculumId);
  corpusCache.set(curriculumId, pending);
  pending
    .then(() => setTimeout(() => {
      if (corpusCache.get(curriculumId) === pending) corpusCache.delete(curriculumId);
    }, CORPUS_TTL_MS).unref?.())
    .catch(() => corpusCache.delete(curriculumId));
  while (corpusCache.size > CORPUS_CACHE_LIMIT) {
    corpusCache.delete(corpusCache.keys().next().value as string);
  }
  return pending;
}

// Single-flight request coalescing for user leaderboard rank (deduplicates concurrent in-flight requests)
const inFlightUserRank = new Map<string, Promise<any | null>>();

export function invalidateUserRankCache(userId?: string) {
  if (userId) {
    for (const key of inFlightUserRank.keys()) {
      if (key.startsWith(`${userId}_`)) {
        inFlightUserRank.delete(key);
      }
    }
  } else {
    inFlightUserRank.clear();
  }
}

// Single-flight request coalescing for student daily quests (deduplicates concurrent in-flight requests)
const inFlightDailyQuests = new Map<string, Promise<DailyQuestProgress>>();

export function invalidateDailyQuestsCache(userId?: string) {
  if (userId) {
    inFlightDailyQuests.delete(userId);
  } else {
    inFlightDailyQuests.clear();
  }
}

// Helper: Daily coin replenishment + activity date refresh + streak update + subscription expiry check
async function checkAndResetDailyCoins(profile: Profile): Promise<Profile> {
  const today = getCairoDateString();
  let profileModified = false;

  // Check, self-heal, and enforce subscription duration and expiry
  if (profile.plan_type && profile.plan_type !== 'free') {
    const planInfo = normalizePlanId(profile.subscription_plan_id || profile.plan_type);
    const expectedDurationDays = planInfo.durationDays;
    let startIso = profile.subscription_start_date;
    if (!startIso && supabase && profile.id) {
      try {
        const { data: tx } = await supabase
          .from('payment_transactions')
          .select('updated_at, created_at')
          .eq('user_id', profile.id)
          .eq('status', 'success')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (tx && (tx.updated_at || tx.created_at)) {
          startIso = tx.updated_at || tx.created_at;
        }
      } catch {
        // Continue to fallback
      }
    }
    if (!startIso) {
      startIso = profile.created_at || new Date().toISOString();
    }
    const startMs = new Date(startIso).getTime();

    if (!profile.subscription_end_date) {
      // Self-healing: compute missing subscription_end_date
      const computedEndMs = startMs + expectedDurationDays * 24 * 60 * 60 * 1000;
      profile.subscription_start_date = startIso;
      profile.subscription_end_date = new Date(computedEndMs).toISOString();
      profile.subscription_plan_id = planInfo.planType;
      if (computedEndMs > Date.now()) {
        profile.subscription_status = 'active';
      } else {
        profile.subscription_status = 'expired';
        profile.plan_type = 'free';
      }
      profileModified = true;
    } else {
      const currentEndMs = new Date(profile.subscription_end_date).getTime();
      const currentSpanDays = Math.round((currentEndMs - startMs) / (24 * 60 * 60 * 1000));

      // Self-healing: if an account subscribed to a 2-month or 3-month plan was truncated to ~30 days, correct it
      if (expectedDurationDays > 30 && currentSpanDays <= 35) {
        const correctedEndMs = startMs + expectedDurationDays * 24 * 60 * 60 * 1000;
        profile.subscription_end_date = new Date(correctedEndMs).toISOString();
        profile.subscription_start_date = startIso;
        profile.subscription_plan_id = planInfo.planType;
        if (correctedEndMs > Date.now()) {
          profile.subscription_status = 'active';
        } else {
          profile.subscription_status = 'expired';
          profile.plan_type = 'free';
        }
        profileModified = true;
      } else {
        // Standard expiry verification
        const isExpired = currentEndMs <= Date.now();
        if (isExpired && profile.subscription_status === 'active') {
          profile.subscription_status = 'expired';
          profile.plan_type = 'free';
          profileModified = true;
        } else if (!isExpired && profile.subscription_status !== 'active') {
          profile.subscription_status = 'active';
          profile.plan_type = planInfo.planType;
          profileModified = true;
        }
      }
    }
  }

  // Daily coin replenishment and streak update on new day (aligned with Africa/Cairo calendar date)
  if (profile.last_active_date !== today) {
    const effectiveStatus = profile.subscription_status || (profile.plan_type && profile.plan_type !== 'free' ? 'active' : 'inactive');
    const isFree = !profile.plan_type || profile.plan_type === 'free' || effectiveStatus !== 'active';
    const cap = isFree ? (DAILY_COIN_CAPS.free ?? 5.0) : (DAILY_COIN_CAPS[profile.plan_type] ?? 80.0);
    const current = toPreciseCoins(profile.coins === undefined ? 0.0 : profile.coins);
    // Packages replenish up to their daily cap minus any overdraft carried from the previous day
    const debt = Math.max(0, profile.coin_debt ?? 0);
    const newCoins = toPreciseCoins(Math.max(current, cap - debt, 0));
    if (debt > 0) profile.coin_debt = toPreciseCoins(Math.max(0, debt - cap));

    // Calculate new streak based on Cairo calendar days
    let newStreak = profile.study_streak || 1;
    if (profile.last_active_date) {
      const todayDate = new Date(today + 'T00:00:00Z');
      const lastActiveDate = new Date(profile.last_active_date + 'T00:00:00Z');
      const diffTime = todayDate.getTime() - lastActiveDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        newStreak = (profile.study_streak || 1) + 1;
      } else if (diffDays === 2 && (profile.streak_shields ?? 1) > 0) {
        // Missed exactly 1 day — consume 1 shield to protect the streak
        profile.streak_shields = Math.max(0, (profile.streak_shields ?? 1) - 1);
        newStreak = (profile.study_streak || 1) + 1;
      } else if (diffDays > 1) {
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }

    profile.last_active_date = today;
    profile.coins = newCoins;
    profile.study_streak = newStreak;
    profileModified = true;
  }

  if (profile.improve_ai_opt_in === undefined) {
    profile.improve_ai_opt_in = true;
  }
  if (profile.streak_shields === undefined) {
    profile.streak_shields = 1;
  }

  if (profileModified) {
    const updatePayload: Partial<Profile> = {
      last_active_date: profile.last_active_date,
      coins: toPreciseCoins(profile.coins ?? 0.0),
      study_streak: profile.study_streak,
      streak_shields: profile.streak_shields,
      plan_type: profile.plan_type,
      subscription_status: profile.subscription_status,
      subscription_start_date: profile.subscription_start_date,
      subscription_end_date: profile.subscription_end_date,
      subscription_plan_id: profile.subscription_plan_id,
      ...(profile.coin_debt !== undefined ? { coin_debt: profile.coin_debt } : {})
    };

    if (supabase) {
      const { error } = await supabase.from('profiles').update(updatePayload).eq('id', profile.id);
      if (error) {
        const { subscription_status, subscription_start_date, subscription_end_date, subscription_plan_id, streak_shields, coin_debt, ...basePayload } = updatePayload;
        await supabase.from('profiles').update(basePayload).eq('id', profile.id);
      }
    } else {
      const data = readLocalDB();
      const p = (data.profiles || []).find((x: any) => x.id === profile.id);
      if (p) {
        Object.assign(p, updatePayload);
        writeLocalDB(data);
      }
    }
  }

  return profile;
}


// Helper: Check and reset device guest coins daily
async function checkAndResetGuestDailyCoins(guest: DeviceGuest): Promise<DeviceGuest> {
  const today = getCairoDateString();
  if (guest.last_message_date !== today) {
    guest.coins = 5.0; // Reset guest to 5 coins daily
    guest.last_message_date = today;
    
    if (supabase) {
      await supabase.from('device_guests').update({ coins: 5.0, last_message_date: today }).eq('device_id', guest.device_id);
    } else {
      const data = readLocalDB();
      const g = data.device_guests.find((x: any) => x.device_id === guest.device_id);
      if (g) {
        g.coins = 5.0;
        g.last_message_date = today;
        writeLocalDB(data);
      }
    }
  }
  return guest;
}

/**
 * Maps a student's (stage, subject) to the (grade_level, subject_name) of the curriculum that holds
 * the content, following catalog sharing so a curriculum shared into another stage or system is
 * searched from its single source.
 */
async function resolveCurriculumKey(gradeLevel: string, subjectName: string): Promise<{ grade: string; subject: string }> {
  const grade = (gradeLevel || '').trim();
  const subject = (subjectName || '').trim();
  const [catalog, curricula] = await Promise.all([db.getEducationCatalog(), db.getCurriculums()]);
  const found = resolveCurriculum(catalog, curricula, grade, subject);
  return found ? { grade: found.grade_level, subject: found.subject_name } : { grade, subject: normalizeSubjectAlias(grade, subject) };
}

function normalizeSubjectAlias(gradeLevel: string, subjectName: string): string {
  const g = (gradeLevel || '').trim();
  const s = (subjectName || '').trim();
  if (g === '2_high' && (s === 'التاريخ' || s === 'تاريخ' || s === 'التاريخ المصري')) {
    return 'التاريخ المصري';
  }
  if (g === '2_high' && (s === 'الفيزياء' || s === 'فيزياء')) {
    return 'فيزياء';
  }
  if (g === '2_high' && (s === 'الرياضيات' || s === 'رياضيات')) {
    return 'رياضيات';
  }
  if ((g.includes('secondary') || g.includes('stage_')) && (s === 'فيزياء' || s === 'الفيزياء')) {
    return 'الفيزياء';
  }
  if ((g.includes('secondary') || g.includes('stage_')) && (s === 'كيمياء' || s === 'الكيمياء')) {
    return 'الكيمياء';
  }
  return s;
}

// AI Response Quality Improvement Opt-Out Privacy Store
let cachedOptedOutUserIds: Set<string> | null = null;
let lastOptedOutFetchTime = 0;
const OPT_OUTS_CACHE_TTL_MS = 60000;

export async function isUserOptedOutOfAiImprovement(userId: string): Promise<boolean> {
  const set = await getAllOptedOutUserIds();
  return set.has(userId);
}

export async function getAllOptedOutUserIds(): Promise<Set<string>> {
  if (cachedOptedOutUserIds && (Date.now() - lastOptedOutFetchTime < OPT_OUTS_CACHE_TTL_MS)) {
    return cachedOptedOutUserIds;
  }

  const set = new Set<string>();

  // Check localDB memory store first
  try {
    const local = readLocalDB();
    if (local?.profiles && Array.isArray(local.profiles)) {
      for (const p of local.profiles) {
        if (p.improve_ai_opt_in === false) {
          set.add(p.id);
        }
      }
    }
  } catch {}

  // If Supabase is enabled, load privacy opt-outs from system_settings
  if (supabase) {
    try {
      const { data, error } = await supabase.from('system_settings').select('key, value').like('key', 'privacy_opt_out:%');
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const uid = row.key.replace('privacy_opt_out:', '');
          if (uid && row.value === 'true') {
            set.add(uid);
          }
        }
      }
    } catch {}
  }

  cachedOptedOutUserIds = set;
  lastOptedOutFetchTime = Date.now();
  return set;
}

export async function setUserOptOutFallback(userId: string, optIn: boolean): Promise<void> {
  if (!cachedOptedOutUserIds) {
    cachedOptedOutUserIds = new Set<string>();
  }

  if (!optIn) {
    cachedOptedOutUserIds.add(userId);
  } else {
    cachedOptedOutUserIds.delete(userId);
  }

  // Update local DB
  try {
    const local = readLocalDB();
    const p = (local.profiles || []).find((x: Profile) => x.id === userId);
    if (p) {
      p.improve_ai_opt_in = optIn;
      writeLocalDB(local);
    }
  } catch {}

  // Update Supabase system_settings
  if (supabase) {
    const key = `privacy_opt_out:${userId}`;
    try {
      if (!optIn) {
        await supabase.from('system_settings').upsert({ key, value: 'true' });
      } else {
        await supabase.from('system_settings').delete().eq('key', key);
      }
    } catch {}
  }
}

export const db = {
  // Profiles
  async getProfile(id: string): Promise<Profile | null> {
    if (supabase) {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
      if (error || !data) return null;
      if (data.improve_ai_opt_in === undefined) {
        data.improve_ai_opt_in = !(await isUserOptedOutOfAiImprovement(id));
      }
      return await checkAndResetDailyCoins(data);
    } else {
      const data = readLocalDB();
      const profile = data.profiles.find((p: Profile) => p.id === id) || null;
      if (!profile) return null;
      if (profile.improve_ai_opt_in === undefined) {
        profile.improve_ai_opt_in = !(await isUserOptedOutOfAiImprovement(id));
      }
      return await checkAndResetDailyCoins(profile);
    }
  },

  async getProfileByPhone(phone: string): Promise<Profile | null> {
    if (supabase) {
      const { data, error } = await supabase.from('profiles').select('*').eq('phone', phone).maybeSingle();
      if (error || !data) return null;
      if (data.improve_ai_opt_in === undefined) {
        data.improve_ai_opt_in = !(await isUserOptedOutOfAiImprovement(data.id));
      }
      return await checkAndResetDailyCoins(data);
    } else {
      const data = readLocalDB();
      const profile = data.profiles.find((p: Profile) => p.phone === phone) || null;
      if (!profile) return null;
      if (profile.improve_ai_opt_in === undefined) {
        profile.improve_ai_opt_in = !(await isUserOptedOutOfAiImprovement(profile.id));
      }
      return await checkAndResetDailyCoins(profile);
    }
  },

  async getProfileByEmail(email: string): Promise<Profile | null> {
    if (supabase) {
      const { data, error } = await supabase.from('profiles').select('*').eq('email', email.toLowerCase()).maybeSingle();
      if (error || !data) return null;
      if (data.improve_ai_opt_in === undefined) {
        data.improve_ai_opt_in = !(await isUserOptedOutOfAiImprovement(data.id));
      }
      return await checkAndResetDailyCoins(data);
    } else {
      const data = readLocalDB();
      const profile = data.profiles.find((p: Profile) => p.email?.toLowerCase() === email.toLowerCase()) || null;
      if (!profile) return null;
      if (profile.improve_ai_opt_in === undefined) {
        profile.improve_ai_opt_in = !(await isUserOptedOutOfAiImprovement(profile.id));
      }
      return await checkAndResetDailyCoins(profile);
    }
  },

  async createProfile(profile: Omit<Profile, 'created_at'>): Promise<Profile> {
    const defaultCoins = profile.plan_type === 'pro' ? 80.0 : (profile.plan_type === 'max' ? 120.0 : 20.0);
    const newProfile = {
      ...profile,
      email: profile.email ? profile.email.toLowerCase() : undefined,
      coins: profile.coins !== undefined ? profile.coins : defaultCoins,
      points: profile.points !== undefined ? profile.points : 0,
      study_streak: profile.study_streak !== undefined ? profile.study_streak : 1,
      last_active_date: profile.last_active_date || getCairoDateString(),
      improve_ai_opt_in: profile.improve_ai_opt_in !== undefined ? profile.improve_ai_opt_in : true,
      welcome_reward_claimed: profile.welcome_reward_claimed ?? true,
      free_plan_claimed: profile.free_plan_claimed ?? true,
      apology_compensation_claimed: false,
      apology_dismissed: true, // Brand-new accounts created from now on never see the apology message
      created_at: new Date().toISOString()
    };

    if (supabase) {
      let { data, error } = await supabase.from('profiles').insert(newProfile).select().single();
      if (error) {
        const { welcome_reward_claimed, free_plan_claimed, apology_compensation_claimed, apology_dismissed, improve_ai_opt_in, ...safeProfile } = newProfile as any;
        let retry = await supabase.from('profiles').insert(safeProfile).select().single();
        if (retry.error) {
          const missingMatch = retry.error.message?.match(/Could not find the '([^']+)' column/);
          if (missingMatch && missingMatch[1]) {
            delete (safeProfile as any)[missingMatch[1]];
            retry = await supabase.from('profiles').insert(safeProfile).select().single();
          }
        }
        if (retry.error) throw new Error(retry.error.message);
        data = {
          ...retry.data,
          welcome_reward_claimed: (newProfile as any).welcome_reward_claimed ?? false,
          free_plan_claimed: (newProfile as any).free_plan_claimed ?? false,
          apology_compensation_claimed: (newProfile as any).apology_compensation_claimed ?? false,
          apology_dismissed: (newProfile as any).apology_dismissed ?? true
        };
      }
      return data;
    } else {
      const data = readLocalDB();
      data.profiles = data.profiles.filter((p: Profile) => 
        p.id !== profile.id && 
        (!profile.email || p.email?.toLowerCase() !== profile.email.toLowerCase()) && 
        (!profile.phone || p.phone !== profile.phone)
      );
      data.profiles.push(newProfile);
      writeLocalDB(data);
      return newProfile;
    }
  },

  async updateProfilePlan(id: string, planType: 'free' | 'pro' | 'pro_1m' | 'pro_2m' | 'pro_3m' | 'max'): Promise<Profile | null> {
    const isFree = planType === 'free';
    const planInfo = normalizePlanId(planType);
    const coins = isFree ? 0.0 : planInfo.dailyCap;
    const durationDays = isFree ? 0 : planInfo.durationDays;
    const today = new Date().toISOString().split('T')[0];
    const updatePayload = {
      plan_type: isFree ? ('free' as const) : planInfo.planType,
      coins,
      last_active_date: today,
      subscription_status: isFree ? ('inactive' as const) : ('active' as const),
      subscription_start_date: isFree ? null : new Date().toISOString(),
      subscription_end_date: isFree ? null : new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
      subscription_plan_id: isFree ? null : planInfo.planType
    };
    if (supabase) {
      let { data, error } = await supabase.from('profiles').update(updatePayload).eq('id', id).select().single();
      if (error) {
        const { subscription_status, subscription_start_date, subscription_end_date, subscription_plan_id, ...basePayload } = updatePayload;
        const retry = await supabase.from('profiles').update(basePayload).eq('id', id).select().single();
        if (retry.data) data = retry.data;
      }
      return data || null;
    } else {
      const data = readLocalDB();
      const profile = data.profiles.find((p: Profile) => p.id === id);
      if (!profile) return null;
      Object.assign(profile, updatePayload);
      writeLocalDB(data);
      return profile;
    }
  },

  async updateProfileGradeLevel(id: string, gradeLevel: string, trackId?: string | null, electiveSubject?: string | null): Promise<Profile | null> {
    const updatePayload: any = { grade_level: gradeLevel };
    if (trackId !== undefined) updatePayload.track_id = trackId;
    if (electiveSubject !== undefined) updatePayload.elective_subject = electiveSubject;

    if (supabase) {
      const { data, error } = await supabase.from('profiles').update(updatePayload).eq('id', id).select().single();
      if (error) return null;
      return data;
    } else {
      const data = readLocalDB();
      const profile = data.profiles.find((p: Profile) => p.id === id);
      if (!profile) return null;
      profile.grade_level = gradeLevel;
      if (trackId !== undefined) profile.track_id = trackId;
      if (electiveSubject !== undefined) profile.elective_subject = electiveSubject;
      writeLocalDB(data);
      return profile;
    }
  },

  // Pending registrations (OTP flow)
  async getPendingRegistration(email: string): Promise<PendingRegistration | null> {
    const cleanEmail = email.toLowerCase().trim();
    if (supabase) {
      const { data, error } = await supabase.from('pending_registrations').select('*').eq('email', cleanEmail).maybeSingle();
      if (error || !data) return null;
      if (!data.expires_at && data.created_at) {
        data.expires_at = new Date(new Date(data.created_at).getTime() + 10 * 60 * 1000).toISOString();
      }
      return data;
    } else {
      const data = readLocalDB();
      const pr = data.pending_registrations.find((p: PendingRegistration) => p.email?.toLowerCase().trim() === cleanEmail) || null;
      if (pr && !pr.expires_at && pr.created_at) {
        pr.expires_at = new Date(new Date(pr.created_at).getTime() + 10 * 60 * 1000).toISOString();
      }
      return pr;
    }
  },

  async createPendingRegistration(
    email: string,
    name: string,
    gradeLevel: string,
    passwordHash: string,
    otp: string,
    termsAcceptedAt?: string,
    phone?: string,
    expiresAt?: string,
    trackId?: string | null,
    electiveSubject?: string | null
  ): Promise<PendingRegistration> {
    const cleanEmail = email.toLowerCase().trim();
    const pending: PendingRegistration = {
      email: cleanEmail,
      phone: phone || undefined,
      name: name.trim(),
      grade_level: gradeLevel,
      track_id: trackId || null,
      elective_subject: electiveSubject || null,
      password_hash: passwordHash,
      otp,
      created_at: new Date().toISOString(),
      terms_accepted_at: termsAcceptedAt || null,
      expires_at: expiresAt || null
    };

    if (supabase) {
      let { data, error } = await supabase.from('pending_registrations').upsert(pending).select().single();
      if (error && (error.code === 'PGRST204' || error.message?.includes('expires_at'))) {
        const { expires_at, ...pendingWithoutExpires } = pending;
        const retry = await supabase.from('pending_registrations').upsert(pendingWithoutExpires).select().single();
        if (retry.error) throw retry.error;
        data = retry.data;
      } else if (error) {
        throw error;
      }
      return data;
    } else {
      const data = readLocalDB();
      data.pending_registrations = data.pending_registrations.filter((pr: PendingRegistration) => pr.email?.toLowerCase().trim() !== cleanEmail);
      data.pending_registrations.push(pending);
      writeLocalDB(data);
      return pending;
    }
  },

  async deletePendingRegistration(email: string): Promise<void> {
    const cleanEmail = email.toLowerCase().trim();
    if (supabase) {
      await supabase.from('pending_registrations').delete().eq('email', cleanEmail);
    } else {
      const data = readLocalDB();
      data.pending_registrations = data.pending_registrations.filter((pr: PendingRegistration) => pr.email?.toLowerCase().trim() !== cleanEmail);
      writeLocalDB(data);
    }
  },

  // Password reset OTPs
  async getPasswordReset(userId: string): Promise<PasswordReset | null> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('password_resets').select('*').eq('user_id', userId).maybeSingle();
        if (error) return null;
        return data;
      } catch {
        return null;
      }
    } else {
      const data = readLocalDB();
      return (data.password_resets || []).find((pr: PasswordReset) => pr.user_id === userId) || null;
    }
  },

  async createPasswordReset(userId: string, otp: string, expiresAt: string): Promise<void> {
    const reset = { user_id: userId, otp, expires_at: expiresAt, created_at: new Date().toISOString() };
    if (supabase) {
      try {
        const { error } = await supabase.from('password_resets').upsert(reset);
        if (error) {
          console.warn('password_resets table not available, using memory fallback:', error.message);
        }
      } catch (err) {
        console.warn('password_resets table error:', err);
      }
    } else {
      const data = readLocalDB();
      data.password_resets = (data.password_resets || []).filter((pr: PasswordReset) => pr.user_id !== userId);
      data.password_resets.push(reset);
      writeLocalDB(data);
    }
  },

  async deletePasswordReset(userId: string): Promise<void> {
    if (supabase) {
      try {
        await supabase.from('password_resets').delete().eq('user_id', userId);
      } catch {
        // Non-blocking
      }
    } else {
      const data = readLocalDB();
      data.password_resets = (data.password_resets || []).filter((pr: PasswordReset) => pr.user_id !== userId);
      writeLocalDB(data);
    }
  },

  // Account deletion OTPs
  async getAccountDeletion(userId: string): Promise<AccountDeletion | null> {
    if (supabase) {
      const { data, error } = await supabase.from('account_deletions').select('*').eq('user_id', userId).maybeSingle();
      if (error) return null;
      return data;
    } else {
      const data = readLocalDB();
      return (data.account_deletions || []).find((ad: AccountDeletion) => ad.user_id === userId) || null;
    }
  },

  async createAccountDeletion(userId: string, email: string, otp: string, expiresAt: string): Promise<void> {
    const record = { user_id: userId, email: email.toLowerCase(), otp, expires_at: expiresAt, created_at: new Date().toISOString() };
    if (supabase) {
      const { error } = await supabase.from('account_deletions').upsert(record);
      if (error) throw error;
    } else {
      const data = readLocalDB();
      data.account_deletions = (data.account_deletions || []).filter((ad: AccountDeletion) => ad.user_id !== userId);
      data.account_deletions.push(record);
      writeLocalDB(data);
    }
  },

  async deleteAccountDeletion(userId: string): Promise<void> {
    if (supabase) {
      await supabase.from('account_deletions').delete().eq('user_id', userId);
    } else {
      const data = readLocalDB();
      data.account_deletions = (data.account_deletions || []).filter((ad: AccountDeletion) => ad.user_id !== userId);
      writeLocalDB(data);
    }
  },

  // Device limits for guest users
  async getDeviceGuest(deviceId: string): Promise<DeviceGuest | null> {
    if (supabase) {
      const { data, error } = await supabase.from('device_guests').select('*').eq('device_id', deviceId).maybeSingle();
      if (error || !data) {
        return null;
      }
      return await checkAndResetGuestDailyCoins(data);
    } else {
      const data = readLocalDB();
      let guest = data.device_guests.find((dg: DeviceGuest) => dg.device_id === deviceId);
      if (!guest) return null;
      return await checkAndResetGuestDailyCoins(guest);
    }
  },

  async incrementDeviceGuestCount(deviceId: string): Promise<DeviceGuest> {
    const today = new Date().toISOString().split('T')[0];
    if (supabase) {
      const { data: existing } = await supabase.from('device_guests').select('*').eq('device_id', deviceId).maybeSingle();
      if (!existing) {
        const { data, error } = await supabase
          .from('device_guests')
          .insert({ device_id: deviceId, free_message_count: 1, last_message_date: today, coins: 5.0 })
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('device_guests')
          .update({ free_message_count: existing.free_message_count + 1 })
          .eq('device_id', deviceId)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    } else {
      const data = readLocalDB();
      let guest = data.device_guests.find((dg: DeviceGuest) => dg.device_id === deviceId);
      if (!guest) {
        guest = {
          device_id: deviceId,
          free_message_count: 1,
          last_message_date: today,
          coins: 5.0
        };
        data.device_guests.push(guest);
      } else {
        guest.free_message_count += 1;
      }
      writeLocalDB(data);
      return guest;
    }
  },

  // Curriculum Management
  async syncCurriculumStateMutation(curriculumId?: string, isNew: boolean = false, isDelete: boolean = false) {
    invalidateCurriculumsCache();
    try {
      const versionStr = Date.now().toString();
      await this.setSystemSetting('curriculum_version', versionStr);

      if (curriculumId) {
        const activeCurrsRaw = await this.getSystemSetting('active_curriculum_ids');
        if (activeCurrsRaw) {
          let activeIds: string[] = [];
          try {
            const parsed = JSON.parse(activeCurrsRaw);
            if (Array.isArray(parsed)) activeIds = parsed;
          } catch (e) {}

          if (isDelete) {
            if (activeIds.includes(curriculumId)) {
              activeIds = activeIds.filter(id => id !== curriculumId);
              await this.setSystemSetting('active_curriculum_ids', JSON.stringify(activeIds));
            }
          } else if (isNew && activeIds.length > 0 && !activeIds.includes(curriculumId)) {
            activeIds.push(curriculumId);
            await this.setSystemSetting('active_curriculum_ids', JSON.stringify(activeIds));
          }
        }
      }
    } catch (e) {
      console.warn('syncCurriculumStateMutation notice:', e);
    } finally {
      invalidateCurriculumsCache();
    }
  },

  async getCurriculums(): Promise<Curriculum[]> {
    if (cachedCurriculums && (Date.now() - cachedCurriculums.time < CURRICULUMS_CACHE_TTL_MS)) {
      return cachedCurriculums.data;
    }

    let results: Curriculum[] = [];
    if (supabase) {
      const { data, error } = await supabase
        .from('curriculums')
        .select('id, grade_level, subject_name, file_name, units, is_placeholder, track_id, is_elective, created_at');
      if (error) return [];
      results = (data || []).map((c: any) => ({
        ...c,
        units: Array.isArray(c.units) ? c.units : [],
        is_placeholder: !!c.is_placeholder,
        track_id: c.track_id || null,
        is_elective: !!c.is_elective
      }));
    } else {
      const data = readLocalDB();
      results = (data.curriculums || []).map((c: any) => {
        const { content: _, ...withoutContent } = c;
        return {
          ...withoutContent,
          units: Array.isArray(c.units) ? c.units : [],
          is_placeholder: !!c.is_placeholder,
          track_id: c.track_id || null,
          is_elective: !!c.is_elective
        };
      });
    }

    cachedCurriculums = { data: results, time: Date.now() };
    return results;
  },

  async createCurriculum(
    gradeLevel: string,
    subjectName: string,
    fileName: string,
    chunks: Omit<CurriculumChunk, 'curriculum_id'>[],
    units: CurriculumUnit[] = [],
    trackId?: string | null,
    isElective?: boolean,
    rawContent?: string
  ): Promise<Curriculum> {
    const cleanGrade = gradeLevel.trim();
    const cleanSubject = subjectName.trim();
    const curriculumId = crypto.randomUUID();
    const newCurriculum: Curriculum = {
      id: curriculumId,
      grade_level: cleanGrade,
      subject_name: cleanSubject,
      file_name: fileName,
      content: rawContent || null,
      units: Array.isArray(units) ? units : [],
      is_placeholder: false,
      track_id: trackId || null,
      is_elective: !!isElective,
      created_at: new Date().toISOString()
    };

    if (supabase) {
      let { error: currError } = await supabase.from('curriculums').insert(newCurriculum);
      if (currError && (currError.code === 'PGRST204' || (currError.message && currError.message.includes("content")))) {
        const { content: _, ...curriculumWithoutContent } = newCurriculum;
        const retry = await supabase.from('curriculums').insert(curriculumWithoutContent);
        currError = retry.error;
      }
      if (currError) throw currError;

      // Assign IDs to parent chunks first so children can reference them, preserving existing IDs
      const parentMap = new Map<string, string>();
      for (const c of chunks) {
        if (c.chunk_level === 'parent') {
          const parentId = c.id || crypto.randomUUID();
          parentMap.set(c.id || parentId, parentId);
        }
      }

      const formattedChunks = chunks.map(c => {
        const realId = (c.chunk_level === 'parent' && c.id)
          ? (parentMap.get(c.id) || c.id)
          : (c.id || crypto.randomUUID());
        return {
          id: realId,
          curriculum_id: curriculumId,
          content: c.content,
          heading: c.heading,
          chunk_level: c.chunk_level || 'parent',
          parent_id: c.parent_id ? (parentMap.get(c.parent_id) || c.parent_id) : null,
          position_index: c.position_index || 0,
          embedding: c.embedding || null
        };
      });

      // Insert in batches of 100 to avoid payload limits
      const BATCH = 100;
      for (let i = 0; i < formattedChunks.length; i += BATCH) {
        const batch = formattedChunks.slice(i, i + BATCH);
        const { error: chunkError } = await supabase.from('curriculum_chunks').insert(batch);
        if (chunkError) {
          await supabase.from('curriculums').delete().eq('id', curriculumId);
          throw chunkError;
        }
      }
      await this.syncCurriculumStateMutation(curriculumId, true, false);
      return newCurriculum;
    } else {
      const data = readLocalDB();
      const existing = data.curriculums.find((c: Curriculum) => c.grade_level === cleanGrade && c.subject_name === cleanSubject);
      if (existing) {
        data.curriculums = data.curriculums.filter((c: Curriculum) => c.id !== existing.id);
        data.curriculum_chunks = data.curriculum_chunks.filter((cc: CurriculumChunk) => cc.curriculum_id !== existing.id);
      }

      data.curriculums.push(newCurriculum);

      const newChunks = chunks.map(c => ({
        id: c.id || crypto.randomUUID(),
        curriculum_id: curriculumId,
        content: c.content,
        heading: c.heading,
        chunk_level: c.chunk_level || 'parent',
        parent_id: c.parent_id || null,
        position_index: c.position_index || 0
      }));
      data.curriculum_chunks.push(...newChunks);

      writeLocalDB(data);
      await this.syncCurriculumStateMutation(curriculumId, true, false);
      return newCurriculum;
    }
  },

  async createPlaceholderCurriculum(
    gradeLevel: string,
    subjectName: string,
    trackId?: string | null,
    isElective?: boolean
  ): Promise<Curriculum> {
    const cleanGrade = gradeLevel.trim();
    const cleanSubject = subjectName.trim();
    const curriculumId = crypto.randomUUID();
    const newCurriculum: Curriculum = {
      id: curriculumId,
      grade_level: cleanGrade,
      subject_name: cleanSubject,
      file_name: 'قيد الإعداد (بدون ملف)',
      units: [],
      is_placeholder: true,
      track_id: trackId || null,
      is_elective: !!isElective,
      created_at: new Date().toISOString()
    };

    if (supabase) {
      const { error: currError } = await supabase.from('curriculums').insert(newCurriculum);
      if (currError) throw currError;
      await this.syncCurriculumStateMutation(curriculumId, false, false);
      return newCurriculum;
    } else {
      const data = readLocalDB();
      const existing = data.curriculums.find((c: Curriculum) => c.grade_level === cleanGrade && c.subject_name === cleanSubject);
      if (existing) {
        data.curriculums = data.curriculums.filter((c: Curriculum) => c.id !== existing.id);
      }
      data.curriculums.push(newCurriculum);
      writeLocalDB(data);
      await this.syncCurriculumStateMutation(curriculumId, false, false);
      return newCurriculum;
    }
  },

  async attachFileToCurriculum(
    curriculumId: string,
    fileName: string,
    chunks: Omit<CurriculumChunk, 'curriculum_id'>[],
    units: CurriculumUnit[] = [],
    rawContent?: string
  ): Promise<Curriculum | null> {
    if (supabase) {
      const { data: existing, error: findError } = await supabase.from('curriculums').select('*').eq('id', curriculumId).single();
      if (findError || !existing) return null;

      const updatePayload: any = {
        file_name: fileName,
        is_placeholder: false,
        content: rawContent || null,
        units: Array.isArray(units) && units.length > 0 ? units : existing.units || []
      };

      let { error: updateError } = await supabase
        .from('curriculums')
        .update(updatePayload)
        .eq('id', curriculumId);
      if (updateError && (updateError.code === 'PGRST204' || (updateError.message && updateError.message.includes("content")))) {
        const { content: _, ...withoutContent } = updatePayload;
        const retry = await supabase.from('curriculums').update(withoutContent).eq('id', curriculumId);
        updateError = retry.error;
      }
      if (updateError) throw updateError;

      // Delete existing chunks if any
      await supabase.from('curriculum_chunks').delete().eq('curriculum_id', curriculumId);

      // Assign IDs to parent chunks first so children can reference them, preserving existing IDs
      const parentMap = new Map<string, string>();
      for (const c of chunks) {
        if (c.chunk_level === 'parent') {
          const parentId = c.id || crypto.randomUUID();
          parentMap.set(c.id || parentId, parentId);
        }
      }

      const formattedChunks = chunks.map(c => {
        const realId = (c.chunk_level === 'parent' && c.id)
          ? (parentMap.get(c.id) || c.id)
          : (c.id || crypto.randomUUID());
        return {
          id: realId,
          curriculum_id: curriculumId,
          content: c.content,
          heading: c.heading,
          chunk_level: c.chunk_level || 'parent',
          parent_id: c.parent_id ? (parentMap.get(c.parent_id) || c.parent_id) : null,
          position_index: c.position_index || 0,
          embedding: c.embedding || null
        };
      });

      const BATCH = 100;
      for (let i = 0; i < formattedChunks.length; i += BATCH) {
        const batch = formattedChunks.slice(i, i + BATCH);
        const { error: chunkError } = await supabase.from('curriculum_chunks').insert(batch);
        if (chunkError) throw chunkError;
      }

      await this.syncCurriculumStateMutation(curriculumId, true, false);
      return {
        ...existing,
        file_name: fileName,
        is_placeholder: false,
        content: rawContent || null,
        units: Array.isArray(units) && units.length > 0 ? units : existing.units || []
      };
    } else {
      const data = readLocalDB();
      const existing = data.curriculums.find((c: Curriculum) => c.id === curriculumId);
      if (!existing) return null;

      existing.file_name = fileName;
      existing.is_placeholder = false;
      existing.content = rawContent || null;
      if (units && units.length > 0) existing.units = units;

      data.curriculum_chunks = (data.curriculum_chunks || []).filter((cc: CurriculumChunk) => cc.curriculum_id !== curriculumId);
      const newChunks = chunks.map(c => ({
        id: c.id || crypto.randomUUID(),
        curriculum_id: curriculumId,
        content: c.content,
        heading: c.heading,
        chunk_level: c.chunk_level || 'parent',
        parent_id: c.parent_id || null,
        position_index: c.position_index || 0
      }));
      data.curriculum_chunks.push(...newChunks);
      writeLocalDB(data);
      await this.syncCurriculumStateMutation(curriculumId, true, false);
      return existing;
    }
  },

  async updateCurriculumUnits(id: string, units: CurriculumUnit[]): Promise<boolean> {
    const sanitizedUnits = Array.isArray(units) ? units : [];
    if (supabase) {
      const { error } = await supabase
        .from('curriculums')
        .update({ units: sanitizedUnits })
        .eq('id', id);
      if (!error) await this.syncCurriculumStateMutation(id, false, false);
      return !error;
    } else {
      const data = readLocalDB();
      const curr = data.curriculums.find((c: Curriculum) => c.id === id);
      if (!curr) return false;
      curr.units = sanitizedUnits;
      writeLocalDB(data);
      await this.syncCurriculumStateMutation(id, false, false);
      return true;
    }
  },

  async deleteCurriculum(id: string): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from('curriculums').delete().eq('id', id);
      if (!error) await this.syncCurriculumStateMutation(id, false, true);
      return !error;
    } else {
      const data = readLocalDB();
      data.curriculums = data.curriculums.filter((c: Curriculum) => c.id !== id);
      data.curriculum_chunks = data.curriculum_chunks.filter((cc: CurriculumChunk) => cc.curriculum_id !== id);
      writeLocalDB(data);
      await this.syncCurriculumStateMutation(id, false, true);
      return true;
    }
  },

  async getCurriculumRecord(gradeLevel: string, subjectName: string): Promise<Curriculum | null> {
    const { grade: cleanGrade, subject: cleanSubject } = await resolveCurriculumKey(gradeLevel, subjectName);
    if (supabase) {
      const { data } = await supabase
        .from('curriculums')
        .select('*')
        .eq('grade_level', cleanGrade)
        .eq('subject_name', cleanSubject)
        .limit(1)
        .maybeSingle();
      return data || null;
    } else {
      const data = readLocalDB();
      return data.curriculums.find((c: Curriculum) =>
        c.grade_level === cleanGrade && c.subject_name === cleanSubject
      ) || null;
    }
  },

  async getAllChunksForCurriculum(gradeLevel: string, subjectName: string): Promise<CurriculumChunk[]> {
    const { grade: cleanGrade, subject: cleanSubject } = await resolveCurriculumKey(gradeLevel, subjectName);
    if (supabase) {
      const { data: currList } = await supabase
        .from('curriculums')
        .select('id')
        .eq('grade_level', cleanGrade)
        .eq('subject_name', cleanSubject)
        .order('created_at', { ascending: false });
      if (!currList || currList.length === 0) return [];
      const curriculumIds = currList.map(c => c.id);

      // Paginated fetch to guarantee all chunks across the entire textbook are retrieved
      let allChunks: CurriculumChunk[] = [];
      let page = 0;
      const pageSize = 1000;
      while (true) {
        const { data: chunks, error } = await supabase
          .from('curriculum_chunks')
          .select('id, content, heading, curriculum_id, chunk_level, parent_id, position_index')
          .in('curriculum_id', curriculumIds)
          .neq('heading', '__CURRICULUM_SUMMARY__')
          .order('position_index', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error || !chunks || chunks.length === 0) break;
        allChunks = allChunks.concat(chunks);
        if (chunks.length < pageSize) break;
        page++;
      }
      return allChunks;
    } else {
      const data = readLocalDB();
      const curr = data.curriculums.find((c: Curriculum) =>
        c.grade_level === cleanGrade && c.subject_name === cleanSubject
      );
      if (!curr) return [];
      return (data.curriculum_chunks || []).filter(
        (cc: CurriculumChunk) => cc.curriculum_id === curr.id && cc.heading !== '__CURRICULUM_SUMMARY__'
      );
    }
  },

  async saveCurriculumGraph(
    curriculumId: string,
    entities: CurriculumEntity[],
    relations: CurriculumRelation[]
  ): Promise<boolean> {
    if (supabase) {
      await supabase.from('curriculum_relations').delete().eq('curriculum_id', curriculumId);
      await supabase.from('curriculum_entities').delete().eq('curriculum_id', curriculumId);

      if (entities.length > 0) {
        for (let i = 0; i < entities.length; i += 50) {
          const batch = entities.slice(i, i + 50).map(e => ({
            id: e.id,
            curriculum_id: curriculumId,
            name: e.name,
            normalized_name: e.normalized_name,
            category: e.category,
            description: e.description,
            aliases: e.aliases || [],
            chunk_ids: e.chunk_ids || [],
            importance_score: e.importance_score || 0.5
          }));
          const { error } = await supabase.from('curriculum_entities').insert(batch);
          if (error) {
            console.error('Error inserting curriculum_entities batch:', error);
          }
        }
      }

      if (relations.length > 0) {
        for (let i = 0; i < relations.length; i += 50) {
          const batch = relations.slice(i, i + 50).map(r => ({
            id: r.id,
            curriculum_id: curriculumId,
            source_entity_id: r.source_entity_id,
            target_entity_id: r.target_entity_id,
            relation_type: r.relation_type,
            description: r.description,
            weight: r.weight || 0.7
          }));
          const { error } = await supabase.from('curriculum_relations').insert(batch);
          if (error) {
            console.error('Error inserting curriculum_relations batch:', error);
          }
        }
      }
      return true;
    } else {
      const data = readLocalDB();
      data.curriculum_entities = (data.curriculum_entities || []).filter((e: any) => e.curriculum_id !== curriculumId);
      data.curriculum_relations = (data.curriculum_relations || []).filter((r: any) => r.curriculum_id !== curriculumId);
      data.curriculum_entities.push(...entities);
      data.curriculum_relations.push(...relations);
      writeLocalDB(data);
      return true;
    }
  },

  async getCurriculumGraph(
    gradeLevel: string,
    subjectName: string
  ): Promise<{ entities: CurriculumEntity[]; relations: CurriculumRelation[] }> {
    const { grade: cleanGrade, subject: cleanSubject } = await resolveCurriculumKey(gradeLevel, subjectName);

    if (supabase) {
      const { data: currList } = await supabase
        .from('curriculums')
        .select('id')
        .eq('grade_level', cleanGrade)
        .eq('subject_name', cleanSubject);

      if (!currList || currList.length === 0) return { entities: [], relations: [] };
      const curriculumId = currList[0].id;

      const [entRes, relRes] = await Promise.all([
        supabase
          .from('curriculum_entities')
          .select('id, curriculum_id, name, normalized_name, category, description, aliases, chunk_ids, importance_score')
          .eq('curriculum_id', curriculumId)
          .limit(500),
        supabase
          .from('curriculum_relations')
          .select('id, curriculum_id, source_entity_id, target_entity_id, relation_type, description, weight')
          .eq('curriculum_id', curriculumId)
          .limit(1000)
      ]);

      let entities = (entRes.data || []) as CurriculumEntity[];
      let relations = (relRes.data || []) as CurriculumRelation[];

      // Auto-Backfill: If curriculum has chunks but graph hasn't been built yet, auto-extract from existing parent chunks!
      if (entities.length === 0) {
        const chunks = await this.getAllChunksForCurriculum(cleanGrade, cleanSubject);
        const parentChunks = chunks.filter(c => c.chunk_level === 'parent' && c.heading !== '__CURRICULUM_SUMMARY__');
        if (parentChunks.length > 0) {
          const allEntities: CurriculumEntity[] = [];
          const allRelations: CurriculumRelation[] = [];
          const entityMap = new Map<string, CurriculumEntity>();

          for (const parent of parentChunks) {
            try {
              const extracted = extractEntitiesAndRelationsFromChunk(
                parent.content,
                parent.heading,
                parent.id,
                curriculumId
              );
              for (const ent of extracted.entities) {
                if (!entityMap.has(ent.normalized_name)) {
                  entityMap.set(ent.normalized_name, ent);
                  allEntities.push(ent);
                } else {
                  const existing = entityMap.get(ent.normalized_name)!;
                  if (!existing.chunk_ids.includes(parent.id)) {
                    existing.chunk_ids.push(parent.id);
                  }
                }
              }
              allRelations.push(...extracted.relations);
            } catch (chunkErr) {
              console.warn('Chunk graph extraction notice:', parent.id, chunkErr);
            }
          }

          if (allEntities.length > 0) {
            await this.saveCurriculumGraph(curriculumId, allEntities, allRelations);
            entities = allEntities;
            relations = allRelations;
          }
        }
      }

      return { entities, relations };
    } else {
      const data = readLocalDB();
      const curr = data.curriculums.find((c: Curriculum) =>
        c.grade_level === cleanGrade && c.subject_name === cleanSubject
      );
      if (!curr) return { entities: [], relations: [] };
      let entities = (data.curriculum_entities || []).filter((e: any) => e.curriculum_id === curr.id);
      let relations = (data.curriculum_relations || []).filter((r: any) => r.curriculum_id === curr.id);

      // Auto-Backfill for local mode as well
      if (entities.length === 0) {
        const chunks = (data.curriculum_chunks || []).filter((c: CurriculumChunk) =>
          c.curriculum_id === curr.id && c.chunk_level !== 'child' && c.heading !== '__CURRICULUM_SUMMARY__'
        );
        if (chunks.length > 0) {
          const allEntities: CurriculumEntity[] = [];
          const allRelations: CurriculumRelation[] = [];
          const entityMap = new Map<string, CurriculumEntity>();

          for (const parent of chunks) {
            try {
              const extracted = extractEntitiesAndRelationsFromChunk(
                parent.content,
                parent.heading,
                parent.id,
                curr.id
              );
              for (const ent of extracted.entities) {
                if (!entityMap.has(ent.normalized_name)) {
                  entityMap.set(ent.normalized_name, ent);
                  allEntities.push(ent);
                } else {
                  const existing = entityMap.get(ent.normalized_name)!;
                  if (!existing.chunk_ids.includes(parent.id)) {
                    existing.chunk_ids.push(parent.id);
                  }
                }
              }
              allRelations.push(...extracted.relations);
            } catch (chunkErr) {
              console.warn('Local chunk graph extraction notice:', parent.id, chunkErr);
            }
          }

          if (allEntities.length > 0) {
            data.curriculum_entities = (data.curriculum_entities || []).filter((e: any) => e.curriculum_id !== curr.id);
            data.curriculum_relations = (data.curriculum_relations || []).filter((r: any) => r.curriculum_id !== curr.id);
            data.curriculum_entities.push(...allEntities);
            data.curriculum_relations.push(...allRelations);
            writeLocalDB(data);
            entities = allEntities;
            relations = allRelations;
          }
        }
      }

      return { entities, relations };
    }
  },

  async getPendingEmbeddingChunks(
    curriculumId: string,
    limit: number = 35
  ): Promise<{
    chunks: { id: string; heading: string; content: string }[];
    totalRemaining: number;
    totalChildren: number;
  }> {
    if (supabase) {
      const [totalRes, pendingCountRes, batchRes] = await Promise.all([
        supabase
          .from('curriculum_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('curriculum_id', curriculumId)
          .eq('chunk_level', 'child'),
        supabase
          .from('curriculum_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('curriculum_id', curriculumId)
          .eq('chunk_level', 'child')
          .is('embedding', null),
        supabase
          .from('curriculum_chunks')
          .select('id, heading, content')
          .eq('curriculum_id', curriculumId)
          .eq('chunk_level', 'child')
          .is('embedding', null)
          .order('position_index', { ascending: true })
          .limit(limit)
      ]);

      const totalChildren = totalRes.count ?? 0;
      const totalRemaining = pendingCountRes.count ?? 0;
      const chunks = (batchRes.data || []).map((c: any) => ({
        id: c.id,
        heading: c.heading,
        content: c.content
      }));

      return { chunks, totalRemaining, totalChildren };
    } else {
      const data = readLocalDB();
      const allChildren = (data.curriculum_chunks || []).filter(
        (c: any) => c.curriculum_id === curriculumId && c.chunk_level === 'child'
      );
      const pendingChildren = allChildren.filter((c: any) => !c.embedding || c.embedding.length === 0);
      const chunks = pendingChildren.slice(0, limit).map((c: any) => ({
        id: c.id,
        heading: c.heading,
        content: c.content
      }));
      return {
        chunks,
        totalRemaining: pendingChildren.length,
        totalChildren: allChildren.length
      };
    }
  },

  async saveChunkEmbeddings(
    chunkEmbeddings: { id: string; embedding: number[] }[]
  ): Promise<number> {
    if (!chunkEmbeddings || chunkEmbeddings.length === 0) return 0;

    if (supabase) {
      let saved = 0;
      const BATCH_SIZE = 10;
      for (let i = 0; i < chunkEmbeddings.length; i += BATCH_SIZE) {
        const slice = chunkEmbeddings.slice(i, i + BATCH_SIZE);
        await Promise.all(
          slice.map(async (item) => {
            if (!item.embedding || item.embedding.length === 0) return;
            const { error } = await supabase!
              .from('curriculum_chunks')
              .update({ embedding: item.embedding })
              .eq('id', item.id);
            if (!error) saved++;
          })
        );
      }
      if (saved > 0) {
        await this.syncCurriculumStateMutation();
      }
      return saved;
    } else {
      const data = readLocalDB();
      let saved = 0;
      for (const item of chunkEmbeddings) {
        const target = (data.curriculum_chunks || []).find((c: any) => c.id === item.id);
        if (target && item.embedding && item.embedding.length > 0) {
          target.embedding = item.embedding;
          saved++;
        }
      }
      if (saved > 0) {
        writeLocalDB(data);
        await this.syncCurriculumStateMutation();
      }
      return saved;
    }
  },

  async getCurriculumEmbeddingStats(
    curriculumId: string
  ): Promise<{ totalChildren: number; embeddedCount: number; pendingCount: number }> {
    if (supabase) {
      const [totalRes, pendingRes] = await Promise.all([
        supabase
          .from('curriculum_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('curriculum_id', curriculumId)
          .eq('chunk_level', 'child'),
        supabase
          .from('curriculum_chunks')
          .select('id', { count: 'exact', head: true })
          .eq('curriculum_id', curriculumId)
          .eq('chunk_level', 'child')
          .is('embedding', null)
      ]);
      const totalChildren = totalRes.count ?? 0;
      const pendingCount = pendingRes.count ?? 0;
      const embeddedCount = Math.max(0, totalChildren - pendingCount);
      return { totalChildren, embeddedCount, pendingCount };
    } else {
      const data = readLocalDB();
      const allChildren = (data.curriculum_chunks || []).filter(
        (c: any) => c.curriculum_id === curriculumId && c.chunk_level === 'child'
      );
      const pendingChildren = allChildren.filter((c: any) => !c.embedding || c.embedding.length === 0);
      const totalChildren = allChildren.length;
      const pendingCount = pendingChildren.length;
      const embeddedCount = Math.max(0, totalChildren - pendingCount);
      return { totalChildren, embeddedCount, pendingCount };
    }
  },


  /** Id of the curriculum a (stage, subject) pair resolves to, including curricula shared into the stage. */
  async resolveCurriculumId(gradeLevel: string, subjectName: string): Promise<string | null> {
    const record = await this.getCurriculumRecord(gradeLevel, subjectName);
    return record?.id || null;
  },

  // ─── Lexical search over the cached whole-curriculum BM25 index ───────────
  async bm25SearchCurriculum(
    gradeLevel: string,
    subjectName: string,
    arabicKeywords: string[],
    englishKeywords: string[],
    topK = 8
  ): Promise<CurriculumChunk[]> {
    const curriculumId = await this.resolveCurriculumId(gradeLevel, subjectName);
    if (!curriculumId) return [];
    const corpus = await getCurriculumCorpus(curriculumId);
    const query = [...arabicKeywords, ...englishKeywords].map(k => k.trim()).filter(Boolean).join(' ');
    return corpus.index.search(query, topK)
      .map(hit => corpus.children.get(hit.doc.id))
      .filter((c): c is CurriculumChunk => !!c);
  },

  // ─── Dense vector search (pgvector HNSW through the hybrid_search_curriculum RPC) ───
  async vectorSearchChunks(curriculumId: string, queryEmbedding: number[], matchCount = 30): Promise<CurriculumChunk[]> {
    if (!supabase || queryEmbedding.length === 0) return [];
    const { data, error } = await supabase.rpc('hybrid_search_curriculum', {
      p_curriculum_id: curriculumId,
      p_query_embedding: queryEmbedding,
      p_arabic_query: '',
      p_english_query: '',
      p_match_count: matchCount,
      p_rrf_k: 60
    });
    if (error) {
      console.error('vectorSearchChunks RPC error:', error.message);
      return [];
    }
    return data || [];
  },

  // ─── v2 RAG: Fetch parent chunks by their IDs ─────────────────────────────
  async getParentChunks(parentIds: string[]): Promise<CurriculumChunk[]> {
    if (parentIds.length === 0) return [];
    const uniqueIds = [...new Set(parentIds)];

    if (supabase) {
      const { data, error } = await supabase
        .from('curriculum_chunks')
        .select('id, content, heading, curriculum_id, chunk_level, parent_id, position_index')
        .in('id', uniqueIds)
        .eq('chunk_level', 'parent');

      if (error) return [];
      return data || [];
    } else {
      const data = readLocalDB();
      return data.curriculum_chunks.filter(
        (cc: CurriculumChunk) => uniqueIds.includes(cc.id)
      );
    }
  },

  // ─── v2 RAG: Get the curriculum summary chunk ─────────────────────────────
  async getCurriculumSummary(gradeLevel: string, subjectName: string): Promise<string> {
    const { grade: cleanGrade, subject: cleanSubject } = await resolveCurriculumKey(gradeLevel, subjectName);

    if (supabase) {
      const { data: currList } = await supabase
        .from('curriculums')
        .select('id')
        .eq('grade_level', cleanGrade)
        .eq('subject_name', cleanSubject);

      if (!currList || currList.length === 0) return '';

      const { data } = await supabase
        .from('curriculum_chunks')
        .select('content')
        .eq('curriculum_id', currList[0].id)
        .lt('position_index', 0)
        .eq('heading', '__CURRICULUM_SUMMARY__')
        .limit(1)
        .single();

      return data?.content || '';
    } else {
      const data = readLocalDB();
      const curr = data.curriculums.find((c: Curriculum) =>
        c.grade_level === cleanGrade && c.subject_name === cleanSubject
      );
      if (!curr) return '';
      const summaryChunk = data.curriculum_chunks.find(
        (cc: CurriculumChunk) => cc.curriculum_id === curr.id && cc.heading === '__CURRICULUM_SUMMARY__'
      );
      return summaryChunk?.content || '';
    }
  },

  // ─── v2 RAG: Get full curriculum outline (all parent headings) ────────────
  async getFullCurriculumOutline(gradeLevel: string, subjectName: string): Promise<string[]> {
    const { grade: cleanGrade, subject: cleanSubject } = await resolveCurriculumKey(gradeLevel, subjectName);

    if (supabase) {
      const { data: currList } = await supabase
        .from('curriculums')
        .select('id')
        .eq('grade_level', cleanGrade)
        .eq('subject_name', cleanSubject);

      if (!currList || currList.length === 0) return [];

      const { data } = await supabase
        .from('curriculum_chunks')
        .select('heading, position_index')
        .eq('curriculum_id', currList[0].id)
        .eq('chunk_level', 'parent')
        .neq('heading', '__CURRICULUM_SUMMARY__')
        .order('position_index', { ascending: true });

      return (data || []).map((c: any) => c.heading);
    } else {
      const data = readLocalDB();
      const curr = data.curriculums.find((c: Curriculum) =>
        c.grade_level === cleanGrade && c.subject_name === cleanSubject
      );
      if (!curr) return [];
      return data.curriculum_chunks
        .filter((cc: CurriculumChunk) =>
          cc.curriculum_id === curr.id &&
          cc.heading !== '__CURRICULUM_SUMMARY__' &&
          cc.chunk_level !== 'child'
        )
        .map((cc: CurriculumChunk) => cc.heading);
    }
  },

  // System Settings
  async getPublicConfig(): Promise<{
    websiteLink: string;
    activeGradeLevels: string[];
    activeTracks: string[];
    activeCurriculumIds: string[];
    allCurriculums: Curriculum[];
    educationCatalog: EducationCatalog;
  }> {
    if (cachedPublicConfig && (Date.now() - lastPublicConfigTime < PUBLIC_CONFIG_CACHE_TTL_MS)) {
      return cachedPublicConfig;
    }

    const DEFAULT_GRADE_LEVELS = ['1_middle', '2_middle', '3_middle', '1_high', '2_high'];
    const DEFAULT_TRACKS = ['medicine_life_sciences', 'engineering_cs', 'business', 'arts_literature'];

    let websiteLink = 'http://localhost:3000';
    let activeGradeLevels = DEFAULT_GRADE_LEVELS;
    let activeTracks = DEFAULT_TRACKS;
    let activeCurriculumIds: string[] = [];
    let storedCatalog: string | null = null;

    if (supabase) {
      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['website_link', 'active_grade_levels', 'active_tracks', 'active_curriculum_ids', 'curriculum_version', CATALOG_SETTING_KEY]);

      if (settingsData && Array.isArray(settingsData)) {
        for (const row of settingsData) {
          if (row.key === CATALOG_SETTING_KEY && row.value) {
            storedCatalog = row.value;
          } else if (row.key === 'website_link' && row.value) {
            websiteLink = row.value;
          } else if (row.key === 'active_grade_levels' && row.value) {
            try {
              const parsed = JSON.parse(row.value);
              if (Array.isArray(parsed) && parsed.length > 0) {
                activeGradeLevels = parsed.filter((g: string) => g !== '3_high');
              }
            } catch (e) {}
          } else if (row.key === 'active_tracks' && row.value) {
            try {
              const parsed = JSON.parse(row.value);
              if (Array.isArray(parsed)) {
                activeTracks = parsed;
              }
            } catch (e) {}
          } else if (row.key === 'active_curriculum_ids' && row.value) {
            try {
              activeCurriculumIds = JSON.parse(row.value);
            } catch (e) {}
          } else if (row.key === 'curriculum_version' && row.value) {
            const versionNum = parseInt(row.value, 10);
            if (!isNaN(versionNum) && versionNum > lastPublicConfigTime) {
              lastPublicConfigTime = versionNum;
            }
          }
        }
      }
    } else {
      const data = readLocalDB();
      const settings = (data.system_settings || []) as any[];
      const linkSetting = settings.find((s: any) => s.key === 'website_link');
      if (linkSetting?.value) websiteLink = linkSetting.value;
      storedCatalog = settings.find((s: any) => s.key === CATALOG_SETTING_KEY)?.value || null;

      const gradesSetting = settings.find((s: any) => s.key === 'active_grade_levels');
      if (gradesSetting?.value) {
        try {
          const parsed = JSON.parse(gradesSetting.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            activeGradeLevels = parsed.filter((g: string) => g !== '3_high');
          }
        } catch (e) {}
      }

      const tracksSetting = settings.find((s: any) => s.key === 'active_tracks');
      if (tracksSetting?.value) {
        try {
          const parsed = JSON.parse(tracksSetting.value);
          if (Array.isArray(parsed)) activeTracks = parsed;
        } catch (e) {}
      }

      const currsSetting = settings.find((s: any) => s.key === 'active_curriculum_ids');
      if (currsSetting?.value) {
        try {
          activeCurriculumIds = JSON.parse(currsSetting.value);
        } catch (e) {}
      }

      const verSetting = settings.find((s: any) => s.key === 'curriculum_version');
      if (verSetting?.value) {
        const versionNum = parseInt(verSetting.value, 10);
        if (!isNaN(versionNum) && versionNum > lastPublicConfigTime) {
          lastPublicConfigTime = versionNum;
        }
      }
    }

    const allCurriculums = await this.getCurriculums();
    // The catalog is the source of truth; the legacy lists seed it on first run and are derived from it afterwards.
    const educationCatalog = loadCatalog(storedCatalog, activeGradeLevels, activeTracks);
    const derived = legacyActiveLists(educationCatalog);
    registerStageCatalog(educationCatalog.stages);

    cachedPublicConfig = {
      websiteLink,
      activeGradeLevels: derived.activeGradeLevels,
      activeTracks: derived.activeTracks,
      activeCurriculumIds,
      allCurriculums,
      educationCatalog
    };
    lastPublicConfigTime = Math.max(lastPublicConfigTime, Date.now());

    return cachedPublicConfig;
  },

  async getEducationCatalog(): Promise<EducationCatalog> {
    return (await this.getPublicConfig()).educationCatalog;
  },

  /** Persists a validated catalog and mirrors it into the legacy grade/track activation settings. */
  async saveEducationCatalog(catalog: EducationCatalog): Promise<void> {
    const { activeGradeLevels, activeTracks } = legacyActiveLists(catalog);
    await this.setSystemSetting(CATALOG_SETTING_KEY, JSON.stringify(catalog));
    await this.setSystemSetting('active_grade_levels', JSON.stringify(activeGradeLevels));
    await this.setSystemSetting('active_tracks', JSON.stringify(activeTracks));
    await this.setSystemSetting('curriculum_version', String(Date.now()));
    invalidateCurriculumsCache();
  },

  /** Student counts per stage and per track, used to protect in-use catalog entries. */
  async getStudentPathCounts(): Promise<{ stages: Record<string, number>; tracks: Record<string, number> }> {
    const stages: Record<string, number> = {};
    const tracks: Record<string, number> = {};
    const add = (grade?: string | null, track?: string | null) => {
      if (grade) stages[grade] = (stages[grade] || 0) + 1;
      if (track) tracks[track] = (tracks[track] || 0) + 1;
    };
    if (supabase) {
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase.from('profiles').select('grade_level, track_id').range(from, from + pageSize - 1);
        if (error || !data) break;
        data.forEach((p: any) => add(p.grade_level, p.track_id));
        if (data.length < pageSize) break;
      }
    } else {
      (readLocalDB().profiles || []).forEach((p: any) => add(p.grade_level, p.track_id));
    }
    return { stages, tracks };
  },

  async getSystemSetting(key: string): Promise<string> {
    if (supabase) {
      const { data, error } = await supabase.from('system_settings').select('value').eq('key', key).single();
      if (error || !data) {
        if (key === 'website_link') return 'http://localhost:3000';
        return '';
      }
      return data.value;
    } else {
      const data = readLocalDB();
      const setting = data.system_settings.find((s: any) => s.key === key);
      return setting ? setting.value : (key === 'website_link' ? 'http://localhost:3000' : '');
    }
  },

  async setSystemSetting(key: string, value: string): Promise<void> {
    invalidatePublicConfigCache();
    if (supabase) {
      await supabase.from('system_settings').upsert({ key, value });
    } else {
      const data = readLocalDB();
      let setting = data.system_settings.find((s: any) => s.key === key);
      if (setting) {
        setting.value = value;
      } else {
        data.system_settings.push({ key, value });
      }
      writeLocalDB(data);
    }
  },

  // Chat History Logging
  // Oldest-first; with `limit`, only the most recent `limit` messages are read.
  async getChatHistory(userId?: string, deviceId?: string, sessionId?: string, limit?: number): Promise<ChatMessage[]> {
    if (supabase) {
      let query = supabase.from('chat_history').select('id, user_id, device_id, session_id, sender, message, coins_cost, created_at');
      if (sessionId) {
        query = query.eq('session_id', sessionId);
      } else if (userId) {
        query = query.eq('user_id', userId);
      } else if (deviceId) {
        query = query.eq('device_id', deviceId);
      } else {
        return [];
      }
      if (limit) {
        const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
        return error || !data ? [] : data.reverse();
      }
      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) return [];
      return data;
    } else {
      const data = readLocalDB();
      let rows: ChatMessage[] = [];
      if (sessionId) {
        rows = data.chat_history.filter((chat: ChatMessage) => chat.session_id === sessionId);
      } else if (userId) {
        rows = data.chat_history.filter((chat: ChatMessage) => chat.user_id === userId);
      } else if (deviceId) {
        rows = data.chat_history.filter((chat: ChatMessage) => chat.device_id === deviceId);
      }
      return limit ? rows.slice(-limit) : rows;
    }
  },

  async findUserAiMessage(userId: string, snippet: string): Promise<ChatMessage | null> {
    const needle = snippet.trim().slice(0, 50);
    if (!needle) return null;
    if (supabase) {
      const { data } = await supabase
        .from('chat_history')
        .select('id, session_id, sender, message, created_at')
        .eq('user_id', userId)
        .eq('sender', 'ai')
        .ilike('message', `%${needle.replace(/[%_\\]/g, m => `\\${m}`)}%`)
        .order('created_at', { ascending: false })
        .limit(1);
      return (data && data[0]) || null;
    }
    const data = readLocalDB();
    return (data.chat_history || []).find((m: ChatMessage) => m.user_id === userId && m.sender === 'ai' && m.message?.includes(needle)) || null;
  },

  async addChatMessage(sender: 'user' | 'ai', message: string, userId?: string, deviceId?: string, sessionId?: string, coinsCost?: number): Promise<ChatMessage> {
    const chat: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: userId,
      device_id: deviceId,
      session_id: sessionId,
      sender,
      message,
      created_at: new Date().toISOString(),
      coins_cost: coinsCost || 0.0
    };

    if (supabase) {
      await supabase.from('chat_history').insert(chat);
    } else {
      const data = readLocalDB();
      data.chat_history.push(chat);
      if (data.chat_history.length > 2000) {
        data.chat_history = data.chat_history.slice(-1500);
      }
      writeLocalDB(data);
    }
    return chat;
  },

  async updateChatMessageText(messageId: string, message: string): Promise<void> {
    if (supabase) {
      await supabase.from('chat_history').update({ message }).eq('id', messageId);
      return;
    }
    const data = readLocalDB();
    const row = (data.chat_history || []).find((m: ChatMessage) => m.id === messageId);
    if (row) {
      row.message = message;
      writeLocalDB(data);
    }
  },

  async deductCoins(userId: string | null, deviceId: string | null, amount: number): Promise<number> {
    const today = getCairoDateString();
    if (userId) {
      const profile = await this.getProfile(userId);
      if (!profile) return 0;
      const currentCoins = profile.coins === undefined ? 50.0 : profile.coins;
      if (profile.role === 'admin' || profile.unlimited_credit) {
        return toPreciseCoins(currentCoins);
      }
      const newCoins = Math.max(0, toPreciseCoins(currentCoins - amount));
      
      if (supabase) {
        await supabase.from('profiles').update({ coins: newCoins, last_active_date: today }).eq('id', userId);
      } else {
        const data = readLocalDB();
        const p = data.profiles.find((x: any) => x.id === userId);
        if (p) {
          p.coins = newCoins;
          p.last_active_date = today;
          writeLocalDB(data);
        }
      }
      return newCoins;
    } else if (deviceId) {
      const guest = await this.getDeviceGuest(deviceId);
      const currentCoins = guest ? (guest.coins === undefined ? 5.0 : guest.coins) : 5.0;
      const newCoins = Math.max(0, toPreciseCoins(currentCoins - amount));
      
      if (supabase) {
        await supabase.from('device_guests').upsert({ device_id: deviceId, coins: newCoins, last_message_date: today });
      } else {
        const data = readLocalDB();
        let g = data.device_guests.find((x: any) => x.device_id === deviceId);
        if (!g) {
          g = { device_id: deviceId, free_message_count: 0, last_message_date: today, coins: newCoins };
          data.device_guests.push(g);
        } else {
          g.coins = newCoins;
          g.last_message_date = today;
        }
        writeLocalDB(data);
      }
      return newCoins;
    }
    return 0;
  },

  // Atomically deducts metered points and adds the real provider cost to the current term. Returns the new balance.
  async chargeUsage(userId: string, points: number, costEgp: number): Promise<number> {
    const safePoints = toPreciseCoins(Math.max(0, points));
    const safeCost = Math.max(0, Math.round(costEgp * 10000) / 10000);
    if (supabase) {
      const { data, error } = await supabase.rpc('charge_usage', { p_user: userId, p_points: safePoints, p_cost_egp: safeCost });
      if (!error) return toPreciseCoins(Number(data ?? 0));
      console.error('charge_usage RPC unavailable, apply supabase_migration_fair_metering.sql:', error.message);
      return this.deductCoins(userId, null, safePoints);
    }
    const data = readLocalDB();
    const p = data.profiles.find((x: any) => x.id === userId);
    if (!p || p.role === 'admin' || p.unlimited_credit) return toPreciseCoins(p?.coins ?? 0);
    const current = p.coins ?? 0;
    p.coin_debt = toPreciseCoins((p.coin_debt ?? 0) + Math.max(0, safePoints - current));
    p.coins = toPreciseCoins(Math.max(0, current - safePoints));
    p.sub_cost_egp = (p.sub_cost_egp ?? 0) + safeCost;
    writeLocalDB(data);
    return p.coins;
  },

  async tryAcquireAiSlot(userId: string, ttlSeconds: number): Promise<boolean> {
    if (supabase) {
      const { data, error } = await supabase.rpc('acquire_ai_slot', { p_user: userId, p_seconds: ttlSeconds });
      if (!error) return data === true;
      console.error('acquire_ai_slot RPC unavailable, apply supabase_migration_fair_metering.sql:', error.message);
      return true;
    }
    const data = readLocalDB();
    const p = data.profiles.find((x: any) => x.id === userId);
    if (!p) return false;
    if (p.ai_busy_until && new Date(p.ai_busy_until).getTime() > Date.now()) return false;
    p.ai_busy_until = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    writeLocalDB(data);
    return true;
  },

  async releaseAiSlot(userId: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('profiles').update({ ai_busy_until: null }).eq('id', userId);
      if (error && !/ai_busy_until/.test(error.message)) console.error('releaseAiSlot error:', error.message);
      return;
    }
    const data = readLocalDB();
    const p = data.profiles.find((x: any) => x.id === userId);
    if (p) {
      p.ai_busy_until = null;
      writeLocalDB(data);
    }
  },

  // A new paid term starts with a clean cost ledger and no carried overdraft.
  async resetMeteringTerm(userId: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('profiles').update({ sub_cost_egp: 0, coin_debt: 0 }).eq('id', userId);
      if (error) console.error('resetMeteringTerm error (apply supabase_migration_fair_metering.sql):', error.message);
      return;
    }
    const data = readLocalDB();
    const p = data.profiles.find((x: any) => x.id === userId);
    if (p) {
      p.sub_cost_egp = 0;
      p.coin_debt = 0;
      writeLocalDB(data);
    }
  },

  async getChatSession(sessionId: string): Promise<ChatSession | null> {
    if (supabase) {
      const { data, error } = await supabase.from('chat_sessions').select('*').eq('id', sessionId).maybeSingle();
      if (error || !data) return null;
      return data;
    } else {
      const data = readLocalDB();
      if (!data.chat_sessions) return null;
      return data.chat_sessions.find((s: ChatSession) => s.id === sessionId) || null;
    }
  },

  async updateChatSessionEngagement(sessionId: string): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from('chat_sessions').update({ engagement_points_awarded: true }).eq('id', sessionId);
      return !error;
    } else {
      const data = readLocalDB();
      const s = (data.chat_sessions || []).find((x: any) => x.id === sessionId);
      if (s) {
        s.engagement_points_awarded = true;
        writeLocalDB(data);
      }
      return true;
    }
  },

  async getChatSessions(userId?: string, deviceId?: string): Promise<ChatSession[]> {
    if (supabase) {
      let query = supabase.from('chat_sessions').select('*');
      if (userId) {
        query = query.eq('user_id', userId);
      } else if (deviceId) {
        query = query.eq('device_id', deviceId);
      } else {
        return [];
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) return [];
      return data;
    } else {
      const data = readLocalDB();
      if (!data.chat_sessions) data.chat_sessions = [];
      let sessions = [];
      if (userId) {
        sessions = data.chat_sessions.filter((s: ChatSession) => s.user_id === userId);
      } else if (deviceId) {
        sessions = data.chat_sessions.filter((s: ChatSession) => s.device_id === deviceId);
      }
      return sessions.sort((a: ChatSession, b: ChatSession) => b.created_at.localeCompare(a.created_at));
    }
  },

  async createChatSession(
    title: string,
    subjectName: string,
    gradeLevel: string,
    userId?: string,
    deviceId?: string,
    mode: ChatMode = 'detailed'
  ): Promise<ChatSession> {
    const session: ChatSession = {
      id: crypto.randomUUID(),
      user_id: userId,
      device_id: deviceId,
      title,
      subject_name: subjectName,
      grade_level: gradeLevel,
      mode,
      created_at: new Date().toISOString()
    };

    if (supabase) {
      let { error } = await supabase.from('chat_sessions').insert(session);
      if (error && (error.code === 'PGRST204' || (error.message && error.message.includes("mode")))) {
        // Fallback: retry without the mode column if it's missing from the schema cache
        const { mode: _, ...sessionWithoutMode } = session;
        const retryResult = await supabase.from('chat_sessions').insert(sessionWithoutMode);
        error = retryResult.error;
      }
      if (error) throw error;
    } else {
      const data = readLocalDB();
      if (!data.chat_sessions) data.chat_sessions = [];
      data.chat_sessions.push(session);
      writeLocalDB(data);
    }
    return session;
  },

  async updateChatSessionMode(sessionId: string, mode: ChatMode): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('chat_sessions').update({ mode }).eq('id', sessionId);
      if (error && (error.code === 'PGRST204' || (error.message && error.message.includes("mode")))) {
        console.warn("Could not update chat session mode because the 'mode' column is missing from the database. Please run the migrations.");
        return;
      }
      if (error) throw error;
    } else {
      const data = readLocalDB();
      const session = (data.chat_sessions || []).find((s: ChatSession) => s.id === sessionId);
      if (session) {
        session.mode = mode;
        writeLocalDB(data);
      }
    }
  },

  async deleteChatSession(sessionId: string): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from('chat_sessions').delete().eq('id', sessionId);
      return !error;
    } else {
      const data = readLocalDB();
      if (!data.chat_sessions) data.chat_sessions = [];
      data.chat_sessions = data.chat_sessions.filter((s: ChatSession) => s.id !== sessionId);
      data.chat_history = data.chat_history.filter((h: ChatMessage) => h.session_id !== sessionId);
      writeLocalDB(data);
      return true;
    }
  },

  async getCurriculumDetail(id: string): Promise<{ curriculum: Curriculum; content: string } | null> {
    if (supabase) {
      const { data: curriculum, error: err1 } = await supabase.from('curriculums').select('*').eq('id', id).single();
      if (err1 || !curriculum) return null;
      
      curriculum.units = Array.isArray(curriculum.units) ? curriculum.units : [];

      // If raw content is preserved directly on curriculum row, return it directly for 100% exact fidelity
      if (curriculum.content && typeof curriculum.content === 'string' && curriculum.content.trim().length > 0) {
        return { curriculum, content: curriculum.content };
      }

      // Check for __RAW_MARKDOWN__ special chunk in curriculum_chunks
      const { data: rawChunk } = await supabase
        .from('curriculum_chunks')
        .select('content')
        .eq('curriculum_id', id)
        .lt('position_index', 0)
        .eq('heading', '__RAW_MARKDOWN__')
        .maybeSingle();

      if (rawChunk && rawChunk.content && typeof rawChunk.content === 'string' && rawChunk.content.trim().length > 0) {
        return { curriculum, content: rawChunk.content };
      }

      // Fallback for legacy records without stored content: reconstruct from parent chunks
      let allChunks: any[] = [];
      let page = 0;
      const pageSize = 1000;
      while (true) {
        const { data: chunkPage, error: err2 } = await supabase
          .from('curriculum_chunks')
          .select('heading, content, position_index, chunk_level')
          .eq('curriculum_id', id)
          .neq('chunk_level', 'child')
          .order('position_index', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (err2 || !chunkPage || chunkPage.length === 0) break;
        allChunks = allChunks.concat(chunkPage);
        if (chunkPage.length < pageSize) break;
        page++;
      }

      allChunks.sort((a, b) => (a.position_index ?? 0) - (b.position_index ?? 0));
      
      let lastUnit = '';
      let lastLesson = '';
      const reconstructedParts: string[] = [];

      for (const c of allChunks) {
        const rawContent = (c.content || '').trim();
        if (!rawContent || c.heading === '__CURRICULUM_SUMMARY__' || c.heading === '__RAW_MARKDOWN__') continue;

        const heading = (c.heading || '').trim();
        const breadcrumbs = heading.split('>').map((s: string) => s.trim()).filter(Boolean);

        if (breadcrumbs.length >= 2) {
          const unit = breadcrumbs[0];
          const lesson = breadcrumbs[1];
          const sub = breadcrumbs.slice(2).join(' > ');

          if (unit && unit !== lastUnit) {
            reconstructedParts.push(`# ${unit}`);
            lastUnit = unit;
          }
          if (lesson && lesson !== lastLesson) {
            reconstructedParts.push(`## ${lesson}`);
            lastLesson = lesson;
          }
          if (sub && !sub.includes('(')) {
            reconstructedParts.push(`### ${sub}`);
          }
        } else if (heading && heading !== 'مقدمة المنهج' && !heading.includes('(')) {
          if (!rawContent.startsWith('#')) {
            reconstructedParts.push(`# ${heading}`);
          }
        }

        reconstructedParts.push(rawContent);
      }
      
      return { curriculum, content: reconstructedParts.join('\n\n') };
    } else {
      const data = readLocalDB();
      const curriculum = (data.curriculums || []).find((c: Curriculum) => c.id === id);
      if (!curriculum) return null;
      
      curriculum.units = Array.isArray(curriculum.units) ? curriculum.units : [];

      if (curriculum.content && typeof curriculum.content === 'string' && curriculum.content.trim().length > 0) {
        return { curriculum, content: curriculum.content };
      }

      const rawChunk = (data.curriculum_chunks || []).find((c: any) => c.curriculum_id === id && c.heading === '__RAW_MARKDOWN__');
      if (rawChunk && rawChunk.content && typeof rawChunk.content === 'string' && rawChunk.content.trim().length > 0) {
        return { curriculum, content: rawChunk.content };
      }

      const chunks = (data.curriculum_chunks || [])
        .filter((cc: CurriculumChunk) => cc.curriculum_id === id && cc.chunk_level !== 'child' && cc.heading !== '__RAW_MARKDOWN__')
        .sort((a: any, b: any) => (a.position_index ?? 0) - (b.position_index ?? 0));

      let lastUnit = '';
      let lastLesson = '';
      const reconstructedParts: string[] = [];

      for (const c of chunks) {
        const rawContent = (c.content || '').trim();
        if (!rawContent || c.heading === '__CURRICULUM_SUMMARY__' || c.heading === '__RAW_MARKDOWN__') continue;

        const heading = (c.heading || '').trim();
        const breadcrumbs = heading.split('>').map((s: string) => s.trim()).filter(Boolean);

        if (breadcrumbs.length >= 2) {
          const unit = breadcrumbs[0];
          const lesson = breadcrumbs[1];
          const sub = breadcrumbs.slice(2).join(' > ');

          if (unit && unit !== lastUnit) {
            reconstructedParts.push(`# ${unit}`);
            lastUnit = unit;
          }
          if (lesson && lesson !== lastLesson) {
            reconstructedParts.push(`## ${lesson}`);
            lastLesson = lesson;
          }
          if (sub && !sub.includes('(')) {
            reconstructedParts.push(`### ${sub}`);
          }
        } else if (heading && heading !== 'مقدمة المنهج' && !heading.includes('(')) {
          if (!rawContent.startsWith('#')) {
            reconstructedParts.push(`# ${heading}`);
          }
        }

        reconstructedParts.push(rawContent);
      }

      return { curriculum, content: reconstructedParts.join('\n\n') };
    }
  },

  async updateCurriculumContent(
    id: string,
    gradeLevel: string,
    subjectName: string,
    chunks: (Omit<CurriculumChunk, 'curriculum_id'> | CurriculumChunk)[],
    rawContent?: string
  ): Promise<boolean> {
    const cleanGrade = gradeLevel.trim();
    const cleanSubject = subjectName.trim();
    
    if (supabase) {
      const updatePayload: any = {
        grade_level: cleanGrade,
        subject_name: cleanSubject,
        content: rawContent || null
      };

      let { error: err1 } = await supabase
        .from('curriculums')
        .update(updatePayload)
        .eq('id', id);
      if (err1 && (err1.code === 'PGRST204' || (err1.message && err1.message.includes("content")))) {
        const { content: _, ...withoutContent } = updatePayload;
        const retry = await supabase.from('curriculums').update(withoutContent).eq('id', id);
        err1 = retry.error;
      }
      if (err1) return false;
      
      const { error: err2 } = await supabase
        .from('curriculum_chunks')
        .delete()
        .eq('curriculum_id', id);
      if (err2) return false;

      // Assign IDs to parent chunks first so children can reference them, preserving existing IDs
      const parentMap = new Map<string, string>();
      for (const c of chunks) {
        if (c.chunk_level === 'parent') {
          const parentId = c.id || crypto.randomUUID();
          parentMap.set(c.id || parentId, parentId);
        }
      }
      
      const formattedChunks = chunks.map(c => {
        const realId = (c.chunk_level === 'parent' && c.id)
          ? (parentMap.get(c.id) || c.id)
          : (c.id || crypto.randomUUID());
        return {
          id: realId,
          curriculum_id: id,
          content: c.content,
          heading: c.heading,
          chunk_level: c.chunk_level || 'parent',
          parent_id: c.parent_id ? (parentMap.get(c.parent_id) || c.parent_id) : null,
          position_index: c.position_index || 0,
          embedding: c.embedding || null
        };
      });

      // Insert in batches of 100 to avoid payload limits
      const BATCH = 100;
      for (let i = 0; i < formattedChunks.length; i += BATCH) {
        const batch = formattedChunks.slice(i, i + BATCH);
        const { error: chunkError } = await supabase.from('curriculum_chunks').insert(batch);
        if (chunkError) {
          console.error('Error inserting updated chunks:', chunkError);
          return false;
        }
      }
      
      await this.syncCurriculumStateMutation(id, false, false);
      return true;
    } else {
      const data = readLocalDB();
      const curriculum = data.curriculums.find((c: Curriculum) => c.id === id);
      if (!curriculum) return false;
      
      curriculum.grade_level = cleanGrade;
      curriculum.subject_name = cleanSubject;
      curriculum.content = rawContent || null;
      
      data.curriculum_chunks = data.curriculum_chunks.filter((cc: CurriculumChunk) => cc.curriculum_id !== id);
      
      const newChunks = chunks.map(c => ({
        id: c.id || crypto.randomUUID(),
        curriculum_id: id,
        content: c.content,
        heading: c.heading,
        chunk_level: c.chunk_level || 'parent',
        parent_id: c.parent_id || null,
        position_index: c.position_index || 0
      }));
      data.curriculum_chunks.push(...newChunks);
      
      writeLocalDB(data);
      await this.syncCurriculumStateMutation(id, false, false);
      return true;
    }
  },

  async updateProfileName(id: string, name: string): Promise<Profile | null> {
    if (supabase) {
      const { data, error } = await supabase.from('profiles').update({ name }).eq('id', id).select().single();
      if (error) return null;
      return data;
    } else {
      const data = readLocalDB();
      const profile = data.profiles.find((p: Profile) => p.id === id);
      if (!profile) return null;
      profile.name = name;
      writeLocalDB(data);
      return profile;
    }
  },

  async updateProfilePassword(id: string, passwordHash: string): Promise<Profile | null> {
    if (supabase) {
      const { data, error } = await supabase.from('profiles').update({ password_hash: passwordHash }).eq('id', id).select().single();
      if (error) return null;
      return data;
    } else {
      const data = readLocalDB();
      const profile = data.profiles.find((p: Profile) => p.id === id);
      if (!profile) return null;
      profile.password_hash = passwordHash;
      writeLocalDB(data);
      return profile;
    }
  },

  async updateImproveAiOptIn(id: string, optIn: boolean): Promise<Profile | null> {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('profiles').update({ improve_ai_opt_in: optIn }).eq('id', id).select().single();
        if (!error && data) {
          await setUserOptOutFallback(id, optIn).catch(() => {});
          return await checkAndResetDailyCoins(data);
        }
      } catch (e) {}

      // Fallback if improve_ai_opt_in column has not yet been added to profiles table
      await setUserOptOutFallback(id, optIn);
      const profile = await this.getProfile(id);
      if (profile) {
        profile.improve_ai_opt_in = optIn;
      }
      return profile;
    } else {
      const data = readLocalDB();
      const profile = (data.profiles || []).find((p: Profile) => p.id === id);
      if (!profile) return null;
      profile.improve_ai_opt_in = optIn;
      writeLocalDB(data);
      await setUserOptOutFallback(id, optIn).catch(() => {});
      return profile;
    }
  },

  async getDashboardStats() {
    if (cachedDashboardStats && (Date.now() - lastDashboardStatsTime < DASHBOARD_CACHE_TTL_MS)) {
      return cachedDashboardStats;
    }

    if (supabase) {
      const todayDate = getCairoDateString();
      const { data: profiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('*');
      
      if (profilesErr || !profiles) {
        return {
          totalUsers: 0,
          freeUsersCount: 0,
          subscribedUsersCount: 0,
          expiredUsersCount: 0,
          conversionRate: 0,
          subscriptionsByPlan: { pro_1m: 0, pro_2m: 0, pro_3m: 0, max: 0, other: 0 },
          totalRevenueEgp: 0,
          totalRevenueEGP: 0,
          successfulTransactionsCount: 0,
          activeTodayCount: 0,
          totalExamsCount: 0,
          totalMessagesCount: 0,
          totalFlashcardDecksCount: 0,
          totalFlashcardsCount: 0,
          flashcardsCreatedTodayCount: 0,
          averageCardsPerDeck: 0,
          flashcardsBySubject: {},
          flashcardsByGrade: {},
          totalPwaUsersCount: 0,
          pwaAdoptionRate: 0,
          pwaUsersByPlatform: { android: 0, ios: 0, desktop: 0, other: 0 },
          pwaUsersByGrade: {},
          pwaUsersList: [],
          usersByGrade: {},
          highestUsageUser: null,
          highestUsageGrade: null
        };
      }

      const students = profiles.filter((p: any) => p.role === 'student');
      const totalUsers = students.length;

      let subscribedUsersCount = 0;
      let freeUsersCount = 0;
      let expiredUsersCount = 0;
      let activeTodayCount = 0;
      let totalPwaUsersCount = 0;
      const usersByGrade: Record<string, number> = {};
      const pwaUsersByGrade: Record<string, number> = {};
      const pwaUsersByPlatform: Record<string, number> = { android: 0, ios: 0, desktop: 0, other: 0 };
      const pwaUsersList: Array<{
        id: string;
        name: string;
        grade_level: string;
        email?: string;
        phone?: string;
        pwa_platform?: string | null;
        pwa_installed_at?: string | null;
        plan_type: string;
        subscription_status?: string;
      }> = [];
      const subscriptionsByPlan = { pro_1m: 0, pro_2m: 0, pro_3m: 0, max: 0, other: 0 };

      students.forEach((p: any) => {
        usersByGrade[p.grade_level] = (usersByGrade[p.grade_level] || 0) + 1;
        if (p.last_active_date === todayDate) {
          activeTodayCount++;
        }
        if (p.pwa_installed) {
          totalPwaUsersCount++;
          pwaUsersByGrade[p.grade_level] = (pwaUsersByGrade[p.grade_level] || 0) + 1;
          const plat = (p.pwa_platform === 'android' || p.pwa_platform === 'ios' || p.pwa_platform === 'desktop') ? p.pwa_platform : 'other';
          pwaUsersByPlatform[plat] = (pwaUsersByPlatform[plat] || 0) + 1;
          pwaUsersList.push({
            id: p.id,
            name: p.name,
            grade_level: p.grade_level,
            email: p.email,
            phone: p.phone,
            pwa_platform: p.pwa_platform || 'other',
            pwa_installed_at: p.pwa_installed_at,
            plan_type: p.plan_type,
            subscription_status: p.subscription_status
          });
        }
        const isSub = (p.subscription_status === 'active') || (p.plan_type && p.plan_type !== 'free');
        const isExp = p.subscription_status === 'expired';
        if (isSub) {
          subscribedUsersCount++;
          if (p.plan_type === 'pro_1m') subscriptionsByPlan.pro_1m++;
          else if (p.plan_type === 'pro_2m') subscriptionsByPlan.pro_2m++;
          else if (p.plan_type === 'pro_3m') subscriptionsByPlan.pro_3m++;
          else if (p.plan_type === 'max') subscriptionsByPlan.max++;
          else subscriptionsByPlan.other++;
        } else if (isExp) {
          expiredUsersCount++;
        } else {
          freeUsersCount++;
        }
      });

      pwaUsersList.sort((a, b) => new Date(b.pwa_installed_at || 0).getTime() - new Date(a.pwa_installed_at || 0).getTime());
      const pwaAdoptionRate = totalUsers > 0 ? Math.round((totalPwaUsersCount / totalUsers) * 1000) / 10 : 0;

      const conversionRate = totalUsers > 0 ? Math.round((subscribedUsersCount / totalUsers) * 1000) / 10 : 0;

      let totalRevenueEgp = 0;
      let successfulTransactionsCount = 0;
      try {
        const { data: txs } = await supabase
          .from('payment_transactions')
          .select('amount')
          .eq('status', 'success');
        if (txs) {
          successfulTransactionsCount = txs.length;
          txs.forEach((t: any) => {
            totalRevenueEgp += Number(t.amount || 0);
          });
        }
      } catch (e) {
        console.warn('Dashboard stats revenue query notice:', e);
      }

      let totalExamsCount = 0;
      try {
        const { count: eCount } = await supabase.from('exams').select('*', { count: 'exact', head: true });
        totalExamsCount = eCount || 0;
      } catch (_) {}

      let totalMessagesCount = 0;
      try {
        const { count: mCount } = await supabase.from('chat_history').select('*', { count: 'exact', head: true });
        totalMessagesCount = mCount || 0;
      } catch (_) {}

      let totalFlashcardDecksCount = 0;
      let totalFlashcardsCount = 0;
      let flashcardsCreatedTodayCount = 0;
      const flashcardsBySubject: Record<string, number> = {};
      const flashcardsByGrade: Record<string, number> = {};

      try {
        const [
          { count: deckCount },
          { count: cardCount },
          { data: allDecks }
        ] = await Promise.all([
          supabase.from('flashcard_decks').select('*', { count: 'exact', head: true }),
          supabase.from('flashcards').select('*', { count: 'exact', head: true }),
          supabase.from('flashcard_decks').select('id, user_id, subject_name, grade_level, created_at')
        ]);

        totalFlashcardDecksCount = deckCount || 0;
        totalFlashcardsCount = cardCount || 0;

        if (allDecks) {
          allDecks.forEach((d: any) => {
            const subj = d.subject_name || 'عام';
            flashcardsBySubject[subj] = (flashcardsBySubject[subj] || 0) + 1;
            if (d.grade_level) {
              flashcardsByGrade[d.grade_level] = (flashcardsByGrade[d.grade_level] || 0) + 1;
            }
            if (d.created_at) {
              try {
                const dateStr = new Date(d.created_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
                if (dateStr === todayDate) {
                  flashcardsCreatedTodayCount++;
                }
              } catch (_) {}
            }
          });
        }
      } catch (e) {
        console.warn('Dashboard stats flashcards query notice:', e);
      }

      const averageCardsPerDeck = totalFlashcardDecksCount > 0
        ? Math.round((totalFlashcardsCount / totalFlashcardDecksCount) * 10) / 10
        : 0;

      let highestUsageUser = null;
      let highestUsageGrade = null;
      try {
        const sortedStudents = [...students].sort((a: any, b: any) => (b.points || 0) - (a.points || 0));
        if (sortedStudents.length > 0) {
          const top = sortedStudents[0];
          highestUsageUser = {
            name: top.name,
            phone: top.phone,
            email: top.email,
            grade_level: top.grade_level,
            message_count: top.points || 0,
            coins_used: top.coins || 0
          };
        }
        const gradeEntries = Object.entries(usersByGrade);
        if (gradeEntries.length > 0) {
          gradeEntries.sort((a, b) => b[1] - a[1]);
          highestUsageGrade = {
            grade_level: gradeEntries[0][0],
            message_count: gradeEntries[0][1]
          };
        }
      } catch (_) {}

      const stats = {
        totalUsers,
        freeUsersCount,
        subscribedUsersCount,
        expiredUsersCount,
        conversionRate,
        subscriptionsByPlan,
        totalRevenueEgp: Math.round(totalRevenueEgp),
        totalRevenueEGP: Math.round(totalRevenueEgp),
        successfulTransactionsCount,
        activeTodayCount,
        totalExamsCount,
        totalMessagesCount,
        totalFlashcardDecksCount,
        totalFlashcardsCount,
        flashcardsCreatedTodayCount,
        averageCardsPerDeck,
        flashcardsBySubject,
        flashcardsByGrade,
        totalPwaUsersCount,
        pwaAdoptionRate,
        pwaUsersByPlatform,
        pwaUsersByGrade,
        pwaUsersList,
        usersByGrade,
        highestUsageUser,
        highestUsageGrade
      };

      cachedDashboardStats = stats;
      lastDashboardStatsTime = Date.now();
      return stats;
    } else {
      const data = readLocalDB();
      const todayDate = getCairoDateString();
      const students = (data.profiles || []).filter((p: Profile) => p.role === 'student');
      const totalUsers = students.length;

      let subscribedUsersCount = 0;
      let freeUsersCount = 0;
      let expiredUsersCount = 0;
      let activeTodayCount = 0;
      let totalPwaUsersCount = 0;
      const usersByGrade: Record<string, number> = {};
      const pwaUsersByGrade: Record<string, number> = {};
      const pwaUsersByPlatform: Record<string, number> = { android: 0, ios: 0, desktop: 0, other: 0 };
      const pwaUsersList: Array<{
        id: string;
        name: string;
        grade_level: string;
        email?: string;
        phone?: string;
        pwa_platform?: string | null;
        pwa_installed_at?: string | null;
        plan_type: string;
        subscription_status?: string;
      }> = [];
      const subscriptionsByPlan = { pro_1m: 0, pro_2m: 0, pro_3m: 0, max: 0, other: 0 };

      students.forEach((p: Profile) => {
        usersByGrade[p.grade_level] = (usersByGrade[p.grade_level] || 0) + 1;
        if (p.last_active_date === todayDate) {
          activeTodayCount++;
        }
        if (p.pwa_installed) {
          totalPwaUsersCount++;
          pwaUsersByGrade[p.grade_level] = (pwaUsersByGrade[p.grade_level] || 0) + 1;
          const plat = (p.pwa_platform === 'android' || p.pwa_platform === 'ios' || p.pwa_platform === 'desktop') ? p.pwa_platform : 'other';
          pwaUsersByPlatform[plat] = (pwaUsersByPlatform[plat] || 0) + 1;
          pwaUsersList.push({
            id: p.id,
            name: p.name,
            grade_level: p.grade_level,
            email: p.email,
            phone: p.phone,
            pwa_platform: p.pwa_platform || 'other',
            pwa_installed_at: p.pwa_installed_at,
            plan_type: p.plan_type,
            subscription_status: p.subscription_status
          });
        }
        if (p.subscription_status === 'active' && p.plan_type !== 'free') {
          subscribedUsersCount++;
          if (p.plan_type === 'pro_1m') subscriptionsByPlan.pro_1m++;
          else if (p.plan_type === 'pro_2m') subscriptionsByPlan.pro_2m++;
          else if (p.plan_type === 'pro_3m') subscriptionsByPlan.pro_3m++;
          else if (p.plan_type === 'max') subscriptionsByPlan.max++;
          else subscriptionsByPlan.other++;
        } else if (p.subscription_status === 'expired') {
          expiredUsersCount++;
        } else {
          freeUsersCount++;
        }
      });

      pwaUsersList.sort((a, b) => new Date(b.pwa_installed_at || 0).getTime() - new Date(a.pwa_installed_at || 0).getTime());
      const pwaAdoptionRate = totalUsers > 0 ? Math.round((totalPwaUsersCount / totalUsers) * 1000) / 10 : 0;

      const conversionRate = totalUsers > 0 ? Math.round((subscribedUsersCount / totalUsers) * 1000) / 10 : 0;

      let totalRevenueEgp = 0;
      let successfulTransactionsCount = 0;
      (data.payment_transactions || []).forEach((t: any) => {
        if (t.status === 'success') {
          successfulTransactionsCount++;
          totalRevenueEgp += Number(t.amount || 0);
        }
      });

      const totalExamsCount = (data.exams || []).length;
      const totalMessagesCount = (data.chat_history || []).length;

      const allDecks = data.flashcard_decks || [];
      const allCards = data.flashcards || [];
      const totalFlashcardDecksCount = allDecks.length;
      const totalFlashcardsCount = allCards.length;
      let flashcardsCreatedTodayCount = 0;
      const flashcardsBySubject: Record<string, number> = {};
      const flashcardsByGrade: Record<string, number> = {};

      allDecks.forEach((d: any) => {
        const subj = d.subject_name || 'عام';
        flashcardsBySubject[subj] = (flashcardsBySubject[subj] || 0) + 1;
        if (d.grade_level) {
          flashcardsByGrade[d.grade_level] = (flashcardsByGrade[d.grade_level] || 0) + 1;
        }
        if (d.created_at) {
          try {
            const dateStr = new Date(d.created_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
            if (dateStr === todayDate) {
              flashcardsCreatedTodayCount++;
            }
          } catch (_) {}
        }
      });

      const averageCardsPerDeck = totalFlashcardDecksCount > 0
        ? Math.round((totalFlashcardsCount / totalFlashcardDecksCount) * 10) / 10
        : 0;

      let highestUsageUser = null;
      if (students.length > 0) {
        const top = [...students].sort((a, b) => (b.points || 0) - (a.points || 0))[0];
        highestUsageUser = {
          name: top.name,
          phone: top.phone,
          email: top.email,
          grade_level: top.grade_level,
          message_count: top.points || 0,
          coins_used: top.coins || 0
        };
      }

      const stats = {
        totalUsers,
        freeUsersCount,
        subscribedUsersCount,
        expiredUsersCount,
        conversionRate,
        subscriptionsByPlan,
        totalRevenueEgp: Math.round(totalRevenueEgp),
        successfulTransactionsCount,
        activeTodayCount,
        totalExamsCount,
        totalMessagesCount,
        totalFlashcardDecksCount,
        totalFlashcardsCount,
        flashcardsCreatedTodayCount,
        averageCardsPerDeck,
        flashcardsBySubject,
        flashcardsByGrade,
        totalPwaUsersCount,
        pwaAdoptionRate,
        pwaUsersByPlatform,
        pwaUsersByGrade,
        pwaUsersList,
        usersByGrade,
        highestUsageUser,
        highestUsageGrade: null
      };

      cachedDashboardStats = stats;
      lastDashboardStatsTime = Date.now();
      return stats;
    }
  },

  // Exams & Testing
  async getExams(gradeLevel?: string, subjectName?: string, userId?: string, deviceId?: string): Promise<Exam[]> {
    if (supabase) {
      let query = supabase.from('exams').select('*');
      if (gradeLevel) query = query.eq('grade_level', gradeLevel);
      if (subjectName) query = query.eq('subject_name', subjectName);
      if (userId) {
        query = query.eq('user_id', userId);
      } else if (deviceId) {
        query = query.eq('device_id', deviceId);
      } else {
        return [];
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    } else {
      const data = readLocalDB();
      let list = data.exams || [];
      if (gradeLevel) list = list.filter((e: any) => e.grade_level === gradeLevel);
      if (subjectName) list = list.filter((e: any) => e.subject_name === subjectName);
      if (userId) {
        list = list.filter((e: any) => e.user_id === userId);
      } else if (deviceId) {
        list = list.filter((e: any) => e.device_id === deviceId);
      } else {
        return [];
      }
      return list.sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || ''));
    }
  },

  async getExam(id: string): Promise<Exam | null> {
    if (supabase) {
      const { data, error } = await supabase.from('exams').select('*').eq('id', id).maybeSingle();
      if (error || !data) return null;
      return data;
    } else {
      const data = readLocalDB();
      return (data.exams || []).find((e: any) => e.id === id) || null;
    }
  },

  async createExam(exam: Omit<Exam, 'id' | 'created_at'>): Promise<Exam> {
    const newExam = {
      ...exam,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase.from('exams').insert(newExam).select().single();
      if (error) throw error;
      return data;
    } else {
      const data = readLocalDB();
      if (!data.exams) data.exams = [];
      data.exams.push(newExam);
      writeLocalDB(data);
      return newExam;
    }
  },

  async getExamSubmissions(userId?: string, deviceId?: string): Promise<ExamSubmission[]> {
    if (supabase) {
      let query = supabase.from('exam_submissions').select('*');
      if (userId) {
        query = query.eq('user_id', userId);
      } else if (deviceId) {
        query = query.eq('device_id', deviceId);
      } else {
        return [];
      }
      const { data, error } = await query.order('submitted_at', { ascending: false });
      if (error) return [];
      return data || [];
    } else {
      const data = readLocalDB();
      let list = data.exam_submissions || [];
      if (userId) {
        list = list.filter((s: any) => s.user_id === userId);
      } else if (deviceId) {
        list = list.filter((s: any) => s.device_id === deviceId);
      } else {
        return [];
      }
      return list.sort((a: any, b: any) => (b.submitted_at || '').localeCompare(a.submitted_at || ''));
    }
  },

  async createExamSubmission(submission: Omit<ExamSubmission, 'id' | 'submitted_at'>): Promise<ExamSubmission> {
    const newSub: any = {
      ...submission,
      id: crypto.randomUUID(),
      submitted_at: new Date().toISOString()
    };

    if (supabase) {
      let { data, error } = await supabase.from('exam_submissions').insert(newSub).select().single();
      if (error) {
        console.warn('Exam submission insert warning, retrying without phase 3 columns:', error.message);
        // Fallback for databases where migration_phase3.sql has not been executed yet
        const { points_awarded, is_first_attempt, ...fallbackSub } = newSub;
        const retry = await supabase.from('exam_submissions').insert(fallbackSub).select().single();
        if (!retry.error && retry.data) {
          data = retry.data;
          error = null;
        }
      }
      if (error) throw error;
      return data;
    } else {
      const data = readLocalDB();
      if (!data.exam_submissions) data.exam_submissions = [];
      data.exam_submissions.push(newSub);
      writeLocalDB(data);
      return newSub;
    }
  },

  // ─── Curriculum rename (metadata only, chunks untouched) ──────────────────
  async renameCurriculum(id: string, subjectName: string, fileName?: string): Promise<Curriculum | null> {
    const cleanSubject = subjectName.trim();
    if (supabase) {
      const update: any = { subject_name: cleanSubject };
      if (fileName) update.file_name = fileName;
      const { data, error } = await supabase.from('curriculums').update(update).eq('id', id).select().single();
      if (error) return null;
      await this.syncCurriculumStateMutation(id, false, false);
      return data;
    } else {
      const data = readLocalDB();
      const curriculum = data.curriculums.find((c: Curriculum) => c.id === id);
      if (!curriculum) return null;
      curriculum.subject_name = cleanSubject;
      if (fileName) curriculum.file_name = fileName;
      writeLocalDB(data);
      await this.syncCurriculumStateMutation(id, false, false);
      return curriculum;
    }
  },

  /** Changes a curriculum's track restriction, elective flag, and placeholder status within its own stage. */
  async updateCurriculumPlacement(id: string, trackId: string | null, isElective: boolean, isPlaceholder?: boolean): Promise<Curriculum | null> {
    const update: Record<string, any> = { track_id: trackId, is_elective: isElective };
    if (typeof isPlaceholder === 'boolean') {
      update.is_placeholder = isPlaceholder;
    }
    if (supabase) {
      const { data, error } = await supabase.from('curriculums').update(update).eq('id', id).select().single();
      if (error) return null;
      await this.syncCurriculumStateMutation(id, false, false);
      return data;
    }
    const data = readLocalDB();
    const curriculum = data.curriculums.find((c: Curriculum) => c.id === id);
    if (!curriculum) return null;
    Object.assign(curriculum, update);
    writeLocalDB(data);
    await this.syncCurriculumStateMutation(id, false, false);
    return curriculum;
  },

  // ─── Reports (AI response reporting) ───────────────────────────────────────
  async createReport(report: Omit<Report, 'id' | 'created_at' | 'status'>): Promise<Report> {
    const newReport: Report = {
      ...report,
      id: crypto.randomUUID(),
      status: 'pending',
      created_at: new Date().toISOString()
    };
    if (supabase) {
      const { data, error } = await supabase.from('reports').insert(newReport).select().single();
      if (error) throw error;
      return data;
    } else {
      const data = readLocalDB();
      if (!data.reports) data.reports = [];
      data.reports.push(newReport);
      writeLocalDB(data);
      return newReport;
    }
  },

  async getReports(status?: string): Promise<Report[]> {
    if (supabase) {
      let query = supabase.from('reports').select('*').order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) return [];
      return data || [];
    } else {
      const data = readLocalDB();
      let list = (data.reports || []) as Report[];
      if (status) list = list.filter(r => r.status === status);
      return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  },

  async updateReportStatus(
    id: string,
    status: 'pending' | 'reviewed' | 'dismissed' | 'action_taken',
    action_taken?: string,
    admin_notes?: string
  ): Promise<boolean> {
    const updateObj: Record<string, any> = { status };
    if (action_taken !== undefined) updateObj.action_taken = action_taken;
    if (admin_notes !== undefined) updateObj.admin_notes = admin_notes;

    if (supabase) {
      const { error } = await supabase.from('reports').update(updateObj).eq('id', id);
      return !error;
    } else {
      const data = readLocalDB();
      const report = (data.reports || []).find((r: Report) => r.id === id);
      if (!report) return false;
      report.status = status;
      if (action_taken !== undefined) report.action_taken = action_taken;
      if (admin_notes !== undefined) report.admin_notes = admin_notes;
      writeLocalDB(data);
      return true;
    }
  },

  async deleteReport(id: string): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from('reports').delete().eq('id', id);
      return !error;
    } else {
      const data = readLocalDB();
      data.reports = (data.reports || []).filter((r: Report) => r.id !== id);
      writeLocalDB(data);
      return true;
    }
  },

  // ─── Contact / Technical Support Messages ───────────────────────────────────
  async createContactMessage(msg: Omit<ContactMessage, 'id' | 'created_at' | 'status'>): Promise<ContactMessage> {
    const newMsg: ContactMessage = {
      ...msg,
      id: crypto.randomUUID(),
      status: 'pending',
      created_at: new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase.from('contact_messages').insert(newMsg).select().single();
      if (error) {
        console.error('Supabase createContactMessage error:', error);
        throw error;
      }
      return data;
    } else {
      const data = readLocalDB();
      if (!data.contact_messages) data.contact_messages = [];
      data.contact_messages.push(newMsg);
      writeLocalDB(data);
      return newMsg;
    }
  },

  async getContactMessages(status?: string, category?: string): Promise<ContactMessage[]> {
    if (supabase) {
      let query = supabase.from('contact_messages').select('*').order('created_at', { ascending: false });
      if (status && status !== 'all') query = query.eq('status', status);
      if (category && category !== 'all') query = query.eq('category', category);
      const { data, error } = await query;
      if (error) {
        console.error('Supabase getContactMessages error:', error);
        return [];
      }
      return data || [];
    } else {
      const data = readLocalDB();
      let list = (data.contact_messages || []) as ContactMessage[];
      if (status && status !== 'all') list = list.filter(m => m.status === status);
      if (category && category !== 'all') list = list.filter(m => m.category === category);
      return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  },

  async updateContactMessageStatus(
    id: string,
    status: 'pending' | 'replied' | 'resolved' | 'dismissed',
    admin_notes?: string
  ): Promise<boolean> {
    const updateObj: Record<string, any> = { status };
    if (admin_notes !== undefined) updateObj.admin_notes = admin_notes;

    if (supabase) {
      const { error } = await supabase.from('contact_messages').update(updateObj).eq('id', id);
      return !error;
    } else {
      const data = readLocalDB();
      const msg = (data.contact_messages || []).find((m: ContactMessage) => m.id === id);
      if (!msg) return false;
      msg.status = status;
      if (admin_notes !== undefined) msg.admin_notes = admin_notes;
      writeLocalDB(data);
      return true;
    }
  },

  async deleteContactMessage(id: string): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from('contact_messages').delete().eq('id', id);
      return !error;
    } else {
      const data = readLocalDB();
      data.contact_messages = (data.contact_messages || []).filter((m: ContactMessage) => m.id !== id);
      writeLocalDB(data);
      return true;
    }
  },

  // ─── Customer Service: Subscription Cancellation & Recalculation ───────────
  async cancelUserSubscription(userId: string): Promise<{ success: boolean; error?: string; message?: string }> {
    const profile = await this.getProfile(userId);
    if (!profile) {
      return { success: false, error: 'المستخدم غير موجود.' };
    }

    if (profile.subscription_status !== 'active' || profile.plan_type === 'free') {
      return { success: false, error: 'الطالب لا يملك اشتراكاً مدفوعاً نشطاً حالياً ليتم إلغاؤه.' };
    }

    // 1. Check 3 days (72 hours) window
    if (profile.subscription_start_date) {
      const startDate = new Date(profile.subscription_start_date).getTime();
      const now = Date.now();
      const elapsedHours = (now - startDate) / (1000 * 60 * 60);
      if (elapsedHours > 72) {
        const days = Math.floor(elapsedHours / 24);
        const hours = Math.floor(elapsedHours % 24);
        return {
          success: false,
          error: `غير مؤهل للإلغاء: لقد مضى ${days > 0 ? `${days} يوم و ` : ''}${hours} ساعة على تاريخ بدء الاشتراك. يشترط للإلغاء والاسترداد ألا يتجاوز الاشتراك 3 أيام (72 ساعة).`
        };
      }
    }

    // 2. Check 0 coins spent rule
    const planCap = DAILY_COIN_CAPS[profile.plan_type] ?? 80.0;
    const currentCoins = profile.coins === undefined ? 0 : profile.coins;
    if (currentCoins < planCap) {
      return {
        success: false,
        error: `غير مؤهل للإلغاء: تم استهلاك نقاط من رصيد باقة الاشتراك (الرصيد المتبقي ${currentCoins.toFixed(1)} من أصل ${planCap} نقطة). يشترط للإلغاء والاسترداد عدم استهلاك أي نقاط من الباقة.`
      };
    }

    // Check if any chat usage occurred during the subscription period
    if (profile.subscription_start_date) {
      if (supabase) {
        const { data: usageRows } = await supabase
          .from('chat_history')
          .select('coins_cost')
          .eq('user_id', userId)
          .gte('created_at', profile.subscription_start_date)
          .gt('coins_cost', 0);
        if (usageRows && usageRows.length > 0) {
          return {
            success: false,
            error: 'غير مؤهل للإلغاء: تم تسجيل عمليات محادثة واستهلاك نقاط خلال فترة الاشتراك الحالية.'
          };
        }
      } else {
        const data = readLocalDB();
        const start = new Date(profile.subscription_start_date).getTime();
        const hasUsage = (data.chat_history || []).some(
          (h: any) => h.user_id === userId && new Date(h.created_at).getTime() >= start && (h.coins_cost || 0) > 0
        );
        if (hasUsage) {
          return {
            success: false,
            error: 'غير مؤهل للإلغاء: تم تسجيل عمليات محادثة واستهلاك نقاط خلال فترة الاشتراك الحالية.'
          };
        }
      }
    }

    // Cancellation execution: Reset plan to free, subscription_status to inactive
    const updatePayload = {
      subscription_status: 'inactive',
      plan_type: 'free',
      subscription_plan_id: null,
      subscription_end_date: null,
      coins: 0.0
    };

    if (supabase) {
      await supabase.from('profiles').update(updatePayload).eq('id', userId);
      try {
        await supabase
          .from('payment_transactions')
          .update({ status: 'refunded', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .in('status', ['success', 'pending']);
      } catch (e) {
        console.warn('Payment transaction refund update notice:', e);
      }
    } else {
      const data = readLocalDB();
      const p = (data.profiles || []).find((x: Profile) => x.id === userId);
      if (p) {
        p.subscription_status = 'inactive';
        p.plan_type = 'free';
        p.subscription_plan_id = undefined;
        p.subscription_end_date = undefined;
        p.coins = 0.0;
      }
      if (data.payment_transactions) {
        data.payment_transactions.forEach((tx: any) => {
          if (tx.user_id === userId && (tx.status === 'success' || tx.status === 'pending')) {
            tx.status = 'refunded';
            tx.updated_at = new Date().toISOString();
          }
        });
      }
      writeLocalDB(data);
    }

    return {
      success: true,
      message: 'تم إلغاء باقة الاشتراك بنجاح واسترداد الخطة وتحويل حساب الطالب إلى الخطة المجانية.'
    };
  },

  async recalculateUserCoins(userId: string): Promise<{ success: boolean; coins: number; message: string }> {
    const profile = await this.getProfile(userId);
    if (!profile) {
      return { success: false, coins: 0, message: 'المستخدم غير موجود.' };
    }

    const today = getCairoDateString();
    const isActiveSub = profile.subscription_status === 'active' && profile.plan_type !== 'free';
    const planCap = DAILY_COIN_CAPS[profile.plan_type] ?? (isActiveSub ? 80.0 : 0.0);
    const newCoins = isActiveSub ? toPreciseCoins(planCap) : toPreciseCoins(20.0);

    profile.coins = newCoins;
    profile.last_active_date = today;

    if (supabase) {
      await supabase.from('profiles').update({ coins: newCoins, last_active_date: today }).eq('id', userId);
    } else {
      const data = readLocalDB();
      const p = (data.profiles || []).find((x: Profile) => x.id === userId);
      if (p) {
        p.coins = newCoins;
        p.last_active_date = today;
        writeLocalDB(data);
      }
    }

    return {
      success: true,
      coins: newCoins,
      message: isActiveSub
        ? `تمت إعادة احتساب وتعيين نقاط اليوم المستحقة لباقة (${profile.plan_type}) بنجاح إلى ${newCoins} نقطة.`
        : `تمت إعادة ضبط رصيد النقاط التجريبي للطالب إلى ${newCoins} نقطة.`
    };
  },

  async grantUserSubscription(
    userId: string,
    planId: 'pro_1m' | 'pro_2m' | 'pro_3m' | string,
    durationDays?: number,
    adminNote?: string
  ): Promise<{ success: boolean; error?: string; message?: string; profile?: Profile }> {
    const profile = await this.getProfile(userId);
    if (!profile) {
      return { success: false, error: 'المستخدم غير موجود.' };
    }

    const validPlans = ['pro_1m', 'pro_2m', 'pro_3m'];
    const selectedPlan = (validPlans.includes(planId) ? planId : 'pro_1m') as 'pro_1m' | 'pro_2m' | 'pro_3m';
    
    let days = durationDays;
    if (!days || days <= 0) {
      days = selectedPlan === 'pro_3m' ? 90 : selectedPlan === 'pro_2m' ? 60 : 30;
    }

    const planAmount = selectedPlan === 'pro_3m' ? 140 : selectedPlan === 'pro_2m' ? 110 : 60;
    const planCap = DAILY_COIN_CAPS[selectedPlan] ?? 80.0;
    const now = new Date();
    const startDateIso = now.toISOString();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const endDateIso = endDate.toISOString();

    const updatePayload = {
      subscription_status: 'active' as const,
      plan_type: selectedPlan,
      subscription_plan_id: selectedPlan,
      subscription_start_date: startDateIso,
      subscription_end_date: endDateIso,
      coins: Math.max(profile.coins || 0, planCap)
    };

    if (supabase) {
      let { data, error } = await supabase.from('profiles').update(updatePayload).eq('id', userId).select().single();
      if (error) {
        // Fallback: update using only base columns that exist in the table
        const basePayload = {
          plan_type: selectedPlan,
          coins: Math.max(profile.coins || 0, planCap)
        };
        const fallbackRes = await supabase.from('profiles').update(basePayload).eq('id', userId).select().single();
        if (fallbackRes.error) return { success: false, error: 'فشل تحديث بيانات الاشتراك في قاعدة البيانات.' };
        data = fallbackRes.data;
      }
      await this.resetMeteringTerm(userId);

      try {
        const orderId = `admin_grant_${userId.slice(0, 8)}_${Date.now()}`;
        await supabase.from('payment_transactions').insert({
          user_id: userId,
          order_id: orderId,
          plan_id: selectedPlan,
          amount: planAmount,
          currency: 'EGP',
          status: 'success',
          provider: 'admin_manual',
          payment_method: 'Admin Manual Grant',
          raw_response: { note: adminNote || 'تفعيل اشتراك يدوي من لوحة التحكم', granted_at: startDateIso, duration_days: days }
        });
      } catch (e) {
        console.warn('Grant subscription transaction insert notice:', e);
      }

      try {
        await this.createNotification({
          title: 'تهانينا! تم تفعيل اشتراكك بنجاح',
          body: `قام مشرف النظام بتفعيل باقة (${selectedPlan === 'pro_3m' ? '3 أشهر' : selectedPlan === 'pro_2m' ? 'شهرين' : 'شهر برو'}) لحسابك لمدة ${days} يوماً مع رصيد يومي ${planCap} نقطة. نتمنى لك دراسة موفقة!`,
          type: 'success',
          target: 'web',
          user_id: userId
        });
      } catch (_) {}

      invalidateDashboardStatsCache();

      return {
        success: true,
        message: `تم تفعيل باقة (${selectedPlan}) بنجاح للطالب لمدة ${days} يوماً.`,
        profile: data
      };
    } else {
      const data = readLocalDB();
      const p = (data.profiles || []).find((x: Profile) => x.id === userId);
      if (!p) return { success: false, error: 'المستخدم غير موجود.' };

      p.subscription_status = 'active';
      p.plan_type = selectedPlan;
      p.subscription_plan_id = selectedPlan;
      p.subscription_start_date = startDateIso;
      p.subscription_end_date = endDateIso;
      p.coins = Math.max(p.coins || 0, planCap);

      data.payment_transactions = data.payment_transactions || [];
      const orderId = `admin_grant_${userId.slice(0, 8)}_${Date.now()}`;
      data.payment_transactions.push({
        id: `tx_${Date.now()}`,
        user_id: userId,
        order_id: orderId,
        plan_id: selectedPlan,
        amount: planAmount,
        currency: 'EGP',
        status: 'success',
        provider: 'admin_manual',
        payment_method: 'Admin Manual Grant',
        raw_response: { note: adminNote || 'تفعيل اشتراك يدوي من لوحة التحكم', duration_days: days },
        created_at: startDateIso,
        updated_at: startDateIso
      });

      data.notifications = data.notifications || [];
      data.notifications.push({
        id: `notif_${Date.now()}`,
        title: 'تهانينا! تم تفعيل اشتراكك بنجاح',
        body: `قام مشرف النظام بتفعيل باقة (${selectedPlan === 'pro_3m' ? '3 أشهر' : selectedPlan === 'pro_2m' ? 'شهرين' : 'شهر برو'}) لحسابك لمدة ${days} يوماً مع رصيد يومي ${planCap} نقطة. نتمنى لك دراسة موفقة!`,
        type: 'success',
        target: 'web',
        user_id: userId,
        active: true,
        created_at: startDateIso
      });

      writeLocalDB(data);
      invalidateDashboardStatsCache();

      return {
        success: true,
        message: `تم تفعيل باقة (${selectedPlan}) بنجاح للطالب لمدة ${days} يوماً.`,
        profile: p
      };
    }
  },

  async updateStudentProfile(
    userId: string,
    updates: { name?: string; phone?: string; grade_level?: string; email?: string; track_id?: string | null; improve_ai_opt_in?: boolean }
  ): Promise<{ success: boolean; error?: string; profile?: Profile }> {
    const profile = await this.getProfile(userId);
    if (!profile) return { success: false, error: 'الطالب غير موجود.' };

    const payload: Partial<Profile> = {};
    if (updates.name && updates.name.trim()) payload.name = updates.name.trim();
    if (updates.phone && updates.phone.trim()) payload.phone = updates.phone.trim();
    if (updates.email && updates.email.trim()) payload.email = updates.email.trim();
    if (updates.grade_level) payload.grade_level = updates.grade_level;
    if (updates.track_id !== undefined) payload.track_id = updates.track_id;
    if (updates.improve_ai_opt_in !== undefined) payload.improve_ai_opt_in = updates.improve_ai_opt_in;

    if (supabase) {
      let { data, error } = await supabase.from('profiles').update(payload).eq('id', userId).select().single();
      if (error && error.code === '42703' && payload.improve_ai_opt_in !== undefined) {
        const { improve_ai_opt_in, ...safePayload } = payload;
        await setUserOptOutFallback(userId, improve_ai_opt_in);
        const retryRes = Object.keys(safePayload).length > 0
          ? await supabase.from('profiles').update(safePayload).eq('id', userId).select().single()
          : await supabase.from('profiles').select('*').eq('id', userId).single();
        if (retryRes.error) return { success: false, error: 'فشل تحديث بيانات الطالب في قاعدة البيانات.' };
        data = retryRes.data;
        if (data) data.improve_ai_opt_in = updates.improve_ai_opt_in;
        error = null;
      }
      if (error) return { success: false, error: 'فشل تحديث بيانات الطالب في قاعدة البيانات.' };
      invalidateDashboardStatsCache();
      return { success: true, profile: data };
    } else {
      const data = readLocalDB();
      const p = (data.profiles || []).find((x: Profile) => x.id === userId);
      if (!p) return { success: false, error: 'الطالب غير موجود.' };
      Object.assign(p, payload);
      writeLocalDB(data);
      if (updates.improve_ai_opt_in !== undefined) {
        await setUserOptOutFallback(userId, updates.improve_ai_opt_in).catch(() => {});
      }
      invalidateDashboardStatsCache();
      return { success: true, profile: p };
    }
  },

  async toggleUserBan(
    userId: string,
    isBanned: boolean,
    reason?: string
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    if (supabase) {
      let { error } = await supabase.from('profiles').update({
        subscription_status: isBanned ? 'suspended' : 'inactive',
        unlimited_credit: isBanned ? false : undefined
      }).eq('id', userId);
      if (error) {
        const { error: fbErr } = await supabase.from('profiles').update({
          unlimited_credit: isBanned ? false : undefined,
          coins: isBanned ? 0 : undefined
        }).eq('id', userId);
        if (fbErr) return { success: false, error: 'فشل تغيير حالة الحساب.' };
      }
      invalidateDashboardStatsCache();
      return { success: true, message: isBanned ? 'تم تجميد حساب الطالب بنجاح.' : 'تم رفع التجميد وتنشيط الحساب بنجاح.' };
    } else {
      const data = readLocalDB();
      const p = (data.profiles || []).find((x: Profile) => x.id === userId);
      if (!p) return { success: false, error: 'المستخدم غير موجود.' };
      p.subscription_status = isBanned ? 'suspended' : 'inactive';
      writeLocalDB(data);
      invalidateDashboardStatsCache();
      return { success: true, message: isBanned ? 'تم تجميد حساب الطالب بنجاح.' : 'تم رفع التجميد وتنشيط الحساب بنجاح.' };
    }
  },

  async sendTargetedNotification(
    userId: string,
    title: string,
    body: string,
    type: 'info' | 'warning' | 'alert' | 'success' = 'info'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const notif = await this.createNotification({
        title: title.trim(),
        body: body.trim(),
        type: type === 'alert' ? 'warning' : type,
        target: 'web',
        user_id: userId
      });
      return { success: !!notif };
    } catch (e: any) {
      return { success: false, error: e.message || 'فشل إرسال الإشعار.' };
    }
  },

  // ─── Notifications ─────────────────────────────────────────────────────────
  async getActiveNotifications(target: 'web' | 'phone', userId?: string | null): Promise<AppNotification[]> {
    const userCacheKey = userId ? `${target}:${userId}` : null;
    if (userCacheKey) {
      const cached = cachedUserNotifications.get(userCacheKey);
      if (cached && (Date.now() - cached.time < USER_NOTIF_CACHE_TTL_MS)) {
        return cached.data;
      }
    } else if (cachedBroadcastNotifications && cachedBroadcastNotifications.target === target && (Date.now() - cachedBroadcastNotifications.time < BROADCAST_NOTIF_CACHE_TTL_MS)) {
      return cachedBroadcastNotifications.data;
    }

    let results: AppNotification[] = [];
    if (supabase) {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.or(`user_id.is.null,user_id.eq.${userId}`);
      } else {
        query = query.is('user_id', null);
      }

      const { data, error } = await query;
      if (error) return [];
      results = (data || []).filter((n: AppNotification) => {
        const matchesTarget = n.target === 'both' || n.target === target;
        const matchesUser = !n.user_id || (userId && n.user_id === userId);
        return matchesTarget && matchesUser;
      });
    } else {
      const data = readLocalDB();
      const list = (data.notifications || []) as AppNotification[];
      results = list
        .filter(n => {
          const matchesActive = n.active;
          const matchesTarget = n.target === 'both' || n.target === target;
          const matchesUser = userId ? (!n.user_id || n.user_id === userId) : !n.user_id;
          return matchesActive && matchesTarget && matchesUser;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    if (userCacheKey) {
      if (cachedUserNotifications.size > 1000) cachedUserNotifications.clear();
      cachedUserNotifications.set(userCacheKey, { data: results, time: Date.now() });
    } else {
      cachedBroadcastNotifications = { target, data: results, time: Date.now() };
    }
    return results;
  },

  async getAllNotifications(): Promise<AppNotification[]> {
    if (supabase) {
      const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    } else {
      const data = readLocalDB();
      return [...((data.notifications || []) as AppNotification[])].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  },

  async createNotification(notification: Omit<AppNotification, 'id' | 'created_at' | 'active'>): Promise<AppNotification> {
    invalidateNotificationsCache();
    const newNotification: AppNotification = {
      ...notification,
      user_id: notification.user_id || null,
      id: crypto.randomUUID(),
      active: true,
      created_at: new Date().toISOString()
    };
    if (supabase) {
      const { data, error } = await supabase.from('notifications').insert(newNotification).select().single();
      if (error) throw error;
      return data;
    } else {
      const data = readLocalDB();
      if (!data.notifications) data.notifications = [];
      data.notifications.push(newNotification);
      writeLocalDB(data);
      return newNotification;
    }
  },

  async setNotificationActive(id: string, active: boolean): Promise<boolean> {
    invalidateNotificationsCache();
    if (supabase) {
      const { error } = await supabase.from('notifications').update({ active }).eq('id', id);
      return !error;
    } else {
      const data = readLocalDB();
      const n = (data.notifications || []).find((x: AppNotification) => x.id === id);
      if (!n) return false;
      n.active = active;
      writeLocalDB(data);
      return true;
    }
  },

  async deleteNotification(id: string): Promise<boolean> {
    invalidateNotificationsCache();
    if (supabase) {
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      return !error;
    } else {
      const data = readLocalDB();
      data.notifications = (data.notifications || []).filter((n: AppNotification) => n.id !== id);
      writeLocalDB(data);
      return true;
    }
  },

  // ─── App Versions (mobile force-update) ────────────────────────────────────
  async getLatestVersion(platform: string = 'android'): Promise<AppVersion | null> {
    if (supabase) {
      const { data, error } = await supabase
        .from('app_versions')
        .select('*')
        .eq('platform', platform)
        .eq('active', true)
        .order('version_code', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return data;
    } else {
      const data = readLocalDB();
      const list = ((data.app_versions || []) as AppVersion[])
        .filter(v => v.platform === platform && v.active)
        .sort((a, b) => b.version_code - a.version_code);
      return list[0] || null;
    }
  },

  async getAllVersions(): Promise<AppVersion[]> {
    if (supabase) {
      const { data, error } = await supabase.from('app_versions').select('*').order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    } else {
      const data = readLocalDB();
      return [...((data.app_versions || []) as AppVersion[])].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  },

  async createVersion(version: Omit<AppVersion, 'id' | 'created_at' | 'active'>): Promise<AppVersion> {
    const newVersion: AppVersion = {
      ...version,
      id: crypto.randomUUID(),
      active: true,
      created_at: new Date().toISOString()
    };
    if (supabase) {
      const { data, error } = await supabase.from('app_versions').insert(newVersion).select().single();
      if (error) throw error;
      return data;
    } else {
      const data = readLocalDB();
      if (!data.app_versions) data.app_versions = [];
      data.app_versions.push(newVersion);
      writeLocalDB(data);
      return newVersion;
    }
  },

  async deleteVersion(id: string): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from('app_versions').delete().eq('id', id);
      return !error;
    } else {
      const data = readLocalDB();
      data.app_versions = (data.app_versions || []).filter((v: AppVersion) => v.id !== id);
      writeLocalDB(data);
      return true;
    }
  },

  // ─── User management (admin) ───────────────────────────────────────────────
  async getUsers(
    search?: string,
    options?: {
      tier?: 'all' | 'free' | 'subscribed' | 'expired' | 'pwa';
      grade_level?: string;
    }
  ): Promise<{
    users: Omit<Profile, 'password_hash'>[];
    counts: {
      total: number;
      subscribed: number;
      free: number;
      expired: number;
      pwa: number;
    };
  }> {
    if (supabase) {
      let rawProfiles: any[];
      let activityRows: any[];
      try {
        [rawProfiles, activityRows] = await Promise.all([
          fetchAllRows<any>((from, to) =>
            supabase!.from('profiles').select('*').eq('role', 'student').order('created_at', { ascending: false }).range(from, to)
          ),
          fetchAllRows<any>((from, to) => supabase!.rpc('admin_user_activity').range(from, to)).catch(() => [])
        ]);
      } catch (error) {
        console.error('getUsers Supabase query error:', error);
        return { users: [], counts: { total: 0, subscribed: 0, free: 0, expired: 0, pwa: 0 } };
      }
      const activity = new Map<string, any>(activityRows.map((a: any) => [a.user_id, a]));

      const optedOutIds = await getAllOptedOutUserIds();
      const allProfiles = rawProfiles.map(({ password_hash: _hash, ...p }: any) => {
        const isSub = (p.subscription_status === 'active') || (p.plan_type && p.plan_type !== 'free');
        const isExp = p.subscription_status === 'expired';
        const a = activity.get(p.id);
        return {
          ...p,
          subscription_status: p.subscription_status || (isSub ? 'active' : (isExp ? 'expired' : 'inactive')),
          subscription_start_date: p.subscription_start_date || (isSub ? p.created_at : null),
          subscription_end_date: p.subscription_end_date || null,
          messages_sent_count: Number(a?.messages_sent || 0),
          active_chat_days_count: Number(a?.active_days || 0),
          exams_created_count: Number(a?.exams_created || 0),
          exams_completed_count: Number(a?.exams_completed || 0),
          flashcard_decks_count: Number(a?.decks || 0),
          flashcards_created_count: Number(a?.cards || 0),
          pwa_installed: !!p.pwa_installed,
          pwa_installed_at: p.pwa_installed_at || null,
          pwa_platform: p.pwa_platform || null,
          improve_ai_opt_in: p.improve_ai_opt_in !== undefined ? !!p.improve_ai_opt_in : !optedOutIds.has(p.id)
        };
      });

      const total = allProfiles.length;
      let subscribedCount = 0;
      let freeCount = 0;
      let expiredCount = 0;
      let pwaCount = 0;

      allProfiles.forEach((p: any) => {
        const isSub = p.subscription_status === 'active' && p.plan_type !== 'free';
        const isExp = p.subscription_status === 'expired';
        if (isSub) subscribedCount++;
        else if (isExp) expiredCount++;
        else freeCount++;
        if (p.pwa_installed) pwaCount++;
      });

      let filtered = allProfiles;

      const tier = options?.tier || 'all';
      if (tier === 'subscribed') {
        filtered = filtered.filter((p: any) => p.subscription_status === 'active' && p.plan_type !== 'free');
      } else if (tier === 'free') {
        filtered = filtered.filter((p: any) => p.plan_type === 'free' || p.subscription_status === 'inactive' || !p.subscription_status);
      } else if (tier === 'expired') {
        filtered = filtered.filter((p: any) => p.subscription_status === 'expired');
      } else if (tier === 'pwa') {
        filtered = filtered.filter((p: any) => p.pwa_installed === true);
      }

      if (options?.grade_level && options.grade_level !== 'all') {
        filtered = filtered.filter((p: any) => p.grade_level === options.grade_level);
      }

      if (search) {
        const s = search.toLowerCase().trim();
        filtered = filtered.filter((p: any) => 
          (p.name && p.name.toLowerCase().includes(s)) ||
          (p.phone && p.phone.includes(s)) ||
          (p.email && p.email.toLowerCase().includes(s))
        );
      }

      return {
        users: filtered,
        counts: {
          total,
          subscribed: subscribedCount,
          free: freeCount,
          expired: expiredCount,
          pwa: pwaCount
        }
      };
    } else {
      const data = readLocalDB();
      const allProfiles = (data.profiles || []).filter((p: Profile) => p.role === 'student');
      const total = allProfiles.length;
      let subscribedCount = 0;
      let freeCount = 0;
      let expiredCount = 0;
      let pwaCount = 0;

      allProfiles.forEach((p: Profile) => {
        const isSub = p.subscription_status === 'active' && p.plan_type !== 'free';
        const isExp = p.subscription_status === 'expired';
        if (isSub) subscribedCount++;
        else if (isExp) expiredCount++;
        else freeCount++;
        if (p.pwa_installed) pwaCount++;
      });

      const messageCounts: Record<string, number> = {};
      const userChatDaysMap: Record<string, Set<string>> = {};
      (data.chat_history || []).forEach((m: any) => {
        if (m.user_id && m.sender === 'user') {
          messageCounts[m.user_id] = (messageCounts[m.user_id] || 0) + 1;
          if (m.created_at) {
            if (!userChatDaysMap[m.user_id]) userChatDaysMap[m.user_id] = new Set<string>();
            try {
              const d = new Date(m.created_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
              userChatDaysMap[m.user_id].add(d);
            } catch (_) {
              userChatDaysMap[m.user_id].add(m.created_at.slice(0, 10));
            }
          }
        }
      });

      const examCreatedCounts: Record<string, number> = {};
      (data.exams || []).forEach((e: any) => {
        if (e.user_id) examCreatedCounts[e.user_id] = (examCreatedCounts[e.user_id] || 0) + 1;
      });

      const examCompletedCounts: Record<string, number> = {};
      (data.exam_submissions || []).forEach((s: any) => {
        if (s.user_id) examCompletedCounts[s.user_id] = (examCompletedCounts[s.user_id] || 0) + 1;
      });

      const deckCounts: Record<string, number> = {};
      const deckUserMap: Record<string, string> = {};
      (data.flashcard_decks || []).forEach((d: any) => {
        if (d.user_id) {
          deckCounts[d.user_id] = (deckCounts[d.user_id] || 0) + 1;
          if (d.id) deckUserMap[d.id] = d.user_id;
        }
      });

      const cardCounts: Record<string, number> = {};
      (data.flashcards || []).forEach((c: any) => {
        if (c.deck_id && deckUserMap[c.deck_id]) {
          const uId = deckUserMap[c.deck_id];
          cardCounts[uId] = (cardCounts[uId] || 0) + 1;
        }
      });

      let filtered = allProfiles;

      const tier = options?.tier || 'all';
      if (tier === 'subscribed') {
        filtered = filtered.filter((p: Profile) => p.subscription_status === 'active' && p.plan_type !== 'free');
      } else if (tier === 'free') {
        filtered = filtered.filter((p: Profile) => p.plan_type === 'free' || p.subscription_status === 'inactive' || !p.subscription_status);
      } else if (tier === 'expired') {
        filtered = filtered.filter((p: Profile) => p.subscription_status === 'expired');
      } else if (tier === 'pwa') {
        filtered = filtered.filter((p: Profile) => p.pwa_installed === true);
      }

      if (options?.grade_level && options.grade_level !== 'all') {
        filtered = filtered.filter((p: Profile) => p.grade_level === options.grade_level);
      }

      if (search) {
        const s = search.toLowerCase().trim();
        filtered = filtered.filter((p: Profile) => 
          (p.name && p.name.toLowerCase().includes(s)) ||
          (p.phone && p.phone.includes(s)) ||
          (p.email && p.email.toLowerCase().includes(s))
        );
      }

      const optedOutIds = await getAllOptedOutUserIds();
      const mapped = filtered
        .sort((a: Profile, b: Profile) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map(({ password_hash, ...rest }: Profile) => ({
          ...rest,
          messages_sent_count: messageCounts[rest.id] || 0,
          active_chat_days_count: userChatDaysMap[rest.id]?.size || 0,
          exams_created_count: examCreatedCounts[rest.id] || 0,
          exams_completed_count: examCompletedCounts[rest.id] || 0,
          flashcard_decks_count: deckCounts[rest.id] || 0,
          flashcards_created_count: cardCounts[rest.id] || 0,
          pwa_installed: !!rest.pwa_installed,
          pwa_installed_at: rest.pwa_installed_at || null,
          pwa_platform: rest.pwa_platform || null,
          improve_ai_opt_in: rest.improve_ai_opt_in !== undefined ? !!rest.improve_ai_opt_in : !optedOutIds.has(rest.id)
        }));

      return {
        users: mapped,
        counts: {
          total,
          subscribed: subscribedCount,
          free: freeCount,
          expired: expiredCount,
          pwa: pwaCount
        }
      };
    }
  },

  async getUserSentMessagesCount(userId: string): Promise<number> {
    if (supabase) {
      const { count } = await supabase.from('chat_history').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('sender', 'user');
      return count || 0;
    } else {
      const data = readLocalDB();
      return (data.chat_history || []).filter((m: any) => m.user_id === userId && m.sender === 'user').length;
    }
  },

  async getUserActiveChatDaysCount(userId: string): Promise<number> {
    if (supabase) {
      const { data } = await supabase.from('chat_history').select('created_at').eq('user_id', userId).eq('sender', 'user');
      if (!data || data.length === 0) return 0;
      const days = new Set<string>();
      data.forEach((m: any) => {
        if (m.created_at) {
          try {
            days.add(new Date(m.created_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }));
          } catch (_) {
            days.add(m.created_at.slice(0, 10));
          }
        }
      });
      return days.size;
    } else {
      const data = readLocalDB();
      const days = new Set<string>();
      (data.chat_history || []).forEach((m: any) => {
        if (m.user_id === userId && m.sender === 'user' && m.created_at) {
          try {
            days.add(new Date(m.created_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }));
          } catch (_) {
            days.add(m.created_at.slice(0, 10));
          }
        }
      });
      return days.size;
    }
  },

  async getUserExamsCount(userId: string): Promise<number> {
    if (supabase) {
      const { count } = await supabase.from('exams').select('*', { count: 'exact', head: true }).eq('user_id', userId);
      return count || 0;
    } else {
      const data = readLocalDB();
      return (data.exams || []).filter((e: any) => e.user_id === userId).length;
    }
  },

  async getUserExamSubmissionsCount(userId: string): Promise<number> {
    if (supabase) {
      const { count } = await supabase.from('exam_submissions').select('*', { count: 'exact', head: true }).eq('user_id', userId);
      return count || 0;
    } else {
      const data = readLocalDB();
      return (data.exam_submissions || []).filter((s: any) => s.user_id === userId).length;
    }
  },

  async getUserFlashcardDecksCount(userId: string): Promise<number> {
    if (supabase) {
      const { count } = await supabase.from('flashcard_decks').select('*', { count: 'exact', head: true }).eq('user_id', userId);
      return count || 0;
    } else {
      const data = readLocalDB();
      return (data.flashcard_decks || []).filter((d: any) => d.user_id === userId).length;
    }
  },

  async getUserFlashcardsCount(userId: string): Promise<number> {
    if (supabase) {
      const { data: userDecks } = await supabase.from('flashcard_decks').select('id').eq('user_id', userId);
      if (!userDecks || userDecks.length === 0) return 0;
      const deckIds = userDecks.map((d: any) => d.id);
      const { count } = await supabase.from('flashcards').select('*', { count: 'exact', head: true }).in('deck_id', deckIds);
      return count || 0;
    } else {
      const data = readLocalDB();
      const userDeckIds = new Set((data.flashcard_decks || []).filter((d: any) => d.user_id === userId).map((d: any) => d.id));
      return (data.flashcards || []).filter((c: any) => userDeckIds.has(c.deck_id)).length;
    }
  },

  async recordPwaInstall(userId: string, platform?: string): Promise<boolean> {
    const cleanPlatform = (platform === 'ios' || platform === 'android' || platform === 'desktop') ? platform : 'unknown';
    const now = new Date().toISOString();
    
    // Invalidate dashboard stats cache so admin sees update immediately
    invalidateDashboardStatsCache();

    if (supabase) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            pwa_installed: true,
            pwa_installed_at: now,
            pwa_platform: cleanPlatform
          })
          .eq('id', userId);
        if (!error) return true;
        console.error('recordPwaInstall Supabase error:', error);
      } catch (err) {
        console.error('recordPwaInstall exception:', err);
      }
      return false;
    } else {
      const data = readLocalDB();
      const profile = (data.profiles || []).find((p: Profile) => p.id === userId);
      if (!profile) return false;
      profile.pwa_installed = true;
      profile.pwa_installed_at = profile.pwa_installed_at || now;
      profile.pwa_platform = cleanPlatform as any;
      writeLocalDB(data);
      return true;
    }
  },

  async setUserUnlimited(id: string, unlimited: boolean): Promise<Profile | null> {
    if (supabase) {
      const { data, error } = await supabase.from('profiles').update({ unlimited_credit: unlimited }).eq('id', id).select().single();
      if (error) return null;
      return data;
    } else {
      const data = readLocalDB();
      const profile = data.profiles.find((p: Profile) => p.id === id);
      if (!profile) return null;
      profile.unlimited_credit = unlimited;
      writeLocalDB(data);
      return profile;
    }
  },

  async deleteUser(id: string): Promise<boolean> {
    if (supabase) {
      try {
        await deleteUserMedia(id).catch(err => console.error('Error deleting user media:', err));
        await supabase.from('chat_history').delete().eq('user_id', id);
        await supabase.from('exams').delete().eq('user_id', id);
        await supabase.from('reports').delete().eq('user_id', id);
        await supabase.from('contact_messages').delete().eq('user_id', id);
        await supabase.from('payment_transactions').delete().eq('user_id', id);
        await supabase.from('account_deletions').delete().eq('user_id', id);
        await supabase.from('user_devices').delete().eq('user_id', id);
        await supabase.from('notifications').delete().eq('user_id', id);
        await supabase.from('voice_calls').delete().eq('user_id', id);
        await supabase.from('voice_usage').delete().eq('user_id', id);
      } catch (e) {
        console.warn('deleteUser related tables cleanup notice:', e);
      }
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      return !error;
    } else {
      const data = readLocalDB();
      data.profiles = (data.profiles || []).filter((p: Profile) => p.id !== id);
      if (data.chat_sessions) data.chat_sessions = data.chat_sessions.filter((s: any) => s.user_id !== id);
      if (data.chat_history) data.chat_history = data.chat_history.filter((h: any) => h.user_id !== id);
      if (data.exams) data.exams = data.exams.filter((e: any) => e.user_id !== id);
      if (data.exam_submissions) data.exam_submissions = data.exam_submissions.filter((es: any) => es.user_id !== id);
      if (data.reports) data.reports = data.reports.filter((r: any) => r.user_id !== id);
      if (data.contact_messages) data.contact_messages = data.contact_messages.filter((cm: any) => cm.user_id !== id);
      if (data.password_resets) data.password_resets = data.password_resets.filter((pr: any) => pr.user_id !== id);
      if (data.account_deletions) data.account_deletions = data.account_deletions.filter((ad: any) => ad.user_id !== id);
      if (data.flashcard_decks) data.flashcard_decks = data.flashcard_decks.filter((fd: any) => fd.user_id !== id);
      if (data.payment_transactions) data.payment_transactions = data.payment_transactions.filter((pt: any) => pt.user_id !== id);
      if (data.user_devices) data.user_devices = data.user_devices.filter((ud: any) => ud.user_id !== id);
      if (data.notifications) data.notifications = data.notifications.filter((n: any) => n.user_id !== id);
      if (data.voice_calls) data.voice_calls = data.voice_calls.filter((v: any) => v.user_id !== id);
      if (data.voice_usage) data.voice_usage = data.voice_usage.filter((v: any) => v.user_id !== id);
      writeLocalDB(data);
      return true;
    }
  },

  async addCoins(userId: string, amount: number): Promise<number> {
    const profile = await this.getProfile(userId);
    if (!profile) return 0;
    const currentCoins = profile.coins === undefined ? 50.0 : profile.coins;
    const newCoins = toPreciseCoins(currentCoins + amount);
    
    if (supabase) {
      await supabase.from('profiles').update({ coins: newCoins }).eq('id', userId);
    } else {
      const data = readLocalDB();
      const p = data.profiles.find((x: any) => x.id === userId);
      if (p) {
        p.coins = newCoins;
        writeLocalDB(data);
      }
    }
    return newCoins;
  },

  async addPoints(userId: string, amount: number): Promise<number> {
    const profile = await this.getProfile(userId);
    if (!profile) return 0;
    const currentPoints = profile.points || 0;
    const newPoints = currentPoints + amount;
    
    if (supabase) {
      const { error } = await supabase.from('profiles').update({ points: newPoints }).eq('id', userId);
      if (error) {
        console.error('addPoints update failed in Supabase:', error);
      }
    } else {
      const data = readLocalDB();
      const p = data.profiles.find((x: any) => x.id === userId);
      if (p) {
        p.points = newPoints;
        writeLocalDB(data);
      }
    }
    profile.points = newPoints;
    invalidateUserRankCache(userId);
    invalidateDailyQuestsCache(userId);
    return newPoints;
  },

  async claimWelcomeCoins(userId: string): Promise<Profile | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;
    if (profile.welcome_reward_claimed) {
      return profile;
    }
    const currentCoins = profile.coins === undefined ? 0.0 : profile.coins;
    // Exactly 20 free points upon registration: if student already has 20.0, do not add more on top
    const newCoins = currentCoins >= 20.0 ? currentCoins : toPreciseCoins(Math.min(20.0, currentCoins + 15.0));
    const updates: any = { coins: newCoins, welcome_reward_claimed: true, plan_type: profile.plan_type || 'free' };
    if (supabase) {
      try {
        const { data, error } = await supabase.from('profiles').update(updates).eq('id', userId).select().single();
        if (error) {
          const fallbackRes = await supabase.from('profiles').update({ coins: newCoins, plan_type: profile.plan_type || 'free' }).eq('id', userId).select().single();
          return fallbackRes.data || { ...profile, coins: newCoins, welcome_reward_claimed: true };
        }
        return data || { ...profile, ...updates };
      } catch (err) {
        return { ...profile, coins: newCoins, welcome_reward_claimed: true };
      }
    } else {
      const data = readLocalDB();
      const p = (data.profiles || []).find((x: any) => x.id === userId);
      if (p) {
        p.coins = newCoins;
        p.welcome_reward_claimed = true;
        p.plan_type = p.plan_type || 'free';
        writeLocalDB(data);
      }
      return { ...profile, ...updates };
    }
  },

  async subscribeFreePlan(userId: string): Promise<Profile | null> {
    const profile = await this.getProfile(userId);
    if (!profile) return null;
    if (profile.free_plan_claimed) {
      return profile;
    }
    const currentCoins = profile.coins === undefined ? 0.0 : profile.coins;
    // Free plan baseline: if student already has 20.0, do not add more on top
    const newCoins = currentCoins >= 20.0 ? currentCoins : toPreciseCoins(Math.max(currentCoins, 5.0));
    const updates: any = { coins: newCoins, free_plan_claimed: true, plan_type: 'free' as const };
    if (supabase) {
      try {
        const { data, error } = await supabase.from('profiles').update(updates).eq('id', userId).select().single();
        if (error) {
          const fallbackRes = await supabase.from('profiles').update({ coins: newCoins, plan_type: 'free' }).eq('id', userId).select().single();
          return fallbackRes.data || { ...profile, coins: newCoins, free_plan_claimed: true, plan_type: 'free' };
        }
        return data || { ...profile, ...updates };
      } catch (err) {
        return { ...profile, coins: newCoins, free_plan_claimed: true, plan_type: 'free' };
      }
    } else {
      const data = readLocalDB();
      const p = (data.profiles || []).find((x: any) => x.id === userId);
      if (p) {
        p.coins = newCoins;
        p.free_plan_claimed = true;
        p.plan_type = 'free';
        writeLocalDB(data);
      }
      return { ...profile, ...updates };
    }
  },

  async claimApologyCompensation(userId: string): Promise<{ success: boolean; profile: Profile | null; error?: string }> {
    const profile = await this.getProfile(userId);
    if (!profile) {
      return { success: false, profile: null, error: 'المستخدم غير موجود' };
    }
    if (!isExistingAccountForApology(profile)) {
      return { success: false, profile, error: 'هذا التعويض مخصص للحسابات السابقة فقط' };
    }
    if (profile.apology_compensation_claimed) {
      return { success: false, profile, error: 'تم استلام نقاط التعويض مسبقاً' };
    }

    const currentCoins = profile.coins === undefined ? 0.0 : profile.coins;
    const newCoins = toPreciseCoins(currentCoins + 15.0);
    const updates: any = {
      coins: newCoins,
      apology_compensation_claimed: true,
      apology_dismissed: true
    };

    if (supabase) {
      try {
        const { data, error } = await supabase.from('profiles').update(updates).eq('id', userId).select().single();
        if (error) {
          const fallbackRes = await supabase.from('profiles').update({ coins: newCoins }).eq('id', userId).select().single();
          return {
            success: true,
            profile: fallbackRes.data ? { ...fallbackRes.data, apology_compensation_claimed: true, apology_dismissed: true } : { ...profile, ...updates }
          };
        }
        return { success: true, profile: data || { ...profile, ...updates } };
      } catch (err) {
        return { success: true, profile: { ...profile, ...updates } };
      }
    } else {
      const data = readLocalDB();
      const p = (data.profiles || []).find((x: any) => x.id === userId);
      if (p) {
        p.coins = newCoins;
        p.apology_compensation_claimed = true;
        p.apology_dismissed = true;
        writeLocalDB(data);
      }
      return { success: true, profile: { ...profile, ...updates } };
    }
  },

  async dismissApology(userId: string): Promise<boolean> {
    const profile = await this.getProfile(userId);
    if (!profile) return false;
    if (profile.apology_dismissed) return true;

    const updates: any = { apology_dismissed: true };
    if (supabase) {
      try {
        await supabase.from('profiles').update(updates).eq('id', userId);
        return true;
      } catch (err) {
        return true;
      }
    } else {
      const data = readLocalDB();
      const p = (data.profiles || []).find((x: any) => x.id === userId);
      if (p) {
        p.apology_dismissed = true;
        writeLocalDB(data);
      }
      return true;
    }
  },

  async hasSubmittedExam(examId: string, userId?: string, deviceId?: string): Promise<boolean> {
    if (supabase) {
      let query = supabase.from('exam_submissions').select('id', { count: 'exact', head: true }).eq('exam_id', examId);
      if (userId) query = query.eq('user_id', userId);
      else if (deviceId) query = query.eq('device_id', deviceId);
      const { count } = await query;
      return (count || 0) > 0;
    } else {
      const data = readLocalDB();
      const subs = data.exam_submissions || [];
      return subs.some((s: any) => s.exam_id === examId && (userId ? s.user_id === userId : s.device_id === deviceId));
    }
  },

  async getLeaderboard(gradeLevel?: string, limit: number = 10): Promise<any[]> {
    const cacheKey = `${gradeLevel || 'all'}_${limit}`;
    const cached = cachedLeaderboardMap.get(cacheKey);
    if (cached && (Date.now() - cached.time < LEADERBOARD_CACHE_TTL_MS)) {
      return cached.data;
    }

    let results: any[] = [];
    if (supabase) {
      const { data, error } = await supabase.rpc('get_leaderboard', {
        p_grade_level: gradeLevel || null,
        p_limit: limit
      });
      if (error) {
        console.error('get_leaderboard RPC error:', error);
        return [];
      }
      results = data || [];
    } else {
      const data = readLocalDB();
      const students = data.profiles.filter((p: any) => {
        if (p.role !== 'student') return false;
        if (gradeLevel && p.grade_level !== gradeLevel) return false;
        const email = (p.email || '').toLowerCase();
        const name = (p.name || '').toLowerCase();
        if (email.includes('test') || email.includes('trial')) return false;
        if (name.includes('test') || name.includes('trial') || p.name?.includes('اختباري') || p.name?.includes('تجريبي')) return false;
        return true;
      });
      
      const stats = students.map((p: any) => {
        const userSubmissions = data.exam_submissions ? data.exam_submissions.filter((es: any) => es.user_id === p.id) : [];
        const avgAccuracy = userSubmissions.length > 0 
          ? userSubmissions.reduce((acc: number, curr: any) => acc + curr.score, 0) / userSubmissions.length
          : 0.0;
        return {
          user_id: p.id,
          name: p.name,
          grade_level: p.grade_level,
          coins: p.coins || 0,
          points: p.points || 0,
          study_streak: p.study_streak || 1,
          average_accuracy: Math.round(avgAccuracy * 100) / 100
        };
      });
      
      stats.sort((a: any, b: any) => {
        if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
        if (b.study_streak !== a.study_streak) return b.study_streak - a.study_streak;
        return b.average_accuracy - a.average_accuracy;
      });
      
      results = stats.slice(0, limit).map((s: any, idx: number) => ({
        ...s,
        rank_number: idx + 1
      }));
    }

    cachedLeaderboardMap.set(cacheKey, { data: results, time: Date.now() });
    return results;
  },

  async getUserLeaderboardRank(userId: string, gradeLevel?: string): Promise<any | null> {
    const cacheKey = `${userId}_${gradeLevel || 'all'}`;
    const existingPromise = inFlightUserRank.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    const fetchPromise = (async () => {
      let result: any = null;
      if (supabase) {
        const { data, error } = await supabase.rpc('get_user_leaderboard_rank', {
          p_user_id: userId,
          p_grade_level: gradeLevel || null
        });
        if (!error && data && data.length > 0) {
          result = data[0];
        } else {
          // Fallback: If RPC not present, compute from broader query
          const fullList = await this.getLeaderboard(gradeLevel, 500);
          const userEntry = fullList.find((s: any) => s.user_id === userId);
          if (userEntry) {
            result = {
              ...userEntry,
              is_in_top_10: userEntry.rank_number <= 10
            };
          }
        }
      } else {
        const data = readLocalDB();
        const students = data.profiles.filter((p: any) => {
          if (p.role !== 'student') return false;
          if (gradeLevel && p.grade_level !== gradeLevel) return false;
          const email = (p.email || '').toLowerCase();
          const name = (p.name || '').toLowerCase();
          if (email.includes('test') || email.includes('trial')) return false;
          if (name.includes('test') || name.includes('trial') || p.name?.includes('اختباري') || p.name?.includes('تجريبي')) return false;
          return true;
        });
        
        const stats = students.map((p: any) => {
          const userSubmissions = data.exam_submissions ? data.exam_submissions.filter((es: any) => es.user_id === p.id) : [];
          const avgAccuracy = userSubmissions.length > 0 
            ? userSubmissions.reduce((acc: number, curr: any) => acc + curr.score, 0) / userSubmissions.length
            : 0.0;
          return {
            user_id: p.id,
            name: p.name,
            grade_level: p.grade_level,
            coins: p.coins || 0,
            points: p.points || 0,
            study_streak: p.study_streak || 1,
            average_accuracy: Math.round(avgAccuracy * 100) / 100
          };
        });
        
        stats.sort((a: any, b: any) => {
          if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
          if (b.study_streak !== a.study_streak) return b.study_streak - a.study_streak;
          return b.average_accuracy - a.average_accuracy;
        });
        
        const index = stats.findIndex((s: any) => s.user_id === userId);
        if (index === -1) {
          const currentUser = data.profiles.find((p: any) => p.id === userId);
          if (!currentUser) {
            result = null;
          } else {
            result = {
              user_id: currentUser.id,
              name: currentUser.name,
              grade_level: currentUser.grade_level,
              coins: currentUser.coins || 0,
              points: currentUser.points || 0,
              study_streak: currentUser.study_streak || 1,
              average_accuracy: 0,
              rank_number: stats.length + 1,
              is_in_top_10: false
            };
          }
        } else {
          result = {
            ...stats[index],
            rank_number: index + 1,
            is_in_top_10: (index + 1) <= 10
          };
        }
      }
      return result;
    })();

    inFlightUserRank.set(cacheKey, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      inFlightUserRank.delete(cacheKey);
    }
  },

  async getFlashcardDecks(userId: string): Promise<any[]> {
    if (supabase) {
      const { data: decks, error: decksErr } = await supabase
        .from('flashcard_decks')
        .select('*')
        .eq('user_id', userId);
      
      if (decksErr || !decks) return [];

      const result = [];
      const today = new Date().toISOString();

      for (const deck of decks) {
        const { count, error: countErr } = await supabase
          .from('flashcards')
          .select('id', { count: 'exact', head: true })
          .eq('deck_id', deck.id)
          .lte('next_review_at', today);
        
        const { count: totalCount } = await supabase
          .from('flashcards')
          .select('id', { count: 'exact', head: true })
          .eq('deck_id', deck.id);

        result.push({
          ...deck,
          due_count: countErr ? 0 : (count || 0),
          total_count: totalCount || 0
        });
      }
      return result;
    } else {
      const data = readLocalDB();
      const decks = (data.flashcard_decks || []).filter((d: any) => d.user_id === userId);
      const todayStr = new Date().toISOString();
      
      return decks.map((deck: any) => {
        const cards = (data.flashcards || []).filter((c: any) => c.deck_id === deck.id);
        const dueCards = cards.filter((c: any) => c.next_review_at <= todayStr);
        return {
          ...deck,
          due_count: dueCards.length,
          total_count: cards.length
        };
      });
    }
  },

  async createFlashcardDeck(
    userId: string,
    subjectName: string,
    gradeLevel: string,
    title: string,
    cards: Omit<Flashcard, 'id' | 'deck_id' | 'box' | 'next_review_at' | 'created_at'>[]
  ): Promise<any> {
    const deckId = crypto.randomUUID();
    const today = new Date().toISOString();
    const newDeck = {
      id: deckId,
      user_id: userId,
      subject_name: subjectName,
      grade_level: gradeLevel,
      title,
      created_at: today
    };

    const newCards = cards.map(c => ({
      id: crypto.randomUUID(),
      deck_id: deckId,
      question: c.question,
      answer: c.answer,
      box: 1,
      next_review_at: today,
      created_at: today
    }));

    if (supabase) {
      const { data: deck, error: deckErr } = await supabase.from('flashcard_decks').insert(newDeck).select().single();
      if (deckErr) throw deckErr;
      
      const { error: cardsErr } = await supabase.from('flashcards').insert(newCards);
      if (cardsErr) throw cardsErr;

      return { ...deck, cards: newCards };
    } else {
      const data = readLocalDB();
      if (!data.flashcard_decks) data.flashcard_decks = [];
      if (!data.flashcards) data.flashcards = [];

      data.flashcard_decks.push(newDeck);
      data.flashcards.push(...newCards);
      writeLocalDB(data);

      return { ...newDeck, cards: newCards };
    }
  },

  async getFlashcardsDue(deckId: string, userId?: string): Promise<any[]> {
    const today = new Date().toISOString();
    if (supabase) {
      if (userId) {
        const { data: deck } = await supabase.from('flashcard_decks').select('id').eq('id', deckId).eq('user_id', userId).maybeSingle();
        if (!deck) return [];
      }
      const { data, error } = await supabase
        .from('flashcards')
        .select('*')
        .eq('deck_id', deckId)
        .lte('next_review_at', today)
        .order('created_at', { ascending: true });
      if (error) return [];
      return data || [];
    } else {
      const data = readLocalDB();
      if (userId) {
        const deck = (data.flashcard_decks || []).find((d: any) => d.id === deckId && d.user_id === userId);
        if (!deck) return [];
      }
      const cards = (data.flashcards || []).filter((c: any) => c.deck_id === deckId && c.next_review_at <= today);
      return cards.sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
    }
  },

  async reviewFlashcard(cardId: string, rating: number, userId?: string): Promise<any> {
    const intervals = [1, 2, 4, 7, 14];
    
    let card: any = null;
    if (supabase) {
      const { data } = await supabase.from('flashcards').select('*').eq('id', cardId).maybeSingle();
      card = data;
      if (card && userId) {
        const { data: deck } = await supabase.from('flashcard_decks').select('id, user_id').eq('id', card.deck_id).maybeSingle();
        if (!deck) throw new Error('Unauthorized access to flashcard');
        if (deck.user_id !== userId) {
          const profile = await this.getProfile(userId);
          if (!profile || profile.role !== 'admin') {
            throw new Error('Unauthorized access to flashcard');
          }
        }
      }
    } else {
      const data = readLocalDB();
      card = (data.flashcards || []).find((c: any) => c.id === cardId) || null;
      if (card && userId) {
        const deck = (data.flashcard_decks || []).find((d: any) => d.id === card.deck_id);
        if (!deck) throw new Error('Unauthorized access to flashcard');
        if (deck.user_id !== userId) {
          const user = (data.profiles || []).find((p: any) => p.id === userId);
          if (!user || user.role !== 'admin') {
            throw new Error('Unauthorized access to flashcard');
          }
        }
      }
    }

    if (!card) throw new Error('Flashcard not found');

    let currentBox = card.box || 1;
    let nextBox = currentBox;

    if (rating >= 4) {
      nextBox = Math.min(5, currentBox + 1);
    } else if (rating === 3) {
      nextBox = currentBox;
    } else {
      nextBox = 1;
    }

    const intervalDays = intervals[nextBox - 1];
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + intervalDays);
    const nextReviewStr = nextReview.toISOString();

    if (supabase) {
      const { data, error } = await supabase
        .from('flashcards')
        .update({ box: nextBox, next_review_at: nextReviewStr })
        .eq('id', cardId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const data = readLocalDB();
      const c = data.flashcards.find((x: any) => x.id === cardId);
      if (c) {
        c.box = nextBox;
        c.next_review_at = nextReviewStr;
        writeLocalDB(data);
      }
      return { ...card, box: nextBox, next_review_at: nextReviewStr };
    }
  },

  async getFlashcardsBySubject(userId: string, subjectName: string): Promise<{ decks: any[]; cards: any[] }> {
    if (supabase) {
      const { data: decks, error: dErr } = await supabase
        .from('flashcard_decks')
        .select('*')
        .eq('user_id', userId)
        .eq('subject_name', subjectName);
      if (dErr || !decks || decks.length === 0) return { decks: [], cards: [] };

      const deckIds = decks.map((d: any) => d.id);
      const deckTitleMap: Record<string, string> = {};
      decks.forEach((d: any) => { deckTitleMap[d.id] = d.title; });

      const { data: cards, error: cErr } = await supabase
        .from('flashcards')
        .select('*')
        .in('deck_id', deckIds)
        .order('created_at', { ascending: true });

      const cardsWithTitle = (cards || []).map((c: any) => ({
        ...c,
        deck_title: deckTitleMap[c.deck_id] || ''
      }));

      return { decks, cards: cardsWithTitle };
    } else {
      const data = readLocalDB();
      const decks = (data.flashcard_decks || []).filter((d: any) => d.user_id === userId && d.subject_name === subjectName);
      const deckIds = new Set(decks.map((d: any) => d.id));
      const deckTitleMap: Record<string, string> = {};
      decks.forEach((d: any) => { deckTitleMap[d.id] = d.title; });

      const cards = (data.flashcards || [])
        .filter((c: any) => deckIds.has(c.deck_id))
        .map((c: any) => ({ ...c, deck_title: deckTitleMap[c.deck_id] || '' }));

      return { decks, cards };
    }
  },

  async updateFlashcardDeck(deckId: string, userId: string, title: string): Promise<boolean> {
    const cleanTitle = title.trim();
    if (supabase) {
      const { error } = await supabase.from('flashcard_decks').update({ title: cleanTitle }).eq('id', deckId).eq('user_id', userId);
      return !error;
    } else {
      const data = readLocalDB();
      const deck = (data.flashcard_decks || []).find((d: any) => d.id === deckId && d.user_id === userId);
      if (!deck) return false;
      deck.title = cleanTitle;
      writeLocalDB(data);
      return true;
    }
  },

  async deleteFlashcardDeck(deckId: string, userId: string): Promise<boolean> {
    if (supabase) {
      const { data: deck } = await supabase.from('flashcard_decks').select('id').eq('id', deckId).eq('user_id', userId).maybeSingle();
      if (!deck) return false;
      const { error: cardsErr } = await supabase.from('flashcards').delete().eq('deck_id', deckId);
      const { error: deckErr } = await supabase.from('flashcard_decks').delete().eq('id', deckId).eq('user_id', userId);
      return !deckErr && !cardsErr;
    } else {
      const data = readLocalDB();
      const hasDeck = (data.flashcard_decks || []).some((d: any) => d.id === deckId && d.user_id === userId);
      if (!hasDeck) return false;
      data.flashcards = (data.flashcards || []).filter((c: any) => c.deck_id !== deckId);
      data.flashcard_decks = (data.flashcard_decks || []).filter((d: any) => !(d.id === deckId && d.user_id === userId));
      writeLocalDB(data);
      return true;
    }
  },

  async updateFlashcard(cardId: string, userId: string, question: string, answer: string): Promise<boolean> {
    if (supabase) {
      const { data: card } = await supabase.from('flashcards').select('deck_id').eq('id', cardId).maybeSingle();
      if (!card) return false;
      const { data: deck } = await supabase.from('flashcard_decks').select('id').eq('id', card.deck_id).eq('user_id', userId).maybeSingle();
      if (!deck) return false;
      const { error } = await supabase.from('flashcards').update({ question, answer }).eq('id', cardId);
      return !error;
    } else {
      const data = readLocalDB();
      const card = (data.flashcards || []).find((c: any) => c.id === cardId);
      if (!card) return false;
      const deck = (data.flashcard_decks || []).find((d: any) => d.id === card.deck_id && d.user_id === userId);
      if (!deck) return false;
      card.question = question;
      card.answer = answer;
      writeLocalDB(data);
      return true;
    }
  },

  async deleteFlashcard(cardId: string, userId: string): Promise<boolean> {
    if (supabase) {
      const { data: card } = await supabase.from('flashcards').select('deck_id').eq('id', cardId).maybeSingle();
      if (!card) return false;
      const { data: deck } = await supabase.from('flashcard_decks').select('id').eq('id', card.deck_id).eq('user_id', userId).maybeSingle();
      if (!deck) return false;
      const { error } = await supabase.from('flashcards').delete().eq('id', cardId);
      return !error;
    } else {
      const data = readLocalDB();
      const card = (data.flashcards || []).find((c: any) => c.id === cardId);
      if (!card) return false;
      const deck = (data.flashcard_decks || []).find((d: any) => d.id === card.deck_id && d.user_id === userId);
      if (!deck) return false;
      data.flashcards = (data.flashcards || []).filter((c: any) => c.id !== cardId);
      writeLocalDB(data);
      return true;
    }
  },

  // Payment Transactions
  async createPaymentTransaction(tx: Omit<PaymentTransaction, 'id' | 'created_at' | 'updated_at'>): Promise<PaymentTransaction> {
    const newTx: PaymentTransaction = {
      id: crypto.randomUUID(),
      ...tx,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase.from('payment_transactions').insert(newTx).select().single();
      if (error) {
        // Fallback if table doesn't exist yet: return newTx in memory
        console.warn('Supabase payment insert warning:', error.message);
        return newTx;
      }
      return data;
    } else {
      const data = readLocalDB();
      data.payment_transactions = data.payment_transactions || [];
      data.payment_transactions.push(newTx);
      writeLocalDB(data);
      return newTx;
    }
  },

  async getPaymentTransactionByOrderId(orderId: string): Promise<PaymentTransaction | null> {
    if (supabase) {
      const { data, error } = await supabase.from('payment_transactions').select('*').eq('order_id', orderId).maybeSingle();
      if (error || !data) return null;
      return data;
    } else {
      const data = readLocalDB();
      return (data.payment_transactions || []).find((t: PaymentTransaction) => t.order_id === orderId) || null;
    }
  },

  async updatePaymentTransactionStatus(
    orderId: string,
    status: 'pending' | 'success' | 'failed' | 'refunded',
    transactionId?: string | null,
    paymentMethod?: string | null,
    rawResponse?: any
  ): Promise<PaymentTransaction | null> {
    const now = new Date().toISOString();
    const updatePayload: any = { status, updated_at: now };
    if (transactionId !== undefined) updatePayload.transaction_id = transactionId;
    if (paymentMethod !== undefined) updatePayload.payment_method = paymentMethod;
    if (rawResponse !== undefined) updatePayload.raw_response = rawResponse;

    if (supabase) {
      const { data, error } = await supabase
        .from('payment_transactions')
        .update(updatePayload)
        .eq('order_id', orderId)
        .select()
        .maybeSingle();
      if (error) {
        console.warn('Supabase payment update warning:', error.message);
        return null;
      }
      return data;
    } else {
      const data = readLocalDB();
      const tx = (data.payment_transactions || []).find((t: PaymentTransaction) => t.order_id === orderId);
      if (!tx) return null;
      Object.assign(tx, updatePayload);
      writeLocalDB(data);
      return tx;
    }
  },

  async activateSubscription(userId: string, planId: string, orderId?: string): Promise<{ success: boolean; profile?: Profile | null }> {
    const profile = await this.getProfile(userId);
    if (!profile) return { success: false };

    const planInfo = normalizePlanId(planId);
    const dailyCap = planInfo.dailyCap;
    const planTitle = planInfo.planTitle;
    const planType = planInfo.planType;
    const durationDays = planInfo.durationDays;

    const currentCoins = profile.coins ?? 0.0;
    const newCoins = toPreciseCoins(Math.max(currentCoins, dailyCap));
    const today = getCairoDateString();
    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    const subscriptionPayload = {
      plan_type: planType,
      subscription_status: 'active' as const,
      subscription_start_date: startDate,
      subscription_end_date: endDate,
      subscription_plan_id: planType,
      coins: newCoins,
      last_active_date: today
    };

    // Upgrade profile to active package
    if (supabase) {
      const { error } = await supabase.from('profiles').update(subscriptionPayload).eq('id', userId);
      if (error) {
        const { subscription_status, subscription_start_date, subscription_end_date, subscription_plan_id, ...basePayload } = subscriptionPayload;
        await supabase.from('profiles').update(basePayload).eq('id', userId);
      }
    } else {
      const data = readLocalDB();
      const p = (data.profiles || []).find((x: Profile) => x.id === userId);
      if (p) {
        Object.assign(p, subscriptionPayload);
        writeLocalDB(data);
      }
    }
    await this.resetMeteringTerm(userId);

    // Create in-app confirmation notification for subscriber
    try {
      await this.createNotification({
        user_id: userId,
        title: 'تم تفعيل اشتراكك بنجاح',
        body: `تهانينا! تم تفعيل ${planTitle} وضبط رصيدك إلى ${newCoins} نقطة تتجدد يومياً لمدة ${durationDays} يوماً. استمتع بميزات المساعد الذكي غير المحدودة.`,
        type: 'success',
        target: 'both'
      });
    } catch {
      // Non-blocking
    }

    const updatedProfile = await this.getProfile(userId);
    if (updatedProfile) {
      updatedProfile.subscription_status = 'active';
      updatedProfile.subscription_start_date = updatedProfile.subscription_start_date || startDate;
      updatedProfile.subscription_end_date = updatedProfile.subscription_end_date || endDate;
      updatedProfile.subscription_plan_id = updatedProfile.subscription_plan_id || planType;
    }
    return { success: true, profile: updatedProfile };
  },

  async checkAndRecordTrialGrant(params: {
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    browserFingerprint?: string;
    deviceId?: string;
    platform?: 'web' | 'mobile';
    hasRegisteredBefore?: boolean;
  }): Promise<{ isAbuse: boolean; coins: number }> {
    const { userId, ipAddress, userAgent, browserFingerprint, deviceId, platform = 'web', hasRegisteredBefore } = params;

    const cleanIp = (ipAddress && ipAddress !== 'unknown' && ipAddress !== '127.0.0.1' && ipAddress !== '::1' && ipAddress.length > 3) ? ipAddress.trim() : null;
    const cleanFp = (browserFingerprint && browserFingerprint.trim() !== '') ? browserFingerprint.trim() : null;
    const cleanDev = (deviceId && deviceId.trim() !== '') ? deviceId.trim() : null;

    let isAbuse = false;
    if (hasRegisteredBefore) {
      isAbuse = true;
    }

    if (supabase) {
      try {
        const filters: string[] = [];
        if (cleanIp) filters.push(`ip_address.eq.${cleanIp}`);
        if (cleanFp) filters.push(`browser_fingerprint.eq.${cleanFp}`);
        if (cleanDev) filters.push(`device_id.eq.${cleanDev}`);

        if (filters.length > 0) {
          const { data: matchedGrants } = await supabase.from('free_trial_grants').select('*').or(filters.join(','));
          if (matchedGrants && matchedGrants.length > 0) {
            const otherUserGrant = matchedGrants.find((g: any) => g.user_id && g.user_id !== userId);
            if (otherUserGrant) {
              isAbuse = true;
            }
          }
        }
      } catch (err) {
        console.error('Error checking trial abuse in Supabase:', err);
      }
    } else {
      const data = readLocalDB();
      if (!data.free_trial_grants) data.free_trial_grants = [];
      const matched = data.free_trial_grants.find((g: FreeTrialGrant) => {
        if (g.user_id === userId) return false;
        if (cleanIp && g.ip_address === cleanIp) return true;
        if (cleanFp && g.browser_fingerprint === cleanFp) return true;
        if (cleanDev && g.device_id === cleanDev) return true;
        return false;
      });
      if (matched) {
        isAbuse = true;
      }
    }

    const coinsToGrant = 20.0;

    // Record grant attempt
    try {
      const grantRecord: FreeTrialGrant = {
        id: crypto.randomUUID(),
        user_id: userId,
        ip_address: cleanIp || undefined,
        user_agent: userAgent ? userAgent.substring(0, 500) : undefined,
        browser_fingerprint: cleanFp || undefined,
        device_id: cleanDev || undefined,
        platform,
        coins_granted: coinsToGrant,
        created_at: new Date().toISOString()
      };

      if (supabase) {
        await supabase.from('free_trial_grants').insert(grantRecord);
      } else {
        const data = readLocalDB();
        if (!data.free_trial_grants) data.free_trial_grants = [];
        data.free_trial_grants.push(grantRecord);
        writeLocalDB(data);
      }
    } catch (err) {
      console.error('Error recording trial grant:', err);
    }

    return { isAbuse, coins: coinsToGrant };
  },

  async getUserActiveDevices(userId: string): Promise<UserDevice[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('user_devices')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('last_active_at', { ascending: false });
        if (!error && data) return data;
      } catch (err) {
        console.error('Error fetching user active devices from Supabase:', err);
      }
      return [];
    } else {
      const data = readLocalDB();
      return (data.user_devices || [])
        .filter((d: UserDevice) => d.user_id === userId && d.is_active)
        .sort((a: UserDevice, b: UserDevice) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime());
    }
  },

  async getActiveDevicesByUser(userIds: string[]): Promise<Map<string, UserDevice[]>> {
    const byUser = new Map<string, UserDevice[]>();
    if (userIds.length === 0) return byUser;
    let rows: UserDevice[] = [];
    if (supabase) {
      for (let i = 0; i < userIds.length; i += 300) {
        const { data } = await supabase
          .from('user_devices')
          .select('*')
          .in('user_id', userIds.slice(i, i + 300))
          .eq('is_active', true)
          .order('last_active_at', { ascending: false });
        if (data) rows = rows.concat(data);
      }
    } else {
      const ids = new Set(userIds);
      rows = (readLocalDB().user_devices || [])
        .filter((d: UserDevice) => ids.has(d.user_id) && d.is_active)
        .sort((a: UserDevice, b: UserDevice) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime());
    }
    for (const d of rows) {
      const list = byUser.get(d.user_id);
      if (list) list.push(d); else byUser.set(d.user_id, [d]);
    }
    return byUser;
  },

  async getUserDeviceCount(userId: string): Promise<number> {
    const devices = await this.getUserActiveDevices(userId);
    return devices.length;
  },

  async registerUserDevice(params: {
    userId: string;
    deviceId?: string;
    sessionToken?: string;
    userAgent?: string;
    ipAddress?: string;
    browserFingerprint?: string;
    platform?: 'web' | 'mobile';
    deviceName?: string;
  }): Promise<{
    success: boolean;
    activeCount: number;
    devicesRevoked: boolean;
    device: UserDevice;
    activeDevices: UserDevice[];
  }> {
    const { userId, deviceId, sessionToken, userAgent, ipAddress, browserFingerprint, platform, deviceName } = params;
    const cleanDeviceId = (deviceId && deviceId.trim()) || `dev_${Math.random().toString(36).substring(2, 14)}`;
    const resolvedName = deviceName || (platform === 'mobile' ? 'تطبيق الهاتف (EGS AI Mobile)' : 'متصفح الويب (EGS AI Web)');
    const resolvedType: 'web' | 'mobile' | 'tablet' | 'desktop' = platform === 'mobile' ? 'mobile' : 'web';
    const nowIso = new Date().toISOString();

    let existingActiveDevices: UserDevice[] = [];
    let devicesRevoked = false;

    if (supabase) {
      try {
        const { data: activeRows } = await supabase
          .from('user_devices')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true);
        existingActiveDevices = activeRows || [];
      } catch (err) {
        console.error('Error fetching active devices from Supabase:', err);
      }
    } else {
      const data = readLocalDB();
      if (!data.user_devices) data.user_devices = [];
      existingActiveDevices = data.user_devices.filter((d: UserDevice) => d.user_id === userId && d.is_active);
    }

    const existingDevice = existingActiveDevices.find(d => d.device_id === cleanDeviceId);

    let targetDevice: UserDevice;

    if (existingDevice) {
      // Re-activating / refreshing an already active device
      targetDevice = {
        ...existingDevice,
        session_token: sessionToken || existingDevice.session_token,
        device_name: resolvedName,
        device_type: resolvedType,
        browser_fingerprint: browserFingerprint || existingDevice.browser_fingerprint,
        ip_address: ipAddress || existingDevice.ip_address,
        user_agent: userAgent ? userAgent.substring(0, 500) : existingDevice.user_agent,
        is_active: true,
        last_active_at: nowIso
      };

      if (supabase) {
        try {
          await supabase.from('user_devices').upsert(targetDevice, { onConflict: 'user_id,device_id' });
        } catch (err) {
          console.error('Error updating existing user device in Supabase:', err);
        }
      } else {
        const data = readLocalDB();
        if (!data.user_devices) data.user_devices = [];
        const idx = data.user_devices.findIndex((d: UserDevice) => d.user_id === userId && d.device_id === cleanDeviceId);
        if (idx !== -1) {
          data.user_devices[idx] = targetDevice;
        } else {
          data.user_devices.push(targetDevice);
        }
        writeLocalDB(data);
      }
    } else {
      // New device! If already at 3 active devices, enforce strict limit:
      // Revoke all previous devices, so only this 1 new device is logged in (ensuring <= 3).
      if (existingActiveDevices.length >= 3) {
        devicesRevoked = true;
        if (supabase) {
          try {
            await supabase
              .from('user_devices')
              .update({ is_active: false })
              .eq('user_id', userId);
          } catch (err) {
            console.error('Error revoking previous user devices in Supabase:', err);
          }
        } else {
          const data = readLocalDB();
          if (!data.user_devices) data.user_devices = [];
          data.user_devices.forEach((d: UserDevice) => {
            if (d.user_id === userId) {
              d.is_active = false;
            }
          });
          writeLocalDB(data);
        }
      }

      targetDevice = {
        id: crypto.randomUUID(),
        user_id: userId,
        device_id: cleanDeviceId,
        session_token: sessionToken,
        device_name: resolvedName,
        device_type: resolvedType,
        browser_fingerprint: browserFingerprint,
        ip_address: ipAddress,
        user_agent: userAgent ? userAgent.substring(0, 500) : undefined,
        is_active: true,
        last_active_at: nowIso,
        created_at: nowIso
      };

      if (supabase) {
        try {
          await supabase.from('user_devices').upsert(targetDevice, { onConflict: 'user_id,device_id' });
        } catch (err) {
          console.error('Error inserting new user device in Supabase:', err);
        }
      } else {
        const data = readLocalDB();
        if (!data.user_devices) data.user_devices = [];
        const idx = data.user_devices.findIndex((d: UserDevice) => d.user_id === userId && d.device_id === cleanDeviceId);
        if (idx !== -1) {
          data.user_devices[idx] = targetDevice;
        } else {
          data.user_devices.push(targetDevice);
        }
        writeLocalDB(data);
      }
    }

    const updatedActiveList = await this.getUserActiveDevices(userId);
    return {
      success: true,
      activeCount: updatedActiveList.length,
      devicesRevoked,
      device: targetDevice,
      activeDevices: updatedActiveList
    };
  },

  async validateUserSessionDevice(userId: string, sessionToken?: string, deviceId?: string): Promise<{ valid: boolean; reason?: string }> {
    let devices: UserDevice[] = [];
    if (supabase) {
      try {
        const { data } = await supabase
          .from('user_devices')
          .select('device_id, session_token, is_active')
          .eq('user_id', userId);
        devices = (data || []) as UserDevice[];
      } catch (err) {
        console.error('Error validating device session in Supabase:', err);
        return { valid: true };
      }
    } else {
      const data = readLocalDB();
      devices = (data.user_devices || []).filter((d: UserDevice) => d.user_id === userId);
    }

    // If user has no device records yet (existing legacy session), allow gracefully
    if (devices.length === 0) {
      return { valid: true };
    }

    // Check if matching session token or deviceId is revoked
    const matchedByToken = sessionToken ? devices.find(d => d.session_token === sessionToken) : undefined;
    const matchedByDevId = deviceId ? devices.find(d => d.device_id === deviceId) : undefined;
    const matched = matchedByToken || matchedByDevId;

    if (matched) {
      if (!matched.is_active) {
        return { valid: false, reason: 'device_session_revoked' };
      }
      this.updateDeviceActivity(userId, matched.device_id).catch(() => {});
      return { valid: true };
    }

    // If not matched but active count < 3, allow
    const activeCount = devices.filter(d => d.is_active).length;
    if (activeCount < 3) {
      return { valid: true };
    }

    return { valid: false, reason: 'device_limit_exceeded' };
  },

  async updateDeviceActivity(userId: string, deviceId: string): Promise<void> {
    const key = `${userId}:${deviceId}`;
    const now = Date.now();
    if (now - (deviceActivityWrites.get(key) || 0) < DEVICE_ACTIVITY_WRITE_INTERVAL_MS) return;
    deviceActivityWrites.set(key, now);
    if (deviceActivityWrites.size > 20000) deviceActivityWrites.clear();
    const nowIso = new Date(now).toISOString();
    if (supabase) {
      try {
        await supabase
          .from('user_devices')
          .update({ last_active_at: nowIso })
          .eq('user_id', userId)
          .eq('device_id', deviceId);
      } catch (err) {}
    } else {
      const data = readLocalDB();
      if (data.user_devices) {
        const dev = data.user_devices.find((d: UserDevice) => d.user_id === userId && d.device_id === deviceId);
        if (dev) {
          dev.last_active_at = nowIso;
          writeLocalDB(data);
        }
      }
    }
  },

  async deactivateUserDevice(userId: string, deviceId: string): Promise<boolean> {
    if (supabase) {
      try {
        const { error } = await supabase
          .from('user_devices')
          .update({ is_active: false })
          .eq('user_id', userId)
          .eq('device_id', deviceId);
        return !error;
      } catch (err) {
        return false;
      }
    } else {
      const data = readLocalDB();
      if (data.user_devices) {
        const dev = data.user_devices.find((d: UserDevice) => d.user_id === userId && d.device_id === deviceId);
        if (dev) {
          dev.is_active = false;
          writeLocalDB(data);
          return true;
        }
      }
      return false;
    }
  },

  async deactivateAllOtherDevices(userId: string, currentDeviceId: string): Promise<boolean> {
    if (supabase) {
      try {
        const { error } = await supabase
          .from('user_devices')
          .update({ is_active: false })
          .eq('user_id', userId)
          .neq('device_id', currentDeviceId);
        return !error;
      } catch (err) {
        return false;
      }
    } else {
      const data = readLocalDB();
      if (data.user_devices) {
        data.user_devices.forEach((d: UserDevice) => {
          if (d.user_id === userId && d.device_id !== currentDeviceId) {
            d.is_active = false;
          }
        });
        writeLocalDB(data);
        return true;
      }
      return false;
    }
  },

  async deactivateAllUserDevices(userId: string): Promise<boolean> {
    if (supabase) {
      try {
        const { error } = await supabase
          .from('user_devices')
          .update({ is_active: false })
          .eq('user_id', userId);
        return !error;
      } catch (err) {
        return false;
      }
    } else {
      const data = readLocalDB();
      if (data.user_devices) {
        data.user_devices.forEach((d: UserDevice) => {
          if (d.user_id === userId) {
            d.is_active = false;
          }
        });
        writeLocalDB(data);
        return true;
      }
      return false;
    }
  },

  // ─── Curriculum Syllabus Progress & Mastery ─────────────────────────────────

  async getUserLessonProgress(userId: string, subjectName?: string, gradeLevel?: string): Promise<UserLessonProgress[]> {
    if (supabase) {
      try {
        let query = supabase.from('user_lesson_progress').select('*').eq('user_id', userId);
        if (subjectName) query = query.eq('subject_name', subjectName);
        if (gradeLevel) query = query.eq('grade_level', gradeLevel);
        const { data, error } = await query;
        if (!error && data) return data;
      } catch (err) {
        console.error('Error fetching user_lesson_progress from Supabase:', err);
      }
      return [];
    } else {
      const data = readLocalDB();
      return (data.user_lesson_progress || []).filter((p: UserLessonProgress) => {
        if (p.user_id !== userId) return false;
        if (subjectName && p.subject_name !== subjectName) return false;
        if (gradeLevel && p.grade_level !== gradeLevel) return false;
        return true;
      });
    }
  },

  async toggleLessonCompletion(params: {
    userId: string;
    gradeLevel: string;
    subjectName: string;
    unitId: string;
    lessonId: string;
    completed: boolean;
    quizScore?: number;
  }): Promise<boolean> {
    const { userId, gradeLevel, subjectName, unitId, lessonId, completed, quizScore } = params;
    const nowIso = new Date().toISOString();

    if (supabase) {
      try {
        if (completed) {
          const { error } = await supabase.from('user_lesson_progress').upsert({
            user_id: userId,
            grade_level: gradeLevel,
            subject_name: subjectName,
            unit_id: unitId,
            lesson_id: lessonId,
            status: 'completed',
            quiz_score: quizScore ?? null,
            completed_at: nowIso
          }, { onConflict: 'user_id,subject_name,lesson_id' });
          return !error;
        } else {
          const { error } = await supabase.from('user_lesson_progress')
            .delete()
            .eq('user_id', userId)
            .eq('subject_name', subjectName)
            .eq('lesson_id', lessonId);
          return !error;
        }
      } catch (err) {
        console.error('Error updating user_lesson_progress in Supabase:', err);
        return false;
      }
    } else {
      const data = readLocalDB();
      if (!data.user_lesson_progress) data.user_lesson_progress = [];
      const idx = data.user_lesson_progress.findIndex(
        (p: UserLessonProgress) => p.user_id === userId && p.subject_name === subjectName && p.lesson_id === lessonId
      );

      if (completed) {
        const item: UserLessonProgress = {
          user_id: userId,
          grade_level: gradeLevel,
          subject_name: subjectName,
          unit_id: unitId,
          lesson_id: lessonId,
          status: 'completed',
          quiz_score: quizScore,
          completed_at: nowIso
        };
        if (idx >= 0) {
          data.user_lesson_progress[idx] = item;
        } else {
          data.user_lesson_progress.push(item);
        }
      } else if (idx >= 0) {
        data.user_lesson_progress.splice(idx, 1);
      }
      writeLocalDB(data);
      return true;
    }
  },

  // ─── Smart Study Notebook (Formula & Definition Vault) ──────────────────────

  async getStudyNotebook(userId: string, subjectName?: string): Promise<StudyNotebookItem[]> {
    if (supabase) {
      try {
        let query = supabase.from('study_notebook').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (subjectName) query = query.eq('subject_name', subjectName);
        const { data, error } = await query;
        if (!error && Array.isArray(data) && data.length > 0) {
          return data;
        }
      } catch (err) {
        console.error('Error fetching study_notebook from Supabase:', err);
      }
    }

    // Check local disk DB if Supabase is disabled, threw error, or returned empty
    try {
      const data = readLocalDB();
      const rawNotes: StudyNotebookItem[] = (data.study_notebook || [])
        .filter((n: StudyNotebookItem) => n.user_id === userId && (!subjectName || n.subject_name === subjectName));

      // Backfill session_id & message_id from chat_history if missing
      const history: ChatMessage[] = data.chat_history || [];
      const notes = rawNotes.map((n: StudyNotebookItem) => {
        if (!n.session_id && history.length > 0) {
          const match = history.find(ch => 
            ch.user_id === userId &&
            ch.sender === 'ai' &&
            ch.message &&
            (ch.message === n.content || ch.message.includes(n.content.trim().slice(0, 50)) || n.content.includes(ch.message.trim().slice(0, 50)))
          );
          if (match) {
            return {
              ...n,
              session_id: match.session_id || null,
              message_id: match.id || null
            };
          }
        }
        return n;
      });

      return notes.sort((a: StudyNotebookItem, b: StudyNotebookItem) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } catch (localErr) {
      console.error('Error reading study notebook from local DB:', localErr);
      return [];
    }
  },

  async createStudyNote(params: {
    userId: string;
    subjectName: string;
    gradeLevel: string;
    title: string;
    content: string;
    noteType?: 'formula' | 'definition' | 'solution' | 'law' | 'general';
    sessionId?: string | null;
    messageId?: string | null;
  }): Promise<StudyNotebookItem> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const nowIso = new Date().toISOString();
    const validSessionId = (params.sessionId && uuidRegex.test(params.sessionId)) ? params.sessionId : null;

    const item: StudyNotebookItem = {
      id,
      user_id: params.userId,
      subject_name: params.subjectName,
      grade_level: params.gradeLevel,
      title: params.title.trim(),
      content: params.content.trim(),
      note_type: params.noteType || 'formula',
      session_id: validSessionId,
      message_id: params.messageId || null,
      created_at: nowIso
    };

    if (supabase) {
      try {
        const { data, error } = await supabase.from('study_notebook').insert(item).select().single();
        if (error && (error.code === '23503' || (error.message && (error.message.includes('foreign key') || error.message.includes('session_id') || error.message.includes('message_id'))))) {
          // Retry without session_id in case foreign key or schema mismatch caused failure
          const fallbackItem = { ...item, session_id: null, message_id: null };
          const retry = await supabase.from('study_notebook').insert(fallbackItem).select().single();
          if (!retry.error && retry.data) {
            return retry.data;
          }
        } else if (!error && data) {
          return data;
        } else if (error) {
          console.error('Error saving study_notebook item in Supabase:', error);
        }
      } catch (err) {
        console.error('Exception saving study_notebook item in Supabase:', err);
      }
    }

    // Always ensure local disk store is updated as primary or fallback
    try {
      const data = readLocalDB();
      if (!data.study_notebook) data.study_notebook = [];
      data.study_notebook = data.study_notebook.filter((n: StudyNotebookItem) => n.id !== item.id);
      data.study_notebook.unshift(item);
      writeLocalDB(data);
    } catch (localErr) {
      console.error('Error persisting study note to local DB:', localErr);
    }

    return item;
  },

  async deleteStudyNote(noteId: string, userId: string): Promise<boolean> {
    let success = false;
    if (supabase) {
      try {
        const { error } = await supabase.from('study_notebook').delete().eq('id', noteId).eq('user_id', userId);
        if (!error) success = true;
      } catch (err) {
        console.error('Error deleting study_notebook item from Supabase:', err);
      }
    }

    try {
      const data = readLocalDB();
      if (data.study_notebook) {
        const initialLen = data.study_notebook.length;
        data.study_notebook = data.study_notebook.filter((n: StudyNotebookItem) => !(n.id === noteId && n.user_id === userId));
        if (data.study_notebook.length !== initialLen) {
          writeLocalDB(data);
          success = true;
        }
      }
    } catch (localErr) {
      console.error('Error deleting study note from local DB:', localErr);
    }

    return success;
  },

  // ─── Daily Quests & Habit Formation System ──────────────────────────────────

  async getDailyQuests(userId: string, knownProfile?: Profile | null): Promise<DailyQuestProgress> {
    const existingPromise = inFlightDailyQuests.get(userId);
    if (existingPromise) {
      return existingPromise;
    }

    const fetchPromise = (async () => {
      const todayCairo = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      const profile = knownProfile ?? await this.getProfile(userId);
      const streakDays = profile?.study_streak || 1;

      // Check today's user activity
      let chatCountToday = 0;
      let examsCountToday = 0;
      let claimedQuestIds: string[] = [];

      if (supabase) {
        try {
          const [msgRes, subRes, claimedRes] = await Promise.all([
            supabase.from('chat_history')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId)
              .eq('sender', 'user')
              .gte('created_at', `${todayCairo}T00:00:00+02:00`),
            supabase.from('exam_submissions')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId)
              .gte('submitted_at', `${todayCairo}T00:00:00+02:00`),
            supabase.from('claimed_daily_quests')
              .select('quest_id')
              .eq('user_id', userId)
              .eq('date', todayCairo)
          ]);

          chatCountToday = msgRes.count || 0;
          examsCountToday = subRes.count || 0;
          if (claimedRes.data && Array.isArray(claimedRes.data)) {
            claimedQuestIds = claimedRes.data.map((c: any) => c.quest_id);
          } else {
            // Fallback to local store if claimed_daily_quests table is not yet migrated in Supabase
            const data = readLocalDB();
            const claimedList = (data.claimed_daily_quests || []).filter(
              (c: any) => c.user_id === userId && c.date === todayCairo
            );
            claimedQuestIds = claimedList.map((c: any) => c.quest_id);
          }
        } catch (err) {
          const data = readLocalDB();
          const claimedList = (data.claimed_daily_quests || []).filter(
            (c: any) => c.user_id === userId && c.date === todayCairo
          );
          claimedQuestIds = claimedList.map((c: any) => c.quest_id);
        }
      } else {
        const data = readLocalDB();
        chatCountToday = (data.chat_history || []).filter(
          (m: any) => m.user_id === userId && m.sender === 'user' && (m.created_at || '').startsWith(todayCairo)
        ).length;
        examsCountToday = (data.exam_submissions || []).filter(
          (s: any) => s.user_id === userId && (s.submitted_at || '').startsWith(todayCairo)
        ).length;
        const claimedList = (data.claimed_daily_quests || []).filter(
          (c: any) => c.user_id === userId && c.date === todayCairo
        );
        claimedQuestIds = claimedList.map((c: any) => c.quest_id);
      }

      // Calculate quest targets and progress
      const quest1Current = Math.min(1, chatCountToday >= 1 ? 1 : 0);
      const quest2Current = Math.min(3, chatCountToday >= 2 ? 3 : chatCountToday);
      const quest3Current = Math.min(1, examsCountToday >= 1 ? 1 : (chatCountToday >= 3 ? 1 : 0));

      const quests: DailyQuestItem[] = [
        {
          id: 'quest_interactive_quiz',
          title: 'حل سؤال تفاعلي أو مسألة في المنهج',
          description: 'اطرح سؤالاً على المساعد الذكي أو أجب على سؤال تفاعلي سريع',
          icon: 'Sparkles',
          target: 1,
          current: quest1Current,
          completed: quest1Current >= 1,
          rewardPoints: 2,
          claimed: claimedQuestIds.includes('quest_interactive_quiz')
        },
        {
          id: 'quest_concept_review',
          title: 'مراجعة 3 مفاهيم أو كروت ذكية',
          description: 'راجع المفاهيم في المدرب الذكي أو تصفح دروس المنهج',
          icon: 'Brain',
          target: 3,
          current: quest2Current,
          completed: quest2Current >= 3,
          rewardPoints: 3,
          claimed: claimedQuestIds.includes('quest_concept_review')
        },
        {
          id: 'quest_exam_challenge',
          title: 'خوض اختبار أو حل مسألة بوكليت',
          description: 'قدم اختباراً تقييمياً ذكياً أو حل مسألة معقدة بالخطوات',
          icon: 'FileText',
          target: 1,
          current: quest3Current,
          completed: quest3Current >= 1,
          rewardPoints: 5,
          claimed: claimedQuestIds.includes('quest_exam_challenge')
        }
      ];

      const allCompleted = quests.every(q => q.completed);

      const result: DailyQuestProgress = {
        date: todayCairo,
        quests,
        allCompleted,
        streakDays
      };

      return result;
    })();

    inFlightDailyQuests.set(userId, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      inFlightDailyQuests.delete(userId);
    }
  },

  async claimDailyQuestReward(userId: string, questId: string): Promise<{ success: boolean; pointsAwarded: number; totalPoints: number }> {
    const todayCairo = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
    const progress = await this.getDailyQuests(userId);
    const quest = progress.quests.find(q => q.id === questId);

    if (!quest) {
      throw new Error('المهمة المطلوبة غير صالحة');
    }
    if (!quest.completed) {
      throw new Error('لم تكتمل شروط هذه المهمة بعد');
    }
    if (quest.claimed) {
      throw new Error('تم استلام مكافأة هذه المهمة اليوم بالفعل');
    }

    // Award points
    const pointsAwarded = quest.rewardPoints;
    const totalPoints = await this.addPoints(userId, pointsAwarded);

    // Record claim in Supabase or local store
    if (supabase) {
      try {
        const { error } = await supabase.from('claimed_daily_quests').insert({
          user_id: userId,
          date: todayCairo,
          quest_id: questId,
          claimed_at: new Date().toISOString()
        });
        if (error) {
          const data = readLocalDB();
          if (!data.claimed_daily_quests) data.claimed_daily_quests = [];
          data.claimed_daily_quests.push({
            user_id: userId,
            date: todayCairo,
            quest_id: questId,
            claimed_at: new Date().toISOString()
          });
          writeLocalDB(data);
        }
      } catch (e) {
        const data = readLocalDB();
        if (!data.claimed_daily_quests) data.claimed_daily_quests = [];
        data.claimed_daily_quests.push({
          user_id: userId,
          date: todayCairo,
          quest_id: questId,
          claimed_at: new Date().toISOString()
        });
        writeLocalDB(data);
      }
    } else {
      const data = readLocalDB();
      if (!data.claimed_daily_quests) data.claimed_daily_quests = [];
      data.claimed_daily_quests.push({
        user_id: userId,
        date: todayCairo,
        quest_id: questId,
        claimed_at: new Date().toISOString()
      });
      writeLocalDB(data);
    }

    invalidateDailyQuestsCache(userId);
    invalidateUserRankCache(userId);

    return { success: true, pointsAwarded, totalPoints };

  },

  // Voice Tutor usage: Supabase table `voice_usage`, local store when it is unavailable or not yet migrated
  async getVoiceUsage(userId: string, date: string): Promise<VoiceUsageRow | null> {
    if (supabase) {
      const { data, error } = await supabase.from('voice_usage').select('*').eq('user_id', userId).eq('date', date).maybeSingle();
      if (!error) return (data as VoiceUsageRow) || null;
    }
    const local = readLocalDB();
    return (local.voice_usage || []).find((r: VoiceUsageRow) => r.user_id === userId && r.date === date) || null;
  },

  async saveVoiceUsage(row: VoiceUsageRow): Promise<void> {
    const record = { ...row, updated_at: new Date().toISOString() };
    if (supabase) {
      const { error } = await supabase.from('voice_usage').upsert(record, { onConflict: 'user_id,date' });
      if (!error) return;
    }
    const local = readLocalDB();
    const rows: VoiceUsageRow[] = local.voice_usage || [];
    const i = rows.findIndex(r => r.user_id === row.user_id && r.date === row.date);
    if (i >= 0) rows[i] = record; else rows.push(record);
    local.voice_usage = rows;
    writeLocalDB(local);
  },

  // Voice Tutor call logs (admin conversation viewer): Supabase `voice_calls`, local store as fallback
  async createVoiceCall(call: VoiceCallRow): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from('voice_calls').insert(call);
      if (!error) return;
    }
    const local = readLocalDB();
    local.voice_calls = [...(local.voice_calls || []), call];
    writeLocalDB(local);
  },

  async updateVoiceCall(callId: string, userId: string, change: (call: VoiceCallRow) => Partial<VoiceCallRow>): Promise<boolean> {
    if (supabase) {
      const { data, error } = await supabase.from('voice_calls').select('*').eq('id', callId).eq('user_id', userId).maybeSingle();
      if (!error) {
        if (!data) return false;
        const { error: updateError } = await supabase.from('voice_calls').update(change(data as VoiceCallRow)).eq('id', callId).eq('user_id', userId);
        if (!updateError) return true;
      }
    }
    const local = readLocalDB();
    const call = (local.voice_calls || []).find((c: VoiceCallRow) => c.id === callId && c.user_id === userId);
    if (!call) return false;
    Object.assign(call, change(call));
    writeLocalDB(local);
    return true;
  },

  async getVoiceCalls(userId: string): Promise<VoiceCallRow[]> {
    if (supabase) {
      const { data, error } = await supabase.from('voice_calls').select('*').eq('user_id', userId).order('started_at', { ascending: false }).limit(100);
      if (!error) return (data as VoiceCallRow[]) || [];
    }
    const local = readLocalDB();
    return (local.voice_calls || [])
      .filter((c: VoiceCallRow) => c.user_id === userId)
      .sort((a: VoiceCallRow, b: VoiceCallRow) => b.started_at.localeCompare(a.started_at))
      .slice(0, 100);
  }
};

