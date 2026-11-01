/** Formatos do painel — os mesmos textos do app Android (core/Formato.kt). */
import { dataPorExtenso } from '../lib/formato'
import { agoraNaBarbearia, somarDias } from '../lib/relogio'

const FUSO = 'America/Sao_Paulo'

export function hoje(): string {
  return agoraNaBarbearia(FUSO).data
}

/** "Hoje", "Amanhã", "Ontem" ou "Segunda-feira, 21 de setembro". */
export function rotuloRelativo(data: string): string {
  const h = hoje()
  if (data === h) return 'Hoje'
  if (data === somarDias(h, 1)) return 'Amanhã'
  if (data === somarDias(h, -1)) return 'Ontem'
  return dataPorExtenso(data)
}

/** Instante do banco -> "21/09/2026 às 14:32". */
export function carimbo(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d)
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? ''
  return `${p('day')}/${p('month')}/${p('year')} às ${p('hour')}:${p('minute')}`
}

export function rotuloStatus(status: string | null | undefined): string {
  if (status === 'agendado') return 'Agendado'
  if (status === 'concluido') return 'Concluído'
  if (status === 'nao_compareceu') return 'Não compareceu'
  return status ?? ''
}

/** "HH:MM" válido. */
export function horaValida(valor: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(valor)
}

/** Máscara de hora enquanto digita: "0930" -> "09:30". */
export function mascararHora(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 4)
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`
}
