-- Migration: Allow guest checkout (no user_id required)
-- Run this manually in the Supabase SQL Editor.

-- 1. Orders: allow guest purchases
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS guest_name  text,
  ADD COLUMN IF NOT EXISTS guest_phone text;

-- 2. Bookings (camps): allow guest reservations
ALTER TABLE public.bookings ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS guest_name  text,
  ADD COLUMN IF NOT EXISTS guest_phone text;

-- 3. Class bookings: allow guest reservations
ALTER TABLE public.class_bookings ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.class_bookings
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS guest_name  text,
  ADD COLUMN IF NOT EXISTS guest_phone text;

-- 4. RLS: allow anonymous inserts when guest_email is provided
CREATE POLICY "Allow guest order insert"
  ON public.orders FOR INSERT
  WITH CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL);

CREATE POLICY "Allow guest booking insert"
  ON public.bookings FOR INSERT
  WITH CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL);

CREATE POLICY "Allow guest class_booking insert"
  ON public.class_bookings FOR INSERT
  WITH CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL);
