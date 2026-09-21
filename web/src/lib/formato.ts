/** Formatação em português do Brasil. Nada aqui depende do Supabase. */

const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** "2026-09-21" -> Date local (sem escorregar de dia por fuso horário). */
export function dataDeTexto(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1)
}

/** Date -> "2026-09-21" */
export function textoDeData(data: Date): string {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

/** "2026-09-21" -> "21/09/2026" */
export function dataCurta(iso: string): string {
  const d = dataDeTexto(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** "2026-09-21" -> "Segunda-feira, 21 de setembro" */
export function dataPorExtenso(iso: string): string {
  const d = dataDeTexto(iso)
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`
}

export function diaDaSemanaCurto(iso: string): string {
  return DIAS_CURTOS[dataDeTexto(iso).getDay()] ?? ''
}

export function nomeDoDiaDaSemana(dia: number): string {
  return DIAS_SEMANA[dia] ?? ''
}

export function nomeDoMes(mes: number): string {
  return MESES[mes] ?? ''
}

/** "14:00:00" -> "14:00" */
export function hora(valor: string | null | undefined): string {
  if (!valor) return ''
  return valor.slice(0, 5)
}

/** 35 -> "R$ 35,00" */
export function moeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

/** 35 -> "35 min" | 60 -> "1h" | 90 -> "1h30" */
export function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

/** Máscara progressiva de telefone brasileiro. */
export function mascararTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** "17999990001" -> "(17) 99999-0001" */
export function telefoneBonito(valor: string): string {
  return mascararTelefone(valor)
}

export function telefoneValido(valor: string): boolean {
  const d = valor.replace(/\D/g, '')
  return d.length === 10 || d.length === 11
}

export function nomeValido(valor: string): boolean {
  return valor.trim().replace(/\s+/g, ' ').length >= 2
}

/** Monta o link do WhatsApp a partir do telefone guardado no banco. */
export function linkWhatsapp(telefone: string | null, mensagem?: string): string | null {
  if (!telefone) return null
  let digitos = telefone.replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`
  if (digitos.length < 12) return null
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''
  return `https://wa.me/${digitos}${texto}`
}

export function linkInstagram(usuario: string | null): string | null {
  if (!usuario) return null
  return `https://instagram.com/${usuario.replace(/^@/, '')}`
}

export function linkMapa(config: {
  mapa_url: string | null
  endereco: string | null
  cidade: string | null
  uf: string | null
}): string | null {
  if (config.mapa_url) return config.mapa_url
  const partes = [config.endereco, config.cidade, config.uf].filter(Boolean)
  if (partes.length === 0) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partes.join(', '))}`
}
