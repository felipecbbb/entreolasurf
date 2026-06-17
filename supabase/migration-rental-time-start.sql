-- Hora de inicio del alquiler de material.
-- Antes solo se guardaba el día (date_start/date_end); ahora el alta pregunta también
-- la hora de inicio. Columna nullable (los alquileres antiguos no tienen hora).
-- Aplicada en producción el 2026-06-17.

ALTER TABLE public.equipment_reservations
  ADD COLUMN IF NOT EXISTS time_start time without time zone;
