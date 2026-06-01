-- Migration: el rol "encargado" no ve facturación (auditoría jun-2026)
-- ============================================================
-- is_admin() incluye admin + encargado; is_strict_admin() solo admin.
-- La facturación (tabla payments y las RPC de pagos) pasa a is_strict_admin:
-- el encargado gestiona operaciones pero no ve ni registra dinero.
-- Ejecutar en el SQL Editor de Supabase.

DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
CREATE POLICY "Strict admins manage payments" ON public.payments
  FOR ALL USING (public.is_strict_admin()) WITH CHECK (public.is_strict_admin());

CREATE OR REPLACE FUNCTION public.get_user_payments(p_user_id uuid)
 RETURNS SETOF payments LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.* FROM public.payments p
  WHERE (p_user_id = auth.uid() OR public.is_strict_admin())
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

CREATE OR REPLACE FUNCTION public.get_bono_payments(p_bono_id uuid)
 RETURNS SETOF payments LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.* FROM public.payments p
  WHERE p.reservation_type = 'enrollment'
    AND p.reference_id IN (SELECT id FROM public.class_enrollments WHERE bono_id = p_bono_id)
    AND (
      public.is_strict_admin()
      OR EXISTS (SELECT 1 FROM public.bonos b WHERE b.id = p_bono_id AND b.user_id = auth.uid())
    )
  ORDER BY p.payment_date DESC;
$function$;
