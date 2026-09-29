import type { KeyboardEvent } from 'react'
import { ABAS } from '../lib/abas'
import { IconeTesoura } from './Icones'

interface Props {
  aba: number
  total: number
  aoTrocarAba: (indice: number) => void
  aoAgendar: () => void
}

export function Cabecalho({ aba, total, aoTrocarAba, aoAgendar }: Props) {
  // Setas do teclado andam entre as abas, como pede o padrão de acessibilidade.
  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') aoTrocarAba((aba + 1) % total)
    else if (e.key === 'ArrowLeft') aoTrocarAba((aba - 1 + total) % total)
    else return
    e.preventDefault()
  }

  return (
    <header className="cabecalho">
      <div className="container cabecalho__linha">
        <button
          type="button"
          className="marca"
          aria-label="Barbearia Arte 10 — início"
          onClick={() => aoTrocarAba(0)}
        >
          <img src="/logo-arte10-mini.jpg" alt="" className="marca__logo" width={40} height={40} />
          <span className="marca__texto">
            <span className="marca__nome">Arte 10</span>
            <span className="marca__sub">Barbearia</span>
          </span>
        </button>

        <nav className="navegacao" role="tablist" aria-label="Seções do site" onKeyDown={aoTeclar}>
          {ABAS.slice(0, total).map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`aba-${item.id}`}
              aria-controls={`painel-${item.id}`}
              aria-selected={i === aba}
              tabIndex={i === aba ? 0 : -1}
              className={`navegacao__item ${i === aba ? 'navegacao__item--ativo' : ''}`}
              onClick={() => aoTrocarAba(i)}
            >
              {item.texto}
            </button>
          ))}
        </nav>

        <div className="cabecalho__acao">
          <button type="button" className="botao botao--ouro" onClick={aoAgendar}>
            <IconeTesoura tamanho={17} />
            <span>
              Agendar<span className="so-desktop"> horário</span>
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}
