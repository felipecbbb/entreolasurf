-- Migration: blindaje de seguridad (jun 2026)
-- ============================================================
-- Auditoría completa de RLS + funciones SECURITY DEFINER + grants.
-- Hallazgos corregidos aquí. Ejecutar en el SQL Editor (ya aplicado en prod).
--
-- Resultado de la auditoría:
--  - profiles: el WITH CHECK impide auto-ascenso a admin / cambiar allowed_sections. OK.
--  - Todas las tablas con PII (bonos, payments, class_enrollments, orders, bookings,
--    equipment_reservations, family_members, profiles) cerradas por auth.uid()+staff. OK.
--  - Los SELECT públicos (qual=true) restantes son solo catálogo público
--    (surf_classes, products, surf_camps, activities, FAQs, fotos). OK.
--  - Funciones SECURITY DEFINER: validan al llamante internamente (auth.uid()/is_admin).
--  - class_holds: RLS activa sin policy = bloqueada a la API directa (intencional,
--    solo se accede vía RPCs SECURITY DEFINER). OK.

-- 1) CUPONES — antes: "Public read active coupons" con qual=true permitía LISTAR
--    todos los códigos vía /rest/v1/coupons. Ahora se valida server-side: get_coupon
--    solo devuelve el cupón si conoces el código exacto y está activo.
create or replace function public.get_coupon(p_code text)
returns setof public.coupons
language sql stable security definer set search_path = public
as $$
  select * from public.coupons
  where upper(code) = upper(p_code) and active = true
  limit 1;
$$;
revoke all on function public.get_coupon(text) from public, anon, authenticated;
grant execute on function public.get_coupon(text) to anon, authenticated;

drop policy if exists "Public read active coupons" on public.coupons;

-- 2) assign_rental_unit — no validaba al llamante y era ejecutable por cualquier
--    usuario autenticado. Solo la usa el webhook de Stripe (service_role).
revoke execute on function public.assign_rental_unit(uuid) from anon, authenticated;

-- 3) Defensa en profundidad: revocar EXECUTE a 'anon' en RPCs sensibles
--    (ya fallaban para anon porque auth.uid() es null, pero se cierran igual).
revoke execute on function public.delete_user(uuid) from anon;
revoke execute on function public.cancel_enrollment(uuid) from anon;
revoke execute on function public.upgrade_bono(uuid, integer) from anon;
revoke execute on function public.book_class(uuid, uuid, uuid) from anon;
revoke execute on function public.get_user_email(uuid) from anon;
revoke execute on function public.get_user_payments(uuid) from anon;
revoke execute on function public.get_bono_payments(uuid) from anon;

-- 4) Fijar search_path en funciones SECURITY DEFINER que no lo tenían
--    (evita secuestro de search_path).
alter function public.delete_user(uuid) set search_path = public;
alter function public.cancel_enrollment(uuid) set search_path = public;
alter function public.upgrade_bono(uuid, integer) set search_path = public;
alter function public.handle_new_user() set search_path = public;
alter function public.increment_coupon_usage(uuid) set search_path = public;
alter function public.update_spots_on_booking() set search_path = public;
alter function public.is_admin() set search_path = public;
alter function public.is_strict_admin() set search_path = public;

-- ------------------------------------------------------------
-- PENDIENTE (no se puede desde SQL, hacer en el Dashboard):
--  - Auth > Settings: activar "Leaked password protection" (HaveIBeenPwned).
--  - Storage: el bucket público 'activity-photos' permite listar archivos; si no
--    se necesita el listado, quitar la policy SELECT amplia (las URLs directas
--    siguen funcionando sin ella).
-- ------------------------------------------------------------
