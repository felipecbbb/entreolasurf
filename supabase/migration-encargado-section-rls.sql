-- Migration: permisos del encargado por sección a nivel RLS (no solo UI)
-- ============================================================
-- enc_can(secciones[]) = true si el usuario es admin, o es encargado y su
-- allowed_sections es NULL (todas) o contiene alguna de esas secciones.
-- Las políticas de gestión (antes is_admin → admin+encargado) pasan a enc_can
-- con las secciones que dan acceso a cada tabla. El admin siempre pasa; el
-- público y las altas de cliente/invitado (otras políticas) no se tocan.
-- Ejecutar en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION public.enc_can(p_sections text[])
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND ( role = 'admin'
            OR (role = 'encargado'
                AND (allowed_sections IS NULL OR allowed_sections ?| p_sections)) )
  );
$function$;
GRANT EXECUTE ON FUNCTION public.enc_can(text[]) TO anon, authenticated;

DROP POLICY IF EXISTS "Admins manage classes" ON public.surf_classes;
CREATE POLICY "Staff manage classes" ON public.surf_classes FOR ALL
  USING (public.enc_can(ARRAY['calendario','reserva-clases'])) WITH CHECK (public.enc_can(ARRAY['calendario','reserva-clases']));

DROP POLICY IF EXISTS "Admin full access" ON public.class_enrollments;
DROP POLICY IF EXISTS "Admins manage all enrollments" ON public.class_enrollments;
DROP POLICY IF EXISTS "Admins insert enrollments" ON public.class_enrollments;
DROP POLICY IF EXISTS "Users read own enrollments" ON public.class_enrollments;
CREATE POLICY "Staff manage enrollments" ON public.class_enrollments FOR ALL
  USING (public.enc_can(ARRAY['calendario','reserva-clases','clientes'])) WITH CHECK (public.enc_can(ARRAY['calendario','reserva-clases','clientes']));
CREATE POLICY "Users read own enrollments" ON public.class_enrollments FOR SELECT
  USING (user_id = auth.uid() OR public.enc_can(ARRAY['calendario','reserva-clases','clientes']));

DROP POLICY IF EXISTS "Admins manage all bonos" ON public.bonos;
DROP POLICY IF EXISTS "Users read own bonos" ON public.bonos;
CREATE POLICY "Staff manage bonos" ON public.bonos FOR ALL
  USING (public.enc_can(ARRAY['calendario','reserva-clases','clientes'])) WITH CHECK (public.enc_can(ARRAY['calendario','reserva-clases','clientes']));
CREATE POLICY "Users read own bonos" ON public.bonos FOR SELECT
  USING (user_id = auth.uid() OR public.enc_can(ARRAY['calendario','reserva-clases','clientes']));

DROP POLICY IF EXISTS "Admins manage all family members" ON public.family_members;
CREATE POLICY "Staff manage family members" ON public.family_members FOR ALL
  USING (public.enc_can(ARRAY['clientes','calendario','reserva-clases'])) WITH CHECK (public.enc_can(ARRAY['clientes','calendario','reserva-clases']));

DROP POLICY IF EXISTS "Admins manage all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users read own bookings" ON public.bookings;
CREATE POLICY "Staff manage bookings" ON public.bookings FOR ALL
  USING (public.enc_can(ARRAY['reservas','camps'])) WITH CHECK (public.enc_can(ARRAY['reservas','camps']));
CREATE POLICY "Users read own bookings" ON public.bookings FOR SELECT
  USING (user_id = auth.uid() OR public.enc_can(ARRAY['reservas','camps']));

DROP POLICY IF EXISTS "Admins manage camps" ON public.surf_camps;
CREATE POLICY "Staff manage camps" ON public.surf_camps FOR ALL
  USING (public.enc_can(ARRAY['camps','reservas'])) WITH CHECK (public.enc_can(ARRAY['camps','reservas']));

DROP POLICY IF EXISTS "Admins manage equipment" ON public.rental_equipment;
CREATE POLICY "Staff manage equipment" ON public.rental_equipment FOR ALL
  USING (public.enc_can(ARRAY['material'])) WITH CHECK (public.enc_can(ARRAY['material']));

DROP POLICY IF EXISTS "Admins manage all equipment reservations" ON public.equipment_reservations;
DROP POLICY IF EXISTS "Users read own equipment reservations" ON public.equipment_reservations;
CREATE POLICY "Staff manage equipment reservations" ON public.equipment_reservations FOR ALL
  USING (public.enc_can(ARRAY['material','calendario'])) WITH CHECK (public.enc_can(ARRAY['material','calendario']));
CREATE POLICY "Users read own equipment reservations" ON public.equipment_reservations FOR SELECT
  USING (user_id = auth.uid() OR public.enc_can(ARRAY['material','calendario']));

DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Staff manage products" ON public.products FOR ALL
  USING (public.enc_can(ARRAY['productos'])) WITH CHECK (public.enc_can(ARRAY['productos']));

DROP POLICY IF EXISTS "Admins manage all orders" ON public.orders;
DROP POLICY IF EXISTS "Users read own orders" ON public.orders;
CREATE POLICY "Staff manage orders" ON public.orders FOR ALL
  USING (public.enc_can(ARRAY['pedidos'])) WITH CHECK (public.enc_can(ARRAY['pedidos']));
CREATE POLICY "Users read own orders" ON public.orders FOR SELECT
  USING (user_id = auth.uid() OR public.enc_can(ARRAY['pedidos']));

DROP POLICY IF EXISTS "Admins manage all order items" ON public.order_items;
DROP POLICY IF EXISTS "Users read own order items" ON public.order_items;
CREATE POLICY "Staff manage order items" ON public.order_items FOR ALL
  USING (public.enc_can(ARRAY['pedidos'])) WITH CHECK (public.enc_can(ARRAY['pedidos']));
CREATE POLICY "Users read own order items" ON public.order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND (o.user_id = auth.uid() OR public.enc_can(ARRAY['pedidos']))));

DROP POLICY IF EXISTS "act_admin" ON public.activities;
CREATE POLICY "act_staff" ON public.activities FOR ALL
  USING (public.enc_can(ARRAY['actividades'])) WITH CHECK (public.enc_can(ARRAY['actividades']));
DROP POLICY IF EXISTS "pk_admin" ON public.activity_packs;
CREATE POLICY "pk_staff" ON public.activity_packs FOR ALL
  USING (public.enc_can(ARRAY['actividades'])) WITH CHECK (public.enc_can(ARRAY['actividades']));
