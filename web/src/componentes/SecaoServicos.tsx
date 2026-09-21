import type { Servico } from '../lib/tipos'
import { duracao, moeda } from '../lib/formato'
import { IconeAlerta } from './Icones'

interface Props {
  servicos: Servico[]
  carregando: boolean
  erro: boolean
  aoAgendar: (servicoId: string) => void
  aoRecarregar: () => void
}

export function SecaoServicos({ servicos, carregando, erro, aoAgendar, aoRecarregar }: Props) {
  return (
    <section className="secao secao--alt" id="servicos">
      <div className="container">
        <span className="etiqueta">Serviços</span>
        <h2 className="titulo-secao">O que fazemos na cadeira</h2>
        <p className="subtitulo-secao">
          Preços e durações reais — é a mesma informação que o sistema usa para montar a sua
          agenda.
        </p>

        {carregando && (
          <div className="grade-servicos" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="esqueleto" style={{ height: 232 }} />
            ))}
          </div>
        )}

        {!carregando && erro && (
          <div className="aviso aviso--erro" style={{ marginTop: 32 }} role="alert">
            <IconeAlerta className="aviso__icone" tamanho={18} />
            <span>
              Não conseguimos carregar os serviços agora.{' '}
              <button type="button" className="botao botao--fantasma" onClick={aoRecarregar}>
                Tentar novamente
              </button>
            </span>
          </div>
        )}

        {!carregando && !erro && servicos.length === 0 && (
          <div className="cartao vazio" style={{ marginTop: 32 }}>
            <p className="vazio__titulo">Nenhum serviço disponível</p>
            <p>A barbearia está atualizando a tabela de serviços. Volte em instantes.</p>
          </div>
        )}

        {!carregando && !erro && servicos.length > 0 && (
          <div className="grade-servicos">
            {servicos.map((servico, indice) => (
              <article key={servico.id} className="cartao servico">
                <div className="servico__topo">
                  <span className="servico__numero">
                    {String(indice + 1).padStart(2, '0')}
                  </span>
                  <span className="servico__duracao">{duracao(servico.duracao_minutos)}</span>
                </div>

                <h3 className="servico__nome">{servico.nome}</h3>

                {servico.descricao && <p className="servico__descricao">{servico.descricao}</p>}

                <div className="servico__rodape">
                  <span className="servico__preco">{moeda(servico.preco)}</span>
                  <button
                    type="button"
                    className="botao botao--contorno"
                    onClick={() => aoAgendar(servico.id)}
                  >
                    Agendar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
