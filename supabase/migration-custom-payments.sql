-- Migration: Support custom payments (saldo a favor) in payments table
-- Run in Supabase SQL Editor

-- 1. Drop and re-add the reservation_type check to allow 'custom'
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_reservation_type_check;
ALTER TABLE payments ADD CONSTRAINT payments_reservation_type_check
  CHECK (reservation_type IN ('enrollment', 'rental', 'custom'));

-- 2. Update get_user_payments RPC to also return custom payments (reference_id = user_id)
CREATE OR REPLACE FUNCTION get_user_payments(p_user_id uuid)
RETURNS SETOF payments
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.* FROM payments p
  WHERE p.reference_id IN (
    SELECT id FROM class_enrollments WHERE user_id = p_user_id
    UNION ALL
    SELECT id FROM equipment_reservations WHERE user_id = p_user_id
  )
  OR (p.reservation_type = 'custom' AND p.reference_id = p_user_id)
  ORDER BY p.payment_date DESC;
$$;

GRANT EXECUTE ON FUNCTION get_user_payments(uuid) TO authenticated;

-- Done!
SELECT pg_notify('pgrst', 'reload schema');
