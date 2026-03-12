import { supabase } from '/lib/supabase.js';

export async function fetchFamilyMembers() {
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createFamilyMember({ full_name, birth_date, level, notes }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('family_members')
    .insert({ user_id: user.id, full_name, birth_date: birth_date || null, level: level || null, notes: notes || null })
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
