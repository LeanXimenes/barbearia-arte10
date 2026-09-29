import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase do site público.
 *
 * Só a chave "anon" entra aqui — ela é pública por natureza e todo o
 * controle de acesso fica no Row Level Security do banco. A service_role
 * key nunca deve ser usada no navegador.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
// Aceita a chave nova (publishable) ou a antiga (anon). As duas são públicas.
const anonKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim()

export const supabaseConfigurado = Boolean(url && anonKey)

export const supabase: SupabaseClient = createClient(
  url || 'https://configuracao-ausente.supabase.co',
  anonKey || 'chave-ausente',
  {
    auth: {
      // O site público não faz login: nenhuma sessão é guardada no navegador.
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: { eventsPerSecond: 4 },
    },
    global: {
      headers: { 'x-cliente': 'site-arte10' },
    },
  }
)
