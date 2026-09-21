import type { Servico } from '../../lib/tipos'
import { duracao, moeda } from '../../lib/formato'
import { IconeAvancar } from '../Icones'

interface Props {
  servicos: Servico[]
  selecionado: string | null
  aoSelecionar: (servico: Servico) => void
}

export function EscolhaServico({ servicos, selecionado, aoSelecionar }: Props) {
  if (servicos.length === 0) {
    return (
      <div className="vazio">
        <p className="vazio__titulo">Nenhum serviço disponível</p>
        <p>A barbearia ainda não liberou serviços para agendamento online.</p>
      </div>
    )
  }

  return (
    <div className="opcoes">
      {servicos.map((servico) => (
        <button
          key={servico.id}
          type="button"
          className={`opcao ${selecionado === servico.id ? 'opcao--ativa' : ''}`}
          onClick={() => aoSelecionar(servico)}
        >
          <span className="opcao__info">
            <span className="opcao__nome">{servico.nome}</span>
            <span className="opcao__meta">
              {duracao(servico.duracao_minutos)}
              {servico.descricao ? ` · ${servico.descricao}` : ''}
            </span>
          </span>
          <span className="opcao__preco">{moeda(servico.preco)}</span>
          <IconeAvancar tamanho={18} />
        </button>
      ))}
    </div>
  )
}
