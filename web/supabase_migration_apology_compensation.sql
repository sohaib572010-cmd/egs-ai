-- EGS AI — Apology & 15-Point Compensation Tracking Migration
-- Run in Supabase SQL editor

-- 1. Add tracking columns to profiles for apology message state & anti-double-claim
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS apology_compensation_claimed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS apology_dismissed BOOLEAN NOT NULL DEFAULT false;

-- 2. Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_profiles_apology ON public.profiles(id, apology_compensation_claimed, apology_dismissed);
