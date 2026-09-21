/**
 * Tradução de falhas em mensagens claras para o cliente.
 *
 * Regra do projeto (itens 22 e 37): quando algo dá errado o site diz que
 * deu errado. Nunca mostramos "agendamento confirmado" sem uma resposta
 * de sucesso vinda do servidor.
 */

export const MSG_SEM_CONEXAO =
  'Não foi possível concluir o agendamento. Verifique sua conexão e tente novamente.'

export const MSG_FALHA_GENERICA =
  'Não foi possível concluir o agendamento. Tente novamente em instantes.'

export const MSG_FALHA_CARREGAR =
  'Não conseguimos carregar as informações agora. Verifique sua conexão e tente novamente.'

/** Erros que indicam problema de rede/servidor indisponível. */
export function pareceFalhaDeRede(erro: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true

  const texto = mensagemBruta(erro).toLowerCase()
  return (
    texto.includes('failed to fetch') ||
    texto.includes('networkerror') ||
    texto.includes('network error') ||
    texto.includes('load failed') ||
    texto.includes('timeout') ||
    texto.includes('aborted') ||
    texto.includes('fetch failed')
  )
}

export function mensagemBruta(erro: unknown): string {
  if (!erro) return ''
  if (typeof erro === 'string') return erro
  if (erro instanceof Error) return erro.message
  if (typeof erro === 'object' && 'message' in erro) {
    return String((erro as { message: unknown }).message ?? '')
  }
  return String(erro)
}

/** Mensagem para o usuário a partir de uma falha de chamada ao Supabase. */
export function mensagemDeFalha(erro: unknown, padrao = MSG_FALHA_GENERICA): string {
  if (pareceFalhaDeRede(erro)) return MSG_SEM_CONEXAO
  return padrao
}

/**
 * Códigos de erro que significam "a agenda mudou desde que você abriu a
 * tela" — nesses casos o site recarrega os horários automaticamente
 * (itens 7 e 23).
 */
const CODIGOS_QUE_EXIGEM_RECARGA = new Set([
  'HORARIO_OCUPADO',
  'HORARIO_BLOQUEADO',
  'HORARIO_PASSADO',
  'DIA_FECHADO',
  'SERVICO_INDISPONIVEL',
  'FORA_EXPEDIENTE',
  'INTERVALO',
  'HORARIO_INVALIDO',
])

export function exigeRecarregarHorarios(codigo: string | undefined): boolean {
  return Boolean(codigo && CODIGOS_QUE_EXIGEM_RECARGA.has(codigo))
}
