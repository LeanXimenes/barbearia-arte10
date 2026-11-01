import type { AgendamentoConfirmado } from './tipos'

export type TipoSituacao = 'marcado' | 'agora' | 'cancelado' | 'neutro'

export interface Situacao {
  texto: string
  tipo: TipoSituacao
}

type Horario = Pick<AgendamentoConfirmado, 'inicio_em' | 'fim_em' | 'status' | 'cancelado'>

/** Etiqueta de cada horário em "Minha conta" (null = sem etiqueta). */
export function situacaoDoHorario(a: Horario, agora: Date = new Date()): Situacao | null {
  if (a.cancelado) return { texto: 'Cancelado', tipo: 'cancelado' }

  const t = agora.getTime()
  if (new Date(a.fim_em).getTime() > t) {
    return new Date(a.inicio_em).getTime() <= t
      ? { texto: 'Agora', tipo: 'agora' }
      : { texto: 'Marcado', tipo: 'marcado' }
  }

  if (a.status === 'concluido') return { texto: 'Atendido', tipo: 'neutro' }
  if (a.status === 'nao_compareceu') return { texto: 'Não compareceu', tipo: 'neutro' }
  return null
}
