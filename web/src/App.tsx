import { useEffect, useRef, useState } from 'react'
import { useDadosDaBarbearia } from './hooks/useDadosDaBarbearia'
import { useOnline } from './hooks/useOnline'
import { supabaseConfigurado } from './lib/supabase'
import { ABAS, abaDoEndereco, direcaoDoDeslize } from './lib/abas'
import { Cabecalho } from './componentes/Cabecalho'
import { BarraAbas } from './componentes/BarraAbas'
import { Hero } from './componentes/Hero'
import { SecaoServicos } from './componentes/SecaoServicos'
import { SecaoFuncionamento } from './componentes/SecaoFuncionamento'
import { SecaoLocalizacao } from './componentes/SecaoLocalizacao'
import { ModalAgendamento } from './componentes/agendamento/ModalAgendamento'
import { IconeAlerta } from './componentes/Icones'

export default function App() {
  const { config, servicos, funcionamento, carregando, erro, recarregar } = useDadosDaBarbearia()
  const online = useOnline()

  const [aba, setAba] = useState(() => abaDoEndereco(window.location.hash))
  const paineis = useRef<(HTMLElement | null)[]>([])
  const toque = useRef<{ x: number; y: number } | null>(null)

  const [modal, setModal] = useState<{
    aberto: boolean
    servicoId: string | null
  }>({
    aberto: false,
    servicoId: null,
  })

  const abrirAgendamento = (servicoId: string | null = null) =>
    setModal({ aberto: true, servicoId })

  const fecharAgendamento = () => setModal({ aberto: false, servicoId: null })

  const irPara = (indice: number) => setAba(Math.max(0, Math.min(ABAS.length - 1, indice)))

  // A aba vai para o endereço (#servicos): o link compartilhado abre na aba certa.
  useEffect(() => {
    const destino = `#${ABAS[aba]?.id ?? ''}`
    if (window.location.hash !== destino) window.history.replaceState(null, '', destino)
    // Abas escondidas não recebem foco pelo teclado nem leitura de tela.
    paineis.current.forEach((painel, i) => {
      if (painel) painel.inert = i !== aba
    })
  }, [aba])

  useEffect(() => {
    const aoMudar = () => setAba(abaDoEndereco(window.location.hash))
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])

  const aoTocar = (e: React.TouchEvent) => {
    const t = e.touches[0]
    toque.current = t ? { x: t.clientX, y: t.clientY } : null
  }

  const aoSoltar = (e: React.TouchEvent) => {
    const inicio = toque.current
    toque.current = null
    const t = e.changedTouches[0]
    if (!inicio || !t) return
    const direcao = direcaoDoDeslize(t.clientX - inicio.x, t.clientY - inicio.y)
    if (direcao) irPara(aba + direcao)
  }

  const painel = (indice: number) => {
    const id = ABAS[indice]?.id
    return {
      ref: (el: HTMLElement | null) => {
        paineis.current[indice] = el
      },
      id: `painel-${id}`,
      role: 'tabpanel',
      'aria-labelledby': `aba-${id}`,
      className: 'aba',
    }
  }

  return (
    <div className="app">
      {!online && (
        <div className="faixa-offline" role="status">
          Sem conexão — as informações podem estar desatualizadas.
        </div>
      )}

      {!supabaseConfigurado && (
        <div className="faixa-config" role="alert">
          <div className="container" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <IconeAlerta tamanho={17} />
            <span>
              Conexão com o banco não configurada. Defina <code>VITE_SUPABASE_URL</code> e{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> para ativar o agendamento.
            </span>
          </div>
        </div>
      )}

      <Cabecalho aba={aba} aoTrocarAba={irPara} aoAgendar={() => abrirAgendamento()} />

      <main className="palco" onTouchStart={aoTocar} onTouchEnd={aoSoltar}>
        <div className="trilho" style={{ transform: `translateX(-${aba * 100}%)` }}>
          <section {...painel(0)}>
            <Hero
              config={config}
              funcionamento={funcionamento}
              aoAgendar={() => abrirAgendamento()}
              aoVerServicos={() => irPara(1)}
              aoVerHorarios={() => irPara(2)}
              aoVerContato={() => irPara(3)}
            />
          </section>

          <section {...painel(1)}>
            <SecaoServicos
              servicos={servicos}
              carregando={carregando}
              erro={Boolean(erro)}
              aoAgendar={(id) => abrirAgendamento(id)}
              aoRecarregar={recarregar}
            />
          </section>

          <section {...painel(2)}>
            <SecaoFuncionamento
              funcionamento={funcionamento}
              config={config}
              aoAgendar={() => abrirAgendamento()}
            />
          </section>

          <section {...painel(3)}>
            <SecaoLocalizacao config={config} />
          </section>
        </div>
      </main>

      <BarraAbas aba={aba} aoTrocarAba={irPara} />

      {modal.aberto && (
        <ModalAgendamento
          servicos={servicos}
          config={config}
          servicoInicialId={modal.servicoId}
          online={online}
          aoFechar={fecharAgendamento}
        />
      )}
    </div>
  )
}
