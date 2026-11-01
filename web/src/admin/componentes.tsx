import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { IconeFechar } from '../componentes/Icones'

// ---------------------------------------------------------------------
// Aviso rápido no pé da tela (o "snackbar" do app Android)
// ---------------------------------------------------------------------
const ContextoAviso = createContext<(texto: string) => void>(() => {})

export function ProvedorAviso({ children }: { children: ReactNode }) {
  const [texto, setTexto] = useState<string | null>(null)
  const timer = useRef<number>()

  const mostrar = useCallback((novo: string) => {
    setTexto(novo)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setTexto(null), 4200)
  }, [])

  return (
    <ContextoAviso.Provider value={mostrar}>
      {children}
      {texto && (
        <div className="p-aviso" role="status" onClick={() => setTexto(null)}>
          {texto}
        </div>
      )}
    </ContextoAviso.Provider>
  )
}

export const useAviso = () => useContext(ContextoAviso)

// ---------------------------------------------------------------------
// Folha (janela que sobe de baixo, como no app)
// ---------------------------------------------------------------------
export function Folha({
  titulo,
  aoFechar,
  ocupado = false,
  rodape,
  children,
}: {
  titulo: string
  aoFechar: () => void
  /** Salvando: não fecha no meio. */
  ocupado?: boolean
  rodape?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !ocupado) aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar, ocupado])

  return (
    <div
      className="modal p-folha"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !ocupado) aoFechar()
      }}
    >
      <div className="modal__caixa">
        <div className="modal__topo">
          <h2 className="modal__titulo">{titulo}</h2>
          <button
            type="button"
            className="modal__fechar"
            onClick={aoFechar}
            disabled={ocupado}
            aria-label="Fechar"
          >
            <IconeFechar tamanho={19} />
          </button>
        </div>
        <div className="modal__corpo">{children}</div>
        {rodape && <div className="modal__rodape">{rodape}</div>}
      </div>
    </div>
  )
}

/** Pergunta de confirmação com o botão de ação e "Voltar". */
export function Confirmar({
  titulo,
  texto,
  rotuloAcao,
  perigoso = false,
  ocupado = false,
  aoConfirmar,
  aoFechar,
}: {
  titulo: string
  texto: string
  rotuloAcao: string
  perigoso?: boolean
  ocupado?: boolean
  aoConfirmar: () => void
  aoFechar: () => void
}) {
  return (
    <Folha
      titulo={titulo}
      aoFechar={aoFechar}
      ocupado={ocupado}
      rodape={
        <>
          <button
            type="button"
            className={`botao botao--bloco ${perigoso ? 'p-botao-perigo' : 'botao--ouro'}`}
            onClick={aoConfirmar}
            disabled={ocupado}
          >
            {ocupado ? <span className="girando" /> : rotuloAcao}
          </button>
          <button type="button" className="botao botao--fantasma" onClick={aoFechar} disabled={ocupado}>
            Voltar
          </button>
        </>
      }
    >
      <p className="p-texto">{texto}</p>
    </Folha>
  )
}

// ---------------------------------------------------------------------
// Pedaços simples
// ---------------------------------------------------------------------
export function TituloSecao({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="p-secao">
      <h3 className="p-secao__titulo">{children}</h3>
      {acao}
    </div>
  )
}

export function Vazio({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <div className="p-vazio">
      <p className="p-vazio__titulo">{titulo}</p>
      {texto && <p>{texto}</p>}
    </div>
  )
}

export function Carregando({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="p-carregando" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="esqueleto" style={{ height: 64 }} />
      ))}
    </div>
  )
}

export function ErroCarregar({ texto, aoTentar }: { texto: string; aoTentar: () => void }) {
  return (
    <div className="aviso aviso--erro" role="alert">
      <span>
        {texto}{' '}
        <button type="button" className="link-ouro" onClick={aoTentar}>
          Tentar de novo
        </button>
      </span>
    </div>
  )
}

export type Tom = 'ouro' | 'verde' | 'vermelho' | 'azul' | 'neutro'

export function Etiqueta({ tom, children }: { tom: Tom; children: ReactNode }) {
  return <span className={`p-etiqueta p-etiqueta--${tom}`}>{children}</span>
}

/** Campo de texto com rótulo, no estilo do site. */
export function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  tipo = 'text',
  modo,
  dica,
  erro,
  placeholder,
  maximo,
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  tipo?: string
  modo?: 'numeric' | 'decimal' | 'tel' | 'email' | 'text'
  dica?: string
  erro?: string | null
  placeholder?: string
  maximo?: number
}) {
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={id}>
        {rotulo}
      </label>
      <input
        id={id}
        className={`campo__entrada ${erro ? 'campo__entrada--erro' : ''}`}
        type={tipo}
        inputMode={modo}
        value={valor}
        placeholder={placeholder}
        maxLength={maximo}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={Boolean(erro)}
      />
      {erro ? <span className="campo__erro">{erro}</span> : dica && <span className="campo__dica">{dica}</span>}
    </div>
  )
}

export function Chave({
  rotulo,
  dica,
  ligado,
  aoMudar,
}: {
  rotulo: string
  dica?: string
  ligado: boolean
  aoMudar: (v: boolean) => void
}) {
  return (
    <label className="p-chave">
      <span className="p-chave__texto">
        <span className="p-chave__rotulo">{rotulo}</span>
        {dica && <span className="p-chave__dica">{dica}</span>}
      </span>
      <input type="checkbox" checked={ligado} onChange={(e) => aoMudar(e.target.checked)} />
      <span className="p-chave__trilho" aria-hidden />
    </label>
  )
}
