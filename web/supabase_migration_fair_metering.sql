-- Fair metering: atomic point charges, carried overdraft, per-term real-cost tracking and one AI request per account.
-- Safe to re-run.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coin_debt NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sub_cost_egp NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_busy_until TIMESTAMPTZ;

-- Deducts points and records the real provider cost in one statement, so concurrent requests can never
-- overwrite each other. Points the balance cannot cover become debt, recovered from the next daily refill.
CREATE OR REPLACE FUNCTION public.charge_usage(p_user UUID, p_points NUMERIC, p_cost_egp NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coins NUMERIC;
BEGIN
  IF p_points IS NULL OR p_points < 0 OR p_points > 1000 OR p_cost_egp IS NULL OR p_cost_egp < 0 OR p_cost_egp > 100 THEN
    RAISE EXCEPTION 'invalid charge amount';
  END IF;

  UPDATE public.profiles
  SET coins = ROUND(GREATEST(0, coins - p_points), 2),
      coin_debt = ROUND(coin_debt + GREATEST(0, p_points - coins), 2),
      sub_cost_egp = ROUND(sub_cost_egp + p_cost_egp, 4)
  WHERE id = p_user AND role <> 'admin' AND NOT COALESCE(unlimited_credit, false)
  RETURNING coins INTO v_coins;

  IF NOT FOUND THEN
    SELECT coins INTO v_coins FROM public.profiles WHERE id = p_user;
  END IF;
  RETURN v_coins;
END;
$$;

-- Claims the account's single AI request slot; returns false while another request holds it.
CREATE OR REPLACE FUNCTION public.acquire_ai_slot(p_user UUID, p_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimed AS (
    UPDATE public.profiles
    SET ai_busy_until = NOW() + make_interval(secs => LEAST(GREATEST(p_seconds, 1), 600))
    WHERE id = p_user AND (ai_busy_until IS NULL OR ai_busy_until < NOW())
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;

REVOKE ALL ON FUNCTION public.charge_usage(UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.acquire_ai_slot(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_usage(UUID, NUMERIC, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.acquire_ai_slot(UUID, INTEGER) TO service_role;

-- The server uses the service-role key, which bypasses RLS. Enabling RLS without policies blocks the
-- public anon/authenticated roles from reading or editing balances and payments directly.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
