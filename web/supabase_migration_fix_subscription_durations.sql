-- EGS AI — Subscriptions Schema & Duration Repair Migration
-- Fixes remaining duration for 3-month (90 days) and 2-month (60 days) subscriptions and repairs all existing accounts.

-- 1. Ensure subscription tracking columns exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive'; -- 'active', 'inactive', 'expired'
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_plan_id TEXT;

-- 2. Ensure indexes exist for fast lookup
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON public.profiles(subscription_status);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_end ON public.profiles(subscription_end_date);

-- 3. Repair 3-Month subscriptions (pro_3m, max) -> 90 days from payment or start date
UPDATE public.profiles p
SET 
  subscription_start_date = COALESCE(
    (SELECT pt.updated_at FROM public.payment_transactions pt WHERE pt.user_id = p.id AND pt.status = 'success' ORDER BY pt.created_at DESC LIMIT 1),
    p.subscription_start_date,
    p.created_at,
    NOW()
  ),
  subscription_end_date = COALESCE(
    (SELECT pt.updated_at FROM public.payment_transactions pt WHERE pt.user_id = p.id AND pt.status = 'success' ORDER BY pt.created_at DESC LIMIT 1),
    p.subscription_start_date,
    p.created_at,
    NOW()
  ) + INTERVAL '90 days',
  subscription_plan_id = 'pro_3m',
  subscription_status = CASE 
    WHEN (COALESCE(
      (SELECT pt.updated_at FROM public.payment_transactions pt WHERE pt.user_id = p.id AND pt.status = 'success' ORDER BY pt.created_at DESC LIMIT 1),
      p.subscription_start_date,
      p.created_at,
      NOW()
    ) + INTERVAL '90 days') > NOW() THEN 'active'
    ELSE 'expired'
  END
WHERE p.plan_type IN ('pro_3m', 'max') OR p.subscription_plan_id = 'pro_3m';

-- 4. Repair 2-Month subscriptions (pro_2m) -> 60 days from payment or start date
UPDATE public.profiles p
SET 
  subscription_start_date = COALESCE(
    (SELECT pt.updated_at FROM public.payment_transactions pt WHERE pt.user_id = p.id AND pt.status = 'success' ORDER BY pt.created_at DESC LIMIT 1),
    p.subscription_start_date,
    p.created_at,
    NOW()
  ),
  subscription_end_date = COALESCE(
    (SELECT pt.updated_at FROM public.payment_transactions pt WHERE pt.user_id = p.id AND pt.status = 'success' ORDER BY pt.created_at DESC LIMIT 1),
    p.subscription_start_date,
    p.created_at,
    NOW()
  ) + INTERVAL '60 days',
  subscription_plan_id = 'pro_2m',
  subscription_status = CASE 
    WHEN (COALESCE(
      (SELECT pt.updated_at FROM public.payment_transactions pt WHERE pt.user_id = p.id AND pt.status = 'success' ORDER BY pt.created_at DESC LIMIT 1),
      p.subscription_start_date,
      p.created_at,
      NOW()
    ) + INTERVAL '60 days') > NOW() THEN 'active'
    ELSE 'expired'
  END
WHERE p.plan_type = 'pro_2m' OR p.subscription_plan_id = 'pro_2m';

-- 5. Repair 1-Month subscriptions (pro_1m, pro) -> 30 days from payment or start date
UPDATE public.profiles p
SET 
  subscription_start_date = COALESCE(
    (SELECT pt.updated_at FROM public.payment_transactions pt WHERE pt.user_id = p.id AND pt.status = 'success' ORDER BY pt.created_at DESC LIMIT 1),
    p.subscription_start_date,
    p.created_at,
    NOW()
  ),
  subscription_end_date = COALESCE(
    (SELECT pt.updated_at FROM public.payment_transactions pt WHERE pt.user_id = p.id AND pt.status = 'success' ORDER BY pt.created_at DESC LIMIT 1),
    p.subscription_start_date,
    p.created_at,
    NOW()
  ) + INTERVAL '30 days',
  subscription_plan_id = 'pro_1m',
  subscription_status = CASE 
    WHEN (COALESCE(
      (SELECT pt.updated_at FROM public.payment_transactions pt WHERE pt.user_id = p.id AND pt.status = 'success' ORDER BY pt.created_at DESC LIMIT 1),
      p.subscription_start_date,
      p.created_at,
      NOW()
    ) + INTERVAL '30 days') > NOW() THEN 'active'
    ELSE 'expired'
  END
WHERE (p.plan_type IN ('pro_1m', 'pro') OR p.subscription_plan_id = 'pro_1m')
  AND (p.subscription_end_date IS NULL OR p.subscription_status IS NULL);

