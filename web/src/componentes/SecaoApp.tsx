import { useInstalarApp, type Plataforma } from '../hooks/useInstalarApp'
import { IconeCelular, IconeCheck, IconeCompartilhar } from './Icones'

const VANTAGENS = [
  'Agende em poucos toques',
  'Atualiza sozinho, sem baixar nada de novo',
  'Levinho, quase não ocupa espaço',
]

const PASSOS: Record<Plataforma, React.ReactNode[]> = {
  iphone: [
    <>
      Toque em <strong>Compartilhar</strong>{' '}
      <IconeCompartilhar tamanho={15} className="app-passos__icone" /> no Safari
    </>,
    <>
      Escolha <strong>Adicionar à Tela de Início</strong>
    </>,
    <>
      Toque em <strong>Adicionar</strong>. Pronto!
    </>,
  ],
  android: [
    <>
      Toque no menu <strong>⋮</strong> do navegador
    </>,
    <>
      Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>
    </>,
    <>
      Confirme em <strong>Instalar</strong>. Pronto!
    </>,
  ],
  computador: [
    <>Abra este site no seu celular</>,
    <>
      Entre na aba <strong>App</strong>
    </>,
    <>Siga o passo a passo que aparece lá</>,
  ],
}

export function SecaoApp() {
  const { podeInstalarComUmToque, instalar, instalado, plataforma } = useInstalarApp()

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
          <button type="button" className="botao botao--ouro botao--bloco" onClick={instalar}>
            <IconeCelular tamanho={18} />
            Instalar o app
          </button>
        ) : (
          <ol className="app-passos">
            {PASSOS[plataforma].map((passo, i) => (
              <li key={i}>
                <span className="app-passos__numero">{i + 1}</span>
                <span>{passo}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
