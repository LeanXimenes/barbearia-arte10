import { useCallback, useEffect, useRef, useState } from 'react'
import { assinarConteudo, carregarConfig, carregarFuncionamento, carregarServicos } from '../servicos/api'
import type { ConfigBarbearia, HorarioFuncionamento, Servico } from '../lib/tipos'
import { supabaseConfigurado } from '../lib/supabase'

interface Estado {
  config: ConfigBarbearia | null
  servicos: Servico[]
  funcionamento: HorarioFuncionamento[]
  carregando: boolean
  erro: string | null
}

const INICIAL: Estado = {
  config: null,
  servicos: [],
  funcionamento: [],
  carregando: true,
  erro: null,
}

/**
 * Carrega o conteúdo do site direto do Supabase e mantém tudo em dia:
 * se o proprietário mudar preço, horário de funcionamento ou desativar
 * um serviço pelo aplicativo, o site reflete sem recarregar a página.
 */
export function useDadosDaBarbearia() {
  const [estado, setEstado] = useState<Estado>(INICIAL)
  const montado = useRef(true)

  const carregar = useCallback(async (silencioso = false) => {
    if (!supabaseConfigurado) {
      setEstado({ ...INICIAL, carregando: false, erro: 'configuracao' })
      return
    }

    if (!silencioso) {
      setEstado((a) => ({ ...a, carregando: true, erro: null }))
    }

    try {
      const [config, servicos, funcionamento] = await Promise.all([
        carregarConfig(),
        carregarServicos(),
        carregarFuncionamento(),
      ])

      if (!montado.current) return
      setEstado({ config, servicos, funcionamento, carregando: false, erro: null })
    } catch {
      if (!montado.current) return
      setEstado((a) => ({ ...a, carregando: false, erro: 'falha' }))
    }
  }, [])

  useEffect(() => {
    montado.current = true
    void carregar()
    return () => {
      montado.current = false
    }
  }, [carregar])

  // Realtime: mudanças feitas pelo aplicativo do proprietário chegam aqui.
  useEffect(() => {
    if (!supabaseConfigurado) return
    return assinarConteudo(() => {
      void carregar(true)
    })
  }, [carregar])

  return { ...estado, recarregar: () => carregar(false) }
}
