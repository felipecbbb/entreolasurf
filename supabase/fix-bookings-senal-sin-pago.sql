-- ============================================================
-- Fix · Señal de surf camp cobrada pero no descontada del total
-- ------------------------------------------------------------
-- Causa: el alta manual de reservas (admin → Reservas → "Nueva reserva de
-- camp") guardaba bookings.deposit_amount pero NO creaba la fila en `payments`.
-- Como la ficha calcula lo pagado con SUM(payments), la señal aparecía como
-- cobrada en el listado y a la vez sin descontar del total en la ficha.
-- El alta ya está corregida en admin/sections/reservas.js; este script repara
-- las reservas creadas ANTES del fix.
--
-- Ejecutar por pasos en el SQL Editor de Supabase. Revisar el paso 1 ANTES de
-- correr el paso 2.
-- ============================================================

-- ---- 1) DIAGNÓSTICO: reservas con señal registrada y sin pagos que la respalden
--         (revisa esta lista y decide si todas son cobros reales)
SELECT b.id,
       b.guest_name,
       sc.title            AS camp,
       b.status,
       b.total_amount,
       b.deposit_amount    AS senal_declarada,
       COALESCE(p.pagado, 0) AS pagos_registrados,
       b.created_at
FROM bookings b
LEFT JOIN surf_camps sc ON sc.id = b.camp_id
LEFT JOIN (
  SELECT reference_id, SUM(amount) AS pagado
  FROM payments
  WHERE reservation_type = 'booking'
  GROUP BY reference_id
) p ON p.reference_id = b.id
WHERE b.deposit_amount > COALESCE(p.pagado, 0)
  AND b.status NOT IN ('cancelled', 'refunded')
ORDER BY b.created_at DESC;

-- ---- 2) REPARACIÓN: crea el pago que falta por la diferencia
--         Método 'efectivo' por defecto: si alguna se cobró por tarjeta o
--         transferencia, edítala después desde la ficha (lápiz del pago).
--         Idempotente: al volver a correrlo ya no hay diferencia que cubrir.
INSERT INTO payments (reservation_type, reference_id, amount, payment_method, channel, concept, payment_date)
SELECT 'booking',
       b.id,
       ROUND((b.deposit_amount - COALESCE(p.pagado, 0))::numeric, 2),
       'efectivo',
       'in_person',
       'Señal surf camp (regularización)',
       COALESCE(b.created_at, NOW())
FROM bookings b
LEFT JOIN (
  SELECT reference_id, SUM(amount) AS pagado
  FROM payments
  WHERE reservation_type = 'booking'
  GROUP BY reference_id
) p ON p.reference_id = b.id
WHERE b.deposit_amount > COALESCE(p.pagado, 0)
  AND b.status NOT IN ('cancelled', 'refunded');

-- ---- 3) Resincroniza importe y estado desde la suma real de pagos
UPDATE bookings b
SET deposit_amount = s.pagado,
    status = CASE
      WHEN s.pagado <= 0 THEN 'pending'
      WHEN b.total_amount > 0 AND s.pagado >= b.total_amount THEN 'fully_paid'
      ELSE 'deposit_paid'
    END,
    updated_at = NOW()
FROM (
  SELECT reference_id, SUM(amount) AS pagado
  FROM payments
  WHERE reservation_type = 'booking'
  GROUP BY reference_id
) s
WHERE s.reference_id = b.id
  AND b.status NOT IN ('cancelled', 'refunded');

-- ---- 4) Verificación: no debe devolver ninguna fila
SELECT b.id, b.deposit_amount, COALESCE(p.pagado, 0) AS pagos
FROM bookings b
LEFT JOIN (
  SELECT reference_id, SUM(amount) AS pagado
  FROM payments WHERE reservation_type = 'booking' GROUP BY reference_id
) p ON p.reference_id = b.id
WHERE b.deposit_amount <> COALESCE(p.pagado, 0)
  AND b.status NOT IN ('cancelled', 'refunded');
