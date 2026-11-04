import { supabase } from '../lib/supabase'
import { ErroMuitosPedidos, MSG_MUITOS_PEDIDOS } from '../lib/erros'
import type {
  AgendamentoConfirmado,
  Assinatura,
  Plano,
  Promocao,
  RespostaConta,
  RespostaMinhaConta,
  RespostaPlano,
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

interface RespostaDoBanco {
  data: unknown
  error: unknown
  status: number
}

/**
 * Resposta de uma função que devolve { ok, erro, mensagem }. Quando o banco
 * barra por excesso de pedidos (HTTP 429), vira uma resposta de erro comum,
 * com a mensagem que a tela já sabe mostrar.
 */
function respostaDaFuncao<T>({ data, error, status }: RespostaDoBanco): T {
  if (status === 429) {
    const corpo = (error ?? {}) as { mensagem?: string; tentar_em_segundos?: number }
    return {
      ok: false,
      erro: 'MUITOS_PEDIDOS',
      mensagem: corpo.mensagem ?? MSG_MUITOS_PEDIDOS,
      tentar_em_segundos: corpo.tentar_em_segundos ?? null,
    } as T
  }
  if (error) throw error
  return data as T
}

/** Erro de uma consulta (lista): 429 vira um erro com mensagem clara. */
function falhaDaConsulta(error: unknown, status: number): never {
  if (status === 429) {
    const corpo = (error ?? {}) as { mensagem?: string; tentar_em_segundos?: number }
    throw new ErroMuitosPedidos(corpo.mensagem ?? MSG_MUITOS_PEDIDOS, corpo.tentar_em_segundos ?? null)
  }
  throw error
}

export async function carregarServicos(): Promise<Servico[]> {
  const { data, error } = await supabase
    .from('servicos')
    .select('id, nome, descricao, preco, duracao_minutos, ativo, ordem, usa_plano')
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
        'granularidade_minutos, antecedencia_minima_minutos, antecedencia_maxima_dias, turnstile_site_key',
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
  fim: string,
): Promise<DiaDisponivel[]> {
  const { data, error, status } = await supabase.rpc('dias_disponiveis', {
    p_servico_id: servicoId,
    p_inicio: inicio,
    p_fim: fim,
  })

  if (error) falhaDaConsulta(error, status)
  return (data ?? []) as DiaDisponivel[]
}

export async function carregarHorarios(servicoId: string, data: string): Promise<HorarioDoDia[]> {
  const { data: linhas, error, status } = await supabase.rpc('horarios_disponiveis', {
    p_servico_id: servicoId,
    p_data: data,
  })

  if (error) falhaDaConsulta(error, status)
  return (linhas ?? []) as HorarioDoDia[]
}

export interface PedidoDeAgendamento {
  servicoId: string
  data: string
  horario: string
  /** Chave de idempotência: a mesma tentativa nunca vira dois agendamentos. */
  chave: string
}

/**
 * Agendamento (só logado): o nome e o número vêm da conta, no servidor.
 * O banco não aceita mais agendamento sem conta.
 */
export async function criarAgendamentoConta(
  token: string,
  pedido: PedidoDeAgendamento,
): Promise<RespostaAgendamento> {
  const resposta = await supabase.rpc('criar_agendamento_conta', {
    p_token: token,
    p_servico_id: pedido.servicoId,
    p_data: pedido.data,
    p_horario_inicio: pedido.horario,
    p_idempotency_key: pedido.chave,
  })
  // Falha de transporte (rede, servidor fora do ar): propaga para que a
  // tela mostre "não foi possível concluir" — e nunca um falso sucesso.
  return normalizarResposta(respostaDaFuncao<RespostaAgendamento>(resposta))
}

function normalizarResposta(resposta: RespostaAgendamento): RespostaAgendamento {
  if (resposta?.ok) {
    resposta.agendamento.preco = Number(resposta.agendamento.preco)
  }
  return resposta
}

/**
 * Recupera um agendamento já criado a partir da chave de idempotência.
 * Usado quando a resposta se perdeu no caminho (internet caiu depois de
 * o servidor gravar): em vez de duplicar, reenviamos o mesmo pedido e o
 * banco devolve a reserva original (só para a mesma conta).
 */
export async function recuperarPorChave(
  token: string,
  pedido: PedidoDeAgendamento,
): Promise<AgendamentoConfirmado | null> {
  const resposta = await criarAgendamentoConta(token, pedido)
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

// ---------------------------------------------------------------------
// Clube Arte 10: planos e promoções
// ---------------------------------------------------------------------

export async function carregarPlanos(): Promise<Plano[]> {
  const { data, error } = await supabase
    .from('planos')
    .select(
      'id, nome, chamada, preco, preco_referencia, cortes, validade_dias, beneficios, destaque',
    )
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('preco', { ascending: true })

  if (error) throw error
  return (data ?? []).map((p) => ({
    ...p,
    preco: Number(p.preco),
    preco_referencia: p.preco_referencia === null ? null : Number(p.preco_referencia),
    beneficios: p.beneficios ?? [],
  })) as Plano[]
}

export async function carregarPromocoes(): Promise<Promocao[]> {
  const { data, error } = await supabase
    .from('promocoes')
    .select('id, titulo, chamada, descricao, itens, observacao')
    .eq('ativo', true)
    .order('ordem', { ascending: true })

  if (error) throw error
  return (data ?? []).map((p) => ({ ...p, itens: p.itens ?? [] })) as Promocao[]
}

/**
 * Pedido de plano (só logado). Sai no nome e no número da conta; com outro
 * número, é para outra pessoa (o banco não troca o nome já cadastrado dela).
 */
export async function solicitarPlano(
  token: string,
  planoId: string,
  nome: string,
  telefone: string,
): Promise<RespostaPlano> {
  const resposta = await supabase.rpc('solicitar_plano_conta', {
    p_token: token,
    p_plano_id: planoId,
    p_nome: nome,
    p_telefone: telefone,
  })
  return respostaDaFuncao<RespostaPlano>(resposta)
}

// ---------------------------------------------------------------------
// Conta do cliente (login com número ou e-mail + senha)
// ---------------------------------------------------------------------

export interface DadosNovaConta {
  nome: string
  telefone: string
  senha: string
  email: string
  /** Token do desafio anti-robô (o banco confere na Cloudflare). */
  turnstile?: string | null
}

export async function criarConta(dados: DadosNovaConta): Promise<RespostaConta> {
  const resposta = await supabase.rpc('criar_conta', {
    p_nome: dados.nome,
    p_telefone: dados.telefone,
    p_senha: dados.senha,
    p_email: dados.email.trim() || null,
    p_turnstile: dados.turnstile ?? null,
  })
  return respostaDaFuncao<RespostaConta>(resposta)
}

/** `login` é o número (com ou sem máscara) ou o e-mail. */
export async function entrarNaConta(login: string, senha: string): Promise<RespostaConta> {
  const resposta = await supabase.rpc('entrar', { p_login: login, p_senha: senha })
  return respostaDaFuncao<RespostaConta>(resposta)
}

export async function sairDaConta(token: string): Promise<void> {
  const { error } = await supabase.rpc('sair', { p_token: token })
  if (error) throw error
}

export async function carregarMinhaConta(token: string): Promise<RespostaMinhaConta> {
  const resposta = await supabase.rpc('minha_conta', { p_token: token })
  const r = respostaDaFuncao<RespostaMinhaConta>(resposta)
  if (r?.ok) {
    for (const a of [...r.proximos, ...r.anteriores]) a.preco = Number(a.preco)
  }
  return r
}

/**
 * O cliente cancela o próprio horário. O banco só aceita até 40 minutos
 * antes; depois disso a resposta pede para falar com a barbearia.
 */
export async function cancelarMeuAgendamento(
  token: string,
  agendamentoId: string,
): Promise<{ ok: true } | { ok: false; erro: string; mensagem: string }> {
  const resposta = await supabase.rpc('cancelar_meu_agendamento', {
    p_token: token,
    p_agendamento_id: agendamentoId,
  })
  return respostaDaFuncao<{ ok: true } | { ok: false; erro: string; mensagem: string }>(resposta)
}

/** Liga os lembretes (Web Push) deste aparelho para a conta. */
export async function registrarAparelhoConta(
  token: string,
  endpoint: string,
  p256dh: string,
  auth: string,
): Promise<boolean> {
  const resposta = await supabase.rpc('registrar_aparelho_conta', {
    p_token: token,
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
  })
  return Boolean(respostaDaFuncao<{ ok?: boolean }>(resposta)?.ok)
}

export async function removerAparelhoConta(token: string, endpoint: string): Promise<void> {
  const { error } = await supabase.rpc('remover_aparelho_conta', { p_token: token, p_endpoint: endpoint })
  if (error) throw error
}

/** Plano (pedido, ativo ou recém-encerrado) do número da conta logada. */
export async function consultarMeuPlano(token: string): Promise<Assinatura | null> {
  const resposta = await supabase.rpc('meu_plano_conta', { p_token: token })
  const r = respostaDaFuncao<{ ok: boolean; plano: Assinatura | null }>(resposta)
  return r?.ok ? r.plano : null
}
