/* ============================================================
   Auth Module — Login / Logout / Session verification
   ============================================================ */
import { supabase } from '/lib/supabase.js';

let currentUser = null;
let currentProfile = null;

export function getUser() { return currentUser; }
export function getProfile() { return currentProfile; }

// Check if session exists and user is admin
export async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  currentUser = session.user;
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    await supabase.auth.signOut();
    currentUser = null;
    currentProfile = null;
    return false;
  }

  currentProfile = profile;
  return true;
}

// Sign in with email/password, verify admin role
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  currentUser = data.user;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    await supabase.auth.signOut();
    currentUser = null;
    currentProfile = null;
    throw new Error('No tienes permisos de administrador');
  }

  currentProfile = profile;
}

// Sign out
export async function signOut() {
  await supabase.auth.signOut();
  currentUser = null;
  currentProfile = null;
}

// Listen for auth state changes (session expiry, etc.)
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      currentUser = null;
      currentProfile = null;
      callback(false);
    }
  });
}
