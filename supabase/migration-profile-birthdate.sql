-- Migration: Add birth_date to profiles
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date date;
