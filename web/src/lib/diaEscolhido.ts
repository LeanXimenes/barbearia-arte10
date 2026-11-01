import type { DiaDisponivel } from './tipos'
import { dataDeTexto, nomeDoDiaDaSemana, nomeDoMes } from './formato'
import { somarDias } from './relogio'

/** "Hoje" / "Amanhã" / "Quarta-feira", com a data por extenso embaixo. */
export function rotuloDoDia(data: string, hoje: string): { titulo: string; subtitulo: string } {
  const d = dataDeTexto(data)
  const diaMes = `${d.getDate()} de ${nomeDoMes(d.getMonth())}`
  const semana = nomeDoDiaDaSemana(d.getDay())

  if (data === hoje) return { titulo: 'Hoje', subtitulo: `${semana.toLowerCase()}, ${diaMes}` }
  if (data === somarDias(hoje, 1)) {
    return { titulo: 'Amanhã', subtitulo: `${semana.toLowerCase()}, ${diaMes}` }
  }
  return { titulo: semana, subtitulo: diaMes }
}

export function diaTemVaga(dia: DiaDisponivel | undefined): boolean {
  return Boolean(dia && dia.aberto && dia.dentro_da_janela && dia.disponiveis > 0)
}

/** Primeiro dia com horário livre depois de `depoisDe` (null se não houver). */
export function proximoDiaLivre(dias: DiaDisponivel[], depoisDe: string): string | null {
  let melhor: string | null = null
  for (const dia of dias) {
    const data = String(dia.data).slice(0, 10)
    if (data > depoisDe && diaTemVaga(dia) && (melhor === null || data < melhor)) melhor = data
  }
  return melhor
}
