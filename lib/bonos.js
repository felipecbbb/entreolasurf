import { supabase } from '/lib/supabase.js';

export async function fetchUserBonos() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('bonos')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchActiveBonos(classType) {
  const { data: { user } } = await supabase.auth.getUser();
  let query = supabase
    .from('bonos')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString());

  if (classType) query = query.eq('class_type', classType);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).filter(b => b.used_credits < b.total_credits);
}

// Fetch activity packs for a given class type (for upgrade pricing)
// Returns { packs, deposit } where deposit is the activity's deposit amount
export async function fetchPacksForType(classType) {
  // Find the activity by type_key
  const { data: activity } = await supabase
    .from('activities')
    .select('id, deposit, extra_class_price')
    .eq('type_key', classType)
    .eq('activo', true)
    .single();
  if (!activity) return { packs: [], deposit: 15, extraClassPrice: 0 };

  const deposit = Number(activity.deposit) || 15;
  const extraClassPrice = Number(activity.extra_class_price) || 0;

  const { data, error } = await supabase
    .from('activity_packs')
    .select('sessions, price, public, featured')
    .eq('activity_id', activity.id)
    .order('sessions', { ascending: true });
  if (error) { console.warn('fetchPacksForType:', error.message); return { packs: [], deposit, extraClassPrice }; }
  return { packs: data || [], deposit, extraClassPrice };
}

// Upgrade a bono: increase total_credits via RPC (validates ownership + status)
// amountPaid = the amount the client pays for this upgrade
export async function upgradeBono(bonoId, newTotalCredits, amountPaid = 0) {
  const { error } = await supabase.rpc('upgrade_bono', {
    p_bono_id: bonoId,
    p_new_total_credits: newTotalCredits,
  });
  if (error) throw error;

  // Update total_paid on the bono
  if (amountPaid > 0) {
    const { data: bono } = await supabase.from('bonos').select('total_paid').eq('id', bonoId).single();
    const currentPaid = Number(bono?.total_paid || 0);
    await supabase.from('bonos').update({
      total_paid: currentPaid + amountPaid,
      updated_at: new Date().toISOString(),
    }).eq('id', bonoId);
  }
}
