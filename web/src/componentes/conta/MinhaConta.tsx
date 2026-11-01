import type { AgendamentoConfirmado, ConfigBarbearia } from '../../lib/tipos'
import { useConta } from '../../hooks/useConta'
import { situacaoDoHorario } from '../../lib/horariosDaConta'
import {
  dataDeTexto,
  linkWhatsapp,
  moeda,
  nomeDoDiaDaSemana,
  nomeDoMes,
  telefoneBonito,
} from '../../lib/formato'
import { IconeAlerta, IconeTesoura, IconeWhatsapp } from '../Icones'

interface Props {
  config: ConfigBarbearia | null
  aoAgendar: () => void
  /** Depois de sair, a janela fecha (nada da conta fica na tela). */
  aoSair: () => void
}

/** "Minha conta": dados do cliente e os horários que ele marcou. */
export function MinhaConta({ config, aoAgendar, aoSair }: Props) {
  const { conta, proximos, anteriores, carregando, erro, atualizar, sair } = useConta()
  if (!conta) return null

  const whats = linkWhatsapp(
    config?.telefone_whatsapp ?? null,
    `Olá! Sou ${conta.nome} e quero falar sobre o meu horário.`,
  )
  const semHorario = !carregando && !erro && proximos.length === 0

  return (
    <>
      <div className="modal__corpo">
        <div className="conta__perfil">
          <span className="conta__avatar" aria-hidden>
            {conta.nome.trim().charAt(0).toUpperCase()}
          </span>
          <span className="conta__dados">
            <span className="conta__nome">{conta.nome}</span>
            <span className="conta__linha">{telefoneBonito(conta.telefone)}</span>
            {conta.email && <span className="conta__linha">{conta.email}</span>}
          </span>
        </div>

        <h3 className="conta__titulo">Seus próximos horários</h3>

        {carregando && proximos.length === 0 && (
          <div className="esqueleto" style={{ height: 84 }} aria-label="Carregando seus horários" />
        )}

        {erro && (
          <div className="aviso aviso--atencao" role="alert">
            <IconeAlerta className="aviso__icone" tamanho={18} />
            <span>
              Não deu para atualizar seus horários agora.{' '}
              <button type="button" className="link-ouro" onClick={() => void atualizar()}>
                Tentar de novo
              </button>
            </span>
          </div>
        )}

        {semHorario && (
          <p className="conta__vazio">
            Nenhum horário marcado pela conta ainda. Que tal agendar agora?
          </p>
        )}

        {proximos.length > 0 && <ListaHorarios itens={proximos} />}

        {anteriores.length > 0 && (
          <>
            <h3 className="conta__titulo">Anteriores</h3>
            <ListaHorarios itens={anteriores} />
          </>
        )}

        <p className="campo__dica conta__ajuda">
          Para remarcar ou cancelar, fale com a barbearia
          {whats ? (
            <>
              {' '}
              pelo{' '}
              <a className="link-ouro" href={whats} target="_blank" rel="noopener noreferrer">
                <IconeWhatsapp tamanho={13} /> WhatsApp
              </a>
              .
            </>
          ) : (
            '.'
          )}
        </p>
      </div>

      <div className="modal__rodape">
        <button type="button" className="botao botao--ouro botao--bloco" onClick={aoAgendar}>
          <IconeTesoura tamanho={17} />
          Agendar horário
        </button>
        <button
          type="button"
          className="botao botao--fantasma"
          onClick={() => {
            sair()
            aoSair()
          }}
        >
          Sair da conta
        </button>
      </div>
    </>
  )
}

function ListaHorarios({ itens }: { itens: AgendamentoConfirmado[] }) {
  const agora = new Date()

  return (
    <ul className="horarios-conta">
      {itens.map((a) => {
        const situacao = situacaoDoHorario(a, agora)
        const dia = dataDeTexto(a.data)
        return (
          <li
            key={a.id}
            className={`horario-conta ${a.cancelado ? 'horario-conta--cancelado' : ''}`}
          >
            <span className="horario-conta__data" aria-hidden>
              <span className="horario-conta__dia">{dia.getDate()}</span>
              <span className="horario-conta__mes">{nomeDoMes(dia.getMonth()).slice(0, 3)}</span>
            </span>
            <span className="horario-conta__info">
              <span className="horario-conta__servico">{a.servico}</span>
              <span>
                {nomeDoDiaDaSemana(dia.getDay())}, {dia.getDate()}/
                {String(dia.getMonth() + 1).padStart(2, '0')} · {a.horario_inicio} – {a.horario_fim}
              </span>
              <span className="horario-conta__extra">
                {a.plano ? 'Pelo plano' : moeda(a.preco)} · Código {a.codigo}
              </span>
            </span>
            {situacao && (
              <span className={`selo selo--${situacao.tipo}`}>{situacao.texto}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
