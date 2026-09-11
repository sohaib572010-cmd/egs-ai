-- Migration: PWA Installation Tracking for Students
-- Adds tracking columns to public.profiles to record PWA downloads/installations, platform, and timestamps.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pwa_installed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pwa_installed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pwa_platform TEXT;

-- Create index for fast admin queries filtering PWA users
CREATE INDEX IF NOT EXISTS idx_profiles_pwa_installed ON public.profiles(pwa_installed) WHERE pwa_installed = true;
