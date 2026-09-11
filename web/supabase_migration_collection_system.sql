-- EGS AI — Registration Points Collection System Migration
-- Run in Supabase SQL editor

-- 1. Add tracking columns to profiles for collection system idempotency
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS welcome_reward_claimed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS free_plan_claimed BOOLEAN NOT NULL DEFAULT false;

-- 2. Index for fast lookup if needed
CREATE INDEX IF NOT EXISTS idx_profiles_welcome_claimed ON public.profiles(id, welcome_reward_claimed);
