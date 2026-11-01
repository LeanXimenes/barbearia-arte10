import { registrarAparelhoWeb, removerAparelhoWeb } from './api'

/**
 * Avisos de novo agendamento no iPhone (e em qualquer navegador) por Web Push.
 *
 * No iPhone só funciona com o painel INSTALADO na Tela de Início
 * (Safari > Compartilhar > Adicionar à Tela de Início), iOS 16.4 ou mais novo,
 * e a permissão precisa ser pedida a partir de um toque no botão.
 */

const CHAVE_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? ''

export type EstadoAvisos =
  /** Ainda verificando. */
  | 'verificando'
  /** iPhone/iPad fora da Tela de Início: precisa instalar primeiro. */
  | 'precisa_instalar'
  /** Navegador sem suporte a push. */
  | 'sem_suporte'
  /** O site foi publicado sem a chave pública (VITE_VAPID_PUBLIC_KEY). */
  | 'sem_chave'
  /** Pode ativar (falta o toque no botão). */
  | 'pode_ativar'
  /** A pessoa negou a permissão: só nos ajustes do aparelho. */
  | 'bloqueado'
  | 'ativo'

export function ehIOS(): boolean {
  const ua = navigator.userAgent
  // iPad com iPadOS se apresenta como Mac, mas tem tela de toque.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function abertoComoApp(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function suportaPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registro(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' })
}

export async function estadoDosAvisos(): Promise<EstadoAvisos> {
  if (ehIOS() && !abertoComoApp()) return 'precisa_instalar'
  if (!suportaPush()) return 'sem_suporte'
  if (!CHAVE_PUBLICA) return 'sem_chave'
  if (Notification.permission === 'denied') return 'bloqueado'
  if (Notification.permission !== 'granted') return 'pode_ativar'
  const reg = await registro()
  const assinatura = await reg.pushManager.getSubscription()
  return assinatura ? 'ativo' : 'pode_ativar'
}

function b64urlParaBytes(valor: string): Uint8Array {
  const base64 = valor.replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binario, (c) => c.charCodeAt(0))
}

function nomeDoAparelho(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/Android/.test(ua)) return 'Android (navegador)'
  return 'Navegador'
}

/**
 * Pede a permissão e cadastra o aparelho no banco. Precisa ser chamada
 * direto do toque no botão (o iPhone exige).
 */
export async function ativarAvisos(): Promise<EstadoAvisos> {
  if (!suportaPush() || !CHAVE_PUBLICA) return estadoDosAvisos()

  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return permissao === 'denied' ? 'bloqueado' : 'pode_ativar'

  const reg = await registro()
  await navigator.serviceWorker.ready
  let assinatura = await reg.pushManager.getSubscription()
  if (!assinatura) {
    assinatura = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64urlParaBytes(CHAVE_PUBLICA) as unknown as BufferSource,
    })
  }

  const json = assinatura.toJSON()
  await registrarAparelhoWeb(
    assinatura.endpoint,
    json.keys?.p256dh ?? '',
    json.keys?.auth ?? '',
    nomeDoAparelho(),
  )
  return 'ativo'
}

/**
 * Já ativo: confirma o cadastro no banco a cada abertura (a Apple pode
 * trocar o endereço de entrega; o banco só guarda o mais recente).
 */
export async function sincronizarAvisos(): Promise<void> {
  if (!suportaPush() || !CHAVE_PUBLICA || Notification.permission !== 'granted') return
  const reg = await registro()
  const assinatura = await reg.pushManager.getSubscription()
  if (!assinatura) return
  const json = assinatura.toJSON()
  await registrarAparelhoWeb(
    assinatura.endpoint,
    json.keys?.p256dh ?? '',
    json.keys?.auth ?? '',
    nomeDoAparelho(),
  ).catch(() => {})
}

export async function desativarAvisos(): Promise<void> {
  if (!suportaPush()) return
  const reg = await registro()
  const assinatura = await reg.pushManager.getSubscription()
  if (!assinatura) return
  await removerAparelhoWeb(assinatura.endpoint).catch(() => {})
  await assinatura.unsubscribe().catch(() => {})
}
