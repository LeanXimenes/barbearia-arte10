import { useCallback, useEffect, useMemo, useState } from 'react'
import { agendaDoDia, assinarMudancas, proximosAgendamentos } from '../api'
import type { AgendaDoDia, ProximoAgendamento } from '../tipos'
import { hoje as hojeNaBarbearia, rotuloRelativo, rotuloStatus } from '../formatoPainel'
import { dataCurta, dataPorExtenso, duracao, linkWhatsapp, telefoneBonito } from '../../lib/formato'
import { somarDias } from '../../lib/relogio'
import { Carregando, ErroCarregar, Etiqueta, TituloSecao, Vazio } from '../componentes'
import { CartaoAvisos } from './Avisos'
import { IconeCalendario, IconeRelogio, IconeWhatsapp } from '../../componentes/Icones'

/** Quantos dias à frente a tela inicial mostra. */
const DIAS_A_FRENTE = 7

/** Tela inicial do dono: o próximo cliente, hoje e os próximos dias já marcados. */
export function Inicio({
  aoAbrirAgenda,
  aoAbrirHistorico,
}: {
  aoAbrirAgenda: (dia?: string) => void
  aoAbrirHistorico: () => void
}) {
  const dia = hojeNaBarbearia()
  const [lista, setLista] = useState<ProximoAgendamento[] | null>(null)
  const [agenda, setAgenda] = useState<AgendaDoDia | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState(() => Date.now())

  const carregar = useCallback(async () => {
    try {
      const [proximos, deHoje] = await Promise.all([proximosAgendamentos(DIAS_A_FRENTE), agendaDoDia(dia)])
      setLista(proximos.agendamentos)
      setAgenda(deHoje)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
    }
  }, [dia])

  useEffect(() => {
    void carregar()
    return assinarMudancas(() => void carregar())
  }, [carregar])

  // "Daqui a 25 min" se atualiza sozinho.
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  const deHoje = useMemo(() => (lista ?? []).filter((a) => a.data === dia), [lista, dia])
  const porDia = useMemo(() => {
    const grupos = new Map<string, ProximoAgendamento[]>()
    for (const a of lista ?? []) {
      if (a.data === dia) continue
      grupos.set(a.data, [...(grupos.get(a.data) ?? []), a])
    }
    return [...grupos.entries()]
  }, [lista, dia])

  const proximo = lista?.find((a) => a.status === 'agendado')

  return (
    <div className="p-tela">
      <div className="p-cabecalho">
        <span className="p-cabecalho__sub">Barbearia Arte 10</span>
        <h1 className="p-cabecalho__titulo">{dataPorExtenso(dia)}</h1>
      </div>

      <CartaoAvisos />

      {erro && !lista && <ErroCarregar texto={erro} aoTentar={() => void carregar()} />}
      {!lista && !erro && <Carregando linhas={3} />}

      {lista && (
        <>
          {proximo && <ProximoCliente a={proximo} agora={agora} hoje={dia} />}

          <div className="p-resumo">
            <Numero rotulo="Hoje" valor={agenda?.resumo.agendamentos ?? deHoje.length} legenda="agendamentos" />
            <Numero rotulo="Livres" valor={agenda?.resumo.livres ?? 0} legenda="horários hoje" />
            <Numero rotulo="Próx. 7 dias" valor={lista.length - deHoje.length} legenda="marcados" />
          </div>

          <TituloSecao
            acao={
              <button type="button" className="link-ouro" onClick={() => aoAbrirAgenda(dia)}>
                Ver agenda
              </button>
            }
          >
            Hoje
          </TituloSecao>
          {deHoje.length === 0 ? (
            <Vazio
              titulo={agenda && !agenda.aberto ? 'Barbearia fechada hoje.' : 'Ninguém mais marcado para hoje'}
              texto={agenda?.aberto ? 'Assim que alguém agendar pelo site, aparece aqui na hora.' : undefined}
            />
          ) : (
            <ul className="p-lista">
              {deHoje.map((a) => (
                <CartaoHorario key={a.id} a={a} aoAbrir={() => aoAbrirAgenda(a.data)} />
              ))}
            </ul>
          )}

          {agenda && agenda.proximos_livres.length > 0 && (
            <div className="p-livres">
              <span className="p-texto-suave">Próximos livres hoje:</span>
              {agenda.proximos_livres.map((h) => (
                <span key={h} className="pilula">
                  {h}
                </span>
              ))}
            </div>
          )}

          <TituloSecao>Próximos dias</TituloSecao>
          {porDia.length === 0 ? (
            <Vazio titulo="Nada marcado nos próximos 7 dias ainda" />
          ) : (
            porDia.map(([data, itens]) => (
              <div key={data} className="p-dia-grupo">
                <button type="button" className="p-dia-grupo__titulo" onClick={() => aoAbrirAgenda(data)}>
                  <strong>{rotuloRelativo(data) === dataPorExtenso(data) ? dataPorExtenso(data) : `${rotuloRelativo(data)} · ${dataPorExtenso(data)}`}</strong>
                  <span>
                    {itens.length} {itens.length === 1 ? 'horário' : 'horários'}
                  </span>
                </button>
                <ul className="p-lista">
                  {itens.map((a) => (
                    <CartaoHorario key={a.id} a={a} aoAbrir={() => aoAbrirAgenda(a.data)} />
                  ))}
                </ul>
              </div>
            ))
          )}

          <div className="p-atalhos">
            <button type="button" className="botao botao--contorno" onClick={() => aoAbrirAgenda()}>
              <IconeCalendario tamanho={17} />
              Agenda
            </button>
            <button type="button" className="botao botao--contorno" onClick={aoAbrirHistorico}>
              <IconeRelogio tamanho={17} />
              Histórico
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function mensagemWhats(a: ProximoAgendamento, hoje: string): string {
  const quando =
    a.data === hoje
      ? `hoje às ${a.horario_inicio}`
      : a.data === somarDias(hoje, 1)
        ? `amanhã às ${a.horario_inicio}`
        : `${dataCurta(a.data)} às ${a.horario_inicio}`
  return `Olá, ${a.cliente_nome}! Aqui é da Barbearia Arte 10 sobre o seu horário de ${quando} (${a.servico_nome}).`
}

function BotaoWhats({ a, grande = false }: { a: ProximoAgendamento; grande?: boolean }) {
  const link = linkWhatsapp(a.cliente_telefone, mensagemWhats(a, hojeNaBarbearia()))
  if (!link) return null
  return grande ? (
    <a className="botao botao--ouro p-whats" href={link} target="_blank" rel="noopener noreferrer">
      <IconeWhatsapp tamanho={18} />
      Mandar mensagem
    </a>
  ) : (
    <a
      className="p-icone-botao p-icone-botao--whats"
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`WhatsApp de ${a.cliente_nome}`}
      onClick={(e) => e.stopPropagation()}
    >
      <IconeWhatsapp tamanho={18} />
    </a>
  )
}

function ProximoCliente({ a, agora, hoje }: { a: ProximoAgendamento; agora: number; hoje: string }) {
  const minutos = Math.round((new Date(a.inicio_em).getTime() - agora) / 60_000)
  const quando = a.em_andamento
    ? 'Na cadeira agora'
    : a.data !== hoje
      ? `${rotuloRelativo(a.data)} às ${a.horario_inicio}`
      : minutos <= 60
        ? `Daqui a ${Math.max(minutos, 1)} min · ${a.horario_inicio}`
        : `Hoje às ${a.horario_inicio}`

  return (
    <div className="p-cartao p-proximo">
      <span className="p-proximo__rotulo">Próximo cliente</span>
      <strong className="p-proximo__nome">{a.cliente_nome}</strong>
      <span className="p-proximo__quando">{quando}</span>
      <span className="p-texto-suave">
        {a.servico_nome} · {duracao(a.duracao_minutos)} · {telefoneBonito(a.cliente_telefone)}
      </span>
      <BotaoWhats a={a} grande />
    </div>
  )
}

function CartaoHorario({ a, aoAbrir }: { a: ProximoAgendamento; aoAbrir: () => void }) {
  return (
    <li className="p-horario">
      <button type="button" className="p-horario__abrir" onClick={aoAbrir}>
        <span className="p-linha__hora">{a.horario_inicio}</span>
        <span className="p-linha__info">
          <strong>{a.cliente_nome}</strong>
          <span>
            {a.servico_nome} · {duracao(a.duracao_minutos)}
          </span>
        </span>
        {a.em_andamento ? <Etiqueta tom="verde">Agora</Etiqueta> : <Etiqueta tom="ouro">{rotuloStatus(a.status)}</Etiqueta>}
      </button>
      <BotaoWhats a={a} />
    </li>
  )
}

function Numero({ rotulo, valor, legenda }: { rotulo: string; valor: number; legenda: string }) {
  return (
    <div className="p-numero">
      <span className="p-numero__rotulo">{rotulo}</span>
      <strong className="p-numero__valor">{valor}</strong>
      <span className="p-numero__legenda">{legenda}</span>
    </div>
  )
}
