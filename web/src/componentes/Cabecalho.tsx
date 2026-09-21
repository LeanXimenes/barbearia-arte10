import { useEffect, useState } from 'react'
import { IconeTesoura } from './Icones'

const LINKS = [
  { href: '#servicos', texto: 'Serviços' },
  { href: '#funcionamento', texto: 'Horários' },
  { href: '#localizacao', texto: 'Localização' },
  { href: '#contato', texto: 'Contato' },
]

interface Props {
  aoAgendar: () => void
}

export function Cabecalho({ aoAgendar }: Props) {
  const [rolado, setRolado] = useState(false)

  useEffect(() => {
    const aoRolar = () => setRolado(window.scrollY > 12)
    aoRolar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  return (
    <header className={`cabecalho ${rolado ? 'cabecalho--rolado' : ''}`}>
      <div className="container cabecalho__linha">
        <a href="#inicio" className="marca" aria-label="Barbearia Arte 10 — início">
          <img src="/logo-arte10.jpg" alt="" className="marca__logo" width={40} height={40} />
          <span className="marca__texto">
            <span className="marca__nome">Arte 10</span>
            <span className="marca__sub">Barbearia</span>
          </span>
        </a>

        <nav className="navegacao" aria-label="Navegação principal">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className="navegacao__item">
              {link.texto}
            </a>
          ))}
        </nav>

        <div className="cabecalho__acao">
          <button type="button" className="botao botao--ouro" onClick={aoAgendar}>
            <IconeTesoura tamanho={17} />
            Agendar horário
          </button>
        </div>
      </div>
    </header>
  )
}
