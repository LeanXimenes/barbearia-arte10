import { useEffect, useState, type ReactNode } from 'react'
import type { AgendamentoConfirmado, ConfigBarbearia } from '../../lib/tipos'
import { useConta } from '../../hooks/useConta'
import { situacaoDoHorario } from '../../lib/horariosDaConta'
import { cancelarMeuAgendamento } from '../../servicos/api'
import { ativarLembretes, estadoDosLembretes, type EstadoLembretes } from '../../lib/avisosCliente'
import { pareceFalhaDeRede } from '../../lib/erros'
import {
  dataDeTexto,
  linkWhatsapp,
  moeda,
  nomeDoDiaDaSemana,
  nomeDoMes,
  telefoneBonito,
} from '../../lib/formato'
import { IconeAlerta, IconeCheck, IconeTesoura, IconeWhatsapp } from '../Icones'

/** O cliente cancela sozinho até 40 minutos antes (o banco confere de novo). */
export const MINUTOS_PARA_CANCELAR = 40

export function podeCancelar(a: AgendamentoConfirmado, agora: Date = new Date()): boolean {
  if (a.cancelado || a.status !== 'agendado') return false
  return new Date(a.inicio_em).getTime() - agora.getTime() >= MINUTOS_PARA_CANCELAR * 60_000
}

interface Props {
  config: ConfigBarbearia | null
  aoAgendar: () => void
  /** Depois de sair, a janela fecha (nada da conta fica na tela). */
  aoSair: () => void
}

/** "Minha conta": dados do cliente e os horários que ele marcou. */
export function MinhaConta({ config, aoAgendar, aoSair }: Props) {
  const { conta, token, proximos, anteriores, carregando, erro, atualizar, sair } = useConta()
  const [cancelando, setCancelando] = useState<AgendamentoConfirmado | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  if (!conta) return null

  const whatsBarbearia = (texto: string) => linkWhatsapp(config?.telefone_whatsapp ?? null, texto)
  const whats = whatsBarbearia(`Olá! Sou ${conta.nome} e quero falar sobre o meu horário.`)
  const semHorario = !carregando && !erro && proximos.length === 0

  async function confirmarCancelamento() {
    if (!cancelando || !token || enviando) return
    setEnviando(true)
    setMensagem(null)
    try {
      const r = await cancelarMeuAgendamento(token, cancelando.id)
      if (r.ok) {
        setMensagem({ tipo: 'ok', texto: 'Horário cancelado. A barbearia já foi avisada.' })
        setCancelando(null)
        await atualizar()
      } else {
        setMensagem({ tipo: 'erro', texto: r.mensagem })
        setCancelando(null)
      }
    } catch (e) {
      setMensagem({
        tipo: 'erro',
        texto: pareceFalhaDeRede(e)
          ? 'Sem conexão: o horário NÃO foi cancelado. Tente de novo.'
          : 'Não foi possível cancelar agora. Tente de novo.',
      })
    } finally {
      setEnviando(false)
    }
  }

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

        {token && <CartaoLembretes token={token} />}

        <h3 className="conta__titulo">Seus próximos horários</h3>

        {mensagem && (
          <div className={`aviso ${mensagem.tipo === 'ok' ? 'aviso--info' : 'aviso--erro'}`} role="status">
            {mensagem.tipo === 'ok' ? (
              <IconeCheck className="aviso__icone" tamanho={18} />
            ) : (
              <IconeAlerta className="aviso__icone" tamanho={18} />
            )}
            <span>{mensagem.texto}</span>
          </div>
        )}

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
          <p className="conta__vazio">Nenhum horário marcado pela conta ainda. Que tal agendar agora?</p>
        )}

        {proximos.length > 0 && (
          <>
            <ListaHorarios
              itens={proximos}
              renderAcao={(a) =>
                a.cancelado ? null : podeCancelar(a) ? (
                  <button type="button" className="link-ouro horario-conta__cancelar" onClick={() => setCancelando(a)}>
                    Cancelar horário
                  </button>
                ) : (
                  <span className="horario-conta__tarde">
                    Faltam menos de {MINUTOS_PARA_CANCELAR} minutos: para cancelar, fale com a barbearia
                    {whats && (
                      <>
                        {' '}
                        pelo{' '}
                        <a className="link-ouro" href={whatsBarbearia(`Olá! Sou ${conta.nome} e preciso falar sobre o meu horário de hoje às ${a.horario_inicio}.`) ?? whats} target="_blank" rel="noopener noreferrer">
                          WhatsApp
                        </a>
                      </>
                    )}
                    .
                  </span>
                )
              }
            />
            <p className="campo__dica conta__regra">
              Você pode cancelar pelo site até {MINUTOS_PARA_CANCELAR} minutos antes do horário. Depois disso, fale
              com a barbearia.
            </p>
          </>
        )}

        {anteriores.length > 0 && (
          <>
            <h3 className="conta__titulo">Anteriores</h3>
            <ListaHorarios itens={anteriores} />
          </>
        )}

        <p className="campo__dica conta__ajuda">
          Para remarcar, fale com a barbearia
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
        {cancelando ? (
          <>
            <p className="conta__confirmar">
              Cancelar <b>{cancelando.servico}</b> de{' '}
              <b>
                {nomeDoDiaDaSemana(dataDeTexto(cancelando.data).getDay()).toLowerCase()},{' '}
                {dataDeTexto(cancelando.data).getDate()}/{String(dataDeTexto(cancelando.data).getMonth() + 1).padStart(2, '0')} às{' '}
                {cancelando.horario_inicio}
              </b>
              ? O horário fica livre para outra pessoa.
            </p>
            <button type="button" className="botao botao--bloco conta__botao-cancelar" onClick={() => void confirmarCancelamento()} disabled={enviando}>
              {enviando ? <span className="girando" /> : 'Sim, cancelar o horário'}
            </button>
            <button type="button" className="botao botao--fantasma" onClick={() => setCancelando(null)} disabled={enviando}>
              Voltar
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </>
  )
}

