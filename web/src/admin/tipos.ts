/** Tipos do painel do dono — os mesmos dados que o app Android usa. */

export interface RespostaSimples {
  ok: boolean
  erro?: string
  mensagem?: string
  id?: string
  /** Quantos registros foram apagados (apagar atendimentos). */
  apagados?: number
}

// --------------------------------------------------------- agenda do dia

export type TipoItem = 'agendamento' | 'bloqueio' | 'intervalo' | 'livre'

export interface ItemAgenda {
  tipo: TipoItem
  id?: string | null
  horario_inicio: string
  horario_fim: string
  inicio_em?: string | null
  fim_em?: string | null
  cliente_nome?: string | null
  cliente_telefone?: string | null
  servico_nome?: string | null
  servico_preco?: number | null
  duracao_minutos?: number | null
  status?: string | null
  motivo?: string | null
  criado_em?: string | null
  passado: boolean
  /** Marcado antes de o dono mudar o expediente, ou em dia fechado. */
  fora_expediente: boolean
}

export interface AgendaDoDia {
  ok: boolean
  erro?: string
  mensagem?: string
  data?: string
  aberto: boolean
  abre?: string | null
  fecha?: string | null
  intervalo?: { inicio: string; fim: string } | null
  itens: ItemAgenda[]
  resumo: { agendamentos: number; bloqueios: number; livres: number }
  proximo?: { cliente?: string | null; servico?: string | null; horario?: string | null } | null
  proximos_livres: string[]
}

/** Horário marcado de hoje em diante (tela inicial do dono). */
export interface ProximoAgendamento {
  id: string
  data: string
  horario_inicio: string
  horario_fim: string
  inicio_em: string
  fim_em: string
  cliente_nome: string
  cliente_telefone: string
  servico_nome: string
  servico_preco: number
  duracao_minutos: number
  status: string
  em_andamento: boolean
}

export interface PromocaoAdmin {
  id: string
  titulo: string
  chamada: string | null
  descricao: string | null
  itens: string[]
  observacao: string | null
  ativo: boolean
  ordem: number
}

export type PromocaoEdicao = Omit<PromocaoAdmin, 'id'>

export interface DiaCalendario {
  data: string
  aberto: boolean
  agendamentos: number
  bloqueios: number
}

export interface AgendamentoHistorico {
  id: string
  data: string
  horario_inicio: string
  horario_fim: string
  status: string
  servico_nome: string
  servico_preco: number
  servico_duracao: number
  created_at: string
  clientes: { nome: string; telefone: string } | null
  cancelado_em: string | null
  fim_em: string | null
}

// ---------------------------------------------------------------- pessoas

export interface ClienteResumo {
  id: string
  nome: string
  telefone: string
  created_at?: string | null
  total_agendamentos: number
  faltas: number
  ultima_visita?: string | null
  proximo_horario?: string | null
}

// --------------------------------------------------------------- catálogo

export interface ServicoAdmin {
  id: string
  nome: string
  descricao: string | null
  preco: number
  duracao_minutos: number
  ativo: boolean
  ordem: number
  usa_plano: boolean
}

export type ServicoEdicao = Omit<ServicoAdmin, 'id'>

export interface HorarioFuncionamento {
  dia_semana: number
  aberto: boolean
  abre: string | null
  fecha: string | null
  intervalo_inicio: string | null
  intervalo_fim: string | null
}

export interface ConfigBarbearia {
  nome: string
  fuso: string
  telefone_whatsapp: string | null
  instagram: string | null
  endereco: string | null
  cidade: string | null
  uf: string | null
  mapa_url: string | null
  granularidade_minutos: number
  antecedencia_minima_minutos: number
  antecedencia_maxima_dias: number
  max_agendamentos_futuros: number
}

// ------------------------------------------------------------------ Clube

export interface PlanoAdmin {
  id: string
  nome: string
  chamada: string | null
  preco: number
  preco_referencia: number | null
  cortes: number
  validade_dias: number
  beneficios: string[]
  destaque: boolean
  ativo: boolean
  ordem: number
}

export type PlanoEdicao = Omit<PlanoAdmin, 'id'>

export type StatusAssinatura = 'solicitada' | 'ativa' | 'encerrada' | 'recusada' | 'cancelada'

export interface AssinaturaResumo {
  id: string
  cliente_nome: string
  cliente_telefone: string
  plano_nome: string
  preco: number
  cortes_total: number
  cortes_usados: number
  validade_dias: number
  status: StatusAssinatura
  solicitada_em: string
  ativada_em: string | null
  expira_em: string | null
  encerrada_em: string | null
}
