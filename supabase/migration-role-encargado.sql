-- ============================================================
-- ROL "ENCARGADO" — staff con acceso operativo total
-- excepto Estadísticas, Cupones y gestión de Equipo
-- ============================================================
--
-- Estrategia:
--   1. Ampliar el CHECK de profiles.role para aceptar 'encargado'.
--   2. Redefinir is_admin() como "staff operativo" (admin OR encargado)
--      → todas las políticas RLS existentes admiten encargado sin cambios.
--   3. Crear is_strict_admin() (solo role='admin') para los casos
--      sensibles: gestión de cupones y de cuentas de equipo.
--   4. Cambiar la política de coupons a is_strict_admin().
--
-- Aplicar manualmente desde Supabase Dashboard → SQL Editor.
-- ============================================================

-- 1) Ampliar roles permitidos
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'encargado', 'client'));

-- 2) is_admin() ahora representa staff operativo (admin OR encargado).
--    El nombre se mantiene para que las ~40 políticas RLS existentes
--    funcionen sin tocarse. Para operaciones admin-only usa is_strict_admin().
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'encargado')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3) Helper estricto: solo role='admin'
CREATE OR REPLACE FUNCTION public.is_strict_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4) Cupones: solo admin estricto puede gestionar
DROP POLICY IF EXISTS "Admin manage coupons" ON public.coupons;
CREATE POLICY "Admin only manage coupons"
  ON public.coupons FOR ALL
  USING (public.is_strict_admin());

-- 5) Profiles: impedir que un encargado se promueva o promueva a otros.
--    La política "Users update own profile" permite update con id=auth.uid()
--    sin restringir columnas. Añadimos check para que role solo lo cambie admin.
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      -- no cambia el rol, o quien hace el update es admin estricto
      role = (SELECT role FROM public.profiles WHERE id = auth.uid())
      OR public.is_strict_admin()
    )
  );

-- 6) RPC delete_user: blindarlo a admin estricto (antes usaba is_admin()
--    que ahora también valdría para encargado).
CREATE OR REPLACE FUNCTION delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminarte a ti mismo';
  END IF;
  IF NOT public.is_strict_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden eliminar usuarios';
  END IF;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_user(uuid) TO authenticated;
