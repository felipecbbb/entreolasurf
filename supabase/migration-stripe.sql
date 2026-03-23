-- Migration: Stripe integration helpers

-- RPC to increment coupon usage atomically
CREATE OR REPLACE FUNCTION increment_coupon_usage(p_coupon_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE coupons
  SET used_count = used_count + 1, updated_at = now()
  WHERE id = p_coupon_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_coupon_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_coupon_usage(uuid) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
