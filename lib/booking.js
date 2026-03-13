import { supabase } from '/lib/supabase.js';

export async function bookClass(classId, bonoId, familyMemberId = null) {
  const { data, error } = await supabase.rpc('book_class', {
    p_class_id: classId,
    p_bono_id: bonoId,
    p_family_member_id: familyMemberId,
  });
  if (error) throw error;
  return data;
}

export async function cancelEnrollment(enrollmentId, cancelledBy = 'client') {
  const { error } = await supabase.rpc('cancel_enrollment', {
    p_enrollment_id: enrollmentId,
  });
  if (error) throw error;
  // Set cancelled_by after RPC (RPC doesn't know about this field yet)
  const { error: updateError } = await supabase
    .from('class_enrollments')
    .update({ cancelled_by: cancelledBy })
    .eq('id', enrollmentId);
  if (updateError) console.warn('cancelEnrollment: could not set cancelled_by', updateError.message);
}

export async function fetchPublishedClasses(filters = {}) {
  let query = supabase
    .from('surf_classes')
    .select('*')
    .eq('published', true)
    .eq('status', 'scheduled')
    .gte('date', new Date().toISOString().slice(0, 10))
    .order('date', { ascending: true })
    .order('time_start', { ascending: true });

  if (filters.type) query = query.eq('type', filters.type);
  if (filters.level && filters.level !== 'todos') query = query.or(`level.eq.${filters.level},level.eq.todos`);
  if (filters.date) query = query.eq('date', filters.date);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchUserEnrollments() {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return [];
  const { data, error } = await supabase
    .from('class_enrollments')
    .select('*, surf_classes(*), family_members(full_name), bonos(class_type)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
