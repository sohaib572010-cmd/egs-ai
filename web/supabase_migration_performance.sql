-- Performance and hardening migration (2026-10-05). Additive and idempotent; safe on live data.

-- 1. Indexes for the hot request paths
CREATE INDEX IF NOT EXISTS idx_chat_history_user_sender_created ON public.chat_history (user_id, sender, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_history_session_created ON public.chat_history (session_id, created_at);
DROP INDEX IF EXISTS public.chat_history_session_id_idx;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_created ON public.chat_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user_created ON public.flashcard_decks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_user_submitted ON public.exam_submissions (user_id, submitted_at DESC);
DROP INDEX IF EXISTS public.exam_submissions_user_id_idx;
CREATE INDEX IF NOT EXISTS idx_user_devices_user_active_recent ON public.user_devices (user_id, last_active_at DESC) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_contact_messages_user ON public.contact_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_exams_session ON public.exams (session_id);
CREATE INDEX IF NOT EXISTS idx_reports_user ON public.reports (user_id);
CREATE INDEX IF NOT EXISTS idx_reports_session ON public.reports (session_id);

-- Special chunks (__CURRICULUM_SUMMARY__ at -1, __RAW_MARKDOWN__ at -99) are read by heading with position_index < 0.
CREATE INDEX IF NOT EXISTS idx_chunks_special ON public.curriculum_chunks (curriculum_id, heading) WHERE position_index < 0;

-- 2. Vector search: every query is scoped to one curriculum (max ~1.4k children), so an exact scan over a
-- partial btree is faster, has perfect recall, and frees the 100 MB HNSW graph from the shared buffer cache.
CREATE INDEX IF NOT EXISTS idx_chunks_child_embedded ON public.curriculum_chunks (curriculum_id) WHERE chunk_level = 'child' AND embedding IS NOT NULL;
DROP INDEX IF EXISTS public.curriculum_chunks_embedding_hnsw_idx;
DROP INDEX IF EXISTS public.curriculum_chunks_fts_english_idx;

-- 3. Redundant or never-used indexes (each one slows every write)
DROP INDEX IF EXISTS public.payment_transactions_order_id_idx;
DROP INDEX IF EXISTS public.idx_voice_usage_user_date;
DROP INDEX IF EXISTS public.idx_user_devices_user_id;
DROP INDEX IF EXISTS public.idx_user_devices_token;
DROP INDEX IF EXISTS public.chat_sessions_engagement_idx;
DROP INDEX IF EXISTS public.idx_profiles_welcome_claimed;
DROP INDEX IF EXISTS public.idx_profiles_apology;
DROP INDEX IF EXISTS public.idx_profiles_improve_ai_opt_in;
DROP INDEX IF EXISTS public.profiles_coins_idx;
DROP INDEX IF EXISTS public.notifications_active_idx;
DROP INDEX IF EXISTS public.idx_curriculums_placeholder;
DROP INDEX IF EXISTS public.idx_curriculums_track;
DROP INDEX IF EXISTS public.idx_curriculum_entities_category;
DROP INDEX IF EXISTS public.idx_curriculum_relations_type;

-- 4. Leaderboard: one aggregate pass instead of a correlated AVG per student (twice per row in the rank function)
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_grade_level text DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE(user_id uuid, name text, grade_level text, coins numeric, points numeric, study_streak integer, average_accuracy numeric, rank_number bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH acc AS (
    SELECT es.user_id AS uid, AVG(es.score) AS avg_score FROM public.exam_submissions es GROUP BY es.user_id
  ), ranked AS (
    SELECT p.id, p.name, p.grade_level, p.coins, COALESCE(p.points, 0) AS pts, COALESCE(p.study_streak, 1) AS streak,
           COALESCE(acc.avg_score, 0.0) AS accuracy
    FROM public.profiles p
    LEFT JOIN acc ON acc.uid = p.id
    WHERE p.role = 'student'
      AND (p_grade_level IS NULL OR p.grade_level = p_grade_level)
      AND LOWER(COALESCE(p.email, '')) NOT LIKE '%test%'
      AND LOWER(COALESCE(p.email, '')) NOT LIKE '%trial%'
      AND LOWER(COALESCE(p.name, '')) NOT LIKE '%test%'
      AND LOWER(COALESCE(p.name, '')) NOT LIKE '%trial%'
      AND COALESCE(p.name, '') NOT LIKE '%اختباري%'
      AND COALESCE(p.name, '') NOT LIKE '%تجريبي%'
  )
  SELECT id, name, grade_level, coins, pts, streak, ROUND(accuracy, 2),
         ROW_NUMBER() OVER (ORDER BY pts DESC, streak DESC, accuracy DESC)
  FROM ranked
  ORDER BY 8
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_user_leaderboard_rank(p_user_id uuid, p_grade_level text DEFAULT NULL)
RETURNS TABLE(user_id uuid, name text, grade_level text, coins numeric, points numeric, study_streak integer, average_accuracy numeric, rank_number bigint, is_in_top_10 boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.user_id, l.name, l.grade_level, l.coins, l.points, l.study_streak, l.average_accuracy, l.rank_number, l.rank_number <= 10
  FROM public.get_leaderboard(p_grade_level, 2147483647) l
  WHERE l.user_id = p_user_id;
$$;

-- 5. Security: pin search_path, server-only RPCs, RLS policies evaluated once per statement
ALTER FUNCTION public.curriculum_chunks_trigger_func() SET search_path = public;
ALTER FUNCTION public.hybrid_search_curriculum(uuid, vector, text, text, integer, integer) SET search_path = public;
ALTER FUNCTION public.check_rate_limit_atomic(text, integer, integer) SET search_path = public;
DO $$ BEGIN
  IF to_regprocedure('public.hybrid_search_curriculum_v4(uuid, vector, text, text, uuid[], integer, integer, double precision, double precision, double precision)') IS NOT NULL THEN
    ALTER FUNCTION public.hybrid_search_curriculum_v4(uuid, vector, text, text, uuid[], integer, integer, double precision, double precision, double precision) SET search_path = public;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit_atomic(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_leaderboard_rank(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.charge_usage(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.acquire_ai_slot(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit_atomic(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_leaderboard_rank(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.charge_usage(uuid, numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.acquire_ai_slot(uuid, integer) TO service_role;

DROP POLICY IF EXISTS "Users can view their own study notes" ON public.study_notebook;
DROP POLICY IF EXISTS "Users can insert their own study notes" ON public.study_notebook;
DROP POLICY IF EXISTS "Users can delete their own study notes" ON public.study_notebook;
CREATE POLICY "Users can view their own study notes" ON public.study_notebook FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can insert their own study notes" ON public.study_notebook FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete their own study notes" ON public.study_notebook FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- 6. Chat media (photos, voice notes) lives in private object storage instead of base64 inside chat_history.
-- Only the service role reads it; clients get short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-media', 'chat-media', false, 15728640,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
              'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a'])
ON CONFLICT (id) DO NOTHING;

ANALYZE public.chat_history, public.chat_sessions, public.curriculum_chunks, public.exam_submissions, public.user_devices, public.profiles;

-- 7. Admin directory activity counts aggregated in SQL (was: every chat row shipped to the server)
CREATE OR REPLACE FUNCTION public.admin_user_activity()
RETURNS TABLE(user_id uuid, messages_sent bigint, active_days bigint, exams_created bigint, exams_completed bigint, decks bigint, cards bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH m AS (
    SELECT ch.user_id, COUNT(*) AS n, COUNT(DISTINCT (ch.created_at AT TIME ZONE 'Africa/Cairo')::date) AS d
    FROM public.chat_history ch WHERE ch.sender = 'user' AND ch.user_id IS NOT NULL GROUP BY ch.user_id
  ), e AS (SELECT ex.user_id, COUNT(*) AS n FROM public.exams ex WHERE ex.user_id IS NOT NULL GROUP BY ex.user_id),
  s AS (SELECT es.user_id, COUNT(*) AS n FROM public.exam_submissions es GROUP BY es.user_id),
  dk AS (SELECT fd.user_id, COUNT(*) AS n FROM public.flashcard_decks fd GROUP BY fd.user_id),
  c AS (SELECT fd.user_id, COUNT(*) AS n FROM public.flashcards f JOIN public.flashcard_decks fd ON fd.id = f.deck_id GROUP BY fd.user_id)
  SELECT p.id, COALESCE(m.n, 0), COALESCE(m.d, 0), COALESCE(e.n, 0), COALESCE(s.n, 0), COALESCE(dk.n, 0), COALESCE(c.n, 0)
  FROM public.profiles p
  LEFT JOIN m ON m.user_id = p.id
  LEFT JOIN e ON e.user_id = p.id
  LEFT JOIN s ON s.user_id = p.id
  LEFT JOIN dk ON dk.user_id = p.id
  LEFT JOIN c ON c.user_id = p.id
  WHERE p.role = 'student';
$$;
REVOKE EXECUTE ON FUNCTION public.admin_user_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_activity() TO service_role;
