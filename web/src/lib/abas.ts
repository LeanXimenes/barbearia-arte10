/** As abas do site. O id também é o endereço (#servicos) para dar para compartilhar. */
export const ABAS = [
  { id: 'inicio', texto: 'Início' },
  { id: 'servicos', texto: 'Serviços' },
  { id: 'horarios', texto: 'Horários' },
  { id: 'contato', texto: 'Contato' },
  // Some quando o site já está aberto como app instalado.
  { id: 'app', texto: 'App' },
] as const

export type IdAba = (typeof ABAS)[number]['id']

/** Aceita também os endereços antigos do site de uma página só. */
const APELIDOS: Record<string, IdAba> = {
  funcionamento: 'horarios',
  localizacao: 'contato',
}

export function abaDoEndereco(hash: string, total: number = ABAS.length): number {
  const id = hash.replace(/^#/, '').toLowerCase()
  const alvo = APELIDOS[id] ?? id
  const indice = ABAS.findIndex((a) => a.id === alvo)
  return indice < 0 || indice >= total ? 0 : indice
}

/** Deslize mínimo (px) para trocar de aba, e só se o gesto for mais lateral que vertical. */
export function direcaoDoDeslize(dx: number, dy: number, minimo = 50): -1 | 0 | 1 {
  if (Math.abs(dx) < minimo || Math.abs(dx) < Math.abs(dy) * 1.5) return 0
  return dx < 0 ? 1 : -1
}
