/**
 * "Que horas são na barbearia?"
 *
 * O visitante pode estar em outro fuso — o que importa para dizer
 * "aberto agora" é sempre o relógio da barbearia.
 */

export interface AgoraLocal {
  data: string // "2026-09-21"
  hora: string // "14:35"
  diaSemana: number // 0 = domingo
}

export function agoraNaBarbearia(fuso = 'America/Sao_Paulo'): AgoraLocal {
  const agora = new Date()

  let partes: Intl.DateTimeFormatPart[]
  try {
    partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(agora)
  } catch {
    // Fuso desconhecido no navegador: cai para o relógio local.
    partes = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(agora)
  }

  const pegar = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? ''

  const mapaDias: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  const hora24 = pegar('hour') === '24' ? '00' : pegar('hour')

  return {
    data: `${pegar('year')}-${pegar('month')}-${pegar('day')}`,
    hora: `${hora24}:${pegar('minute')}`,
    diaSemana: mapaDias[pegar('weekday')] ?? agora.getDay(),
  }
}

/** Soma dias a uma data no formato "AAAA-MM-DD". */
export function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1))
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export interface EstadoAgora {
  aberto: boolean
  detalhe: string
}

/** Diz se a barbearia está aberta agora, com base no expediente do dia. */
export function estadoAgora(
  funcionamento: Array<{
    dia_semana: number
    aberto: boolean
    abre: string | null
    fecha: string | null
    intervalo_inicio: string | null
    intervalo_fim: string | null
  }>,
  agora: AgoraLocal
): EstadoAgora {
  const hoje = funcionamento.find((f) => f.dia_semana === agora.diaSemana)

  if (!hoje || !hoje.aberto || !hoje.abre || !hoje.fecha) {
    return { aberto: false, detalhe: 'Fechado hoje' }
  }

  const abre = hoje.abre.slice(0, 5)
  const fecha = hoje.fecha.slice(0, 5)
  const h = agora.hora

  if (h < abre) return { aberto: false, detalhe: `Abre às ${abre}` }
  if (h >= fecha) return { aberto: false, detalhe: 'Encerrado por hoje' }

  if (hoje.intervalo_inicio && hoje.intervalo_fim) {
    const ini = hoje.intervalo_inicio.slice(0, 5)
    const fim = hoje.intervalo_fim.slice(0, 5)
    if (h >= ini && h < fim) return { aberto: false, detalhe: `Intervalo até ${fim}` }
  }

  return { aberto: true, detalhe: `Aberto até ${fecha}` }
}
