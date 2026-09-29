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
    <div className="container aba__conteudo">
      <span className="etiqueta">Serviços</span>
      <h2 className="titulo-secao">O que fazemos na cadeira</h2>

      {carregando && (
        <div className="lista-servicos" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="esqueleto" style={{ height: 64 }} />
          ))}
        </div>
      )}

      {!carregando && erro && (
        <div className="aviso aviso--erro" role="alert">
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
        <div className="cartao vazio">
          <p className="vazio__titulo">Nenhum serviço disponível</p>
          <p>A barbearia está atualizando a tabela de serviços. Volte em instantes.</p>
        </div>
      )}

      {!carregando && !erro && servicos.length > 0 && (
        <ul className="lista-servicos">
          {servicos.map((servico) => (
            <li key={servico.id} className="cartao servico">
              <div className="servico__info">
                <h3 className="servico__nome">{servico.nome}</h3>
                <span className="servico__detalhe">
                  {duracao(servico.duracao_minutos)}
                  {servico.descricao && (
                    <span className="servico__descricao"> · {servico.descricao}</span>
                  )}
                </span>
              </div>
              <span className="servico__preco">{moeda(servico.preco)}</span>
              <button
                type="button"
                className="botao botao--contorno servico__botao"
                onClick={() => aoAgendar(servico.id)}
                aria-label={`Agendar ${servico.nome}`}
              >
                Agendar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
