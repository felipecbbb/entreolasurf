-- ============================================================
-- WHATSAPP BOT — CLEANUP
-- Revierte migration-whatsapp.sql. Aplicar en Supabase SQL Editor.
-- ============================================================

-- Tablas en orden inverso por FKs (CASCADE limpia políticas, índices, triggers)
DROP TABLE IF EXISTS public.whatsapp_leads    CASCADE;
DROP TABLE IF EXISTS public.whatsapp_sessions CASCADE;
DROP TABLE IF EXISTS public.whatsapp_messages CASCADE;
DROP TABLE IF EXISTS public.whatsapp_contacts CASCADE;

-- Funciones helper que solo usaba el bot
DROP FUNCTION IF EXISTS public.get_active_bonos_by_phone(text);
DROP FUNCTION IF EXISTS public.get_upcoming_classes(text, integer);
DROP FUNCTION IF EXISTS public.touch_updated_at() CASCADE;

-- Recargar caché PostgREST
SELECT pg_notify('pgrst', 'reload schema');
