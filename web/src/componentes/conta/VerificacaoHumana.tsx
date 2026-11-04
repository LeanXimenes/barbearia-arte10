import { useEffect, useRef, useState } from 'react'

/**
 * Desafio anti-robô do Cloudflare Turnstile no cadastro.
 *
 * Aqui só se mostra o desafio e se pega o token: quem confere de verdade é
 * o banco (criar_conta pergunta à Cloudflare). O token vale uma vez só,
 * então a cada tentativa o desafio recomeça (`rodada`).
 */

interface ApiTurnstile {
  render: (elemento: HTMLElement, opcoes: Record<string, unknown>) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}

declare global {
  interface Window {
    turnstile?: ApiTurnstile
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let carregamento: Promise<ApiTurnstile> | null = null

function carregarTurnstile(): Promise<ApiTurnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!carregamento) {
    carregamento = new Promise((pronto, falhou) => {
      const script = document.createElement('script')
      script.src = SCRIPT
      script.async = true
      script.onload = () => (window.turnstile ? pronto(window.turnstile) : falhou(new Error('turnstile')))
      script.onerror = () => {
        carregamento = null
        falhou(new Error('turnstile'))
      }
      document.head.appendChild(script)
    })
  }
  return carregamento
}

interface Props {
  chaveDoSite: string
  /** Muda a cada tentativa de cadastro: o desafio recomeça. */
  rodada: number
  aoMudar: (token: string | null) => void
}

export function VerificacaoHumana({ chaveDoSite, rodada, aoMudar }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const avisar = useRef(aoMudar)
  avisar.current = aoMudar
  const [semConexao, setSemConexao] = useState(false)

  useEffect(() => {
    let vivo = true
    carregarTurnstile()
      .then((api) => {
        if (!vivo || !caixa.current) return
        widget.current = api.render(caixa.current, {
          sitekey: chaveDoSite,
          action: 'criar_conta',
          theme: 'dark',
          language: 'pt-br',
          size: 'flexible',
          callback: (token: string) => avisar.current(token),
          'expired-callback': () => avisar.current(null),
          'error-callback': () => avisar.current(null),
        })
      })
      .catch(() => {
        if (vivo) setSemConexao(true)
      })
    return () => {
      vivo = false
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current)
      widget.current = null
    }
  }, [chaveDoSite])

  useEffect(() => {
    if (rodada > 0 && widget.current && window.turnstile) {
      window.turnstile.reset(widget.current)
      avisar.current(null)
    }
  }, [rodada])

  return (
    <div className="verificacao-humana">
      <div ref={caixa} />
      {semConexao && (
        <span className="campo__erro">
          Não deu para carregar a verificação anti-robô. Confira a internet e abra o site de novo.
        </span>
      )}
    </div>
  )
}
