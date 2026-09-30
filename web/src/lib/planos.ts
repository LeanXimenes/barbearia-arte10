import type { Plano, Servico } from './tipos'

/** Preço do serviço que desconta do plano (o corte). É a base da economia. */
export function precoDoCorteDoPlano(servicos: Servico[]): number | null {
  const corte = servicos.find((s) => s.usa_plano)
  return corte ? corte.preco : null
}

/**
 * Quanto os cortes do plano custariam avulsos e quanto o cliente economiza.
 * A conta usa o preço ATUAL do corte: mudou o preço do serviço, o site
 * já mostra a economia nova. Sem serviço marcado, usa o valor guardado.
 */
export function contaDoPlano(
  plano: Pick<Plano, 'preco' | 'cortes' | 'preco_referencia'>,
  precoCorte: number | null,
): { avulso: number | null; economia: number | null } {
  const avulso = precoCorte !== null ? precoCorte * plano.cortes : plano.preco_referencia
  if (avulso === null) return { avulso: null, economia: null }
  const economia = Math.round((avulso - plano.preco) * 100) / 100
  return { avulso, economia: economia > 0 ? economia : null }
}

/** "30 dias" -> "1 mês", 90 -> "3 meses", 365 -> "1 ano", 14 -> "2 semanas", 10 -> "10 dias". */
export function textoValidade(dias: number): string {
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
  if (dias > 0 && dias % 365 === 0) return plural(dias / 365, 'ano', 'anos')
  if (dias > 0 && dias % 30 === 0) return plural(dias / 30, 'mês', 'meses')
  if (dias > 0 && dias % 7 === 0) return plural(dias / 7, 'semana', 'semanas')
  return plural(dias, 'dia', 'dias')
}

/**
 * O que vai ao lado do preço. O plano é pago UMA vez e vale pelo prazo:
 * 30 dias vira "/mês"; qualquer outro prazo diz o prazo ("por 3 meses"),
 * para nunca parecer mensalidade.
 */
export function sufixoDoPreco(dias: number): string {
  return dias === 30 ? '/mês' : `por ${textoValidade(dias)}`
}

// Vantagens que o site já calcula sozinho: se o dono escrever à mão, somem
// daqui para não contradizer os números reais (prazo, cortes, economia).
const CALCULADAS = [/^v[aá]lid[oa]s?\b/i, /^\d+\s+cortes?\b/i, /^economi[zs]/i]

/** Vantagens do plano: as calculadas (sempre certas) + as escritas pelo dono. */
export function vantagensDoPlano(
  plano: Pick<Plano, 'cortes' | 'validade_dias' | 'beneficios'>,
): string[] {
  const extras = plano.beneficios.filter((b) => !CALCULADAS.some((r) => r.test(b.trim())))
  return [
    `${plano.cortes} ${plano.cortes === 1 ? 'corte' : 'cortes'} de cabelo`,
    `Vale por ${textoValidade(plano.validade_dias)}`,
    ...extras,
  ]
}
