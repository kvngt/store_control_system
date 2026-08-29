import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Whether the required build-time env vars are present. Checked by App.tsx
// before rendering anything that depends on Supabase — a missing config
// used to throw here at *import time*, which crashed the whole module graph
// before React ever got a chance to render a helpful message (this is
// exactly what happened on the first Hostinger deploy: a blank black screen
// with no clue why).
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Create a single supabase client for interacting with your database. When
// misconfigured we still create a client (with placeholder values) so that
// importing this module never throws; `isSupabaseConfigured` is what gates
// whether the app actually renders.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);
