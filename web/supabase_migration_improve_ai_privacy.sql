-- Migration: AI Improvement Opt-in Privacy Setting
-- Adds improve_ai_opt_in column to public.profiles (default true) to let students control AI response quality sharing.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS improve_ai_opt_in BOOLEAN NOT NULL DEFAULT true;

-- Create index for fast admin queries filtering opted-in students
CREATE INDEX IF NOT EXISTS idx_profiles_improve_ai_opt_in ON public.profiles(improve_ai_opt_in);
