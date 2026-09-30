import { useEffect, useState } from 'react'
import type { Assinatura, ConfigBarbearia, Plano } from '../lib/tipos'
import { useClube } from '../hooks/useClube'
import { lerCliente } from '../lib/clienteSalvo'
import { consultarMeuPlano } from '../servicos/api'
import { diaMesDoInstante, linkWhatsapp } from '../lib/formato'
import { IconeAlerta, IconeCheck, IconeCoroa, IconeWhatsapp } from './Icones'
import { ModalPlano } from './ModalPlano'

interface Props {
  config: ConfigBarbearia | null
}

type Visao = 'planos' | 'promocoes'

export function SecaoClube({ config }: Props) {
  const { planos, promocoes, carregando, erro, recarregar } = useClube()
  const [visao, setVisao] = useState<Visao>('planos')
  const [escolhido, setEscolhido] = useState<Plano | null>(null)
  const [meuPlano, setMeuPlano] = useState<Assinatura | null>(null)

  // Quem já agendou neste celular vê a situação do próprio plano.
  const atualizarMeuPlano = () => {
    const salvo = lerCliente()
    if (!salvo) return
    consultarMeuPlano(salvo.telefone)
      .then(setMeuPlano)
      .catch(() => setMeuPlano(null))
  }
  useEffect(atualizarMeuPlano, [])

  return (
    <div className="container aba__conteudo clube">
      <span className="etiqueta">Clube Arte 10</span>
      <h2 className="titulo-secao">Planos e promoções</h2>

      {meuPlano && <MeuPlano plano={meuPlano} />}

      <div className="alternador" role="tablist" aria-label="Planos ou promoções">
        {(['planos', 'promocoes'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={visao === v}
            className={`alternador__item ${visao === v ? 'alternador__item--ativo' : ''}`}
            onClick={() => setVisao(v)}
          >
            {v === 'planos' ? 'Planos' : 'Promoções'}
          </button>
        ))}
      </div>

      {carregando && (
        <div className="clube__lista" aria-hidden>
          <div className="esqueleto" style={{ height: 150 }} />
          <div className="esqueleto" style={{ height: 150 }} />
        </div>
      )}

      {!carregando && erro && (
        <div className="aviso aviso--erro" role="alert">
          <IconeAlerta className="aviso__icone" tamanho={18} />
          <span>
            Não conseguimos carregar o Clube agora.{' '}
            <button
              type="button"
              className="botao botao--fantasma"
              onClick={() => void recarregar()}
            >
              Tentar novamente
            </button>
          </span>
        </div>
      )}

      {!carregando && !erro && visao === 'planos' && (
        <div className="clube__lista">
          {planos.length === 0 && (
            <p className="clube__vazio">Nenhum plano disponível no momento.</p>
          )}
          {planos.map((plano) => (
            <CartaoPlano key={plano.id} plano={plano} aoQuerer={() => setEscolhido(plano)} />
          ))}
        </div>
      )}

      {!carregando && !erro && visao === 'promocoes' && (
        <div className="clube__lista">
          {promocoes.length === 0 && (
            <p className="clube__vazio">Nenhuma promoção no momento. Volte logo!</p>
          )}
          {promocoes.map((promo) => {
            const whats = linkWhatsapp(
              config?.telefone_whatsapp ?? null,
              `Olá! Quero saber mais da promoção ${promo.titulo}.`,
            )
            return (
              <article key={promo.id} className="cartao promo">
                <h3 className="promo__titulo">{promo.titulo}</h3>
                {promo.chamada && <p className="promo__chamada">{promo.chamada}</p>}
                {promo.itens.length > 0 && (
                  <ul className="promo__itens">
                    {promo.itens.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {promo.descricao && <p className="promo__descricao">{promo.descricao}</p>}
                <div className="promo__rodape">
                  {promo.observacao && <span className="promo__obs">{promo.observacao}</span>}
                  {whats && (
                    <a
                      href={whats}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="botao botao--contorno promo__botao"
                    >
                      <IconeWhatsapp tamanho={16} />
                      WhatsApp
                    </a>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {escolhido && (
        <ModalPlano
          plano={escolhido}
          config={config}
          aoFechar={() => {
            setEscolhido(null)
            atualizarMeuPlano()
          }}
        />
      )}
    </div>
  )
}

function CartaoPlano({ plano, aoQuerer }: { plano: Plano; aoQuerer: () => void }) {
  const economia =
    plano.preco_referencia !== null && plano.preco_referencia > plano.preco
      ? plano.preco_referencia - plano.preco
      : null

  return (
    <article className={`cartao plano ${plano.destaque ? 'plano--destaque' : ''}`}>
      {plano.destaque && (
        <span className="plano__selo">
          <IconeCoroa tamanho={13} /> Mais escolhido
        </span>
      )}
      <div className="plano__topo">
        <div className="plano__info">
          <h3 className="plano__nome">{plano.nome}</h3>
          {plano.chamada && <p className="plano__chamada">{plano.chamada}</p>}
        </div>
        <div className="plano__preco">
          <span className="plano__moeda">R$</span>
          <span className="plano__valor">{formatarInteiro(plano.preco)}</span>
          <span className="plano__mes">/mês</span>
        </div>
      </div>

      <ul className="plano__beneficios">
        {plano.beneficios.map((b) => (
          <li key={b}>
            <IconeCheck tamanho={13} /> {b}
          </li>
        ))}
      </ul>

      <div className="plano__rodape">
        {economia !== null && plano.preco_referencia !== null && (
          <span className="plano__economia">
            <s>R$ {formatarInteiro(plano.preco_referencia)}</s> Economia de R${' '}
            {formatarInteiro(economia)}
          </span>
        )}
        <button
          type="button"
          className={`botao ${plano.destaque ? 'botao--ouro' : 'botao--contorno'} plano__botao`}
          onClick={aoQuerer}
        >
          Quero esse plano
        </button>
      </div>
    </article>
  )
}

function MeuPlano({ plano }: { plano: Assinatura }) {
  let texto: string
  if (plano.status === 'ativa') {
    texto = `Seu ${plano.plano}: ${plano.restantes} de ${plano.cortes_total} cortes · até ${
      plano.expira_em ? diaMesDoInstante(plano.expira_em) : ''
    }`
  } else if (plano.status === 'solicitada') {
    texto = `Pedido do ${plano.plano} enviado. A barbearia vai confirmar o pagamento.`
  } else {
    texto = `Os cortes do seu ${plano.plano} acabaram. Que tal renovar?`
  }

  return (
    <div className={`meu-plano meu-plano--${plano.status}`} role="status">
      <IconeCoroa tamanho={16} />
      <span>{texto}</span>
    </div>
  )
}

/** "110" para 110,00 e "65,50" quando tem centavos. */
function formatarInteiro(valor: number): string {
  return Number.isInteger(valor)
    ? String(valor)
    : valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}
