import { useState, type FormEvent } from 'react'
import type { ConfigBarbearia } from '../../lib/tipos'
import { useConta } from '../../hooks/useConta'
import { lerCliente } from '../../lib/clienteSalvo'
import {
  emailValido,
  linkWhatsapp,
  mascararTelefone,
  nomeValido,
  telefoneValido,
} from '../../lib/formato'
import { IconeAlerta, IconeWhatsapp } from '../Icones'

interface PropsForm {
  config: ConfigBarbearia | null
  /** Avisa o modal que está enviando (trava fechar no meio). */
  aoEnviar: (enviando: boolean) => void
  /** Entrou: o modal decide se fecha ou mostra "Minha conta". */
  aoConcluir: () => void
}

/** Número com máscara enquanto parece número; e-mail fica como foi digitado. */
function formatarLogin(valor: string): string {
  return /^[\d\s()+-]*$/.test(valor) ? mascararTelefone(valor) : valor
}

// ---------------------------------------------------------------------
// Entrar
// ---------------------------------------------------------------------

export function FormEntrar({
  config,
  aoEnviar,
  aoConcluir,
  loginInicial,
  aoCriarConta,
}: PropsForm & { loginInicial: string; aoCriarConta: () => void }) {
  const { entrar } = useConta()
  const [login, setLogin] = useState(loginInicial)
  const [senha, setSenha] = useState('')
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [esqueci, setEsqueci] = useState(false)

  const loginRuim = tentou && login.trim() === ''
  const senhaRuim = tentou && senha === ''

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    setTentou(true)
    if (!login.trim() || !senha) return

    setEnviando(true)
    aoEnviar(true)
    setErro(null)
    const r = await entrar(login.trim(), senha)
    setEnviando(false)
    aoEnviar(false)
    if (r.ok) aoConcluir()
    else setErro(r.mensagem)
  }

  const whats = linkWhatsapp(
    config?.telefone_whatsapp ?? null,
    'Olá! Esqueci a senha da minha conta no site da Arte 10. Pode me ajudar?',
  )

  return (
    <>
      <div className="modal__corpo">
        <form id="form-entrar" onSubmit={(e) => void enviar(e)} noValidate>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="entrar-login">
              Celular ou e-mail
            </label>
            <input
              id="entrar-login"
              className={`campo__entrada ${loginRuim ? 'campo__entrada--erro' : ''}`}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="(00) 00000-0000 ou seu@email.com"
              value={login}
              onChange={(e) => setLogin(formatarLogin(e.target.value))}
              aria-invalid={loginRuim}
            />
            {loginRuim && <span className="campo__erro">Informe o seu número ou e-mail.</span>}
          </div>

          <CampoSenha
            id="entrar-senha"
            valor={senha}
            aoMudar={setSenha}
            autoComplete="current-password"
            erro={senhaRuim ? 'Informe a sua senha.' : null}
          />
        </form>

        {erro && (
          <div className="aviso aviso--erro" role="alert">
            <IconeAlerta className="aviso__icone" tamanho={18} />
            <span>{erro}</span>
          </div>
        )}

        <div className="conta__links">
          <button type="button" className="link-ouro" onClick={() => setEsqueci((v) => !v)}>
            Esqueci minha senha
          </button>
          <button type="button" className="link-ouro" onClick={aoCriarConta}>
            Ainda não tenho conta
          </button>
        </div>

        {esqueci && (
          <div className="aviso aviso--info" role="status" style={{ marginTop: 12 }}>
            <span>
              Fale com a barbearia: ela troca a sua senha e você entra de novo.
              {whats && (
                <>
                  {' '}
                  <a className="link-ouro" href={whats} target="_blank" rel="noopener noreferrer">
                    <IconeWhatsapp tamanho={14} /> Chamar no WhatsApp
                  </a>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="modal__rodape">
        <button
          type="submit"
          form="form-entrar"
          className="botao botao--ouro botao--bloco"
          disabled={enviando}
        >
          {enviando ? (
            <>
              <span className="girando" />
              Entrando…
            </>
          ) : (
            'Entrar'
          )}
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------
// Criar conta
// ---------------------------------------------------------------------

export function FormCriarConta({
  aoEnviar,
  aoConcluir,
  aoEntrarCom,
}: PropsForm & { aoEntrarCom: (login: string) => void }) {
  const { criar } = useConta()
  // Quem já agendou neste aparelho começa com nome e número preenchidos.
  const [salvo] = useState(() => lerCliente())
  const [nome, setNome] = useState(salvo?.nome ?? '')
  const [telefone, setTelefone] = useState(salvo ? mascararTelefone(salvo.telefone) : '')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<{ codigo?: string; mensagem: string } | null>(null)

  const nomeRuim = tentou && !nomeValido(nome)
  const telefoneRuim = tentou && !telefoneValido(telefone)
  const emailRuim = tentou && email.trim() !== '' && !emailValido(email)
  const senhaRuim = tentou && senha.length < 6

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    setTentou(true)
    const emailOk = email.trim() === '' || emailValido(email)
    if (!nomeValido(nome) || !telefoneValido(telefone) || !emailOk || senha.length < 6) return

    setEnviando(true)
    aoEnviar(true)
    setErro(null)
    const r = await criar({ nome, telefone, email, senha })
    setEnviando(false)
    aoEnviar(false)
    if (r.ok) aoConcluir()
    else setErro({ codigo: r.erro, mensagem: r.mensagem })
  }

  return (
    <>
      <div className="modal__corpo">
        <p className="conta__intro">
          Com a conta você agenda sem digitar nada e vê os horários que marcou.
        </p>

        <form id="form-criar" onSubmit={(e) => void enviar(e)} noValidate>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="criar-nome">
              Seu nome
            </label>
            <input
              id="criar-nome"
              className={`campo__entrada ${nomeRuim ? 'campo__entrada--erro' : ''}`}
              type="text"
              autoComplete="name"
              maxLength={80}
              placeholder="Como podemos te chamar?"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              aria-invalid={nomeRuim}
            />
            {nomeRuim && <span className="campo__erro">Informe seu nome (mínimo 2 letras).</span>}
          </div>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="criar-telefone">
              Celular / WhatsApp
            </label>
            <input
              id="criar-telefone"
              className={`campo__entrada ${telefoneRuim ? 'campo__entrada--erro' : ''}`}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="(00) 00000-0000"
              value={telefone}
              onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
              aria-invalid={telefoneRuim}
            />
            {telefoneRuim ? (
              <span className="campo__erro">
                Informe um número válido com DDD, como (17) 99999-0000.
              </span>
            ) : (
              <span className="campo__dica">É com ele que a barbearia te identifica.</span>
            )}
          </div>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="criar-email">
              E-mail <span className="campo__opcional">(opcional)</span>
            </label>
            <input
              id="criar-email"
              className={`campo__entrada ${emailRuim ? 'campo__entrada--erro' : ''}`}
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={emailRuim}
            />
            {emailRuim ? (
              <span className="campo__erro">Esse e-mail não parece certo.</span>
            ) : (
              <span className="campo__dica">Se colocar, dá para entrar com ele também.</span>
            )}
          </div>

          <CampoSenha
            id="criar-senha"
            rotulo="Crie uma senha"
            valor={senha}
            aoMudar={setSenha}
            autoComplete="new-password"
            erro={senhaRuim ? 'A senha precisa ter pelo menos 6 caracteres.' : null}
            dica="Pelo menos 6 caracteres."
          />
        </form>

        {erro && (
          <div className="aviso aviso--erro" role="alert">
            <IconeAlerta className="aviso__icone" tamanho={18} />
            <span>
              {erro.mensagem}
              {erro.codigo === 'TELEFONE_JA_CADASTRADO' && (
                <>
                  {' '}
                  <button type="button" className="link-ouro" onClick={() => aoEntrarCom(telefone)}>
                    Entrar com esse número
                  </button>
                </>
              )}
              {erro.codigo === 'EMAIL_JA_CADASTRADO' && (
                <>
                  {' '}
                  <button type="button" className="link-ouro" onClick={() => aoEntrarCom(email.trim())}>
                    Entrar com esse e-mail
                  </button>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="modal__rodape">
        <button
          type="submit"
          form="form-criar"
          className="botao botao--ouro botao--bloco"
          disabled={enviando}
        >
          {enviando ? (
            <>
              <span className="girando" />
              Criando a conta…
            </>
          ) : (
            'Criar conta'
          )}
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------

function CampoSenha({
  id,
  rotulo = 'Senha',
  valor,
  aoMudar,
  autoComplete,
  erro,
  dica,
}: {
  id: string
  rotulo?: string
  valor: string
  aoMudar: (valor: string) => void
  autoComplete: string
  erro: string | null
  dica?: string
}) {
  const [mostrar, setMostrar] = useState(false)

  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={id}>
        {rotulo}
      </label>
      <div className="campo__senha">
        <input
          id={id}
          className={`campo__entrada ${erro ? 'campo__entrada--erro' : ''}`}
          type={mostrar ? 'text' : 'password'}
          autoComplete={autoComplete}
          maxLength={72}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          aria-invalid={Boolean(erro)}
        />
        <button
          type="button"
          className="campo__mostrar"
          onClick={() => setMostrar((m) => !m)}
          aria-pressed={mostrar}
          aria-controls={id}
        >
          {mostrar ? 'Esconder' : 'Mostrar'}
        </button>
      </div>
      {erro ? (
        <span className="campo__erro">{erro}</span>
      ) : (
        dica && <span className="campo__dica">{dica}</span>
      )}
    </div>
  )
}
