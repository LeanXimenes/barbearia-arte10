import { describe, expect, it } from 'vitest'
import { agruparFuncionamento } from './funcionamento'
import type { HorarioFuncionamento } from './tipos'

const dia = (
  dia_semana: number,
  aberto: boolean,
  abre: string | null = null,
  fecha: string | null = null,
  intervalo_inicio: string | null = null,
  intervalo_fim: string | null = null
): HorarioFuncionamento => ({ dia_semana, aberto, abre, fecha, intervalo_inicio, intervalo_fim })

describe('agruparFuncionamento', () => {
  it('agrupa os horários reais da Arte 10 como no cartaz', () => {
    const semana = [
      dia(0, true, '09:00:00', '23:00:00'),
      ...[1, 2, 3, 4, 5].map((d) => dia(d, true, '08:00:00', '12:30:00')),
      dia(6, true, '09:00:00', '23:00:00'),
    ]
    const grupos = agruparFuncionamento(semana)
    expect(grupos.map((g) => g.rotulo)).toEqual(['Segunda a sexta', 'Sábado e domingo'])
    expect(grupos[0]?.dias).toEqual([1, 2, 3, 4, 5])
    expect(grupos[1]?.dias).toEqual([6, 0])
    expect(grupos[1]?.fecha).toBe('23:00:00')
  })

  it('separa dias com horário diferente e mantém dia único com nome completo', () => {
    const semana = [
      dia(0, false),
      ...[1, 2, 3, 4].map((d) => dia(d, true, '09:00:00', '19:00:00', '12:00:00', '13:30:00')),
      dia(5, true, '09:00:00', '20:00:00', '12:00:00', '13:30:00'),
      dia(6, true, '08:00:00', '18:00:00'),
    ]
    expect(agruparFuncionamento(semana).map((g) => g.rotulo)).toEqual([
      'Segunda a quinta',
      'Sexta-feira',
      'Sábado',
      'Domingo',
    ])
  })

  it('não junta dias que não são seguidos', () => {
    const semana = [
      dia(1, true, '08:00:00', '12:00:00'),
      dia(2, false),
      dia(3, true, '08:00:00', '12:00:00'),
    ]
    expect(agruparFuncionamento(semana).map((g) => g.rotulo)).toEqual([
      'Segunda-feira',
      'Terça-feira',
      'Quarta-feira',
    ])
  })
})
