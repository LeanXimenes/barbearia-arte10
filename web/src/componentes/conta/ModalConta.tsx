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
  /** Aberto do meio do agendamento: depois de entrar, fecha e volta para ele. */
  voltarAoAgendamento: boolean
  aoFechar: () => void
  aoAgendar: () => void
}

export function ModalConta({
  telaInicial,
  config,
  voltarAoAgendamento,
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

  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !enviando) aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar, enviando])

  // Já logado: os horários podem ter mudado no app do dono desde a última vez.
  const logadoAoAbrir = useRef(Boolean(conta))
  useEffect(() => {
    if (logadoAoAbrir.current) void atualizar()
  }, [atualizar])

  const aoConcluir = () => {
    if (voltarAoAgendamento) aoFechar()
    // Senão, a própria conta aparece (o modal vira "Minha conta").
  }

  const titulo = conta ? 'Minha conta' : tela === 'entrar' ? 'Entrar na conta' : 'Criar conta'

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !enviando) aoFechar()
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
          <button
            type="button"
            className="modal__fechar"
            onClick={aoFechar}
            disabled={enviando}
            aria-label="Fechar"
          >
            <IconeFechar tamanho={19} />
          </button>
        </div>

        {conta ? (
          <MinhaConta config={config} aoAgendar={aoAgendar} aoSair={aoFechar} />
        ) : (
          <>
            <div className="conta__abas">
              <div className="alternador" role="tablist" aria-label="Entrar ou criar conta">
                {(['entrar', 'criar'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tela === t}
                    disabled={enviando}
                    className={`alternador__item ${tela === t ? 'alternador__item--ativo' : ''}`}
                    onClick={() => setTela(t)}
                  >
                    {t === 'entrar' ? 'Entrar' : 'Criar conta'}
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
