/* ============================================================
   Dominio · Precios (fuente única de verdad)
   ============================================================
   Antes, getPackPrice/getExpectedPrice/expectedBonoPrice estaban COPIADOS en
   calendario.js, clientes.js, reserva-clases.js, mi-cuenta/tabs/bonos.js y api.js,
   con nombres y matices distintos → incongruencias de "cuánto cuesta / cuánto debe".
   Aquí vive UNA sola implementación que todos importan.

   Catálogo de precios por tipo de actividad: índice 0 sin usar, índice N = precio
   del pack de N sesiones por persona. (Espejo hardcodeado; api.js puede preferir
   los activity_packs de BD y cae a este espejo si falta el tier.)
   ============================================================ */

export const PACK_PRICING = {
  grupal:     [0, 35, 65, 90, 115, 135, 155, 165],
  individual: [0, 69, 130, 177, 220, 250],
  yoga:       [0, 20, 35, 48, 60, 70, 75],
  paddle:     [0, 49, 95, 135, 170, 205, 240],
  surfskate:  [0, 30, 55, 78, 95, 115, 130],
};

// Redondeo a céntimo (usar SIEMPRE este, para no divergir entre superficies)
export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Precio de pack del catálogo para N sesiones de un tipo. Si el tipo no tiene
// tarifa, cae a fallbackPrice * N. Si N supera el último tramo, extrapola con el
// precio por sesión del tramo máximo.
export function getPackPrice(type, sessionCount, fallbackPrice = 0) {
  const n = Number(sessionCount) || 0;
  if (n <= 0) return 0;
  const tiers = PACK_PRICING[type];
  if (!tiers) return (Number(fallbackPrice) || 0) * n;
  if (n < tiers.length) return tiers[n] || 0;
  const maxTier = tiers.length - 1;
  const maxPrice = tiers[maxTier];
  const perSession = maxPrice / maxTier;
  return maxPrice + (n - maxTier) * perSession;
}

// Precio TOTAL esperado de un bono: el precio a medida (custom_total, p.ej. con
// descuento) si está fijado; si no, el del catálogo según sus créditos.
export function bonoExpected(bono) {
  if (!bono) return 0;
  return bono.custom_total != null
    ? Number(bono.custom_total)
    : getPackPrice(bono.class_type, bono.total_credits, 0);
}

// Importe pagado real de un bono (campo total_paid, que el dominio mantiene == SUM(payments)).
export function bonoPaid(bono) {
  return Number(bono?.total_paid || 0);
}

// Pendiente de cobro de un bono (nunca negativo, redondeado a céntimo).
export function bonoPending(bono) {
  return Math.max(0, round2(bonoExpected(bono) - bonoPaid(bono)));
}

// ¿Bono saldado? Pendiente (redondeado a céntimo) <= 0.
export function bonoFullyPaid(bono) {
  return bonoPending(bono) <= 0;
}

// Precio efectivo de una clase suelta: el propio de la clase si lo tiene (>0),
// si no el del catálogo de 1 sesión de su tipo.
export function classPrice(cls) {
  const p = Number(cls?.price) || 0;
  return p > 0 ? p : getPackPrice(cls?.type, 1, 0);
}
