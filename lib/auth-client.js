/* ============================================================
   Auth Client — public-facing auth helpers (no admin check)
   ============================================================ */
import { supabase } from '/lib/supabase.js';

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  return data;
}

export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: window.location.origin + '/mi-cuenta/',
    },
  });
  if (error) throw new Error(error.message);

  // If email confirmation is disabled, user is already logged in
  // If not, try to auto-login immediately
  if (!data.session) {
    try {
      const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
      if (!loginErr) return loginData;
    } catch {}
  }
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function updateProfile(fields) {
  const session = await getSession();
  if (!session) throw new Error('No hay sesión activa');
  const { data, error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', session.user.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
