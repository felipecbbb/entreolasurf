-- Migration: arreglos de seguridad (auditoría jun-2026)
-- ============================================================
-- 1) Quitar la política que permitía a CUALQUIER cliente crear bonos
--    (créditos de clase) directamente → fraude de servicio. Los bonos
--    legítimos los crea el webhook de Stripe (service role) o el admin.
-- 2) Las RPC de email/pagos eran SECURITY DEFINER sin comprobar el caller
--    → cualquier usuario logueado obtenía email e historial de pagos de
--    cualquier otro. Ahora solo devuelven datos propios o si es admin.
-- Ejecutar en el SQL Editor de Supabase.

-- 1) Bonos: solo admin (is_admin) o service role pueden insertar
DROP POLICY IF EXISTS "Users cannot directly insert bonos" ON public.bonos;

-- 2a) Email de usuario: solo el propio o admin
CREATE OR REPLACE FUNCTION public.get_user_email(p_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.email FROM auth.users u
  WHERE u.id = p_user_id
    AND (p_user_id = auth.uid() OR public.is_admin());
$function$;

-- 2b) Pagos de usuario: solo los propios o admin
CREATE OR REPLACE FUNCTION public.get_user_payments(p_user_id uuid)
 RETURNS SETOF payments
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.* FROM public.payments p
  WHERE (p_user_id = auth.uid() OR public.is_admin())
    AND (
      p.reference_id IN (
        SELECT id FROM public.class_enrollments     WHERE user_id = p_user_id
        UNION ALL SELECT id FROM public.equipment_reservations WHERE user_id = p_user_id
        UNION ALL SELECT id FROM public.bookings     WHERE user_id = p_user_id
        UNION ALL SELECT id FROM public.bonos        WHERE user_id = p_user_id
        UNION ALL SELECT id FROM public.orders       WHERE user_id = p_user_id
      )
      OR (p.reservation_type = 'custom' AND p.reference_id = p_user_id)
    )
  ORDER BY p.payment_date DESC;
$function$;

-- 2c) Pagos de un bono: solo el dueño del bono o admin
CREATE OR REPLACE FUNCTION public.get_bono_payments(p_bono_id uuid)
 RETURNS SETOF payments
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.* FROM public.payments p
  WHERE p.reservation_type = 'enrollment'
    AND p.reference_id IN (SELECT id FROM public.class_enrollments WHERE bono_id = p_bono_id)
    AND (
      public.is_admin()
      OR EXISTS (SELECT 1 FROM public.bonos b WHERE b.id = p_bono_id AND b.user_id = auth.uid())
    )
  ORDER BY p.payment_date DESC;
$function$;
