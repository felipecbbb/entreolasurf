import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase;
try {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} catch (e) {
  console.error('Supabase init failed:', e);
  // Provide a dummy client so modules can still load
  supabase = new Proxy({}, {
    get: () => () => ({ data: null, error: { message: 'Supabase not configured' } }),
  });
}

export { supabase };
