-- Migration: Client updates - audience, cancelled_by, legal acceptance, profile level
-- Run each block SEPARATELY in Supabase SQL Editor to avoid deadlocks

-- ============ Block 1: surf_classes ============
ALTER TABLE public.surf_classes ADD COLUMN IF NOT EXISTS audience text DEFAULT NULL;

-- ============ Block 2: class_enrollments ============
-- Run this separately:
-- ALTER TABLE public.class_enrollments ADD COLUMN IF NOT EXISTS cancelled_by text DEFAULT NULL;

-- ============ Block 3: profiles ============
-- Run this separately:
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz DEFAULT NULL;
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS waiver_accepted_at timestamptz DEFAULT NULL;
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS level text DEFAULT NULL;
