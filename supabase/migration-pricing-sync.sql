-- Migration: pricing sync — extra class price, bono total_paid, get_user_email RPC
-- Run in Supabase SQL Editor

-- 1. Extra class price per activity (for classes beyond max pack)
ALTER TABLE activities ADD COLUMN IF NOT EXISTS extra_class_price NUMERIC DEFAULT 0;

-- 2. Track total amount paid toward a bono
ALTER TABLE bonos ADD COLUMN IF NOT EXISTS total_paid NUMERIC(10,2) DEFAULT 0;

-- 3. RPC to get user email from auth.users (SECURITY DEFINER = runs with DB owner privileges)
-- This avoids needing service_role key in the browser
CREATE OR REPLACE FUNCTION get_user_email(p_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT email FROM auth.users WHERE id = p_user_id;
$$;

-- Grant execute to authenticated users (admin check done at app level)
GRANT EXECUTE ON FUNCTION get_user_email(uuid) TO authenticated;

-- 4. RPC to fetch all payments for a user (across all their enrollments and rentals)
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
  ORDER BY p.payment_date DESC;
$$;

GRANT EXECUTE ON FUNCTION get_user_payments(uuid) TO authenticated;

-- 5. RPC to fetch payments linked to a specific bono
-- (all payments on enrollments that used this bono)
CREATE OR REPLACE FUNCTION get_bono_payments(p_bono_id uuid)
RETURNS SETOF payments
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.* FROM payments p
  WHERE p.reservation_type = 'enrollment'
    AND p.reference_id IN (
      SELECT id FROM class_enrollments WHERE bono_id = p_bono_id
    )
  ORDER BY p.payment_date DESC;
$$;

GRANT EXECUTE ON FUNCTION get_bono_payments(uuid) TO authenticated;

-- 6. Add last_name column to profiles and family_members
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT DEFAULT '';
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS last_name TEXT DEFAULT '';

-- 7. Credit balance (saldo a favor) for clients
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(10,2) DEFAULT 0;
