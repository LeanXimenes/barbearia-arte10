import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  agendaDoDia,
  assinarMudancas,
  atualizarStatus,
  bloquear,
  cancelar,
  desbloquear,
  visaoGeral,
} from '../api'
import type { AgendaDoDia, DiaCalendario, ItemAgenda } from '../tipos'
import { carimbo, hoje, rotuloRelativo, rotuloStatus } from '../formatoPainel'
import {
  dataCurta,
  dataDeTexto,
  dataPorExtenso,
  diaDaSemanaCurto,
  duracao,
  linkWhatsapp,
  moeda,
  telefoneBonito,
} from '../../lib/formato'
import { somarDias } from '../../lib/relogio'
import { Carregando, ErroCarregar, Etiqueta, Folha, useAviso } from '../componentes'
import { IconeAvancar, IconeVoltar, IconeWhatsapp } from '../../componentes/Icones'

/** Agenda do dia (linha do tempo), igual à do app Android. */
export function Agenda({
  diaPedido,
  aoConsumirDia,
}: {
  diaPedido: string | null
  aoConsumirDia: () => void
}) {
  const mostrarAviso = useAviso()
  const [dia, setDia] = useState(() => diaPedido ?? hoje())
  const [agenda, setAgenda] = useState<AgendaDoDia | null>(null)
  const [calendario, setCalendario] = useState<DiaCalendario[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [selecionado, setSelecionado] = useState<ItemAgenda | null>(null)

  // Aviso tocado: abre direto no dia do agendamento.
  useEffect(() => {
    if (diaPedido) {
      setDia(diaPedido)
      aoConsumirDia()
    }
  }, [diaPedido, aoConsumirDia])

  const pedido = useRef(0)
  const carregar = useCallback(
    async (silencioso = false) => {
      const meu = ++pedido.current
      if (!silencioso) setCarregando(true)
      try {
        const r = await agendaDoDia(dia)
        if (meu !== pedido.current) return
        setAgenda(r)
        setErro(null)
      } catch (e) {
        if (meu === pedido.current) setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
      } finally {
        if (meu === pedido.current) setCarregando(false)
      }
    },
    [dia],
  )

  const carregarCalendario = useCallback(async () => {
    try {
      setCalendario(await visaoGeral(somarDias(hoje(), -7), somarDias(hoje(), 45)))
    } catch {
      // Sem o resumo a faixa de dias só não mostra os pontinhos.
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    void carregarCalendario()
  }, [carregarCalendario])

  useEffect(
    () =>
      assinarMudancas(() => {
        void carregar(true)
        void carregarCalendario()
      }),
    [carregar, carregarCalendario],
  )

  const recarregarTudo = () => {
    void carregar(true)
    void carregarCalendario()
  }

  return (
    <div className="p-tela p-tela--agenda">
      <BarraDeDatas dia={dia} calendario={calendario} aoTrocar={setDia} />

      {erro && !agenda && <ErroCarregar texto={erro} aoTentar={() => void carregar()} />}
      {carregando && !agenda && <Carregando linhas={6} />}

      {agenda && (
        <div className={carregando ? 'p-esmaecido' : ''}>
          {!agenda.aberto ? (
            <div className="p-faixa-dia p-faixa-dia--fechado">
              <strong>Fora do expediente</strong>
              <span>A barbearia não abre neste dia.</span>
            </div>
          ) : (
            <div className="p-faixa-dia">
              Expediente {agenda.abre ?? ''} — {agenda.fecha ?? ''}
              {agenda.intervalo && ` · intervalo ${agenda.intervalo.inicio}—${agenda.intervalo.fim}`}
            </div>
          )}

          {agenda.itens.length === 0 ? (
            <p className="p-texto-suave" style={{ padding: '18px 4px' }}>
              Nenhum horário para mostrar neste dia.
            </p>
          ) : (
            <ul className="p-linha-tempo">
              {agenda.itens.map((item, i) => (
                <li key={`${item.tipo}-${item.horario_inicio}-${item.id ?? i}`}>
                  <ItemLinha item={item} aoTocar={() => setSelecionado(item)} />
                </li>
              ))}
            </ul>
          )}

          <div className="legenda">
            <span className="legenda__item">
              <span className="legenda__amostra p-amostra--agendado" /> Agendado
            </span>
            <span className="legenda__item">
              <span className="legenda__amostra p-amostra--bloqueado" /> Bloqueado
            </span>
            <span className="legenda__item">
              <span className="legenda__amostra p-amostra--livre" /> Disponível
            </span>
          </div>
        </div>
      )}

      {selecionado && (
        <DetalheItem
          item={selecionado}
          dia={dia}
          aoFechar={() => setSelecionado(null)}
          aoConcluir={(mensagem) => {
            mostrarAviso(mensagem)
            recarregarTudo()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Barra de datas: dia anterior / próximo e a faixa de dias
// ---------------------------------------------------------------------
function BarraDeDatas({
  dia,
  calendario,
  aoTrocar,
}: {
  dia: string
  calendario: DiaCalendario[]
  aoTrocar: (d: string) => void
}) {
  const porData = useMemo(() => new Map(calendario.map((c) => [String(c.data).slice(0, 10), c])), [calendario])
  // 7 dias para trás e 45 para frente, como no app.
  const dias = useMemo(() => Array.from({ length: 53 }, (_, i) => somarDias(hoje(), i - 7)), [])
  const faixa = useRef<HTMLDivElement>(null)

  // Mantém o dia escolhido à vista na faixa.
  useEffect(() => {
    faixa.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [dia])

  return (
    <div className="p-datas">
      <div className="p-datas__topo">
        <button type="button" className="calendario__seta" onClick={() => aoTrocar(somarDias(dia, -1))} aria-label="Dia anterior">
          <IconeVoltar tamanho={18} />
        </button>
        <div className="p-datas__texto">
          <strong>{rotuloRelativo(dia)}</strong>
          <span>{dataCurta(dia)}</span>
        </div>
        <button type="button" className="calendario__seta" onClick={() => aoTrocar(somarDias(dia, 1))} aria-label="Próximo dia">
          <IconeAvancar tamanho={18} />
        </button>
      </div>
      <div className="p-datas__faixa" ref={faixa}>
        {dias.map((d) => {
          const info = porData.get(d)
          const fechado = info?.aberto === false
          const temCliente = (info?.agendamentos ?? 0) > 0
          return (
            <button
              key={d}
              type="button"
              aria-pressed={d === dia}
              className={`p-dia ${d === dia ? 'p-dia--ativo' : ''} ${fechado ? 'p-dia--fechado' : ''}`}
              onClick={() => aoTrocar(d)}
            >
              <span className="p-dia__semana">{diaDaSemanaCurto(d)}</span>
              <span className="p-dia__numero">{dataDeTexto(d).getDate()}</span>
              <span className={`p-dia__ponto ${temCliente ? 'p-dia__ponto--on' : ''}`} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Um trecho da linha do tempo
// ---------------------------------------------------------------------
function ItemLinha({ item, aoTocar }: { item: ItemAgenda; aoTocar: () => void }) {
  if (item.tipo === 'intervalo') {
    return (
      <div className="p-item p-item--intervalo">
        <span className="p-item__hora">{item.horario_inicio}</span>
        <span className="p-item__corpo">
          <strong>Intervalo</strong>
          <span>até {item.horario_fim}</span>
        </span>
      </div>
    )
  }

  const classe = `p-item p-item--${item.tipo} ${item.passado ? 'p-item--passado' : ''}`
  return (
    <button type="button" className={classe} onClick={aoTocar}>
      <span className="p-item__hora">{item.horario_inicio}</span>
      <span className="p-item__corpo">
        {item.tipo === 'agendamento' && (
          <>
            <strong>{item.cliente_nome}</strong>
            <span>
              {item.servico_nome} · {duracao(item.duracao_minutos ?? 0)}
            </span>
            {item.fora_expediente && <span className="p-item__alerta">Fora do expediente atual</span>}
          </>
        )}
        {item.tipo === 'bloqueio' && (
          <>
            <strong>Horário bloqueado</strong>
            <span>{item.motivo || 'Toque para desbloquear'}</span>
          </>
        )}
        {item.tipo === 'livre' && (
          <>
            <strong>{item.passado ? 'Horário já passou' : 'Livre'}</strong>
            <span>{item.passado ? `até ${item.horario_fim}` : 'Toque para bloquear'}</span>
          </>
        )}
      </span>
      {item.tipo === 'agendamento' && (
        <Etiqueta tom={item.status === 'concluido' ? 'verde' : item.status === 'nao_compareceu' ? 'vermelho' : 'ouro'}>
          {rotuloStatus(item.status)}
        </Etiqueta>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------
// Detalhe de um horário (folha que sobe)
// ---------------------------------------------------------------------
function DetalheItem({
  item,
  dia,
  aoFechar,
  aoConcluir,
}: {
  item: ItemAgenda
  dia: string
  aoFechar: () => void
  aoConcluir: (mensagem: string) => void
}) {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false)
  // Depois de cancelar "avisando no WhatsApp", o link fica aqui para o toque.
  const [avisoWhats, setAvisoWhats] = useState<string | null>(null)

  async function executar(acao: () => Promise<unknown>, mensagem: string, fechar = true) {
    if (ocupado) return
    setOcupado(true)
    setErro(null)
    try {
      await acao()
      aoConcluir(mensagem)
      if (fechar) aoFechar()
      return true
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function cancelarHorario(avisar: boolean) {
    if (!item.id) return
    const ok = await executar(() => cancelar(item.id!, motivo), 'Horário cancelado. Ele já está livre no site.', !avisar)
    if (ok && avisar) {
      const porque = motivo.trim() ? ` Motivo: ${motivo.trim()}.` : ''
      setAvisoWhats(
        linkWhatsapp(
          item.cliente_telefone ?? null,
          `Olá, ${item.cliente_nome ?? ''}! Aqui é da Barbearia Arte 10. Infelizmente precisamos cancelar o seu ` +
            `horário de ${dataCurta(dia)} às ${item.horario_inicio}.${porque} Você pode marcar outro horário pelo ` +
            `app. Desculpe o transtorno!`,
        ),
      )
    }
  }

  const erroCaixa = erro && (
    <div className="aviso aviso--erro" role="alert" style={{ marginTop: 12 }}>
      <span>{erro}</span>
    </div>
  )

  // ---- depois de cancelar avisando: só falta mandar a mensagem
  if (avisoWhats !== null) {
    return (
      <Folha titulo="Horário cancelado" aoFechar={aoFechar}>
        <p className="p-texto">O horário já está livre no site. Agora é só mandar o aviso para o cliente:</p>
        {avisoWhats ? (
          <a className="botao botao--ouro botao--bloco" href={avisoWhats} target="_blank" rel="noopener noreferrer" onClick={aoFechar}>
            <IconeWhatsapp tamanho={18} />
            Enviar aviso no WhatsApp
          </a>
        ) : (
          <p className="p-texto-suave">Telefone do cliente inválido para o WhatsApp.</p>
        )}
      </Folha>
    )
  }

  // ---- agendamento do cliente
  if (item.tipo === 'agendamento') {
    const whats = linkWhatsapp(
      item.cliente_telefone ?? null,
      `Olá, ${item.cliente_nome ?? ''}! Aqui é da Barbearia Arte 10 sobre o seu horário de ${item.horario_inicio}.`,
    )
    const podeCancelar = !item.passado && item.status === 'agendado'

    if (confirmarCancelamento) {
      return (
        <Folha
          titulo={`Cancelar o horário de ${item.cliente_nome ?? ''}?`}
          aoFechar={() => setConfirmarCancelamento(false)}
          ocupado={ocupado}
          rodape={
            <>
              <button type="button" className="botao botao--bloco p-botao-perigo" disabled={ocupado} onClick={() => void cancelarHorario(true)}>
                {ocupado ? <span className="girando" /> : 'Cancelar e avisar no WhatsApp'}
              </button>
              <button type="button" className="botao botao--contorno" disabled={ocupado} onClick={() => void cancelarHorario(false)}>
                Só cancelar
              </button>
              <button type="button" className="botao botao--fantasma" disabled={ocupado} onClick={() => setConfirmarCancelamento(false)}>
                Voltar
              </button>
            </>
          }
        >
          <p className="p-texto">
            {dataCurta(dia)} às {item.horario_inicio} · {item.servico_nome}. O horário volta a ficar livre no site. Isso
            não pode ser desfeito.
          </p>
          <div className="campo" style={{ marginTop: 14 }}>
            <label className="campo__rotulo" htmlFor="motivo-cancelar">
              Motivo (opcional)
            </label>
            <input id="motivo-cancelar" className="campo__entrada" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          {erroCaixa}
        </Folha>
      )
    }

    return (
      <Folha titulo="Agendamento do cliente" aoFechar={aoFechar} ocupado={ocupado}>
        <h3 className="p-detalhe__nome">{item.cliente_nome}</h3>
        <dl className="p-linhas">
          <Linha rotulo="Telefone" valor={telefoneBonito(item.cliente_telefone ?? '')} />
          <Linha rotulo="Serviço" valor={item.servico_nome ?? ''} />
          <Linha rotulo="Data" valor={dataPorExtenso(dia)} />
          <Linha rotulo="Horário" valor={`${item.horario_inicio} — ${item.horario_fim}`} />
          <Linha rotulo="Duração" valor={duracao(item.duracao_minutos ?? 0)} />
          <Linha rotulo="Valor" valor={moeda(Number(item.servico_preco ?? 0))} />
          <Linha rotulo="Status" valor={rotuloStatus(item.status)} />
          <Linha rotulo="Marcado em" valor={carimbo(item.criado_em)} />
        </dl>

        {whats && (
          <a className="botao botao--contorno botao--bloco" href={whats} target="_blank" rel="noopener noreferrer">
            <IconeWhatsapp tamanho={17} />
            Falar com o cliente
          </a>
        )}

        {item.passado && item.id && (
          <div className="p-desfecho">
            <button
              type="button"
              className={`botao ${item.status === 'concluido' ? 'botao--ouro' : 'botao--contorno'}`}
              disabled={ocupado || item.status === 'concluido'}
              onClick={() => void executar(() => atualizarStatus(item.id!, 'concluido'), 'Atendimento atualizado.')}
            >
              Atendido
            </button>
            <button
              type="button"
              className={`botao ${item.status === 'nao_compareceu' ? 'p-botao-perigo' : 'botao--contorno'}`}
              disabled={ocupado || item.status === 'nao_compareceu'}
              onClick={() => void executar(() => atualizarStatus(item.id!, 'nao_compareceu'), 'Atendimento atualizado.')}
            >
              Faltou
            </button>
          </div>
        )}

        {podeCancelar && (
          <button type="button" className="botao botao--fantasma p-texto-perigo" onClick={() => setConfirmarCancelamento(true)}>
            Cancelar este horário
          </button>
        )}

        <p className="campo__dica" style={{ marginTop: 12 }}>
          Este horário pertence ao cliente e permanece registrado. Marcar o desfecho não libera o horário na agenda.
          {podeCancelar &&
            ' Se cancelar, o horário volta a ficar livre no site e fica no histórico como cancelado. Depois do horário você poderá marcar se ele foi atendido ou faltou.'}
        </p>
        {erroCaixa}
      </Folha>
    )
  }

  // ---- bloqueio
  if (item.tipo === 'bloqueio') {
    return (
      <Folha titulo="Horário bloqueado" aoFechar={aoFechar} ocupado={ocupado}>
        <h3 className="p-detalhe__nome">{item.motivo || 'Sem motivo informado'}</h3>
        <dl className="p-linhas">
          <Linha rotulo="Data" valor={dataPorExtenso(dia)} />
          <Linha rotulo="Período" valor={`${item.horario_inicio} — ${item.horario_fim}`} />
          <Linha rotulo="Bloqueado em" valor={carimbo(item.criado_em)} />
        </dl>
        <button
          type="button"
          className="botao botao--ouro botao--bloco"
          disabled={ocupado || !item.id}
          onClick={() => void executar(() => desbloquear(item.id!), 'Horário liberado.')}
        >
          {ocupado ? <span className="girando" /> : 'Desbloquear horário'}
        </button>
        <p className="campo__dica" style={{ marginTop: 10 }}>
          Ao desbloquear, o horário volta a aparecer como disponível no site.
        </p>
        {erroCaixa}
      </Folha>
    )
  }

  // ---- horário livre
  return (
    <Folha titulo={item.passado ? 'Horário já passou' : 'Horário disponível'} aoFechar={aoFechar} ocupado={ocupado}>
      <h3 className="p-detalhe__nome">
        {item.horario_inicio} — {item.horario_fim}
      </h3>
      <p className="p-texto-suave">{dataPorExtenso(dia)}</p>
      {!item.passado && (
        <>
          <div className="campo" style={{ marginTop: 16 }}>
            <label className="campo__rotulo" htmlFor="motivo-bloqueio">
              Motivo (opcional)
            </label>
            <input
              id="motivo-bloqueio"
              className="campo__entrada"
              placeholder="Ex.: compromisso pessoal"
              value={motivo}
              maxLength={200}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="botao botao--ouro botao--bloco"
            disabled={ocupado}
            onClick={() => void executar(() => bloquear(dia, item.horario_inicio, item.horario_fim, motivo), 'Horário bloqueado.')}
          >
            {ocupado ? <span className="girando" /> : 'Bloquear horário'}
          </button>
          <p className="campo__dica" style={{ marginTop: 10 }}>
            O site deixa de oferecer este horário assim que o bloqueio for salvo.
          </p>
        </>
      )}
      {erroCaixa}
    </Folha>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="p-linhas__linha">
      <dt>{rotulo}</dt>
      <dd>{valor || '—'}</dd>
    </div>
  )
}
