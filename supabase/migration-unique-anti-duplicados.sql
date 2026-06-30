-- Migration: reglas únicas anti-duplicados (clientes y familiares)
-- ============================================================
-- ⚠️ EJECUTAR SOLO DESPUÉS de limpiar los duplicados existentes (con "Fusionar
-- duplicados" en el panel). Si quedan duplicados, la creación de estos índices
-- FALLA (es lo correcto: te obliga a limpiarlos primero).
--
-- Comprueba duplicados antes con:
--   SELECT lower(email), count(*) FROM profiles WHERE coalesce(email,'')<>'' GROUP BY 1 HAVING count(*)>1;
--   SELECT user_id, lower(full_name), count(*) FROM family_members GROUP BY 1,2 HAVING count(*)>1;
--
-- Ejecutar en el SQL Editor de Supabase.

-- Clientes: email único (ignorando mayúsculas; solo cuando hay email).
create unique index if not exists uq_profiles_email_lower
  on public.profiles (lower(email))
  where email is not null and email <> '';

-- Familiares: nombre+apellidos único por cliente (ignorando mayúsculas).
create unique index if not exists uq_family_members_name_per_user
  on public.family_members (user_id, lower(full_name), coalesce(lower(last_name), ''));
