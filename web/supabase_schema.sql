-- Database schema for EGS AI (v2 — Advanced RAG with pgvector + Hybrid Search)
-- Run this in your Supabase SQL Editor to set up the database tables

-- ─── STEP 0: Enable pgvector extension ───────────────────────────────────────
-- Required for semantic vector search. Available by default in Supabase.
CREATE EXTENSION IF NOT EXISTS vector;

-- Clean slate: Drop existing tables if they exist to prevent schema mismatch
DROP TABLE IF EXISTS public.chat_history CASCADE;
DROP TABLE IF EXISTS public.curriculum_chunks CASCADE;
DROP TABLE IF EXISTS public.curriculums CASCADE;
DROP TABLE IF EXISTS public.device_guests CASCADE;
DROP TABLE IF EXISTS public.pending_registrations CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    grade_level TEXT NOT NULL, -- '1_middle', '2_middle', '3_middle', '1_high', '2_high', '3_high'
    plan_type TEXT NOT NULL DEFAULT 'free', -- 'free', 'pro_1m', 'pro_2m', 'pro_3m', 'pro', 'max'
    subscription_status TEXT NOT NULL DEFAULT 'inactive', -- 'active', 'inactive', 'expired'
    subscription_start_date TIMESTAMP WITH TIME ZONE,
    subscription_end_date TIMESTAMP WITH TIME ZONE,
    subscription_plan_id TEXT,
    role TEXT NOT NULL DEFAULT 'student', -- 'student', 'admin'
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    coins NUMERIC NOT NULL DEFAULT 20.0,
    points NUMERIC NOT NULL DEFAULT 0,
    study_streak INT NOT NULL DEFAULT 1,
    last_active_date DATE NOT NULL DEFAULT CURRENT_DATE,
    unlimited_credit BOOLEAN NOT NULL DEFAULT false,
    terms_accepted_at TIMESTAMP WITH TIME ZONE,
    pwa_installed BOOLEAN NOT NULL DEFAULT false,
    pwa_installed_at TIMESTAMP WITH TIME ZONE,
    pwa_platform TEXT,
    improve_ai_opt_in BOOLEAN NOT NULL DEFAULT true
);

-- 2. Pending Registrations Table
CREATE TABLE IF NOT EXISTS public.pending_registrations (
    phone TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    otp TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    terms_accepted_at TIMESTAMP WITH TIME ZONE
);

-- 3. Device Guests Table
CREATE TABLE IF NOT EXISTS public.device_guests (
    device_id TEXT PRIMARY KEY,
    free_message_count INTEGER NOT NULL DEFAULT 0,
    last_message_date DATE NOT NULL DEFAULT CURRENT_DATE,
    coins NUMERIC NOT NULL DEFAULT 5.0
);

-- 4. Curriculums Table
CREATE TABLE IF NOT EXISTS public.curriculums (
    id UUID PRIMARY KEY,
    grade_level TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content TEXT,
    units JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(grade_level, subject_name)
);

