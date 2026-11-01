import type { Conta } from './tipos'

/**
 * Sessão da conta guardada neste aparelho, como o login de qualquer app.
 * O código só serve para esta conta e o banco guarda apenas o hash dele.
 * A cópia da conta aqui serve para mostrar o nome na hora, sem esperar a
 * internet; o banco confere a sessão sempre que o site abre.
 */
export interface SessaoSalva {
  token: string
  conta: Conta
}

const CHAVE = 'arte10:sessao'

export function lerSessao(): SessaoSalva | null {
  try {
    const bruto = window.localStorage.getItem(CHAVE)
    if (!bruto) return null
    const s = JSON.parse(bruto) as Partial<SessaoSalva>
    const c = s.conta as Partial<Conta> | undefined
    if (typeof s.token !== 'string' || !/^[0-9a-f]{64}$/.test(s.token)) return null
    if (!c || typeof c.nome !== 'string' || typeof c.telefone !== 'string') return null
    return {
      token: s.token,
      conta: {
        nome: c.nome,
        telefone: c.telefone,
        email: typeof c.email === 'string' ? c.email : null,
        desde: typeof c.desde === 'string' ? c.desde : '',
      },
    }
  } catch {
    return null
  }
}

export function salvarSessao(sessao: SessaoSalva): void {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(sessao))
  } catch {
    // Aba anônima ou armazenamento bloqueado: vale só enquanto a página estiver aberta.
  }
}

export function apagarSessao(): void {
  try {
    window.localStorage.removeItem(CHAVE)
  } catch {
    // Nada a fazer.
  }
}
