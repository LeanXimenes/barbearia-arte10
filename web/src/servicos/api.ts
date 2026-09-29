import { supabase } from '../lib/supabase'
import type {
  AgendamentoConfirmado,
  ConfigBarbearia,
  DiaDisponivel,
  HorarioDoDia,
  HorarioFuncionamento,
  RespostaAgendamento,
  Servico,
} from '../lib/tipos'

/**
 * Camada de acesso a dados.
 *
 * Nada aqui decide disponibilidade: toda a regra mora no banco. O site
 * apenas pergunta e mostra a resposta (item 34).
 */

export async function carregarServicos(): Promise<Servico[]> {
  const { data, error } = await supabase
    .from('servicos')
    .select('id, nome, descricao, preco, duracao_minutos, ativo, ordem')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })

  if (error) throw error

  // "numeric" pode chegar como número ou string dependendo do driver:
  // normalizamos aqui para o resto do site não precisar se preocupar.
  return (data ?? []).map((s) => ({ ...s, preco: Number(s.preco) })) as Servico[]
}

export async function carregarConfig(): Promise<ConfigBarbearia | null> {
  const { data, error } = await supabase
    .from('config_barbearia')
    .select(
      'nome, fuso, telefone_whatsapp, instagram, endereco, cidade, uf, mapa_url, ' +
        'granularidade_minutos, antecedencia_minima_minutos, antecedencia_maxima_dias'
    )
    .maybeSingle()

  if (error) throw error
  return (data as ConfigBarbearia | null) ?? null
}

export async function carregarFuncionamento(): Promise<HorarioFuncionamento[]> {
  const { data, error } = await supabase
    .from('config_horarios')
    .select('dia_semana, aberto, abre, fecha, intervalo_inicio, intervalo_fim')
    .order('dia_semana', { ascending: true })

  if (error) throw error
  return (data ?? []) as HorarioFuncionamento[]
}

export async function carregarDias(
  servicoId: string,
  inicio: string,
  fim: string
): Promise<DiaDisponivel[]> {
  const { data, error } = await supabase.rpc('dias_disponiveis', {
    p_servico_id: servicoId,
    p_inicio: inicio,
    p_fim: fim,
  })

  if (error) throw error
  return (data ?? []) as DiaDisponivel[]
}

export async function carregarHorarios(servicoId: string, data: string): Promise<HorarioDoDia[]> {
  const { data: linhas, error } = await supabase.rpc('horarios_disponiveis', {
    p_servico_id: servicoId,
    p_data: data,
  })

  if (error) throw error
  return (linhas ?? []) as HorarioDoDia[]
}

export interface PedidoDeAgendamento {
  servicoId: string
  data: string
  horario: string
  nome: string
  telefone: string
  /** Chave de idempotência: a mesma tentativa nunca vira dois agendamentos. */
  chave: string
}

export async function criarAgendamento(
  pedido: PedidoDeAgendamento
): Promise<RespostaAgendamento> {
  const { data, error } = await supabase.rpc('criar_agendamento', {
    p_servico_id: pedido.servicoId,
    p_data: pedido.data,
    p_horario_inicio: pedido.horario,
    p_nome: pedido.nome,
    p_telefone: pedido.telefone,
    p_idempotency_key: pedido.chave,
  })

  // Falha de transporte (rede, servidor fora do ar): propaga para que a
  // tela mostre "não foi possível concluir" — e nunca um falso sucesso.
  if (error) throw error

  const resposta = data as RespostaAgendamento
  if (resposta?.ok) {
    resposta.agendamento.preco = Number(resposta.agendamento.preco)
  }
  return resposta
}

/**
 * Recupera um agendamento já criado a partir da chave de idempotência.
 * Usado quando a resposta se perdeu no caminho (internet caiu depois de
 * o servidor gravar): em vez de duplicar, reenviamos o mesmo pedido e o
 * banco devolve a reserva original.
 */
export async function recuperarPorChave(
  pedido: PedidoDeAgendamento
): Promise<AgendamentoConfirmado | null> {
  const resposta = await criarAgendamento(pedido)
  return resposta.ok ? resposta.agendamento : null
}

type AoMudar = () => void

/**
 * Realtime (item 18). A tabela agenda_publica só contém períodos
 * ocupados, sem qualquer dado pessoal — é o que permite o site anônimo
 * receber avisos de mudança com segurança.
 */
export function assinarAgenda(aoMudar: AoMudar): () => void {
  return assinar(['agenda_publica'], aoMudar)
}

/** Serviços e horário de funcionamento (o que o dono muda pelo aplicativo). */
export function assinarConteudo(aoMudar: AoMudar): () => void {
  return assinar(['servicos', 'config_horarios'], aoMudar)
}

let proximoCanal = 0

function assinar(tabelas: string[], aoMudar: AoMudar): () => void {
  // Nome ÚNICO por assinatura: o realtime-js devolve o MESMO canal para um
  // nome repetido, e fechar o diálogo derrubaria a assinatura da página.
  let canal = supabase.channel(`arte10-${tabelas.join('-')}-${++proximoCanal}`)
  for (const tabela of tabelas) {
    canal = canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela }, aoMudar)
  }
  canal.subscribe()

  return () => {
    void supabase.removeChannel(canal)
  }
}
