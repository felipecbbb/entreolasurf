-- Migration: Add "public" column to activity_packs
-- Controls whether a pack is visible on the frontend or only used as internal pricing rule
-- Run in Supabase SQL Editor

ALTER TABLE public.activity_packs
  ADD COLUMN IF NOT EXISTS public boolean NOT NULL DEFAULT true;

-- Remove the unique constraint on (activity_id, sessions) to allow flexible session numbers
-- (It may already exist from the initial schema)
ALTER TABLE public.activity_packs
  DROP CONSTRAINT IF EXISTS activity_packs_activity_id_sessions_key;
