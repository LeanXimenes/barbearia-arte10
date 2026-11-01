import { describe, expect, it } from 'vitest'
import { proximoDiaLivre, rotuloDoDia } from './diaEscolhido'

const dia = (data: string, disponiveis: number, aberto = true) => ({
  data,
  aberto,
  dentro_da_janela: true,
  disponiveis,
})

describe('dia escolhido no agendamento', () => {
  it('chama hoje e amanhã pelo nome', () => {
    expect(rotuloDoDia('2026-10-31', '2026-10-31')).toEqual({
      titulo: 'Hoje',
      subtitulo: 'sábado, 31 de outubro',
    })
    expect(rotuloDoDia('2026-11-01', '2026-10-31').titulo).toBe('Amanhã')
    expect(rotuloDoDia('2026-11-04', '2026-10-31')).toEqual({
      titulo: 'Quarta-feira',
      subtitulo: '4 de novembro',
    })
  })

  it('acha o próximo dia com horário livre', () => {
    const dias = [
      dia('2026-10-31', 0),
      dia('2026-11-01', 5, false), // fechado
      dia('2026-11-03', 4),
      dia('2026-11-02', 0), // lotado
    ]
    expect(proximoDiaLivre(dias, '2026-10-31')).toBe('2026-11-03')
    expect(proximoDiaLivre(dias, '2026-11-03')).toBeNull()
  })
})
