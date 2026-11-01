import { useState, type FormEvent } from 'react'
import { entrar } from '../api'
import { IconeAlerta } from '../../componentes/Icones'

/** Entrada do painel: a conta de administrador da barbearia (Supabase Auth). */
export function Login({ aviso }: { aviso?: string | null }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(aviso ?? null)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (enviando || !email.trim() || !senha) return
    setEnviando(true)
    setErro(null)
    try {
      await entrar(email, senha)
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível entrar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="p-login">
      <form className="p-login__caixa" onSubmit={(e) => void enviar(e)} noValidate>
        <img src="/logo-arte10-mini.jpg" alt="" width={64} height={64} className="p-login__logo" />
        <h1 className="p-login__titulo">Painel do dono</h1>
        <p className="p-login__texto">Barbearia Arte 10 · agenda, clientes e avisos de novos horários.</p>

        <div className="campo">
          <label className="campo__rotulo" htmlFor="painel-email">
            E-mail
          </label>
          <input
            id="painel-email"
            className="campo__entrada"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="campo">
          <label className="campo__rotulo" htmlFor="painel-senha">
            Senha
          </label>
          <div className="campo__senha">
            <input
              id="painel-senha"
              className="campo__entrada"
              type={mostrar ? 'text' : 'password'}
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <button type="button" className="campo__mostrar" onClick={() => setMostrar((m) => !m)}>
              {mostrar ? 'Esconder' : 'Mostrar'}
            </button>
          </div>
        </div>

        {erro && (
          <div className="aviso aviso--erro" role="alert" style={{ marginBottom: 14 }}>
            <IconeAlerta className="aviso__icone" tamanho={18} />
            <span>{erro}</span>
          </div>
        )}

        <button
          type="submit"
          className="botao botao--ouro botao--bloco"
          disabled={enviando || !email.trim() || !senha}
        >
          {enviando ? <span className="girando" /> : 'Entrar'}
        </button>
        <p className="campo__dica" style={{ marginTop: 14, textAlign: 'center' }}>
          Depois de entrar, o painel fica conectado neste aparelho.
        </p>
      </form>
    </div>
  )
}
