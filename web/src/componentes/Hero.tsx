import type { ConfigBarbearia, HorarioFuncionamento } from '../lib/tipos'
import { agoraNaBarbearia, estadoAgora } from '../lib/relogio'
import { hora } from '../lib/formato'
import { IconeCalendario, IconeLocal, IconeRelogio, IconeTesoura } from './Icones'

interface Props {
  config: ConfigBarbearia | null
  funcionamento: HorarioFuncionamento[]
  aoAgendar: () => void
  aoVerServicos: () => void
}

export function Hero({ config, funcionamento, aoAgendar, aoVerServicos }: Props) {
  const agora = agoraNaBarbearia(config?.fuso)
  const estado = estadoAgora(funcionamento, agora)
  const hoje = funcionamento.find((f) => f.dia_semana === agora.diaSemana)

  const cidade = [config?.cidade, config?.uf].filter(Boolean).join(' — ')

  return (
    <div className="container aba__conteudo hero">
      <img
        src="/logo-arte10.jpg"
        alt="Barbearia Arte 10"
        className="hero__logo"
        width={320}
        height={320}
      />

      <h1 className="apenas-leitores">Barbearia Arte 10</h1>

      <span className="selo-status">
        <span
          className={`selo-status__ponto ${
            estado.aberto ? 'selo-status__ponto--aberto' : 'selo-status__ponto--fechado'
          }`}
        />
        {estado.aberto ? 'Aberto agora' : 'Fechado agora'} · {estado.detalhe}
      </span>

      <p className="hero__texto">
        Corte, barba, pezinho e sobrancelha com hora marcada. Veja os horários livres e confirme em
        menos de um minuto.
      </p>

      <div className="hero__botoes">
        <button type="button" className="botao botao--ouro" onClick={aoAgendar}>
          <IconeTesoura tamanho={18} />
          Agendar horário
        </button>
        <button type="button" className="botao botao--contorno" onClick={aoVerServicos}>
          Ver serviços
        </button>
      </div>

      <div className="destaques">
        <div className="cartao destaque">
          <span className="destaque__icone">
            <IconeRelogio tamanho={18} />
          </span>
          <span>
            <span className="destaque__titulo">Hoje</span>
            <span className="destaque__valor">
              {hoje?.aberto && hoje.abre && hoje.fecha
                ? `${hora(hoje.abre)} — ${hora(hoje.fecha)}`
                : 'Fechado'}
            </span>
          </span>
        </div>

        <div className="cartao destaque">
          <span className="destaque__icone">
            <IconeCalendario tamanho={18} />
          </span>
          <span>
            <span className="destaque__titulo">Agendamento</span>
            <span className="destaque__valor">Online, sem fila</span>
          </span>
        </div>

        <div className="cartao destaque">
          <span className="destaque__icone">
            <IconeLocal tamanho={18} />
          </span>
          <span>
            <span className="destaque__titulo">Onde</span>
            <span className="destaque__valor">{cidade || 'Com hora marcada'}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
