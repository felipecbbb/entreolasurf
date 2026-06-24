-- ============================================================
-- Migration: forzar cambio de contraseña en el primer acceso
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
--
-- Las cuentas creadas desde el admin (reserva manual / alta de cliente)
-- reciben una contraseña aleatoria por correo. Con este flag, el cliente
-- debe cambiarla la primera vez que entra. El registro público NO lo activa
-- (esos usuarios eligen su propia contraseña).
--
-- La policy "Users update own profile" ya permite al propio usuario poner el
-- flag a false al cambiar la contraseña (es un campo de UX, no de seguridad).
-- ============================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

select pg_notify('pgrst', 'reload schema');
