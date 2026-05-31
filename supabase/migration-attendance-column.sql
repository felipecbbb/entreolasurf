-- Migration: separar ASISTENCIA del PAGO en class_enrollments
-- ============================================================
-- Hasta ahora 'status' mezclaba dos cosas distintas:
--   - estado de pago/ciclo de vida: confirmed / partial / paid / cancelled
--   - asistencia a la clase: completed (asistió) / no_show (no se presentó)
-- Eso hacía que marcar asistencia pisara el color de pago (un impago pasaba
-- a verde al marcar "asistió"). Separamos la asistencia en su propia columna.
--
-- attendance: null = sin marcar · true = asistió · false = no se presentó
-- El color de pago se rige SOLO por status. La asistencia ya no toca status.
--
-- Ejecutar en el SQL Editor de Supabase.

-- 1. Nueva columna de asistencia (independiente del pago)
ALTER TABLE public.class_enrollments
  ADD COLUMN IF NOT EXISTS attendance boolean;

COMMENT ON COLUMN public.class_enrollments.attendance IS
  'Asistencia a la clase, independiente del pago: null=sin marcar, true=asistió, false=no se presentó';

-- 2. Migrar inscripciones existentes que usaban status para la asistencia
--    completed = asistió (se renderizaba como pagado/verde) -> attendance true + status paid
UPDATE public.class_enrollments
  SET attendance = true, status = 'paid', updated_at = now()
  WHERE status = 'completed';

--    no_show = no se presentó -> attendance false + status confirmed (pago pendiente)
UPDATE public.class_enrollments
  SET attendance = false, status = 'confirmed', updated_at = now()
  WHERE status = 'no_show';

-- 3. Endurecer el check: status ya solo guarda pago/ciclo de vida.
--    La asistencia vive en la columna attendance.
ALTER TABLE public.class_enrollments DROP CONSTRAINT IF EXISTS class_enrollments_status_check;
ALTER TABLE public.class_enrollments ADD CONSTRAINT class_enrollments_status_check
  CHECK (status IN ('confirmed','cancelled','paid','partial'));
