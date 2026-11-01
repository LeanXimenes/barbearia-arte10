import { describe, expect, it } from 'vitest'
import { situacaoDoHorario } from './horariosDaConta'

const agora = new Date('2026-11-10T13:00:00Z')
const horario = (inicio: string, fim: string, extra: Record<string, unknown> = {}) => ({
  inicio_em: inicio,
  fim_em: fim,
  status: 'agendado',
  cancelado: false,
  ...extra,
})

describe('etiqueta dos horários em "Minha conta"', () => {
  it('futuro aparece como marcado; em andamento, como agora', () => {
    expect(situacaoDoHorario(horario('2026-11-11T13:00:00Z', '2026-11-11T13:35:00Z'), agora)?.texto).toBe(
      'Marcado',
    )
    expect(situacaoDoHorario(horario('2026-11-10T12:50:00Z', '2026-11-10T13:25:00Z'), agora)?.texto).toBe(
      'Agora',
    )
  })

  it('cancelado pelo dono sempre aparece como cancelado', () => {
    const r = situacaoDoHorario(
      horario('2026-11-11T13:00:00Z', '2026-11-11T13:35:00Z', { cancelado: true }),
      agora,
    )
    expect(r).toEqual({ texto: 'Cancelado', tipo: 'cancelado' })
  })

  it('o que já passou mostra o desfecho, se o dono marcou', () => {
    const passado = (status: string) =>
      situacaoDoHorario(horario('2026-11-09T13:00:00Z', '2026-11-09T13:35:00Z', { status }), agora)
    expect(passado('concluido')?.texto).toBe('Atendido')
    expect(passado('nao_compareceu')?.texto).toBe('Não compareceu')
    expect(passado('agendado')).toBeNull()
  })
})
