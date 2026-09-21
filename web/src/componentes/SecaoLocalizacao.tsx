import type { ConfigBarbearia } from '../lib/tipos'
import { linkInstagram, linkMapa, linkWhatsapp, telefoneBonito } from '../lib/formato'
import { IconeInstagram, IconeLocal, IconeWhatsapp } from './Icones'

interface Props {
  config: ConfigBarbearia | null
  aoAgendar: () => void
}

export function SecaoLocalizacao({ config, aoAgendar }: Props) {
  const mapa = config ? linkMapa(config) : null
  const whats = linkWhatsapp(
    config?.telefone_whatsapp ?? null,
    'Olá! Vim pelo site da Barbearia Arte 10.'
  )
  const insta = linkInstagram(config?.instagram ?? null)
  const temEndereco = Boolean(config?.endereco || config?.cidade)

  return (
    <section className="secao secao--alt" id="localizacao">
      <div className="container">
        <span className="etiqueta">Localização</span>
        <h2 className="titulo-secao">Onde a gente fica</h2>

        <div className="local">
          <div className="cartao local__cartao">
            <IconeLocal tamanho={26} className="destaque__icone" />

            {temEndereco ? (
              <>
                {config?.endereco && <p className="local__endereco">{config.endereco}</p>}
                {(config?.cidade || config?.uf) && (
                  <p className="local__cidade">
                    {[config?.cidade, config?.uf].filter(Boolean).join(' — ')}
                  </p>
                )}
              </>
            ) : (
              <p className="local__endereco" style={{ color: 'var(--texto-suave)' }}>
                Endereço em atualização
              </p>
            )}

            <div className="local__acoes">
              {mapa && (
                <a
                  href={mapa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="botao botao--contorno"
                >
                  Como chegar
                </a>
              )}
              {whats && (
                <a
                  href={whats}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="botao botao--contorno"
                >
                  <IconeWhatsapp tamanho={17} />
                  WhatsApp
                </a>
              )}
            </div>
          </div>

          <div className="cartao local__cartao" id="contato">
            <span className="etiqueta">Contato</span>

            {config?.telefone_whatsapp && (
              <p className="local__endereco">{telefoneBonito(config.telefone_whatsapp)}</p>
            )}

            <p style={{ color: 'var(--texto-suave)', fontSize: '0.94rem' }}>
              Para marcar, o caminho mais rápido é o agendamento online — ele mostra na hora os
              horários que ainda estão livres.
            </p>

            <div className="local__acoes">
              <button type="button" className="botao botao--ouro" onClick={aoAgendar}>
                Agendar horário
              </button>
              {insta && (
                <a
                  href={insta}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="botao botao--contorno"
                >
                  <IconeInstagram tamanho={17} />
                  Instagram
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
