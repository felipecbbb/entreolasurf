import { supabase } from '/lib/supabase.js';

export async function fetchFamilyMembers() {
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createFamilyMember({ full_name, last_name, birth_date, level, notes, can_swim, has_injury, injury_detail, wetsuit_size }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('family_members')
    .insert({ user_id: user.id, full_name, last_name: last_name || '', birth_date: birth_date || null, level: level || null, notes: notes || null, can_swim: can_swim ?? null, has_injury: has_injury ?? null, injury_detail: injury_detail || null, wetsuit_size: wetsuit_size || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFamilyMember(id, fields) {
  const { data, error } = await supabase
    .from('family_members')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFamilyMember(id) {
  const { error } = await supabase.from('family_members').delete().eq('id', id);
  if (error) throw error;
}
