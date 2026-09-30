import { useEffect, useState } from 'react'

/** Evento que o Chrome/Edge/Samsung dispara quando o site pode ser instalado. */
interface EventoInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type Plataforma = 'iphone' | 'android' | 'computador'

/**
 * De onde o cliente abriu o site. "interno" = navegador de dentro do
 * Instagram/Facebook/TikTok: ali não dá para instalar, é preciso abrir no
 * navegador de verdade (Chrome no Android, Safari no iPhone).
 */
export type Navegador = 'chrome' | 'safari' | 'interno' | 'outro'

/** Já está aberto como app instalado (tela cheia, sem barra do navegador)? */
export function abertoComoApp(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone
  return (
    standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches
  )
}

export function plataformaDe(userAgent: string, toque: boolean): Plataforma {
  // iPad novo se apresenta como Mac; o que entrega é ter tela de toque.
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && toque)) {
    return 'iphone'
  }
  if (/android/i.test(userAgent)) return 'android'
  return 'computador'
}

export function navegadorDe(userAgent: string, plataforma: Plataforma): Navegador {
  if (
    /instagram|fban|fbav|fb_iab|fbios|tiktok|musical_ly|bytedancewebview|line\/|snapchat|pinterest|; wv\)/i.test(
      userAgent,
    )
  ) {
    return 'interno'
  }
  if (plataforma === 'iphone') {
    // No iPhone, Chrome/Firefox/Edge/Opera se identificam com CriOS, FxiOS...
    return /crios|fxios|edgios|opios|opt\//i.test(userAgent) ? 'outro' : 'safari'
  }
  // Opera, Samsung, Edge, Firefox, Mi... também dizem "Chrome": exclui antes.
  if (
    /opr\/|opera|samsungbrowser|edga?\/|firefox|miuibrowser|ucbrowser|yabrowser/i.test(userAgent)
  ) {
    return 'outro'
  }
  return /chrome\//i.test(userAgent) ? 'chrome' : 'outro'
}

/** Link que abre ESTA página no Chrome do Android, já na aba App. */
export function linkAbrirNoChrome(url: URL): string {
  const destino = `${url.host}${url.pathname}?instalar=1`
  const reserva = encodeURIComponent(`${url.origin}${url.pathname}?instalar=1`)
  return `intent://${destino}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${reserva};end`
}

export function useInstalarApp() {
  const [evento, setEvento] = useState<EventoInstalacao | null>(null)
  const [instalado, setInstalado] = useState(false)

  useEffect(() => {
    const aoPoder = (e: Event) => {
      e.preventDefault() // o convite aparece pelo nosso botão, na hora certa
      setEvento(e as EventoInstalacao)
    }
    const aoInstalar = () => {
      setInstalado(true)
      setEvento(null)
    }
    window.addEventListener('beforeinstallprompt', aoPoder)
    window.addEventListener('appinstalled', aoInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', aoPoder)
      window.removeEventListener('appinstalled', aoInstalar)
    }
  }, [])

  const instalar = async () => {
    if (!evento) return
    await evento.prompt()
    const { outcome } = await evento.userChoice
    if (outcome === 'accepted') setInstalado(true)
    setEvento(null) // o navegador só deixa usar o convite uma vez
  }

  const plataforma = plataformaDe(navigator.userAgent, navigator.maxTouchPoints > 1)

  return {
    podeInstalarComUmToque: evento !== null,
    instalar,
    instalado,
    plataforma,
    navegador: navegadorDe(navigator.userAgent, plataforma),
  }
}
