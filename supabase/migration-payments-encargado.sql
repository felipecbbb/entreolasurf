-- Migration: el encargado puede registrar pagos (jun-2026)
-- ============================================================
-- La tabla payments solo permitía a is_strict_admin → los encargados no podían
-- registrar pagos (la inserción fallaba en silencio). Se añade una política para
-- el staff con acceso a las secciones donde se cobran pagos. enc_can() también
-- devuelve true para admins, así que cubre a todos. Ejecutar en el SQL Editor.

drop policy if exists "Staff manage payments" on public.payments;
create policy "Staff manage payments" on public.payments
  for all
  using (enc_can(ARRAY['calendario','clientes','material','reservas','pedidos']))
  with check (enc_can(ARRAY['calendario','clientes','material','reservas','pedidos']));
