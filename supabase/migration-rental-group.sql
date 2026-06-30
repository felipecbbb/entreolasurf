-- Migration: alquiler multi-material (varios materiales en una misma reserva)
-- ============================================================
-- Un alquiler a nombre de un cliente puede tener VARIOS materiales (1 neopreno +
-- 1 tabla + …), cada uno con su tarifa, talla y unidad. Cada material sigue siendo
-- una fila en equipment_reservations; group_id enlaza las filas de un mismo alquiler
-- para mostrarlas y gestionarlas como una sola reserva.
-- group_id NULL = alquiler de un solo material (comportamiento antiguo, intacto).
-- Ejecutar en el SQL Editor de Supabase.

ALTER TABLE public.equipment_reservations
  ADD COLUMN IF NOT EXISTS group_id uuid;

CREATE INDEX IF NOT EXISTS idx_equipment_reservations_group
  ON public.equipment_reservations(group_id);
