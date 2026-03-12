-- Migration: Add health/size fields to profiles and family_members
-- Also adds 'partial' status to class_enrollments
-- Run in Supabase SQL Editor

-- Profiles: add swim, injury, wetsuit size
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_swim boolean,
  ADD COLUMN IF NOT EXISTS has_injury boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS injury_detail text,
  ADD COLUMN IF NOT EXISTS wetsuit_size text;

-- Family members: add swim, injury, wetsuit size
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS can_swim boolean,
  ADD COLUMN IF NOT EXISTS has_injury boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS injury_detail text,
  ADD COLUMN IF NOT EXISTS wetsuit_size text;

-- Add 'partial' to class_enrollments status check
ALTER TABLE public.class_enrollments DROP CONSTRAINT IF EXISTS class_enrollments_status_check;
ALTER TABLE public.class_enrollments ADD CONSTRAINT class_enrollments_status_check
  CHECK (status IN ('confirmed','cancelled','completed','no_show','paid','partial'));
