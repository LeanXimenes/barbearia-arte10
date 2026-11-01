import { supabaseAdmin as sb } from './supabaseAdmin'
import { pareceFalhaDeRede } from '../lib/erros'
import type {
  AgendaDoDia,
  AgendamentoHistorico,
  AssinaturaResumo,
  ClienteResumo,
  ConfigBarbearia,
  DiaCalendario,
  HorarioFuncionamento,
  PlanoAdmin,
  PlanoEdicao,
  ProximoAgendamento,
  PromocaoAdmin,
  PromocaoEdicao,
  RespostaSimples,
  ServicoAdmin,
  ServicoEdicao,
} from './tipos'

/**
 * Tudo o que o painel faz no banco — as MESMAS chamadas do app Android
 * (AgendaRepositorio e CatalogoRepositorio). Nenhuma regra mora aqui: o
 * banco decide e o RLS só libera para administradores.
 */

const MSG_CARREGAR = 'Não foi possível carregar. Verifique a internet e tente de novo.'
const MSG_SALVAR = 'Não foi possível salvar. Tente de novo.'
const MSG_SEM_INTERNET = 'Sem internet: nada foi salvo. Tente de novo quando a conexão voltar.'

/** Erro com mensagem pronta para mostrar na tela. */
export class ErroPainel extends Error {}

function falha(erro: unknown, salvando: boolean): never {
  if (pareceFalhaDeRede(erro)) throw new ErroPainel(salvando ? MSG_SEM_INTERNET : MSG_CARREGAR)
  throw new ErroPainel(salvando ? MSG_SALVAR : MSG_CARREGAR)
}

async function ler<T>(consulta: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  try {
    const { data, error } = await consulta
    if (error) falha(error, false)
    return data as T
  } catch (e) {
    if (e instanceof ErroPainel) throw e
    falha(e, false)
  }
}

async function gravar<T = void>(consulta: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  try {
    const { data, error } = await consulta
    if (error) falha(error, true)
    return data as T
  } catch (e) {
    if (e instanceof ErroPainel) throw e
    falha(e, true)
  }
}

/** RPC que devolve {ok, erro, mensagem}: recusa do banco vira ErroPainel com a mensagem dele. */
async function acao(funcao: string, args?: Record<string, unknown>): Promise<RespostaSimples> {
  const r = await gravar<RespostaSimples>(sb.rpc(funcao, args))
  if (!r?.ok) throw new ErroPainel(r?.mensagem || MSG_SALVAR)
  return r
}

// ------------------------------------------------------------------ conta

export async function entrar(email: string, senha: string): Promise<void> {
  try {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) {
      if (pareceFalhaDeRede(error)) throw new ErroPainel(MSG_CARREGAR)
      throw new ErroPainel('E-mail ou senha incorretos.')
    }
  } catch (e) {
    if (e instanceof ErroPainel) throw e
    falha(e, false)
  }
}

export async function sair(): Promise<void> {
  await sb.auth.signOut().catch(() => {})
}

/** A conta está liberada em public.administradores? */
export async function ehAdministrador(): Promise<boolean> {
  return (await ler<boolean>(sb.rpc('is_admin'))) === true
}

// ----------------------------------------------------------------- agenda

export async function agendaDoDia(data: string): Promise<AgendaDoDia> {
  const r = await ler<AgendaDoDia>(sb.rpc('agenda_do_dia', { p_data: data }))
  if (!r?.ok) throw new ErroPainel(r?.mensagem || MSG_CARREGAR)
  return { ...r, itens: r.itens ?? [], proximos_livres: r.proximos_livres ?? [] }
}

/** Hoje e os próximos dias (só o que ainda não terminou), com o telefone do cliente. */
export async function proximosAgendamentos(dias = 7): Promise<{ hoje: string; agendamentos: ProximoAgendamento[] }> {
  const r = await ler<{ ok: boolean; mensagem?: string; hoje: string; agendamentos: ProximoAgendamento[] }>(
    sb.rpc('proximos_agendamentos', { p_dias: dias }),
  )
  if (!r?.ok) throw new ErroPainel(r?.mensagem || MSG_CARREGAR)
  return {
    hoje: r.hoje,
    agendamentos: (r.agendamentos ?? []).map((a) => ({ ...a, servico_preco: Number(a.servico_preco) })),
  }
}

