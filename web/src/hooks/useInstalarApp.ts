import { useEffect, useState } from 'react'

/** Evento que o Chrome/Edge/Samsung dispara quando o site pode ser instalado. */
interface EventoInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type Plataforma = 'iphone' | 'android' | 'computador'

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

  return {
    podeInstalarComUmToque: evento !== null,
    instalar,
    instalado,
    plataforma: plataformaDe(navigator.userAgent, navigator.maxTouchPoints > 1),
  }
}
