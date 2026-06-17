/* ============================================================
   Dominio · Bonos (ciclo de vida: buscar / crear / ampliar)
   ============================================================
   Antes, la búsqueda del bono del dueño, la creación y la ampliación (y la
   caducidad por defecto +12 meses) estaban copiadas en el confirm del calendario,
   en openCreateBono/openExpandBono de clientes y calendario, y en lib/bonos.js.
   Aquí viven los bloques canónicos. (El total_paid lo gobierna /lib/domain/payments.js;
   used_credits/status los gobierna el trigger update_bono_credits.)
   ============================================================ */
import { supabase } from '/lib/supabase.js';
import { round2 } from '/lib/domain/pricing.js';

// Caducidad por defecto de un bono nuevo/ampliado.
export function defaultBonoExpiry(months = 12) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

// Créditos libres de un bono.
export function bonoAvailable(bono) {
  if (!bono) return 0;
  return Math.max(0, (bono.total_credits || 0) - (bono.used_credits || 0));
}

// Bono "vivo" del dueño para un tipo: activo o agotado, no caducado. Prefiere uno
// con créditos libres (no malgastar prepago) antes que el más reciente.
export async function findOwnerBono(ownerId, classType) {
  if (!ownerId) return null;
  const { data } = await supabase.from('bonos')
    .select('*').eq('user_id', ownerId).eq('class_type', classType)
    .in('status', ['active', 'exhausted']).gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  const list = data || [];
  return list.find(b => bonoAvailable(b) > 0) || list[0] || null;
}

// Crea un bono. total_paid lo deja en 0 por defecto (regístralo como payment y usa
// recalcBonoPaid). Devuelve el id.
export async function createBono({ user_id, class_type, total_credits, custom_total, total_paid = 0, expires_at }) {
  const { data, error } = await supabase.from('bonos').insert({
    user_id,
    class_type,
    total_credits: Math.max(1, Number(total_credits) || 0),
    used_credits: 0,
    status: 'active',
    total_paid: round2(total_paid),
    custom_total: custom_total != null ? round2(custom_total) : null,
    expires_at: expires_at || defaultBonoExpiry(),
  }).select('id').single();
  if (error) throw error;
  return data?.id || null;
}

// Amplía un bono existente (créditos y/o precio a medida). No toca total_paid.
export async function extendBono(bonoId, { newTotalCredits, newCustomTotal, status, expires_at } = {}) {
  const upd = { updated_at: new Date().toISOString() };
  if (newTotalCredits != null) upd.total_credits = newTotalCredits;
  if (newCustomTotal != null) upd.custom_total = round2(newCustomTotal);
  if (status) upd.status = status;
  if (expires_at) upd.expires_at = expires_at;
  const { error } = await supabase.from('bonos').update(upd).eq('id', bonoId);
  if (error) throw error;
}
