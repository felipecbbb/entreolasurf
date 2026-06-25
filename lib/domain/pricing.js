/* ============================================================
   Dominio · Precios (fuente única de verdad)
   ============================================================
   Antes, getPackPrice/getExpectedPrice/expectedBonoPrice estaban COPIADOS en
   calendario.js, clientes.js, reserva-clases.js, mi-cuenta/tabs/bonos.js y api.js,
   con nombres y matices distintos → incongruencias de "cuánto cuesta / cuánto debe".
   Aquí vive UNA sola implementación que todos importan.

   Los precios viven SOLO en la BD (activity_packs + activities.extra_class_price),
   cargados por loadPricing(). Ya NO hay catálogo de precios hardcodeado: si la BD
   no está disponible, getPackPrice usa la pista del llamador (precio propio de la
   clase) en vez de inventar precios viejos que podrían cobrarse en silencio.
   ============================================================ */

import { supabase } from '/lib/supabase.js';

// Redondeo a céntimo (usar SIEMPRE este, para no divergir entre superficies)
export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Tarifas REALES desde la BD (activity_packs), cacheadas. getPackPrice las usa.
// Si la BD no está disponible, NO se inventan precios (sin catálogo hardcodeado).
// Llamar loadPricing() al arrancar admin y mi-cuenta para que TODAS las superficies
// (ficha, listados, pendientes) usen el MISMO precio que la pantalla de tarifas.
let _dbTiers = null, _dbTs = 0;
export async function loadPricing(force = false) {
  if (!force && _dbTiers && (Date.now() - _dbTs) < 60000) return _dbTiers;
  try {
    const [actsRes, packsRes] = await Promise.all([
      supabase.from('activities').select('id, type_key, extra_class_price'),
      supabase.from('activity_packs').select('activity_id, sessions, price'),
    ]);
    const byId = {}; (actsRes.data || []).forEach(a => { byId[a.id] = a; });
    const map = {};
    (actsRes.data || []).forEach(a => { map[a.type_key] = { byN: {}, extra: Number(a.extra_class_price) || 0, maxN: 0, maxPrice: 0 }; });
    (packsRes.data || []).forEach(p => {
      const a = byId[p.activity_id]; if (!a) return;
      const m = map[a.type_key]; if (!m) return;
      m.byN[p.sessions] = Number(p.price);
      if (p.sessions > m.maxN) { m.maxN = p.sessions; m.maxPrice = Number(p.price); }
    });
    _dbTiers = map; _dbTs = Date.now();
  } catch { /* mantiene el fallback hardcodeado */ }
  return _dbTiers;
}

// Precio de pack para N sesiones de un tipo. Usa las tarifas de BD si están cargadas
// (loadPricing), si no el catálogo. Si N supera el tramo máximo, extrapola; si el tipo
// no existe, cae a fallbackPrice * N.
export function getPackPrice(type, sessionCount, fallbackPrice = 0) {
  const n = Number(sessionCount) || 0;
  if (n <= 0) return 0;
  const m = _dbTiers && _dbTiers[type];
  if (m && m.maxN > 0) {
    if (m.byN[n] != null) return m.byN[n];                              // tarifa exacta de BD
    if (n > m.maxN) return round2(m.maxPrice + (n - m.maxN) * m.extra); // + precio clase extra
    return round2((m.maxPrice / m.maxN) * n);                          // tramo intermedio
  }
  // BD no cargada/caída: no inventamos precios viejos; usamos la pista del llamador.
  return round2((Number(fallbackPrice) || 0) * n);
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
