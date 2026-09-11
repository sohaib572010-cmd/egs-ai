-- Supabase Migration: Student Engagement & Retention Features
-- user_lesson_progress: Tracks curriculum syllabus completion per student and subject
-- study_notebook: Stores bookmarked formulas, laws, and definitions from chat explanations

-- 1. Create user_lesson_progress table
CREATE TABLE IF NOT EXISTS user_lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  grade_level TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed', -- 'completed' | 'in_progress'
  quiz_score NUMERIC NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_lesson_progress_unique UNIQUE(user_id, subject_name, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_user ON user_lesson_progress(user_id, subject_name);
CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_grade ON user_lesson_progress(user_id, grade_level);

-- 2. Create study_notebook table
CREATE TABLE IF NOT EXISTS study_notebook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'formula', -- 'formula' | 'definition' | 'solution' | 'law' | 'general'
  session_id UUID NULL REFERENCES chat_sessions(id) ON DELETE SET NULL,
  message_id TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE study_notebook ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL;
ALTER TABLE study_notebook ADD COLUMN IF NOT EXISTS message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_study_notebook_user ON study_notebook(user_id, subject_name);
CREATE INDEX IF NOT EXISTS idx_study_notebook_session ON study_notebook(session_id);
CREATE INDEX IF NOT EXISTS idx_study_notebook_created ON study_notebook(user_id, created_at DESC);
