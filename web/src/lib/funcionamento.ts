import type { HorarioFuncionamento } from './tipos'

/** Semana na ordem em que as pessoas leem: segunda primeiro, domingo por último. */
const ORDEM = [1, 2, 3, 4, 5, 6, 0]

const NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const NOMES_COMPLETOS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]

export interface GrupoDeDias {
  /** dia_semana (0 = domingo) de cada dia do grupo, em ordem. */
  dias: number[]
  /** "Segunda a sexta", "Sábado e domingo", "Quarta-feira"… */
  rotulo: string
  aberto: boolean
  abre: string | null
  fecha: string | null
  intervaloInicio: string | null
  intervaloFim: string | null
}

const assinatura = (h: HorarioFuncionamento) =>
  [h.aberto, h.abre, h.fecha, h.intervalo_inicio, h.intervalo_fim].join('|')

/**
 * Junta dias SEGUIDOS com o mesmo horário numa linha só
 * ("Segunda a sexta — 08:00 às 12:30").
 */
export function agruparFuncionamento(lista: HorarioFuncionamento[]): GrupoDeDias[] {
  const grupos: GrupoDeDias[] = []
  let anterior: string | null = null

  for (const dia of ORDEM) {
    const h = lista.find((f) => f.dia_semana === dia)
    if (!h) {
      anterior = null
      continue
    }

    const atual = assinatura(h)
    const ultimo = grupos[grupos.length - 1]

    if (ultimo && atual === anterior) {
      ultimo.dias.push(dia)
    } else {
      grupos.push({
        dias: [dia],
        rotulo: '',
        aberto: h.aberto,
        abre: h.abre,
        fecha: h.fecha,
        intervaloInicio: h.intervalo_inicio,
        intervaloFim: h.intervalo_fim,
      })
    }
    anterior = atual
  }

  for (const g of grupos) g.rotulo = rotulo(g.dias)
  return grupos
}

function rotulo(dias: number[]): string {
  const primeiro = dias[0] ?? 0
  const ultimo = dias[dias.length - 1] ?? 0
  if (dias.length === 1) return NOMES_COMPLETOS[primeiro] ?? ''
  const ligacao = dias.length === 2 ? 'e' : 'a'
  return `${NOMES[primeiro]} ${ligacao} ${(NOMES[ultimo] ?? '').toLowerCase()}`
}
