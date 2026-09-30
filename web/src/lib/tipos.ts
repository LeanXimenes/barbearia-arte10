/** Tipos espelhando exatamente o que o banco devolve. */

export interface Servico {
  id: string
  nome: string
  descricao: string | null
  preco: number
  duracao_minutos: number
  ativo: boolean
  ordem: number
  /** Desconta um corte do plano do Clube quando agendado. */
  usa_plano: boolean
}

export interface HorarioDoDia {
  horario: string // "14:00:00"
  horario_fim: string // "14:35:00"
  inicio_em: string // ISO
  fim_em: string // ISO
  disponivel: boolean
  motivo: 'ocupado' | 'bloqueado' | null
}

export interface DiaDisponivel {
  data: string // "2026-09-21"
  aberto: boolean
  dentro_da_janela: boolean
  disponiveis: number
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
}

export interface HorarioFuncionamento {
  dia_semana: number
  aberto: boolean
  abre: string | null
  fecha: string | null
  intervalo_inicio: string | null
  intervalo_fim: string | null
}

export interface AgendamentoConfirmado {
  id: string
  codigo: string
  cliente: string
  telefone: string
  servico: string
  preco: number
  duracao_minutos: number
  data: string
  horario_inicio: string
  horario_fim: string
  inicio_em: string
  fim_em: string
  status: string
  created_at: string
  /** Presente quando este agendamento usou um corte do plano do cliente. */
  plano?: UsoDoPlano | null
}

export interface UsoDoPlano {
  nome: string
  numero: number
  total: number
  restantes: number
  expira_em: string
}

export interface Plano {
  id: string
  nome: string
  chamada: string | null
  preco: number
  preco_referencia: number | null
  cortes: number
  validade_dias: number
  beneficios: string[]
  destaque: boolean
}

export interface Promocao {
  id: string
  titulo: string
  chamada: string | null
  descricao: string | null
  itens: string[]
  observacao: string | null
}

export interface Assinatura {
  id: string
  plano: string
  status: 'solicitada' | 'ativa' | 'encerrada' | 'recusada' | 'cancelada'
  preco: number
  cortes_total: number
  cortes_usados: number
  restantes: number
  solicitada_em: string
  expira_em: string | null
}

export type RespostaPlano =
  | { ok: true; assinatura: Assinatura; barbearia: DadosBarbearia }
  | { ok: false; erro: string; mensagem: string; assinatura?: Assinatura }

export interface DadosBarbearia {
  nome: string
  endereco: string | null
  cidade: string | null
  uf: string | null
  telefone_whatsapp: string | null
  instagram: string | null
  mapa_url: string | null
}

export type RespostaAgendamento =
  | {
      ok: true
      duplicado: boolean
      agendamento: AgendamentoConfirmado
      barbearia: DadosBarbearia
    }
  | {
      ok: false
      erro: string
      mensagem: string
    }
