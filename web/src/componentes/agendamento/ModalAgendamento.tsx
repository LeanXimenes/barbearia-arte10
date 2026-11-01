import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgendamentoConfirmado,
  ConfigBarbearia,
  DadosBarbearia,
  DiaDisponivel,
  HorarioDoDia,
  Servico,
} from '../../lib/tipos'
import {
  assinarAgenda,
  carregarDias,
  carregarHorarios,
  criarAgendamentoConta,
} from '../../servicos/api'
import { dataCurta, hora } from '../../lib/formato'
import { agoraNaBarbearia, somarDias } from '../../lib/relogio'
import {
  MSG_SEM_CONEXAO,
  exigeRecarregarHorarios,
  mensagemDeFalha,
  pareceFalhaDeRede,
} from '../../lib/erros'
import { EscolhaServico } from './EscolhaServico'
import { EscolhaData } from './EscolhaData'
import { EscolhaHorario } from './EscolhaHorario'
import { FormularioDados } from './FormularioDados'
import { Confirmacao } from './Confirmacao'
import { useConta } from '../../hooks/useConta'
import { proximoDiaLivre } from '../../lib/diaEscolhido'
import { IconeAlerta, IconeFechar, IconeVoltar } from '../Icones'

// O dia não é mais um passo: os horários já abrem no dia de hoje e o
// calendário só aparece quando a pessoa toca em "Escolher outro dia".
type Passo = 'servico' | 'horario' | 'dados' | 'confirmado'

const ORDEM_PASSOS: Passo[] = ['servico', 'horario', 'dados']

/** O banco calcula no máximo 92 dias por pedido. */
const DIAS_POR_PEDIDO = 90

const TITULOS: Record<Passo, string> = {
  servico: 'Escolha o serviço',
  horario: 'Escolha o horário',
  dados: 'Confirme o horário',
  confirmado: 'Tudo certo',
}

interface Props {
  servicos: Servico[]
  config: ConfigBarbearia | null
  servicoInicialId?: string | null
  online: boolean
  aoFechar: () => void
  aoVerMeusHorarios: () => void
}