/** Lembrete 30 minutos antes, neste celular. */
function CartaoLembretes({ token }: { token: string }) {
  const [estado, setEstado] = useState<EstadoLembretes>('verificando')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    estadoDosLembretes()
      .then(setEstado)
      .catch(() => setEstado('sem_suporte'))
  }, [])

  if (estado === 'verificando' || estado === 'sem_suporte') return null

  if (estado === 'ativo') {
    return (
      <div className="conta__lembretes conta__lembretes--ativo">
        <IconeCheck tamanho={18} />
        <span>Lembrete ligado: avisamos neste celular 30 minutos antes do seu horário.</span>
      </div>
    )
  }

  return (
    <div className="conta__lembretes">
      <IconeAlerta tamanho={18} />
      <span className="conta__lembretes-texto">
        <strong>Quer um lembrete 30 minutos antes?</strong>
        {estado === 'precisa_instalar' && (
          <span>No iPhone, instale o site na Tela de Início (veja a aba App) e abra por lá para ligar o lembrete.</span>
        )}
        {estado === 'bloqueado' && (
          <span>Os avisos estão bloqueados. Libere nos ajustes do celular (Notificações) para receber o lembrete.</span>
        )}
        {estado === 'pode_ativar' && <span>A gente avisa neste celular antes do seu horário.</span>}
      </span>
      {estado === 'pode_ativar' && (
        <button
          type="button"
          className="botao botao--ouro"
          disabled={ocupado}
          onClick={() => {
            setOcupado(true)
            ativarLembretes(token)
              .then(setEstado)
              .catch(() => setEstado('pode_ativar'))
              .finally(() => setOcupado(false))
          }}
        >
          {ocupado ? <span className="girando" /> : 'Ligar lembrete'}
        </button>
      )}
    </div>
  )
}

function ListaHorarios({
  itens,
  renderAcao,
}: {
  itens: AgendamentoConfirmado[]
  renderAcao?: (a: AgendamentoConfirmado) => ReactNode
}) {
  const agora = new Date()

  return (
    <ul className="horarios-conta">
      {itens.map((a) => {
        const situacao = situacaoDoHorario(a, agora)
        const dia = dataDeTexto(a.data)
        return (
          <li key={a.id} className={`horario-conta ${a.cancelado ? 'horario-conta--cancelado' : ''}`}>
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
              {renderAcao?.(a)}
            </span>
            {situacao && <span className={`selo selo--${situacao.tipo}`}>{situacao.texto}</span>}
          </li>
        )
      })}
    </ul>
  )
}
