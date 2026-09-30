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
