import { useState } from 'react'
import { useDadosDaBarbearia } from './hooks/useDadosDaBarbearia'
import { useOnline } from './hooks/useOnline'
import { supabaseConfigurado } from './lib/supabase'
import { Cabecalho } from './componentes/Cabecalho'
import { Hero } from './componentes/Hero'
import { SecaoServicos } from './componentes/SecaoServicos'
import { SecaoFuncionamento } from './componentes/SecaoFuncionamento'
import { SecaoLocalizacao } from './componentes/SecaoLocalizacao'
import { Rodape } from './componentes/Rodape'
import { ModalAgendamento } from './componentes/agendamento/ModalAgendamento'
import { IconeAlerta, IconeTesoura } from './componentes/Icones'

export default function App() {
  const { config, servicos, funcionamento, carregando, erro, recarregar } = useDadosDaBarbearia()
  const online = useOnline()

  const [modal, setModal] = useState<{ aberto: boolean; servicoId: string | null }>({
    aberto: false,
    servicoId: null,
  })

  const abrirAgendamento = (servicoId: string | null = null) =>
    setModal({ aberto: true, servicoId })

  const fecharAgendamento = () => setModal({ aberto: false, servicoId: null })

  return (
    <>
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

      <Cabecalho aoAgendar={() => abrirAgendamento()} />

      <main>
        <Hero
          config={config}
          funcionamento={funcionamento}
          aoAgendar={() => abrirAgendamento()}
        />

        <SecaoServicos
          servicos={servicos}
          carregando={carregando}
          erro={Boolean(erro)}
          aoAgendar={(id) => abrirAgendamento(id)}
          aoRecarregar={recarregar}
        />

        <SecaoFuncionamento
          funcionamento={funcionamento}
          config={config}
          aoAgendar={() => abrirAgendamento()}
        />

        <SecaoLocalizacao config={config} aoAgendar={() => abrirAgendamento()} />
      </main>

      <Rodape config={config} funcionamento={funcionamento} />

      <div className="barra-mobile">
        <button
          type="button"
          className="botao botao--ouro botao--bloco"
          onClick={() => abrirAgendamento()}
        >
          <IconeTesoura tamanho={18} />
          Agendar horário
        </button>
      </div>

      {modal.aberto && (
        <ModalAgendamento
          servicos={servicos}
          config={config}
          servicoInicialId={modal.servicoId}
          online={online}
          aoFechar={fecharAgendamento}
        />
      )}
    </>
  )
}
