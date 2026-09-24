-- Migration: Add streak_shields to profiles table for student streak protection
-- Default to 1 shield so every student begins with a safety net.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS streak_shields INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.profiles.streak_shields IS 'Number of streak protection shields available to prevent study streak resets when a student misses a day.';
