-- =============================================================================
-- Migration: Audit Fixes
-- Date: 2026-03-12
-- Description: Adds missing constraints, indexes, and a unique partial index
--              to improve data integrity and query performance.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CHECK constraint: prevent negative credit balances
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS credit_balance_non_negative;

ALTER TABLE public.profiles
  ADD CONSTRAINT credit_balance_non_negative CHECK (credit_balance >= 0);

-- -----------------------------------------------------------------------------
-- 2. Missing indexes for performance
-- -----------------------------------------------------------------------------

-- Profiles: fast lookup by role (e.g. listing all admins/instructors)
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles(role);

-- Orders: filter/sort by status + created_at (dashboard, reports)
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders(status, created_at);

-- Class enrollments: filter by status, look up by class or user
CREATE INDEX IF NOT EXISTS idx_class_enrollments_status
  ON public.class_enrollments(status);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_id
  ON public.class_enrollments(class_id);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_user_id
  ON public.class_enrollments(user_id);

-- Bonos: look up active bonos per user, filter by activity
CREATE INDEX IF NOT EXISTS idx_bonos_user_id_status
  ON public.bonos(user_id, status);

CREATE INDEX IF NOT EXISTS idx_bonos_activity_id
  ON public.bonos(activity_id);

-- Payments: look up payment by reference (order/bono id)
CREATE INDEX IF NOT EXISTS idx_payments_reference_id
  ON public.payments(reference_id);

-- -----------------------------------------------------------------------------
-- 3. Unique partial index: prevent duplicate active enrollments
--    A user (or family member) cannot be enrolled twice in the same class
--    unless the previous enrollment was cancelled.
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_unique_enrollment;

CREATE UNIQUE INDEX idx_unique_enrollment
  ON public.class_enrollments(class_id, user_id, family_member_id)
  WHERE status != 'cancelled';
