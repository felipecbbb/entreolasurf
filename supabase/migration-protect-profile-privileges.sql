-- Migration: blindar rol y permisos de sección (auditoría jun-2026)
-- ============================================================
-- Un encargado satisface is_admin(), así que podía cambiar profiles.role o
-- profiles.allowed_sections vía la policy "Admins manage all profiles" y
-- auto-concederse accesos. Se refuerza con check en la policy de update propia
-- y, sobre todo, con un trigger que bloquea cambios de role/allowed_sections
-- salvo admin estricto (o service role, para las altas).
-- Ejecutar en el SQL Editor de Supabase.

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()) OR public.is_strict_admin())
    AND (allowed_sections IS NOT DISTINCT FROM (SELECT p.allowed_sections FROM public.profiles p WHERE p.id = auth.uid()) OR public.is_strict_admin())
  );

CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.allowed_sections IS DISTINCT FROM OLD.allowed_sections)
     AND auth.uid() IS NOT NULL
     AND NOT public.is_strict_admin() then
    raise exception 'No autorizado a cambiar rol o permisos';
  end if;
  return NEW;
end;
$function$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();
