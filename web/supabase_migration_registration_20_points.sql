-- EGS AI — Registration Points System Update (Exactly 20 Free Points)
-- Run in Supabase SQL editor

-- 1. Update column default values to 20.0
ALTER TABLE public.profiles ALTER COLUMN coins SET DEFAULT 20.0;
ALTER TABLE public.free_trial_grants ALTER COLUMN coins_granted SET DEFAULT 20.0;

-- 2. Backfill existing free student accounts that received the previous 15.0 trial points to 20.0
UPDATE public.profiles
SET coins = 20.0
WHERE plan_type = 'free'
  AND coins = 15.0
  AND (subscription_status IS NULL OR subscription_status = 'inactive');
