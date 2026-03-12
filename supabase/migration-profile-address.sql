-- Migration: Add address fields to profiles + admin family member management
-- Run in Supabase SQL Editor

-- 1. Address fields on profiles
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists postal_code text;

-- 2. Allow admins to fully manage family members (not just read)
drop policy if exists "Admins read all family members" on public.family_members;
create policy "Admins manage all family members"
  on public.family_members for all
  using (public.is_admin());
