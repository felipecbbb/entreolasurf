/* ============================================================
   Precio de camps por volumen — fuente única en JS
   ------------------------------------------------------------
   Espejo de la función SQL camp_price_for(). Si cambias una, cambia la otra:
   el frontend usa esta para mostrar, y la BD la suya para verificar.
   Tramos: precio POR PERSONA a partir de N plazas. Las plazas por encima del
   último tramo van a extra_spot_price (o al precio del último tramo).
   ============================================================ */

/**
 * @param {number} spots        plazas pedidas
 * @param {{price:number, extra_spot_price?:number|null}} camp
 * @param {{spots:number, price_per_person:number}[]} tiers
 * @returns {{total:number, perPerson:number, tierSpots:number|null, saving:number}}
 */
export function campPriceFor(spots, camp, tiers = []) {
  const n = Math.max(1, Math.floor(Number(spots) || 1));
  const base = Number(camp?.price) || 0;
  const list = (tiers || [])
    .map(t => ({ spots: Number(t.spots), price: Number(t.price_per_person) }))
    .filter(t => Number.isFinite(t.spots) && t.spots >= 1 && Number.isFinite(t.price))
    .sort((a, b) => a.spots - b.spots);

  const sinDescuento = base * n;
  if (!list.length) {
    return { total: round2(sinDescuento), perPerson: round2(base), tierSpots: null, saving: 0 };
  }

  const maxq = list[list.length - 1].spots;
  const tier = [...list].reverse().find(t => t.spots <= n) || null;

  let total;
  if (!tier) total = base * n;                       // pide menos que el primer tramo
  else if (n <= maxq) total = tier.price * n;
  else {
    const extra = camp?.extra_spot_price == null ? tier.price : Number(camp.extra_spot_price);
    total = tier.price * maxq + extra * (n - maxq);
  }

  return {
    total: round2(total),
    perPerson: round2(total / n),
    tierSpots: tier ? tier.spots : null,
    saving: round2(Math.max(sinDescuento - total, 0)),
  };
}

function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

export function formatEuro(v) {
  return `${Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 })}€`;
}
