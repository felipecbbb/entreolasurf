-- ============================================================
-- PAYMENTS — Columna 'channel' (web | in_person)
-- Permite distinguir pagos online (Stripe) de presenciales (playa).
-- Aplicar manualmente en Supabase Dashboard → SQL Editor.
-- ============================================================

-- 1) Añadir columna channel
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_person';

-- 2) Constraint de valores válidos
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_channel_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_channel_check
  CHECK (channel IN ('web', 'in_person'));

-- 3) Backfill: pagos cuyo método sea 'online' o 'stripe' son canal web.
UPDATE public.payments
   SET channel = 'web'
 WHERE channel = 'in_person'
   AND payment_method IN ('online', 'stripe');

-- 4) Normalizar 'stripe' → 'online' (el CHECK de payment_method no permite 'stripe',
--    pero por si acaso hay filas creadas saltándose el constraint).
UPDATE public.payments
   SET payment_method = 'online'
 WHERE payment_method = 'stripe';

-- 5) Índice para queries por canal (útil al filtrar en estadísticas)
CREATE INDEX IF NOT EXISTS idx_payments_channel
  ON public.payments(channel, payment_date DESC);

-- Recargar caché PostgREST
SELECT pg_notify('pgrst', 'reload schema');
