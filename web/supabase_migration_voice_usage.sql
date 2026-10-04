-- Migration: Voice Tutor trial (daily usage and call logs)

-- One row per student per Cairo day. seconds_used includes the reservation of an active call,
-- which is settled to the real duration when the call ends. key_slot is the Gemini key pool index of the call.
CREATE TABLE IF NOT EXISTS public.voice_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  seconds_used INTEGER NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0,
  active_call_id TEXT,
  call_started_at TIMESTAMPTZ,
  call_reserved INTEGER NOT NULL DEFAULT 0,
  last_beat_at TIMESTAMPTZ,
  key_slot INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_voice_usage_user_date UNIQUE (user_id, date)
);

ALTER TABLE public.voice_usage ADD COLUMN IF NOT EXISTS key_slot INTEGER;
CREATE INDEX IF NOT EXISTS idx_voice_usage_user_date ON public.voice_usage(user_id, date);
ALTER TABLE public.voice_usage ENABLE ROW LEVEL SECURITY;

-- One row per call: transcript entries [{role: student|teacher|search, text, at, interrupted?, sources?}],
-- shown in the admin conversation viewer next to chat sessions.
CREATE TABLE IF NOT EXISTS public.voice_calls (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  dialect TEXT NOT NULL DEFAULT 'egyptian',
  teacher TEXT NOT NULL DEFAULT 'male',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_voice_calls_user_started ON public.voice_calls(user_id, started_at DESC);
ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;
