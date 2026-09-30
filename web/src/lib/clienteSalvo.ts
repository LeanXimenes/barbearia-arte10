/**
 * Nome e telefone do cliente guardados no próprio celular dele, para não
 * precisar digitar de novo no próximo agendamento. Fica só no aparelho
 * (nada vai para o servidor além do que já iria no agendamento).
 */
export interface ClienteSalvo {
  nome: string
  telefone: string
}

const CHAVE = 'arte10:cliente'

export function lerCliente(): ClienteSalvo | null {
  try {
    const bruto = window.localStorage.getItem(CHAVE)
    if (!bruto) return null
    const c = JSON.parse(bruto) as Partial<ClienteSalvo>
    if (typeof c.nome !== 'string' || typeof c.telefone !== 'string') return null
    if (!c.nome.trim() || !c.telefone.trim()) return null
    return { nome: c.nome, telefone: c.telefone }
  } catch {
    return null
  }
}

export function salvarCliente(cliente: ClienteSalvo): void {
  try {
    window.localStorage.setItem(
      CHAVE,
      JSON.stringify({ nome: cliente.nome.trim(), telefone: cliente.telefone.trim() }),
    )
  } catch {
    // Navegador sem armazenamento (aba anônima): só não lembra da próxima vez.
  }
}
