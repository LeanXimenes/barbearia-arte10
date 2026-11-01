import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AgendamentoConfirmado, Conta, RespostaConta } from '../lib/tipos'
import {
  carregarMinhaConta,
  criarConta,
  entrarNaConta,
  sairDaConta,
  type DadosNovaConta,
} from '../servicos/api'
import { apagarSessao, lerSessao, salvarSessao, type SessaoSalva } from '../lib/sessaoSalva'
import { esquecerCliente, salvarCliente } from '../lib/clienteSalvo'
import { MSG_CONTA_FALHA, MSG_CONTA_SEM_CONEXAO, pareceFalhaDeRede } from '../lib/erros'
import { desligarLembretes, sincronizarLembretes } from '../lib/avisosCliente'

export type ResultadoConta = { ok: true } | { ok: false; erro?: string; mensagem: string }

interface ValorConta {
  conta: Conta | null
  token: string | null
  proximos: AgendamentoConfirmado[]
  anteriores: AgendamentoConfirmado[]
  /** Buscando os horários da conta no servidor. */
  carregando: boolean
  /** A última busca falhou (sem internet, servidor fora). */
  erro: boolean
  entrar: (login: string, senha: string) => Promise<ResultadoConta>
  criar: (dados: DadosNovaConta) => Promise<ResultadoConta>
  sair: () => void
  atualizar: () => Promise<void>
  /** O servidor respondeu que a sessão acabou: volta a ser visitante. */
  sessaoExpirou: () => void
}

const ContextoConta = createContext<ValorConta | null>(null)

export function ProvedorConta({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<SessaoSalva | null>(() => lerSessao())
  const [proximos, setProximos] = useState<AgendamentoConfirmado[]>([])
  const [anteriores, setAnteriores] = useState<AgendamentoConfirmado[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)

  const tokenRef = useRef<string | null>(sessao?.token ?? null)
  // Só a busca mais recente pode mexer na tela (entrar/sair no meio dela).
  const pedidoRef = useRef(0)
  // O cadastro do aparelho para os lembretes é conferido uma vez por abertura.
  const lembretesConferidos = useRef(false)

  const aplicarSessao = useCallback((nova: SessaoSalva | null) => {
    tokenRef.current = nova?.token ?? null
    setSessao(nova)
    if (nova) {
      salvarSessao(nova)
      // Plano do Clube e agendamento sem conta passam a vir preenchidos.
      salvarCliente({ nome: nova.conta.nome, telefone: nova.conta.telefone })
    } else {
      pedidoRef.current++
      apagarSessao()
      setProximos([])
      setAnteriores([])
      setCarregando(false)
      setErro(false)
    }
  }, [])

  const atualizar = useCallback(async () => {
    const token = tokenRef.current
    if (!token) return
    const pedido = ++pedidoRef.current
    setCarregando(true)
    setErro(false)
    try {
      const r = await carregarMinhaConta(token)
      if (pedido !== pedidoRef.current) return
      if (r.ok) {
        setProximos(r.proximos)
        setAnteriores(r.anteriores)
        aplicarSessao({ token, conta: r.conta })
        if (!lembretesConferidos.current) {
          lembretesConferidos.current = true
          void sincronizarLembretes(token).catch(() => {})
        }
      } else if (r.erro === 'SESSAO_EXPIRADA') {
        aplicarSessao(null)
      } else {
        setErro(true)
      }
    } catch {
      if (pedido === pedidoRef.current) setErro(true)
    } finally {
      if (pedido === pedidoRef.current) setCarregando(false)
    }
  }, [aplicarSessao])

  // Ao abrir o site, confere se a sessão guardada ainda vale.
  useEffect(() => {
    void atualizar()
  }, [atualizar])

  const concluirLogin = useCallback(
    async (chamada: () => Promise<RespostaConta>): Promise<ResultadoConta> => {
      try {
        const r = await chamada()
        if (!r.ok) return { ok: false, erro: r.erro, mensagem: r.mensagem }
        aplicarSessao({ token: r.sessao.token, conta: r.conta })
        void atualizar()
        return { ok: true }
      } catch (e) {
        return { ok: false, mensagem: pareceFalhaDeRede(e) ? MSG_CONTA_SEM_CONEXAO : MSG_CONTA_FALHA }
      }
    },
    [aplicarSessao, atualizar],
  )

  const entrar = useCallback(
    (login: string, senha: string) => concluirLogin(() => entrarNaConta(login, senha)),
    [concluirLogin],
  )

  const criar = useCallback(
    (dados: DadosNovaConta) => concluirLogin(() => criarConta(dados)),
    [concluirLogin],
  )

  const sair = useCallback(() => {
    const token = tokenRef.current
    aplicarSessao(null)
    esquecerCliente()
    // Este aparelho para de receber os lembretes da conta; depois encerra a sessão.
    if (token) {
      void desligarLembretes(token).finally(() => {
        sairDaConta(token).catch(() => {})
      })
    }
  }, [aplicarSessao])

  const sessaoExpirou = useCallback(() => aplicarSessao(null), [aplicarSessao])

  const valor = useMemo<ValorConta>(
    () => ({
      conta: sessao?.conta ?? null,
      token: sessao?.token ?? null,
      proximos,
      anteriores,
      carregando,
      erro,
      entrar,
      criar,
      sair,
      atualizar,
      sessaoExpirou,
    }),
    [sessao, proximos, anteriores, carregando, erro, entrar, criar, sair, atualizar, sessaoExpirou],
  )

  return <ContextoConta.Provider value={valor}>{children}</ContextoConta.Provider>
}

export function useConta(): ValorConta {
  const valor = useContext(ContextoConta)
  if (!valor) throw new Error('useConta precisa estar dentro de <ProvedorConta>')
  return valor
}
