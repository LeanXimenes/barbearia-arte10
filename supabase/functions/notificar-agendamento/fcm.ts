// =====================================================================
// Regras puras do envio via FCM (sem APIs do Deno): dá para testar em
// qualquer runtime. Usado pelo index.ts da Edge Function.
// =====================================================================

export type ClasseResposta =
  /** O FCM aceitou a mensagem para este aparelho. */
  | 'entregue'
  /** O token não existe mais (app desinstalado/reinstalado): desativar. */
  | 'token_invalido'
  /** Instabilidade do Google ou credencial expirada: tentar de novo depois. */
  | 'passageiro'
  /** Erro que não se resolve sozinho (payload inválido, permissão): não repetir. */
  | 'permanente'

interface DetalheFcm {
  '@type'?: string
  errorCode?: string
  fieldViolations?: Array<{ field?: string; description?: string }>
}

interface ErroFcm {
  error?: {
    code?: number
    status?: string
    message?: string
    details?: DetalheFcm[]
  }
}

/**
 * Classifica a resposta do FCM HTTP v1 para UM aparelho.
 *
 * Cuidado importante: o FCM devolve 400 INVALID_ARGUMENT tanto para token
 * inválido quanto para erro no corpo da mensagem. Só o primeiro caso pode
 * desativar o aparelho — senão um único campo errado no payload
 * desligaria TODOS os aparelhos de uma vez.
 */
export function classificarRespostaFcm(status: number, corpo: string): ClasseResposta {
  if (status >= 200 && status < 300) return 'entregue'

  let erro: ErroFcm['error'] | undefined
  try {
    erro = (JSON.parse(corpo) as ErroFcm).error
  } catch {
    erro = undefined
  }

  const detalhes = erro?.details ?? []
  const codigos = detalhes.map((d) => d.errorCode).filter(Boolean) as string[]
  const campos = detalhes.flatMap((d) => d.fieldViolations ?? []).map((v) => v.field ?? '')
  const mensagem = (erro?.message ?? '').toLowerCase()

  if (codigos.includes('UNREGISTERED') || codigos.includes('SENDER_ID_MISMATCH')) {
    return 'token_invalido'
  }

  if (status === 404) return 'token_invalido'

  if (status === 400) {
    const tokenRuim =
      campos.includes('message.token') ||
      mensagem.includes('registration token') ||
      mensagem.includes('not a valid fcm registration token')
    return tokenRuim ? 'token_invalido' : 'permanente'
  }

  if (status === 401) return 'passageiro' // access token OAuth expirado/revogado
  if (status === 429 || status >= 500) return 'passageiro'
  if (codigos.includes('QUOTA_EXCEEDED') || codigos.includes('UNAVAILABLE') || codigos.includes('INTERNAL')) {
    return 'passageiro'
  }

  return 'permanente'
}

export interface NotificacaoReservada {
  id: string
  agendamento_id: string | null
  titulo: string
  corpo: string
  dados: Record<string, unknown> | null
  tentativas: number
}

/** Monta a mensagem FCM v1 para um aparelho. */
export function montarMensagem(token: string, n: NotificacaoReservada) {
  const dados: Record<string, string> = {}
  for (const [chave, valor] of Object.entries(n.dados ?? {})) {
    // O FCM só aceita strings em "data" e reserva algumas chaves.
    if (valor === null || valor === undefined) continue
    if (chave === 'from' || chave === 'message_type' || /^(google|gcm)/i.test(chave)) continue
    dados[chave] = String(valor)
  }
  dados.titulo = n.titulo
  dados.corpo = n.corpo

  return {
    message: {
      token,
      notification: { title: n.titulo, body: n.corpo },
      data: dados,
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: 'agendamentos',
          // Mesmo agendamento = mesma notificação: se por algum motivo o push
          // chegar duas vezes, a segunda substitui a primeira na bandeja.
          tag: n.agendamento_id ?? n.id,
          sound: 'default',
          default_vibrate_timings: true,
        },
      },
    },
  }
}

/** Decide o status final da notificação depois de tentar todos os aparelhos. */
export function statusFinal(classes: ClasseResposta[]): 'enviada' | 'pendente' | 'falhou' {
  if (classes.includes('entregue')) return 'enviada'
  if (classes.length === 0) return 'pendente' // nenhum aparelho ainda: pode registrar depois
  if (classes.includes('passageiro') || classes.includes('token_invalido')) return 'pendente'
  return 'falhou'
}

/** Comparação que não vaza, pelo tempo de resposta, quantos caracteres batem. */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ta = new TextEncoder().encode(a)
  const tb = new TextEncoder().encode(b)
  let diferenca = ta.length ^ tb.length
  const tamanho = Math.max(ta.length, tb.length)
  for (let i = 0; i < tamanho; i++) {
    diferenca |= (ta[i] ?? 0) ^ (tb[i] ?? 0)
  }
  return diferenca === 0
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