-- ─── 5. Curriculum Chunks Table (v2 — Hierarchical + Vector) ─────────────────
CREATE TABLE IF NOT EXISTS public.curriculum_chunks (
    id UUID PRIMARY KEY,
    curriculum_id UUID NOT NULL REFERENCES public.curriculums(id) ON DELETE CASCADE,

    -- Content
    content TEXT NOT NULL,
    heading TEXT NOT NULL,

    -- Hierarchy: parent-child structure for RAG
    -- chunk_level: 'parent' = full section, 'child' = sliding-window sub-chunk
    -- parent_id: only set on child chunks, points to their parent chunk
    chunk_level TEXT NOT NULL DEFAULT 'parent', -- 'parent' | 'child'
    parent_id UUID REFERENCES public.curriculum_chunks(id) ON DELETE CASCADE,
    position_index INTEGER NOT NULL DEFAULT 0,

    -- Semantic Vector (768 dims for Google text-embedding-004)
    -- Only populated on child chunks (retrieval units)
    embedding VECTOR(768),

    -- Bilingual Full-Text Search:
    -- fts_arabic: Arabic text, uses 'simple' config (no stemming, preserves Arabic morphology)
    -- fts_english: English scientific terms, uses 'english' config
    fts_arabic TSVECTOR,
    fts_english TSVECTOR
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- HNSW index for fast approximate nearest-neighbor vector search
-- m=16, ef_construction=64 are standard balanced values
CREATE INDEX IF NOT EXISTS curriculum_chunks_embedding_hnsw_idx
    ON public.curriculum_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- GIN index for Arabic full-text search
CREATE INDEX IF NOT EXISTS curriculum_chunks_fts_arabic_idx
    ON public.curriculum_chunks USING gin(fts_arabic);

-- GIN index for English full-text search
CREATE INDEX IF NOT EXISTS curriculum_chunks_fts_english_idx
    ON public.curriculum_chunks USING gin(fts_english);

-- Index on parent_id for parent-chunk expansion lookups
CREATE INDEX IF NOT EXISTS curriculum_chunks_parent_id_idx
    ON public.curriculum_chunks(parent_id);

-- Index on curriculum_id + chunk_level for fast filtering
CREATE INDEX IF NOT EXISTS curriculum_chunks_curriculum_level_idx
    ON public.curriculum_chunks(curriculum_id, chunk_level);

-- ─── Trigger: Auto-update both tsvectors ─────────────────────────────────────
CREATE OR REPLACE FUNCTION curriculum_chunks_trigger_func() RETURNS trigger AS $$
BEGIN
  -- Arabic tsvector: 'simple' config for Arabic text (no language-specific stemming)
  new.fts_arabic := to_tsvector('simple',
    COALESCE(new.heading, '') || ' ' || COALESCE(new.content, '')
  );
  -- English tsvector: 'english' config for scientific terms in Latin script
  new.fts_english := to_tsvector('english',
    COALESCE(new.heading, '') || ' ' || COALESCE(new.content, '')
  );
  RETURN new;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER curriculum_chunks_update_fts
BEFORE INSERT OR UPDATE ON public.curriculum_chunks
FOR EACH ROW EXECUTE FUNCTION curriculum_chunks_trigger_func();

-- ─── Hybrid Search RPC Function (BM25 + Vector + RRF) ────────────────────────
-- Performs hybrid retrieval using Reciprocal Rank Fusion:
--   RRF_Score(d) = Σ(m in M) [ 1 / (k + rank_m(d)) ]  where k=60
--
-- Parameters:
--   p_curriculum_id: which curriculum to search
--   p_query_embedding: HyDE embedding for vector search (768 dims)
--   p_arabic_query: Arabic keywords string for BM25
--   p_english_query: English keywords string for BM25
--   p_match_count: number of child chunks to return
--   p_rrf_k: RRF constant (default 60)
CREATE OR REPLACE FUNCTION hybrid_search_curriculum(
  p_curriculum_id UUID,
  p_query_embedding VECTOR(768),
  p_arabic_query TEXT,
  p_english_query TEXT,
  p_match_count INT DEFAULT 8,
  p_rrf_k INT DEFAULT 60
)
RETURNS TABLE(
  id UUID,
  content TEXT,
  heading TEXT,
  parent_id UUID,
  position_index INTEGER,
  rrf_score FLOAT
)
LANGUAGE SQL STABLE
AS $$
  WITH
  -- Vector search: cosine similarity on HyDE embedding
  vector_search AS (
    SELECT
      cc.id,
      ROW_NUMBER() OVER (ORDER BY cc.embedding <=> p_query_embedding) AS rank
    FROM public.curriculum_chunks cc
    WHERE
      cc.curriculum_id = p_curriculum_id
      AND cc.chunk_level = 'child'
      AND cc.embedding IS NOT NULL
    ORDER BY cc.embedding <=> p_query_embedding
    LIMIT 50
  ),
  -- Arabic BM25 search
  bm25_arabic AS (
    SELECT
      cc.id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank(cc.fts_arabic, plainto_tsquery('simple', p_arabic_query)) DESC
      ) AS rank
    FROM public.curriculum_chunks cc
    WHERE
      cc.curriculum_id = p_curriculum_id
      AND cc.chunk_level = 'child'
      AND cc.fts_arabic @@ plainto_tsquery('simple', p_arabic_query)
    LIMIT 50
  ),
  -- English BM25 search
  bm25_english AS (
    SELECT
      cc.id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank(cc.fts_english, plainto_tsquery('english', p_english_query)) DESC
      ) AS rank
    FROM public.curriculum_chunks cc
    WHERE
      cc.curriculum_id = p_curriculum_id
      AND cc.chunk_level = 'child'
      AND p_english_query != ''
      AND cc.fts_english @@ plainto_tsquery('english', p_english_query)
    LIMIT 50
  ),
  -- RRF fusion across all three signals
  rrf_scores AS (
    SELECT
      COALESCE(vs.id, ba.id, be.id) AS chunk_id,
      COALESCE(1.0 / (p_rrf_k + vs.rank), 0.0)  -- vector signal
        + COALESCE(1.0 / (p_rrf_k + ba.rank), 0.0)  -- arabic BM25 signal
        + COALESCE(1.0 / (p_rrf_k + be.rank), 0.0)  -- english BM25 signal
      AS rrf_score
    FROM vector_search vs
    FULL OUTER JOIN bm25_arabic ba ON vs.id = ba.id
    FULL OUTER JOIN bm25_english be ON COALESCE(vs.id, ba.id) = be.id
  )
  SELECT
    cc.id,
    cc.content,
    cc.heading,
    cc.parent_id,
    cc.position_index,
    rs.rrf_score
  FROM rrf_scores rs
  JOIN public.curriculum_chunks cc ON cc.id = rs.chunk_id
  ORDER BY rs.rrf_score DESC
  LIMIT p_match_count;
