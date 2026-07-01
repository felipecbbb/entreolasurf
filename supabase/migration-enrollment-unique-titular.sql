-- Migration (OPCIONAL, defensa en profundidad): cerrar el hueco del índice único de
-- inscripciones para el TITULAR (family_member_id NULL).
-- ============================================================
-- El índice único actual es (class_id, user_id, family_member_id) WHERE status!='cancelled'.
-- Postgres trata los NULL como DISTINTOS, así que un mismo titular (family_member_id NULL)
-- puede inscribirse dos veces en la misma clase sin que la BD lo impida. El dedup de la app
-- ya lo previene (y ahora falla-cerrado), pero esto es una red a nivel BD.
--
-- ⚠️ Antes de aplicar, ELIMINA las inscripciones duplicadas de titular ya existentes o el
-- CREATE fallará. Detectarlas:
--   SELECT class_id, user_id, count(*) FROM class_enrollments
--   WHERE family_member_id IS NULL AND status <> 'cancelled'
--   GROUP BY 1,2 HAVING count(*) > 1;
--
-- Ejecutar en el SQL Editor de Supabase.

DROP INDEX IF EXISTS idx_unique_enrollment;
CREATE UNIQUE INDEX idx_unique_enrollment
  ON public.class_enrollments
    (class_id, user_id, coalesce(family_member_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status <> 'cancelled';
