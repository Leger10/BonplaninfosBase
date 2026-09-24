// src/lib/supabase.js — client local (émule Supabase via serveur Express).
import { localSupabase as supabase } from './localSupabaseClient'

// Test de connexion (optionnel)
export const testConnection = async () => {
  try {
    const { data, error } = await supabase.from('profiles').select('id').limit(1)
    if (error) throw error
    console.log('✅ Connexion locale réussie')
    return true
  } catch (error) {
    console.error('❌ Erreur de connexion locale:', error)
    return false
  }
}

export { supabase }