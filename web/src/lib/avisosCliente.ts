import { registrarAparelhoConta, removerAparelhoConta } from '../servicos/api'

/**
 * Lembrete "seu horário é daqui a 30 minutos" no celular do cliente (Web Push).
 *
 * No iPhone só funciona com o site instalado na Tela de Início (iOS 16.4+);
 * no Android funciona direto no Chrome. A permissão é pedida no toque do botão.
 */

const CHAVE_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? ''

export type EstadoLembretes =
  | 'verificando'
  | 'precisa_instalar'
  | 'sem_suporte'
  | 'pode_ativar'
  | 'bloqueado'
  | 'ativo'

function ehIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function abertoComoApp(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function suportaPush(): boolean {
  return Boolean(CHAVE_PUBLICA) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function registro(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

export async function estadoDosLembretes(): Promise<EstadoLembretes> {
  if (ehIOS() && !abertoComoApp()) return 'precisa_instalar'
  if (!suportaPush()) return 'sem_suporte'
  if (Notification.permission === 'denied') return 'bloqueado'
  if (Notification.permission !== 'granted') return 'pode_ativar'
  const assinatura = await (await registro()).pushManager.getSubscription()
  return assinatura ? 'ativo' : 'pode_ativar'
}

function b64urlParaBytes(valor: string): Uint8Array {
  const base64 = valor.replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binario, (c) => c.charCodeAt(0))
}

async function cadastrar(token: string, assinatura: PushSubscription): Promise<void> {
  const json = assinatura.toJSON()
  await registrarAparelhoConta(token, assinatura.endpoint, json.keys?.p256dh ?? '', json.keys?.auth ?? '')
}

/** Pede a permissão (direto do toque) e liga os lembretes para a conta. */
export async function ativarLembretes(token: string): Promise<EstadoLembretes> {
  if (!suportaPush()) return estadoDosLembretes()
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return permissao === 'denied' ? 'bloqueado' : 'pode_ativar'

  const reg = await registro()
  await navigator.serviceWorker.ready
  const assinatura =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64urlParaBytes(CHAVE_PUBLICA) as unknown as BufferSource,
    }))
  await cadastrar(token, assinatura)
  return 'ativo'
}

/** Já ligado: confirma o cadastro a cada abertura (o endereço pode mudar). */
export async function sincronizarLembretes(token: string): Promise<void> {
  if (!suportaPush() || Notification.permission !== 'granted') return
  const assinatura = await (await registro()).pushManager.getSubscription()
  if (assinatura) await cadastrar(token, assinatura).catch(() => {})
}

/** Ao sair da conta: este aparelho para de receber os lembretes dela. */
export async function desligarLembretes(token: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const reg = await navigator.serviceWorker.getRegistration('/')
  const assinatura = await reg?.pushManager.getSubscription()
  if (!assinatura) return
  await removerAparelhoConta(token, assinatura.endpoint).catch(() => {})
  await assinatura.unsubscribe().catch(() => {})
}