$$;

-- 6. System Settings Table
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Insert default system settings
INSERT INTO public.system_settings (key, value)
VALUES ('website_link', 'http://localhost:3000')
ON CONFLICT (key) DO NOTHING;

-- 7. Chat History Table
CREATE TABLE IF NOT EXISTS public.chat_history (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    device_id TEXT,
    sender TEXT NOT NULL, -- 'user', 'ai'
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    coins_cost NUMERIC NOT NULL DEFAULT 0.0
);

-- 8. Insert Default Admin User
INSERT INTO public.profiles (id, phone, name, grade_level, plan_type, role, password_hash, coins, unlimited_credit)
VALUES (
    'a3e0f065-9856-424d-8dc8-b4b3cf0b89cf',
    '01147814652',
    'مدير النظام',
    '3_high',
    'max',
    'admin',
    '343f7ea65b1d1ed5b5980d214808c2e06379a8b97586db4d6c97874d4440c174',
    1000.0,
    true
)
ON CONFLICT (phone) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    plan_type = EXCLUDED.plan_type,
    coins = COALESCE(profiles.coins, EXCLUDED.coins),
    unlimited_credit = true;


-- 9. Chat Sessions Table
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id TEXT,
    title TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'detailed',
    engagement_points_awarded BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Link Chat History to Chat Sessions
ALTER TABLE public.chat_history ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE;

-- 11. Performance Index for Session Queries
CREATE INDEX IF NOT EXISTS chat_history_session_id_idx ON public.chat_history(session_id);
CREATE INDEX IF NOT EXISTS chat_sessions_engagement_idx ON public.chat_sessions(id, engagement_points_awarded);


-- 12. Exams Table
CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    questions JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    device_id TEXT
);

CREATE INDEX IF NOT EXISTS exams_user_id_idx ON public.exams(user_id);
CREATE INDEX IF NOT EXISTS exams_device_id_idx ON public.exams(device_id);

-- 13. Exam Submissions Table
CREATE TABLE IF NOT EXISTS public.exam_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id TEXT,
    answers JSONB NOT NULL,
    score NUMERIC NOT NULL,
    evaluation TEXT NOT NULL,
    points_awarded NUMERIC NOT NULL DEFAULT 0,
    is_first_attempt BOOLEAN NOT NULL DEFAULT false,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exam_submissions_first_attempt_idx ON public.exam_submissions(exam_id, user_id, is_first_attempt);

-- 14. Reports Table (AI response reporting)
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    device_id TEXT,
    message_id TEXT,
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
    reported_content TEXT NOT NULL,
    user_query TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'reviewed' | 'dismissed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports(status);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON public.reports(created_at);

-- 15. Notifications Table (admin-authored & system user-specific, student-facing)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info', -- 'info' | 'success' | 'warning' | 'maintenance'
    target TEXT NOT NULL DEFAULT 'both', -- 'both' | 'web' | 'phone'
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_active_idx ON public.notifications(active);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);

