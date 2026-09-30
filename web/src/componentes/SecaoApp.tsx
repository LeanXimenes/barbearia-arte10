import { useState, type ReactNode } from 'react'
import { linkAbrirNoChrome, useInstalarApp } from '../hooks/useInstalarApp'
import { IconeCelular, IconeCheck, IconeCompartilhar } from './Icones'

const VANTAGENS = [
  'Agende em poucos toques',
  'Atualiza sozinho, sem baixar nada de novo',
  'Levinho, quase não ocupa espaço',
]

export function SecaoApp() {
  const { podeInstalarComUmToque, instalar, instalado, plataforma, navegador } = useInstalarApp()

  return (
    <div className="container aba__conteudo app-aba">
      <span className="etiqueta">App</span>
      <h2 className="titulo-secao">Leve a Arte 10 no bolso</h2>
      <p className="app-aba__texto">
        Baixe o app da barbearia e marque seu horário direto da tela inicial do celular.
      </p>

      <ul className="app-vantagens">
        {VANTAGENS.map((texto) => (
          <li key={texto}>
            <span className="app-vantagens__check">
              <IconeCheck tamanho={14} />
            </span>
            {texto}
          </li>
        ))}
      </ul>

      <div className="cartao app-instalar">
        <div className="app-instalar__topo">
          <img src="/icon-192.png" alt="" className="app-instalar__icone" width={52} height={52} />
          <span>
            <span className="app-instalar__nome">Arte 10</span>
            <span className="app-instalar__sub">Barbearia · Grátis</span>
          </span>
        </div>

        {instalado ? (
          <p className="app-instalar__pronto">
            <IconeCheck tamanho={18} /> App instalado! Procure o ícone da Arte 10 na sua tela
            inicial.
          </p>
        ) : podeInstalarComUmToque ? (
          <button
            type="button"
            className="botao botao--ouro botao--bloco app-instalar__botao"
            onClick={instalar}
          >
            <IconeCelular tamanho={18} />
            Instalar o app
          </button>
        ) : (
          <ComoInstalar plataforma={plataforma} navegador={navegador} />
        )}
      </div>
    </div>
  )
}

type Info = ReturnType<typeof useInstalarApp>

function ComoInstalar({
  plataforma,
  navegador,
}: {
  plataforma: Info['plataforma']
  navegador: Info['navegador']
}) {
  // Android fora do Chrome (Instagram, Opera, Samsung...): o jeito mais fácil
  // é um botão que abre esta mesma página no Chrome, já na aba App.
  if (plataforma === 'android' && navegador !== 'chrome') {
    return (
      <>
        {navegador === 'interno' && (
          <p className="app-instalar__aviso">
            Por aqui não dá para instalar. Abra no Chrome, é um toque só:
          </p>
        )}
        <a
          href={linkAbrirNoChrome(new URL(window.location.href))}
          className="botao botao--ouro botao--bloco app-instalar__botao"
        >
          <IconeCelular tamanho={18} />
          Instalar pelo Chrome
        </a>
        <p className="app-instalar__ou">
          ou no menu <strong>⋮</strong> deste navegador, toque em{' '}
          <strong>Adicionar à tela inicial</strong>
        </p>
      </>
    )
  }

  if (plataforma === 'android') {
    return (
      <Passos
        itens={[
          <>
            Toque no menu <strong>⋮</strong> no canto de cima
          </>,
          <>
            Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>
          </>,
          <>
            Confirme em <strong>Instalar</strong>. Pronto!
          </>,
        ]}
      />
    )
  }

  if (plataforma === 'iphone' && navegador === 'interno') {
    return (
      <>
        <p className="app-instalar__aviso">Por aqui não dá para instalar. Abra no Safari:</p>
        <Passos
          itens={[
            <>
              Toque nos <strong>três pontinhos</strong> (⋯) no canto da tela
            </>,
            <>
              Escolha <strong>Abrir no navegador</strong> (Safari)
            </>,
            <>
              Lá, volte nesta aba <strong>App</strong>
            </>,
          ]}
        />
        <CopiarLink />
      </>
    )
  }

  if (plataforma === 'iphone') {
    const safari = navegador === 'safari'
    return (
      <>
        <Passos
          itens={[
            <>
              Toque em <strong>Compartilhar</strong>{' '}
              <IconeCompartilhar tamanho={15} className="app-passos__icone" />{' '}
              {safari ? 'na barra de baixo' : 'na barra do navegador'}
            </>,
            <>
              Role e toque em <strong>Adicionar à Tela de Início</strong>
            </>,
            <>
              Toque em <strong>Adicionar</strong>. Pronto!
            </>,
          ]}
        />
        {safari && (
          <p className="app-seta" aria-hidden>
            <IconeCompartilhar tamanho={16} /> O Compartilhar fica aqui embaixo
            <span className="app-seta__seta">↓</span>
          </p>
        )}
      </>
    )
  }

  return (
    <>
      <p className="app-instalar__aviso">
        O app é para celular. Abra este endereço no seu celular e toque em <strong>App</strong>:
      </p>
      <p className="app-instalar__endereco">{window.location.host}</p>
      <CopiarLink />
    </>
  )
}

function Passos({ itens }: { itens: ReactNode[] }) {
  return (
    <ol className="app-passos">
      {itens.map((passo, i) => (
        <li key={i}>
          <span className="app-passos__numero">{i + 1}</span>
          <span>{passo}</span>
        </li>
      ))}
    </ol>
  )
}

function CopiarLink() {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    const link = `${window.location.origin}${window.location.pathname}?instalar=1`
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2500)
    } catch {
      window.prompt('Copie o link:', link)
    }
  }

  return (
    <button
      type="button"
      className="botao botao--contorno botao--bloco app-instalar__copiar"
      onClick={() => void copiar()}
    >
      {copiado ? (
        <>
          <IconeCheck tamanho={16} /> Link copiado!
        </>
      ) : (
        'Copiar o link'
      )}
    </button>
  )
}
