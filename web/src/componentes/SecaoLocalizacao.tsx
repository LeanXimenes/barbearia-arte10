import type { ConfigBarbearia } from '../lib/tipos'
import { linkInstagram, linkMapa, linkWhatsapp, telefoneBonito } from '../lib/formato'
import { IconeInstagram, IconeLocal, IconeWhatsapp } from './Icones'

interface Props {
  config: ConfigBarbearia | null
}

export function SecaoLocalizacao({ config }: Props) {
  const mapa = config ? linkMapa(config) : null
  const whats = linkWhatsapp(
    config?.telefone_whatsapp ?? null,
    'Olá! Vim pelo site da Barbearia Arte 10.',
  )
  const insta = linkInstagram(config?.instagram ?? null)
  const arroba = config?.instagram
    ? config.instagram.startsWith('@')
      ? config.instagram
      : `@${config.instagram}`
    : null
  const cidade = [config?.cidade, config?.uf].filter(Boolean).join(' — ')
  const ano = new Date().getFullYear()

  return (
    <div className="container aba__conteudo">
      <span className="etiqueta">Contato</span>
      <h2 className="titulo-secao">Onde a gente fica</h2>

      <div className="local">
        <div className="cartao local__cartao">
          <span className="local__rotulo">
            <IconeLocal tamanho={16} /> Endereço
          </span>
          {config?.endereco || cidade ? (
            <>
              {config?.endereco && <p className="local__endereco">{config.endereco}</p>}
              {cidade && <p className="local__cidade">{cidade}</p>}
            </>
          ) : (
            <p className="local__endereco" style={{ color: 'var(--texto-suave)' }}>
              Endereço em atualização
            </p>
          )}
          {mapa && (
            <a
              href={mapa}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao--contorno local__botao"
            >
              Como chegar
            </a>
          )}
        </div>

        <div className="cartao local__cartao">
          <span className="local__rotulo">
            <IconeWhatsapp tamanho={16} /> WhatsApp
          </span>
          {config?.telefone_whatsapp ? (
            <p className="local__telefone">{telefoneBonito(config.telefone_whatsapp)}</p>
          ) : (
            <p className="local__endereco" style={{ color: 'var(--texto-suave)' }}>
              Em atualização
            </p>
          )}
          {arroba && (
            <p className="local__insta">
              <IconeInstagram tamanho={16} /> {arroba}
            </p>
          )}
          <div className="local__acoes">
            {whats && (
              <a
                href={whats}
                target="_blank"
                rel="noopener noreferrer"
                className="botao botao--contorno local__botao"
              >
                <IconeWhatsapp tamanho={17} />
                Conversar
              </a>
            )}
            {insta && (
              <a
                href={insta}
                target="_blank"
                rel="noopener noreferrer"
                className="botao botao--contorno local__botao"
              >
                <IconeInstagram tamanho={17} />
                Instagram
              </a>
            )}
          </div>
        </div>
      </div>

      <p className="rodape-mini">© {ano} Barbearia Arte 10</p>
    </div>
  )
}