export function visaoGeral(inicio: string, fim: string): Promise<DiaCalendario[]> {
  return ler(sb.rpc('visao_geral_periodo', { p_inicio: inicio, p_fim: fim }))
}

export function bloquear(data: string, inicio: string, fim: string, motivo: string) {
  return acao('criar_bloqueio', {
    p_data: data,
    p_horario_inicio: inicio,
    p_horario_fim: fim,
    p_motivo: motivo.trim() || null,
  })
}

export function desbloquear(id: string) {
  return acao('remover_bloqueio', { p_id: id })
}

/** Desfecho do atendimento (atendido / faltou). Não libera o horário. */
export function atualizarStatus(id: string, status: 'concluido' | 'nao_compareceu') {
  return acao('atualizar_status_agendamento', { p_id: id, p_status: status })
}

/** Cancela o horário do cliente (só antes de acontecer). O horário volta a ficar livre. */
export function cancelar(id: string, motivo: string) {
  return acao('cancelar_agendamento', { p_id: id, p_motivo: motivo.trim() || null })
}

export function apagarAtendimento(id: string) {
  return acao('apagar_atendimento', { p_id: id })
}

export function apagarAtendimentosPassados() {
  return acao('apagar_atendimentos_passados')
}

const COLUNAS_HISTORICO =
  'id, data, horario_inicio, horario_fim, status, servico_nome, servico_preco, servico_duracao, ' +
  'created_at, cancelado_em, fim_em, clientes(nome, telefone)'

export async function historico(ate: string, limite = 100, deslocamento = 0): Promise<AgendamentoHistorico[]> {
  const linhas = await ler<AgendamentoHistorico[]>(
    sb
      .from('agendamentos')
      .select(COLUNAS_HISTORICO)
      .lte('data', ate)
      .order('data', { ascending: false })
      .order('horario_inicio', { ascending: false })
      .range(deslocamento, deslocamento + limite - 1),
  )
  return (linhas ?? []).map((a) => ({ ...a, servico_preco: Number(a.servico_preco) }))
}

