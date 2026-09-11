-- Migration: Claimed Daily Quests Table
-- Persists daily quest completions per user and date with unique constraint

CREATE TABLE IF NOT EXISTS public.claimed_daily_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  quest_id TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_date_quest UNIQUE (user_id, date, quest_id)
);

CREATE INDEX IF NOT EXISTS idx_claimed_quests_user_date 
  ON public.claimed_daily_quests(user_id, date);
