import { useMemo } from 'react'
import type { DiaDisponivel } from '../../lib/tipos'
import { nomeDoMes } from '../../lib/formato'
import { IconeAlerta, IconeAvancar, IconeVoltar } from '../Icones'

interface Props {
  dias: DiaDisponivel[]
  mesVisivel: string // "2026-09"
  selecionada: string | null
  carregando: boolean
  erro: boolean
  podeVoltarMes: boolean
  podeAvancarMes: boolean
  aoTrocarMes: (delta: number) => void
  aoSelecionar: (data: string) => void
  aoTentarNovamente: () => void
}

const NOMES_DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export function EscolhaData({
  dias,
  mesVisivel,
  selecionada,
  carregando,
  erro,
  podeVoltarMes,
  podeAvancarMes,
  aoTrocarMes,
  aoSelecionar,
  aoTentarNovamente,
}: Props) {
  const porData = useMemo(() => {
    const mapa = new Map<string, DiaDisponivel>()
    for (const dia of dias) mapa.set(String(dia.data).slice(0, 10), dia)
    return mapa
  }, [dias])

  const [anoTexto, mesTexto] = mesVisivel.split('-')
  const ano = Number(anoTexto)
  const mes = Number(mesTexto) - 1

  // Células do calendário: vazias até o primeiro dia cair no dia da semana certo.
  const celulas = useMemo(() => {
    const primeiro = new Date(ano, mes, 1)
    const totalDias = new Date(ano, mes + 1, 0).getDate()
    const lista: Array<string | null> = Array.from({ length: primeiro.getDay() }, () => null)

    for (let d = 1; d <= totalDias; d++) {
      lista.push(`${anoTexto}-${mesTexto}-${String(d).padStart(2, '0')}`)
    }
    return lista
  }, [ano, mes, anoTexto, mesTexto])

  return (
    <div>
      <div className="calendario__topo">
        <span className="calendario__mes">
          {nomeDoMes(mes).replace(/^./, (c) => c.toUpperCase())} de {ano}
        </span>
        <span className="calendario__nav">
          <button
            type="button"
            className="calendario__seta"
            onClick={() => aoTrocarMes(-1)}
            disabled={!podeVoltarMes}
            aria-label="Mês anterior"
          >
            <IconeVoltar tamanho={16} />
          </button>
          <button
            type="button"
            className="calendario__seta"
            onClick={() => aoTrocarMes(1)}
            disabled={!podeAvancarMes}
            aria-label="Próximo mês"
          >
            <IconeAvancar tamanho={16} />
          </button>
        </span>
      </div>

      {erro && (
        <div className="aviso aviso--erro" role="alert" style={{ marginBottom: 14 }}>
          <IconeAlerta className="aviso__icone" tamanho={18} />
          <span>
            Não conseguimos carregar o calendário.{' '}
            <button type="button" className="botao botao--fantasma" onClick={aoTentarNovamente}>
              Tentar novamente
            </button>
          </span>
        </div>
      )}

      <div className="calendario__semana" aria-hidden>
        {NOMES_DIAS.map((nome, i) => (
          <span key={i} className="calendario__nome-dia">
            {nome}
          </span>
        ))}
      </div>

      <div className="calendario__grade" role="grid">
        {celulas.map((data, indice) => {
          if (!data) return <span key={`vazio-${indice}`} className="dia dia--vazio" />

          const info = porData.get(data)
          const disponivel = Boolean(info?.aberto && info.dentro_da_janela && info.disponiveis > 0)
          const numero = Number(data.slice(8, 10))

          return (
            <button
              key={data}
              type="button"
              role="gridcell"
              className={[
                'dia',
                !disponivel ? 'dia--indisponivel' : '',
                selecionada === data ? 'dia--selecionado' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!disponivel || carregando}
              onClick={() => aoSelecionar(data)}
              aria-label={
                disponivel
                  ? `Dia ${numero}, ${info?.disponiveis} horário(s) livre(s)`
                  : `Dia ${numero} indisponível`
              }
            >
              {numero}
              {disponivel && <span className="dia__ponto" />}
            </button>
          )
        })}
      </div>

      <div className="legenda">
        <span className="legenda__item">
          <span className="legenda__amostra legenda__amostra--livre" />
          Com horário livre
        </span>
        <span className="legenda__item">
          <span className="legenda__amostra" />
          Fechado ou lotado
        </span>
      </div>

      {carregando && (
        <p className="campo__dica" style={{ marginTop: 12 }}>
          Atualizando disponibilidade…
        </p>
      )}
    </div>
  )
}