function novaChave(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export function ModalAgendamento({
  servicos,
  config,
  servicoInicialId,
  online,
  aoFechar,
  aoVerMeusHorarios,
}: Props) {
  // Só abre logado: o nome e o número vêm da conta, nada para digitar.
  const { conta, token, atualizar: atualizarConta, sessaoExpirou } = useConta()

  const fuso = config?.fuso
  const hoje = useMemo(() => agoraNaBarbearia(fuso).data, [fuso])
  const janelaDias = config?.antecedencia_maxima_dias ?? 60
  const ultimaData = useMemo(() => somarDias(hoje, janelaDias), [hoje, janelaDias])

  const [passo, setPasso] = useState<Passo>(servicoInicialId ? 'horario' : 'servico')
  const [servico, setServico] = useState<Servico | null>(
    () => servicos.find((s) => s.id === servicoInicialId) ?? null,
  )
  const [data, setData] = useState<string | null>(() => (servicoInicialId ? hoje : null))
  const [horario, setHorario] = useState<string | null>(null)
  const [calendarioAberto, setCalendarioAberto] = useState(false)

  const [mesVisivel, setMesVisivel] = useState(() => hoje.slice(0, 7))
  const [dias, setDias] = useState<DiaDisponivel[]>([])
  const [carregandoDias, setCarregandoDias] = useState(false)
  const [erroDias, setErroDias] = useState(false)

  const [horarios, setHorarios] = useState<HorarioDoDia[]>([])
  const [carregandoHorarios, setCarregandoHorarios] = useState(false)
  const [erroHorarios, setErroHorarios] = useState(false)
  const [avisoAtualizacao, setAvisoAtualizacao] = useState(false)

  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{
    agendamento: AgendamentoConfirmado
    barbearia: DadosBarbearia
  } | null>(null)

  const chaveRef = useRef<string>(novaChave())
  const assinaturaRef = useRef<string>('')

  // Uma tentativa de reserva = uma chave. Trocar de horário gera outra,
  // mas repetir o mesmo pedido nunca duplica (itens 21 e 22).
  const assinatura = `${servico?.id ?? ''}|${data ?? ''}|${horario ?? ''}`
  if (assinatura !== assinaturaRef.current) {
    assinaturaRef.current = assinatura
    chaveRef.current = novaChave()
  }

  // ------------------------------------------------------------------
  // Travas de interface
  // ------------------------------------------------------------------
  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !enviando) aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar, enviando])

  // ------------------------------------------------------------------
  // Carregamento de dados
  // ------------------------------------------------------------------
  // A janela inteira de uma vez: trocar de mês no calendário fica instantâneo
  // e dá para achar o próximo dia livre quando hoje está lotado.
  const buscarDias = useCallback(
    async (silencioso = false) => {
      if (!servico) return

      const pedidos: Promise<DiaDisponivel[]>[] = []
      for (let inicio = hoje; inicio <= ultimaData; inicio = somarDias(inicio, DIAS_POR_PEDIDO)) {
        const fim = somarDias(inicio, DIAS_POR_PEDIDO - 1)
        pedidos.push(carregarDias(servico.id, inicio, fim > ultimaData ? ultimaData : fim))
      }

      if (!silencioso) setCarregandoDias(true)
      setErroDias(false)
      try {
        setDias((await Promise.all(pedidos)).flat())
      } catch {
        setErroDias(true)
      } finally {
        setCarregandoDias(false)
      }
    },
    [servico, hoje, ultimaData],
  )

  const buscarHorarios = useCallback(
    async (silencioso = false) => {
      if (!servico || !data) return

      if (!silencioso) setCarregandoHorarios(true)
      setErroHorarios(false)
      try {
        setHorarios(await carregarHorarios(servico.id, data))
      } catch {
        setErroHorarios(true)
      } finally {
        setCarregandoHorarios(false)
      }
    },
    [servico, data],
  )

  useEffect(() => {
    void buscarDias()
  }, [buscarDias])

  useEffect(() => {
    void buscarHorarios()
  }, [buscarHorarios])

  // ------------------------------------------------------------------
  // Tempo real: a agenda mudou enquanto a pessoa estava escolhendo.
  // ------------------------------------------------------------------
  useEffect(() => {
    return assinarAgenda(() => {
      setAvisoAtualizacao(true)
      void buscarDias(true)
      void buscarHorarios(true)
      window.setTimeout(() => setAvisoAtualizacao(false), 6000)
    })
  }, [buscarDias, buscarHorarios])

  // ------------------------------------------------------------------
  // Navegação entre passos
  // ------------------------------------------------------------------
  const indicePasso = ORDEM_PASSOS.indexOf(passo)

  function voltar() {
    if (enviando) return
    setErroEnvio(null)
    if (calendarioAberto) setCalendarioAberto(false)
    else if (passo === 'horario') setPasso('servico')
    else if (passo === 'dados') setPasso('horario')
  }

  function escolherServico(s: Servico) {
    setServico(s)
    // Já abre no dia de hoje (ou no dia que a pessoa tinha escolhido).
    setData((atual) => atual ?? hoje)
    setHorario(null)
    setHorarios([])
    setCalendarioAberto(false)
    setPasso('horario')
  }

  function escolherData(d: string) {
    setData(d)
    setHorario(null)
    setCalendarioAberto(false)
    setPasso('horario')
  }

  function abrirCalendario() {
    setMesVisivel((data ?? hoje).slice(0, 7))
    setCalendarioAberto(true)
  }

  function escolherHorario(h: string) {
    setHorario(h)
    setErroEnvio(null)
    setPasso('dados')
  }

  function trocarMes(delta: number) {
    const [a, m] = mesVisivel.split('-').map(Number)
    const d = new Date(a ?? 1970, (m ?? 1) - 1 + delta, 1)
    setMesVisivel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const horarioEscolhido = horarios.find((h) => hora(h.horario) === horario)
  const infoDoDia = dias.find((d) => String(d.data).slice(0, 10) === data) ?? null
  const proximoLivre = data ? proximoDiaLivre(dias, data) : null

  // ------------------------------------------------------------------
  // Confirmação — o único ponto que grava no banco.
  // ------------------------------------------------------------------
  async function confirmar() {
    if (enviando) return // trava contra cliques repetidos (item 21)
    if (!servico || !data || !horario || !token) return

    if (!online) {
      setErroEnvio(MSG_SEM_CONEXAO)
      return
    }

    setEnviando(true)
    setErroEnvio(null)

    try {
      const resposta = await criarAgendamentoConta(token, {
        servicoId: servico.id,
        data,
        horario,
        chave: chaveRef.current,
      })

      if (resposta.ok) {
        void atualizarConta()
        setResultado({ agendamento: resposta.agendamento, barbearia: resposta.barbearia })
        setPasso('confirmado')
        void buscarHorarios(true)
        return
      }

      // A sessão não vale mais (ex.: a conta foi apagada): nada foi gravado.
      // O site volta para a porta de entrada.
      if (resposta.erro === 'SESSAO_EXPIRADA') {
        sessaoExpirou()
        return
      }

      // O servidor recusou por uma regra de agenda: mostramos o motivo e
      // devolvemos a pessoa para a lista já atualizada (itens 7 e 23).
      setErroEnvio(resposta.mensagem)
      if (exigeRecarregarHorarios(resposta.erro)) {
        await buscarHorarios(true)
        await buscarDias(true)
        setPasso('horario')
        setHorario(null)
      }
    } catch (erro) {
      // Falha de transporte: NUNCA dizemos que deu certo. Se a reserva
      // tiver sido gravada, a mesma chave devolve o mesmo agendamento
      // quando a pessoa tentar de novo.
      setErroEnvio(pareceFalhaDeRede(erro) ? MSG_SEM_CONEXAO : mensagemDeFalha(erro))
    } finally {
      setEnviando(false)
    }
  }

  function recomecar() {
    setResultado(null)
    setPasso('servico')
    setServico(null)
    setData(null)
    setHorario(null)
    setErroEnvio(null)
  }

  // ------------------------------------------------------------------
  const mesAtual = hoje.slice(0, 7)
  const mesLimite = ultimaData.slice(0, 7)

  const podeConfirmar = Boolean(servico && data && horario && token)

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Agendar horário"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !enviando) aoFechar()
      }}
    >
      <div className="modal__caixa">
        <div className="modal__topo">
          {indicePasso > 0 && passo !== 'confirmado' ? (
            <button
              type="button"
              className="modal__voltar"
              onClick={voltar}
              disabled={enviando}
              aria-label="Voltar"
            >
              <IconeVoltar tamanho={19} />
            </button>
          ) : (
            <img
              src="/logo-arte10-mini.jpg"
              alt=""
              width={38}
              height={38}
              style={{ borderRadius: 9, objectFit: 'cover' }}
            />
          )}

          <h2 className="modal__titulo">
            {passo === 'horario' && calendarioAberto ? 'Escolha o dia' : TITULOS[passo]}
          </h2>

          <button
            type="button"
            className="modal__fechar"
            onClick={aoFechar}
            disabled={enviando}
            aria-label="Fechar"
          >
            <IconeFechar tamanho={19} />
          </button>
        </div>

        {passo !== 'confirmado' && (
          <div className="passos" aria-hidden>
            {ORDEM_PASSOS.map((p, i) => (
              <span
                key={p}
                className={`passo ${
                  i < indicePasso ? 'passo--feito' : i === indicePasso ? 'passo--atual' : ''
                }`}
              />
            ))}
          </div>
        )}

        <div className="modal__corpo">
          {passo !== 'servico' && passo !== 'confirmado' && (
            <div className="resumo-escolha">
              {servico && <span className="pilula">{servico.nome}</span>}
              {/* Na escolha do horário o dia já aparece em destaque logo abaixo. */}
              {data && passo !== 'horario' && <span className="pilula">{dataCurta(data)}</span>}
              {horario && <span className="pilula">{horario}</span>}
            </div>
          )}

          {passo === 'servico' && (
            <EscolhaServico
              servicos={servicos}
              selecionado={servico?.id ?? null}
              aoSelecionar={escolherServico}
            />
          )}

          {passo === 'horario' && calendarioAberto && (
            <EscolhaData
              dias={dias}
              hoje={hoje}
              mesVisivel={mesVisivel}
              selecionada={data}
              carregando={carregandoDias}
              erro={erroDias}
              podeVoltarMes={mesVisivel > mesAtual}
              podeAvancarMes={mesVisivel < mesLimite}
              aoTrocarMes={trocarMes}
              aoSelecionar={escolherData}
              aoTentarNovamente={() => void buscarDias()}
            />
          )}

          {passo === 'horario' && !calendarioAberto && data && (
            <EscolhaHorario
              data={data}
              hoje={hoje}
              infoDoDia={infoDoDia}
              proximoLivre={proximoLivre}
              horarios={horarios}
              carregando={carregandoHorarios}
              erro={erroHorarios}
              avisoAtualizacao={avisoAtualizacao}
              selecionado={horario}
              aoSelecionar={escolherHorario}
              aoTentarNovamente={() => void buscarHorarios()}
              aoEscolherOutroDia={abrirCalendario}
              aoIrParaDia={escolherData}
            />
          )}

          {passo === 'dados' && servico && data && horario && conta && (
            <FormularioDados
              servico={servico}
              data={data}
              horario={horario}
              horarioFim={hora(horarioEscolhido?.horario_fim) || ''}
              conta={conta}
            />
          )}

          {passo === 'confirmado' && resultado && (
            <Confirmacao agendamento={resultado.agendamento} barbearia={resultado.barbearia} />
          )}

          {erroEnvio && passo !== 'confirmado' && (
            <div className="aviso aviso--erro" role="alert" style={{ marginTop: 16 }}>
              <IconeAlerta className="aviso__icone" tamanho={18} />
              <span>{erroEnvio}</span>
            </div>
          )}
        </div>

        {passo === 'dados' && (
          <div className="modal__rodape">
            {!online && (
              <div className="aviso aviso--atencao">
                <IconeAlerta className="aviso__icone" tamanho={18} />
                Você está sem conexão. Reconecte para confirmar o agendamento.
              </div>
            )}
            <button
              type="button"
              className="botao botao--ouro botao--bloco"
              onClick={() => void confirmar()}
              disabled={enviando || !podeConfirmar || !online}
            >
              {enviando ? (
                <>
                  <span className="girando" />
                  Confirmando…
                </>
              ) : (
                'Confirmar agendamento'
              )}
            </button>
          </div>
        )}

        {passo === 'confirmado' && (
          <div className="modal__rodape">
            <button type="button" className="botao botao--ouro botao--bloco" onClick={aoFechar}>
              Concluir
            </button>
            <button type="button" className="botao botao--contorno" onClick={aoVerMeusHorarios}>
              Ver meus horários
            </button>
            <button type="button" className="botao botao--fantasma" onClick={recomecar}>
              Agendar outro horário
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