/** Avisa quando um agendamento ou bloqueio muda (para as telas recarregarem). */
let proximoCanal = 0
export function assinarMudancas(aoMudar: () => void): () => void {
  const canal = sb
    .channel(`painel-agenda-${++proximoCanal}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, aoMudar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bloqueios' }, aoMudar)
    .subscribe()
  return () => {
    void sb.removeChannel(canal)
  }
}

// --------------------------------------------------------------- clientes

export async function clientes(busca = ''): Promise<ClienteResumo[]> {
  // Só letras, números e espaços: vírgula e parênteses quebrariam o filtro "or".
  const texto = busca.replace(/[^\p{L}\p{N} ]/gu, '').trim()
  const digitos = texto.replace(/\D/g, '')

  let consulta = sb.from('clientes_resumo').select('*')
  if (texto) {
    consulta = consulta.or(
      digitos ? `nome.ilike.%${texto}%,telefone.ilike.%${digitos}%` : `nome.ilike.%${texto}%`,
    )
  }
  return (await ler<ClienteResumo[]>(consulta.order('nome', { ascending: true }).limit(200))) ?? []
}

export function apagarCliente(id: string) {
  return acao('apagar_cliente', { p_id: id })
}

// --------------------------------------------------------------- serviços

export async function servicos(): Promise<ServicoAdmin[]> {
  const linhas = await ler<ServicoAdmin[]>(
    sb.from('servicos').select('*').order('ordem', { ascending: true }).order('nome', { ascending: true }),
  )
  return (linhas ?? []).map((s) => ({ ...s, preco: Number(s.preco), usa_plano: Boolean(s.usa_plano) }))
}

export function criarServico(s: ServicoEdicao) {
  return gravar(sb.from('servicos').insert(s))
}

export function atualizarServico(id: string, s: ServicoEdicao) {
  return gravar(sb.from('servicos').update(s).eq('id', id))
}

/** Ativar/desativar em vez de excluir: o histórico de quem já usou fica intacto. */
export function definirAtivo(id: string, ativo: boolean) {
  return gravar(sb.from('servicos').update({ ativo }).eq('id', id))
}

export function reordenarServicos(ids: string[]) {
  return acao('reordenar_servicos', { p_ids: ids })
}

// ------------------------------------------------------------------ Clube

export async function planos(): Promise<PlanoAdmin[]> {
  const linhas = await ler<PlanoAdmin[]>(
    sb.from('planos').select('*').order('ordem', { ascending: true }).order('preco', { ascending: true }),
  )
  return (linhas ?? []).map((p) => ({
    ...p,
    preco: Number(p.preco),
    preco_referencia: p.preco_referencia === null ? null : Number(p.preco_referencia),
    beneficios: p.beneficios ?? [],
  }))
}

export function criarPlano(p: PlanoEdicao) {
  return gravar(sb.from('planos').insert(p))
}

export function atualizarPlano(id: string, p: PlanoEdicao) {
  return gravar(sb.from('planos').update(p).eq('id', id))
}

export function excluirPlano(id: string) {
  return acao('excluir_plano', { p_id: id })
}

// Promoções do site (o dono cria, edita, esconde e apaga).
export async function promocoes(): Promise<PromocaoAdmin[]> {
  const linhas = await ler<PromocaoAdmin[]>(
    sb.from('promocoes').select('*').order('ordem', { ascending: true }).order('titulo', { ascending: true }),
  )
  return (linhas ?? []).map((p) => ({ ...p, itens: p.itens ?? [] }))
}

export function criarPromocao(p: PromocaoEdicao) {
  return gravar(sb.from('promocoes').insert(p))
}

export function atualizarPromocao(id: string, p: PromocaoEdicao) {
  return gravar(sb.from('promocoes').update(p).eq('id', id))
}

export function excluirPromocao(id: string) {
  return gravar(sb.from('promocoes').delete().eq('id', id))
}

export async function assinaturas(): Promise<AssinaturaResumo[]> {
  const linhas = await ler<AssinaturaResumo[]>(
    sb.from('assinaturas_resumo').select('*').order('solicitada_em', { ascending: false }).limit(200),
  )
  return (linhas ?? []).map((a) => ({ ...a, preco: Number(a.preco) }))
}

export function ativarAssinatura(id: string) {
  return acao('ativar_assinatura', { p_id: id })
}

/** Recusa um pedido ou cancela um plano ativo. */
export function encerrarAssinatura(id: string) {
  return acao('encerrar_assinatura', { p_id: id })
}

export function excluirAssinatura(id: string) {
  return acao('excluir_assinatura', { p_id: id })
}

export function excluirAssinaturasEncerradas() {
  return acao('excluir_assinaturas_encerradas')
}

// ---------------------------------------------------------- funcionamento

export async function funcionamento(): Promise<HorarioFuncionamento[]> {
  return (
    (await ler<HorarioFuncionamento[]>(
      sb.from('config_horarios').select('*').order('dia_semana', { ascending: true }),
    )) ?? []
  )
}

export function salvarFuncionamento(d: HorarioFuncionamento) {
  return gravar(
    sb
      .from('config_horarios')
      .update({
        aberto: d.aberto,
        abre: d.abre,
        fecha: d.fecha,
        intervalo_inicio: d.intervalo_inicio,
        intervalo_fim: d.intervalo_fim,
      })
      .eq('dia_semana', d.dia_semana),
  )
}

export async function config(): Promise<ConfigBarbearia | null> {
  return ler(sb.from('config_barbearia').select('*').limit(1).maybeSingle())
}

export function salvarConfig(c: ConfigBarbearia) {
  return gravar(
    sb
      .from('config_barbearia')
      .update({
        nome: c.nome,
        telefone_whatsapp: c.telefone_whatsapp,
        instagram: c.instagram,
        endereco: c.endereco,
        cidade: c.cidade,
        uf: c.uf,
        mapa_url: c.mapa_url,
        granularidade_minutos: c.granularidade_minutos,
        antecedencia_minima_minutos: c.antecedencia_minima_minutos,
        antecedencia_maxima_dias: c.antecedencia_maxima_dias,
        max_agendamentos_futuros: c.max_agendamentos_futuros,
      })
      .eq('id', true),
  )
}

// ---------------------------------------------------- avisos no iPhone

export function registrarAparelhoWeb(endpoint: string, p256dh: string, auth: string, modelo: string) {
  return acao('registrar_dispositivo_web', {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_modelo: modelo,
  })
}

export function removerAparelhoWeb(endpoint: string) {
  return gravar(sb.from('dispositivos_push').delete().eq('token', endpoint))
}
