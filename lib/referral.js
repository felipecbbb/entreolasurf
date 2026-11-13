/* ============================================================
   Referidos — captura del código de vendedor (?ref=codigo)
   ------------------------------------------------------------
   Cualquier página con ?ref=lucia guarda el código 30 días. Gana el
   último enlace (last click). Solo cuenta para Surf Camps: se manda a
   create-checkout, que lo valida contra la BD (aquí no se confía en nada).
   ============================================================ */
import { supabase } from '/lib/supabase.js';

const KEY = 'eo_ref';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_RE = /^[a-z0-9-]{2,40}$/;

export function captureReferral() {
  try {
    const raw = new URLSearchParams(location.search).get('ref');
    if (!raw) return;
    const code = raw.trim().toLowerCase();
    if (!CODE_RE.test(code)) return;
    localStorage.setItem(KEY, JSON.stringify({ code, ts: Date.now() }));
  } catch { /* modo privado / storage lleno: sin atribución, no rompe nada */ }
}

export function getReferralCode() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v?.code || !CODE_RE.test(v.code)) return null;
    if (Date.now() - Number(v.ts || 0) > TTL_MS) { localStorage.removeItem(KEY); return null; }
    return v.code;
  } catch { return null; }
}

/** Nombre y descuento del vendedor activo (o null). Nunca expone la comisión. */
export async function getReferralInfo() {
  const code = getReferralCode();
  if (!code) return null;
  const { data, error } = await supabase.rpc('referral_info', { p_code: code });
  if (error || !data?.length) return null;
  return { code, ...data[0] };
}

/** Texto del descuento para mostrar al cliente, o '' si no tiene. */
export function referralDiscountLabel(info) {
  const v = Number(info?.discount_value) || 0;
  if (!info || info.discount_type === 'none' || v <= 0) return '';
  return info.discount_type === 'percent'
    ? `${v}% de descuento en el total del Surf Camp`
    : `${v.toLocaleString('es-ES')}€ de descuento por plaza en el total del Surf Camp`;
}
