-- Migration: el registro guarda TODOS los datos del perfil (auditoría jun-2026)
-- ============================================================
-- Antes el trigger solo guardaba full_name, phone y email; el resto de datos
-- del registro (apellidos, fecha nac., dirección, ciudad, CP, nivel, talla,
-- sabe nadar, lesión) se guardaban con un UPDATE posterior que dependía de
-- tener sesión activa (frágil si hay confirmación por email). Ahora todos los
-- datos viajan en el metadata del signUp y este trigger los persiste al crear
-- el perfil, sin depender de la sesión.
-- Ejecutar en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare m jsonb := new.raw_user_meta_data;
begin
  INSERT INTO public.profiles (
    id, full_name, last_name, phone, email, birth_date, address, city,
    postal_code, level, wetsuit_size, can_swim, has_injury, injury_detail,
    terms_accepted_at, waiver_accepted_at
  ) VALUES (
    new.id,
    coalesce(m->>'full_name', ''),
    nullif(m->>'last_name', ''),
    nullif(m->>'phone', ''),
    new.email,
    nullif(m->>'birth_date', '')::date,
    nullif(m->>'address', ''),
    nullif(m->>'city', ''),
    nullif(m->>'postal_code', ''),
    nullif(m->>'level', ''),
    nullif(m->>'wetsuit_size', ''),
    nullif(m->>'can_swim', '')::boolean,
    coalesce(nullif(m->>'has_injury', '')::boolean, false),
    nullif(m->>'injury_detail', ''),
    case when m->>'terms_accepted' = 'true' then now() else null end,
    case when m->>'terms_accepted' = 'true' then now() else null end
  );
  RETURN new;
end;
$function$;
