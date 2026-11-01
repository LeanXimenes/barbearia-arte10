import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { painelConfigurado, supabaseAdmin } from './supabaseAdmin'
import { ehAdministrador, sair } from './api'
import { ProvedorAviso } from './componentes'
import { Login } from './telas/Login'
import { Inicio } from './telas/Inicio'
import { Agenda } from './telas/Agenda'
import { Historico } from './telas/Historico'
import { Clientes } from './telas/Clientes'
import { Servicos } from './telas/Servicos'
import { Clube } from './telas/Clube'
import { Ajustes } from './telas/Ajustes'
import { useOnline } from '../hooks/useOnline'
import { sincronizarAvisos } from './push'
import {
  IconeCalendario,
  IconeCoroa,
  IconeInicio,
  IconeTesoura,
  IconeUsuario,
} from '../componentes/Icones'

export type IdAba = 'inicio' | 'agenda' | 'clientes' | 'servicos' | 'clube' | 'ajustes'

const IconeAjustes = ({ tamanho = 21 }: { tamanho?: number }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)

const ABAS: Array<{ id: IdAba; texto: string; icone: (p: { tamanho?: number }) => ReactNode }> = [
  { id: 'inicio', texto: 'Início', icone: IconeInicio },
  { id: 'agenda', texto: 'Agenda', icone: IconeCalendario },
  { id: 'clientes', texto: 'Clientes', icone: IconeUsuario },
  { id: 'servicos', texto: 'Serviços', icone: IconeTesoura },
  { id: 'clube', texto: 'Clube', icone: IconeCoroa },
  { id: 'ajustes', texto: 'Ajustes', icone: IconeAjustes },
]

/** "#agenda=2026-11-04" (vem do aviso tocado) -> aba e dia. */
function lerEndereco(): { aba: IdAba; dia: string | null; historico: boolean } {
  const [nome, valor] = window.location.hash.replace(/^#/, '').split('=')
  if (nome === 'historico') return { aba: 'inicio', dia: null, historico: true }
  const aba = ABAS.some((a) => a.id === nome) ? (nome as IdAba) : 'inicio'
  const dia = aba === 'agenda' && valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
  return { aba, dia, historico: false }
}

type EstadoSessao =
  | { tipo: 'carregando' }
  | { tipo: 'fora'; aviso?: string }
  | { tipo: 'dentro'; email: string }

export function PainelApp() {
  return (
    <ProvedorAviso>
      <Raiz />
    </ProvedorAviso>
  )
}

function Raiz() {
  const [sessao, setSessao] = useState<EstadoSessao>({ tipo: 'carregando' })

  const conferir = useCallback(async () => {
    const { data } = await supabaseAdmin.auth.getSession()
    const email = data.session?.user.email
    if (!data.session) {
      setSessao({ tipo: 'fora' })
      return
    }
    try {
      if (await ehAdministrador()) {
        setSessao({ tipo: 'dentro', email: email ?? '' })
        void sincronizarAvisos()
      } else {
        await sair()
        setSessao({
          tipo: 'fora',
          aviso: 'Essa conta não está liberada como administradora da barbearia (tabela administradores no Supabase).',
        })
      }
    } catch {
      // Sem internet ao abrir: continua com a sessão salva; as telas avisam.
      setSessao({ tipo: 'dentro', email: email ?? '' })
    }
  }, [])

  useEffect(() => {
    void conferir()
    const { data } = supabaseAdmin.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_IN') void conferir()
      if (evento === 'SIGNED_OUT') setSessao({ tipo: 'fora' })
    })
    return () => data.subscription.unsubscribe()
  }, [conferir])

  if (!painelConfigurado) {
    return (
      <div className="p-login">
        <div className="p-login__caixa">
          <h1 className="p-login__titulo">Painel sem configuração</h1>
          <p className="p-login__texto">
            Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no web/.env e gere o site de novo.
          </p>
        </div>
      </div>
    )
  }

  if (sessao.tipo === 'carregando') {
    return (
      <div className="p-login">
        <img src="/logo-arte10-mini.jpg" alt="" width={72} height={72} className="p-login__logo p-pulsar" />
      </div>
    )
  }

  if (sessao.tipo === 'fora') return <Login aviso={sessao.aviso} />

  return <Conectado email={sessao.email} />
}

function Conectado({ email }: { email: string }) {
  const online = useOnline()
  const [inicial] = useState(lerEndereco)
  const [aba, setAba] = useState<IdAba>(inicial.aba)
  const [diaPedido, setDiaPedido] = useState<string | null>(inicial.dia)
  const [historico, setHistorico] = useState(inicial.historico)

  // Aviso tocado com o painel já aberto: o service worker troca o endereço.
  useEffect(() => {
    const aoMudar = () => {
      const e = lerEndereco()
      setAba(e.aba)
      setHistorico(e.historico)
      if (e.dia) setDiaPedido(e.dia)
    }
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])

  const irPara = (nova: IdAba, dia: string | null = null) => {
    setHistorico(false)
    setAba(nova)
    if (dia) setDiaPedido(dia)
    window.history.replaceState(null, '', `#${nova}`)
  }

  const abrirHistorico = () => {
    setHistorico(true)
    window.history.replaceState(null, '', '#historico')
  }

  const titulo = historico ? 'Histórico' : ABAS.find((a) => a.id === aba)?.texto

  return (
    <div className="p-app">
      {!online && (
        <div className="faixa-offline" role="status">
          Sem conexão — o que aparece pode estar desatualizado.
        </div>
      )}

      <header className="p-topo">
        <img src="/logo-arte10-mini.jpg" alt="" width={34} height={34} className="p-topo__logo" />
        <span className="p-topo__marca">Arte 10</span>
        <span className="p-topo__titulo">{titulo}</span>
      </header>

      <main className="p-conteudo">
        {historico ? (
          <Historico aoVoltar={() => irPara(aba)} />
        ) : (
          <>
            {aba === 'inicio' && (
              <Inicio aoAbrirAgenda={(dia) => irPara('agenda', dia)} aoAbrirHistorico={abrirHistorico} />
            )}
            {aba === 'agenda' && (
              <Agenda diaPedido={diaPedido} aoConsumirDia={() => setDiaPedido(null)} />
            )}
            {aba === 'clientes' && <Clientes />}
            {aba === 'servicos' && <Servicos />}
            {aba === 'clube' && <Clube />}
            {aba === 'ajustes' && <Ajustes email={email} aoAbrirHistorico={abrirHistorico} />}
          </>
        )}
      </main>

      <nav className="p-abas" aria-label="Seções do painel">
        {ABAS.map(({ id, texto, icone: Icone }) => (
          <button
            key={id}
            type="button"
            className={`p-abas__item ${aba === id && !historico ? 'p-abas__item--ativo' : ''}`}
            aria-current={aba === id && !historico ? 'page' : undefined}
            onClick={() => irPara(id)}
          >
            <Icone tamanho={21} />
            {texto}
          </button>
        ))}
      </nav>
    </div>
  )
}
