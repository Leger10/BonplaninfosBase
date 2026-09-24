import { localSupabase as supabase } from './localSupabaseClient';

export const supabaseUrl = supabase.supabaseUrl;
export const supabaseAnonKey = supabase.supabaseKey;

export { supabase };

export default supabase;