-- 16. App Versions Table (mobile force-update management)
CREATE TABLE IF NOT EXISTS public.app_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL DEFAULT 'android', -- 'android' | 'ios'
    version_code INTEGER NOT NULL,
    version_name TEXT NOT NULL,
    release_notes TEXT NOT NULL DEFAULT '',
    download_url TEXT NOT NULL DEFAULT '',
    mandatory BOOLEAN NOT NULL DEFAULT true,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_versions_platform_active_idx ON public.app_versions(platform, active);

-- 17. Free Trial Grants (IP, Browser Fingerprint, Device ID Anti-Abuse Tracking)
CREATE TABLE IF NOT EXISTS public.free_trial_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    ip_address TEXT,
    user_agent TEXT,
    browser_fingerprint TEXT,
    device_id TEXT,
    platform TEXT NOT NULL DEFAULT 'web', -- 'web' | 'mobile'
    coins_granted NUMERIC NOT NULL DEFAULT 20.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trial_grants_ip ON public.free_trial_grants(ip_address);
CREATE INDEX IF NOT EXISTS idx_trial_grants_fingerprint ON public.free_trial_grants(browser_fingerprint);
CREATE INDEX IF NOT EXISTS idx_trial_grants_device ON public.free_trial_grants(device_id);
CREATE INDEX IF NOT EXISTS idx_trial_grants_user ON public.free_trial_grants(user_id);

-- 18. User Devices (Multi-Device Limitation: Max 3 Devices per account)
CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    session_token TEXT,
    device_name TEXT NOT NULL DEFAULT 'جهاز غير معروف',
    device_type TEXT NOT NULL DEFAULT 'web', -- 'web', 'mobile', 'tablet', 'desktop'
    browser_fingerprint TEXT,
    ip_address TEXT,
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_device UNIQUE(user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_lookup ON public.user_devices(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_devices_token ON public.user_devices(session_token);
CREATE INDEX IF NOT EXISTS idx_user_devices_last_active ON public.user_devices(last_active_at DESC);

-- 19. Leaderboard RPC Function & Points Indexes
CREATE INDEX IF NOT EXISTS profiles_points_idx ON public.profiles(points DESC);
CREATE INDEX IF NOT EXISTS profiles_study_streak_idx ON public.profiles(study_streak DESC);

CREATE OR REPLACE FUNCTION public.get_leaderboard(
    p_grade_level TEXT DEFAULT NULL,
    p_limit INT DEFAULT 20
)
RETURNS TABLE (
    user_id UUID,
    name TEXT,
    grade_level TEXT,
    coins NUMERIC,
    points NUMERIC,
    study_streak INT,
    average_accuracy NUMERIC,
    rank_number BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH student_stats AS (
        SELECT 
            p.id AS s_user_id,
            p.name AS s_name,
            p.grade_level AS s_grade_level,
            p.coins AS s_coins,
            COALESCE(p.points, 0) AS s_points,
            COALESCE(p.study_streak, 1) AS s_study_streak,
            COALESCE(
                (SELECT AVG(es.score) 
                 FROM public.exam_submissions es 
                 WHERE es.user_id = p.id), 
                0.0
            ) AS s_avg_accuracy
        FROM 
            public.profiles p
        WHERE 
            p.role = 'student'
            AND (p_grade_level IS NULL OR p.grade_level = p_grade_level)
            AND LOWER(COALESCE(p.email, '')) NOT LIKE '%test%'
            AND LOWER(COALESCE(p.email, '')) NOT LIKE '%trial%'
            AND LOWER(COALESCE(p.name, '')) NOT LIKE '%test%'
            AND LOWER(COALESCE(p.name, '')) NOT LIKE '%trial%'
            AND COALESCE(p.name, '') NOT LIKE '%اختباري%'
            AND COALESCE(p.name, '') NOT LIKE '%تجريبي%'
    )
    SELECT 
        s_user_id,
        s_name,
        s_grade_level,
        s_coins,
        s_points,
        s_study_streak,
        ROUND(s_avg_accuracy, 2) AS average_accuracy,
        ROW_NUMBER() OVER (
            ORDER BY 
                s_points DESC,
                s_study_streak DESC, 
                s_avg_accuracy DESC
        ) AS rank_number
    FROM 
        student_stats
    ORDER BY 
        rank_number ASC
    LIMIT 
        p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


