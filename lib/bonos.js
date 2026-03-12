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
export async function fetchPacksForType(classType) {
  // Find the activity by type_key
  const { data: activity } = await supabase
    .from('activities')
    .select('id')
    .eq('type_key', classType)
    .eq('activo', true)
    .single();
  if (!activity) return [];

  const { data, error } = await supabase
    .from('activity_packs')
    .select('sessions, price, public, featured')
    .eq('activity_id', activity.id)
    .order('sessions', { ascending: true });
  if (error) { console.warn('fetchPacksForType:', error.message); return []; }
  return data || [];
}

// Upgrade a bono: increase total_credits via RPC (validates ownership + status)
export async function upgradeBono(bonoId, newTotalCredits) {
  const { error } = await supabase.rpc('upgrade_bono', {
    p_bono_id: bonoId,
    p_new_total_credits: newTotalCredits,
  });
  if (error) throw error;
}
