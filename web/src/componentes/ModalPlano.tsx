import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Assinatura, ConfigBarbearia, Plano } from '../lib/tipos'
import { lerCliente, salvarCliente } from '../lib/clienteSalvo'
import { solicitarPlano } from '../servicos/api'
import {
  linkWhatsapp,
  mascararTelefone,
  moeda,
  nomeValido,
  telefoneBonito,
  telefoneValido,
} from '../lib/formato'
import {
  IconeAlerta,
  IconeCheck,
  IconeCoroa,
  IconeFechar,
  IconeUsuario,
  IconeWhatsapp,
} from './Icones'

interface Props {
  plano: Plano
  config: ConfigBarbearia | null
  aoFechar: () => void
}

export function ModalPlano({ plano, config, aoFechar }: Props) {
  const [salvo] = useState(() => lerCliente())
  const [usandoSalvo, setUsandoSalvo] = useState(salvo !== null)
  const [nome, setNome] = useState(salvo?.nome ?? '')
  const [telefone, setTelefone] = useState(salvo ? mascararTelefone(salvo.telefone) : '')
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pedido, setPedido] = useState<Assinatura | null>(null)

  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => {
      document.body.style.overflow = anterior
      window.removeEventListener('keydown', aoTeclar)
    }
  }, [aoFechar])

  async function enviar() {
    if (enviando) return
    setTentou(true)
    if (!nomeValido(nome) || !telefoneValido(telefone)) return

    setEnviando(true)
    setErro(null)
    try {
      const r = await solicitarPlano(plano.id, nome, telefone)
      if (r.ok) {
        salvarCliente({ nome: nome.trim(), telefone: telefone.replace(/\D/g, '') })
        setPedido(r.assinatura)
      } else {
        setErro(r.mensagem)
      }
    } catch {
      setErro('Não foi possível enviar agora. Confira sua internet e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  const whats = linkWhatsapp(
    config?.telefone_whatsapp ?? null,
    `Olá! Acabei de pedir o ${plano.nome} (${moeda(plano.preco)}) pelo app. Como faço o pagamento?`,
  )

  const nomeRuim = tentou && !nomeValido(nome)
  const telRuim = tentou && !telefoneValido(telefone)

  // Portal: a aba fica dentro de um trilho com "transform", que prenderia
  // um elemento "fixed" dentro dela.
  return createPortal(
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Quero o ${plano.nome}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !enviando) aoFechar()
      }}
    >
      <div className="modal__caixa">
        <div className="modal__topo">
          <span className="plano-modal__icone">
            <IconeCoroa tamanho={20} />
          </span>
          <h2 className="modal__titulo">{pedido ? 'Pedido enviado!' : plano.nome}</h2>
          <button type="button" className="modal__fechar" onClick={aoFechar} aria-label="Fechar">
            <IconeFechar tamanho={19} />
          </button>
        </div>

        <div className="modal__corpo">
          {pedido ? (
            <div className="confirmado">
              <div className="confirmado__selo">
                <IconeCheck tamanho={34} />
              </div>
              <h3 className="confirmado__titulo">A barbearia já foi avisada</h3>
              <p className="confirmado__texto">
                Agora é só pagar o {pedido.plano} ({moeda(pedido.preco)}) na barbearia ou combinar
                pelo WhatsApp. Assim que o pagamento for confirmado, seus {pedido.cortes_total}{' '}
                cortes ficam liberados.
              </p>
            </div>
          ) : (
            <>
              <div className="revisao">
                <div className="revisao__linha">
                  <span className="revisao__rotulo">Plano</span>
                  <span className="revisao__valor">{plano.nome}</span>
                </div>
                <div className="revisao__linha">
                  <span className="revisao__rotulo">Cortes</span>
                  <span className="revisao__valor">
                    {plano.cortes} em {plano.validade_dias} dias
                  </span>
                </div>
                <div className="revisao__linha">
                  <span className="revisao__rotulo">Valor</span>
                  <span className="revisao__valor revisao__valor--destaque">
                    {moeda(plano.preco)}
                  </span>
                </div>
              </div>

              <ol className="app-passos plano-modal__passos">
                <li>
                  <span className="app-passos__numero">1</span>
                  <span>Envie o pedido aqui</span>
                </li>
                <li>
                  <span className="app-passos__numero">2</span>
                  <span>Pague na barbearia ou pelo WhatsApp</span>
                </li>
                <li>
                  <span className="app-passos__numero">3</span>
                  <span>
                    Pronto: cada corte que você agendar <strong>desconta do plano sozinho</strong>
                  </span>
                </li>
              </ol>

              {usandoSalvo && salvo ? (
                <div className="cliente-salvo">
                  <span className="cliente-salvo__icone">
                    <IconeUsuario tamanho={18} />
                  </span>
                  <span className="cliente-salvo__dados">
                    <span className="cliente-salvo__rotulo">Plano no nome de</span>
                    <span className="cliente-salvo__nome">{salvo.nome}</span>
                    <span className="cliente-salvo__tel">{telefoneBonito(salvo.telefone)}</span>
                  </span>
                  <button
                    type="button"
                    className="botao botao--fantasma cliente-salvo__trocar"
                    onClick={() => {
                      setUsandoSalvo(false)
                      setNome('')
                      setTelefone('')
                      setTentou(false)
                    }}
                  >
                    Usar outro nome e número
                  </button>
                </div>
              ) : (
                <>
                  <div className="campo">
                    <label className="campo__rotulo" htmlFor="plano-nome">
                      Seu nome
                    </label>
                    <input
                      id="plano-nome"
                      className={`campo__entrada ${nomeRuim ? 'campo__entrada--erro' : ''}`}
                      type="text"
                      autoComplete="name"
                      maxLength={80}
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      aria-invalid={nomeRuim}
                    />
                    {nomeRuim && <span className="campo__erro">Informe seu nome.</span>}
                  </div>
                  <div className="campo">
                    <label className="campo__rotulo" htmlFor="plano-telefone">
                      WhatsApp / telefone
                    </label>
                    <input
                      id="plano-telefone"
                      className={`campo__entrada ${telRuim ? 'campo__entrada--erro' : ''}`}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="(00) 00000-0000"
                      value={telefone}
                      onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
                      aria-invalid={telRuim}
                    />
                    {telRuim ? (
                      <span className="campo__erro">Informe um telefone válido com DDD.</span>
                    ) : (
                      <span className="campo__dica">
                        Use o mesmo número quando for agendar: é por ele que o plano desconta.
                      </span>
                    )}
                  </div>
                </>
              )}

              {erro && (
                <div className="aviso aviso--erro" role="alert" style={{ marginTop: 14 }}>
                  <IconeAlerta className="aviso__icone" tamanho={18} />
                  <span>{erro}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal__rodape">
          {pedido ? (
            <>
              {whats && (
                <a
                  href={whats}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="botao botao--ouro botao--bloco"
                >
                  <IconeWhatsapp tamanho={17} />
                  Combinar o pagamento
                </a>
              )}
              <button type="button" className="botao botao--fantasma" onClick={aoFechar}>
                Fechar
              </button>
            </>
          ) : (
            <button
              type="button"
              className="botao botao--ouro botao--bloco"
              onClick={() => void enviar()}
              disabled={enviando}
            >
              {enviando ? (
                <>
                  <span className="girando" />
                  Enviando…
                </>
              ) : (
                `Pedir o ${plano.nome}`
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
