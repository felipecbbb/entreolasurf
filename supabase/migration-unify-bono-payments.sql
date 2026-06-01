-- Migration: unificar la contabilidad de pagos de bono (auditoría jun-2026)
-- ============================================================
-- Los cobros de bono se registraban con convenciones inconsistentes
-- (reservation_type='enrollment' con reference_id = bono o = enrollment),
-- y los KPIs los contaban dos veces (total_paid + payment). Ahora:
--   - Todo cobro de bono usa reservation_type='bono', reference_id = bono.id
--     (igual que ya hace el webhook de Stripe para compras online).
--   - "Pagos de clase" sueltos siguen siendo reservation_type='enrollment'.
-- Esta migración corrige los registros existentes mal etiquetados.
-- Ejecutar en el SQL Editor de Supabase.

UPDATE public.payments
SET reservation_type = 'bono'
WHERE reservation_type = 'enrollment'
  AND reference_id IN (SELECT id FROM public.bonos);
