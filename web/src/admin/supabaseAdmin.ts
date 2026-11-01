import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase do painel do dono (/admin).
 *
 * Diferente do site: aqui existe login (conta de administrador do Supabase
 * Auth, a mesma regra do app Android) e a sessão fica salva no aparelho,
 * renovada sozinha. Tudo o que o painel enxerga passa pelo RLS do banco:
 * sem estar em public.administradores, a conta não vê nada.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const chave = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim()

export const painelConfigurado = Boolean(url && chave)

export const supabaseAdmin: SupabaseClient = createClient(
  url || 'https://configuracao-ausente.supabase.co',
  chave || 'chave-ausente',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'arte10-painel',
    },
    realtime: { params: { eventsPerSecond: 4 } },
    global: { headers: { 'x-cliente': 'painel-arte10' } },
  },
)
