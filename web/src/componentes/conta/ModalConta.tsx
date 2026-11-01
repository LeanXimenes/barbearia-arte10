import { useEffect, useRef, useState } from 'react'
import type { ConfigBarbearia } from '../../lib/tipos'
import { useConta } from '../../hooks/useConta'
import { lerCliente } from '../../lib/clienteSalvo'
import { mascararTelefone } from '../../lib/formato'
import { IconeFechar } from '../Icones'
import { FormCriarConta, FormEntrar } from './FormulariosConta'
import { MinhaConta } from './MinhaConta'

export type TelaConta = 'entrar' | 'criar'

interface Props {
  telaInicial: TelaConta
  config: ConfigBarbearia | null
  /**
   * Porta de entrada do site: aparece na primeira vez que a pessoa abre e
   * não fecha até ela entrar ou criar a conta.
   */
  obrigatorio?: boolean
  aoFechar: () => void
  aoAgendar: () => void
}

export function ModalConta({
  telaInicial,
  config,
  obrigatorio = false,
  aoFechar,
  aoAgendar,
}: Props) {
  const { conta, atualizar } = useConta()
  const [tela, setTela] = useState<TelaConta>(telaInicial)
  const [loginSugerido, setLoginSugerido] = useState(() => {
    const salvo = lerCliente()
    return salvo ? mascararTelefone(salvo.telefone) : ''
  })
  const [enviando, setEnviando] = useState(false)
  const podeFechar = !obrigatorio && !enviando

  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && podeFechar) aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar, podeFechar])

  // Já logado: os horários podem ter mudado no app do dono desde a última vez.
  const logadoAoAbrir = useRef(Boolean(conta))
  useEffect(() => {
    if (logadoAoAbrir.current) void atualizar()
  }, [atualizar])

  // Entrou: na porta de entrada o site aparece sozinho; senão vira "Minha conta".
  const aoConcluir = () => {}

  const titulo = conta
    ? 'Minha conta'
    : obrigatorio
      ? 'Bem-vindo à Arte 10'
      : tela === 'entrar'
        ? 'Entrar na conta'
        : 'Criar conta'

  return (
    <div
      className={`modal ${obrigatorio ? 'modal--obrigatorio' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && podeFechar) aoFechar()
      }}
    >
      <div className="modal__caixa modal__caixa--conta">
        <div className="modal__topo">
          <img
            src="/logo-arte10-mini.jpg"
            alt=""
            width={38}
            height={38}
            style={{ borderRadius: 9, objectFit: 'cover' }}
          />
          <h2 className="modal__titulo">{titulo}</h2>
          {!obrigatorio && (
            <button
              type="button"
              className="modal__fechar"
              onClick={aoFechar}
              disabled={enviando}
              aria-label="Fechar"
            >
              <IconeFechar tamanho={19} />
            </button>
          )}
        </div>

        {conta ? (
          <MinhaConta config={config} aoAgendar={aoAgendar} aoSair={aoFechar} />
        ) : (
          <>
            <div className="conta__abas">
              {obrigatorio && (
                <p className="conta__boas-vindas">
                  Entre ou crie sua conta para agendar e ver seus horários. É só desta vez:
                  depois você já entra direto.
                </p>
              )}
              <div className="alternador" role="tablist" aria-label="Entrar ou criar conta">
                {(['criar', 'entrar'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tela === t}
                    disabled={enviando}
                    className={`alternador__item ${tela === t ? 'alternador__item--ativo' : ''}`}
                    onClick={() => setTela(t)}
                  >
                    {t === 'entrar' ? 'Já tenho conta' : 'Criar conta'}
                  </button>
                ))}
              </div>
            </div>

            {tela === 'entrar' ? (
              <FormEntrar
                config={config}
                loginInicial={loginSugerido}
                aoEnviar={setEnviando}
                aoConcluir={aoConcluir}
                aoCriarConta={() => setTela('criar')}
              />
            ) : (
              <FormCriarConta
                config={config}
                aoEnviar={setEnviando}
                aoConcluir={aoConcluir}
                aoEntrarCom={(login) => {
                  setLoginSugerido(login)
                  setTela('entrar')
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
