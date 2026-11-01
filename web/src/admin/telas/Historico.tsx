import { useCallback, useEffect, useState } from 'react'
import { apagarAtendimento, apagarAtendimentosPassados, historico } from '../api'
import type { AgendamentoHistorico } from '../tipos'
import { hoje, rotuloStatus } from '../formatoPainel'
import { dataCurta, duracao, hora, moeda } from '../../lib/formato'
import { Carregando, Confirmar, ErroCarregar, Etiqueta, Vazio, useAviso } from '../componentes'
import { IconeVoltar } from '../../componentes/Icones'

const POR_PAGINA = 100

/** Já passou pela cadeira (ou foi cancelado): pode ser apagado do app. */
function podeApagar(a: AgendamentoHistorico): boolean {
  return a.cancelado_em !== null || (a.fim_em !== null && new Date(a.fim_em).getTime() <= Date.now())
}

export function Historico({ aoVoltar }: { aoVoltar: () => void }) {
  const mostrarAviso = useAviso()
  const [itens, setItens] = useState<AgendamentoHistorico[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [temMais, setTemMais] = useState(false)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [apagar, setApagar] = useState<AgendamentoHistorico | 'todos' | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const lista = await historico(hoje(), POR_PAGINA, 0)
      setItens(lista)
      setTemMais(lista.length === POR_PAGINA)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function carregarMais() {
    if (!itens || carregandoMais) return
    setCarregandoMais(true)
    try {
      const mais = await historico(hoje(), POR_PAGINA, itens.length)
      setItens([...itens, ...mais])
      setTemMais(mais.length === POR_PAGINA)
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'Não foi possível carregar.')
    } finally {
      setCarregandoMais(false)
    }
  }

  async function confirmarApagar() {
    if (!apagar) return
    setOcupado(true)
    try {
      if (apagar === 'todos') {
        const r = await apagarAtendimentosPassados()
        mostrarAviso(`${r.apagados ?? 0} atendimento(s) apagado(s).`)
      } else {
        await apagarAtendimento(apagar.id)
        mostrarAviso('Atendimento apagado.')
      }
      setApagar(null)
      await carregar()
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'Não foi possível apagar.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="p-tela">
      <div className="p-cabecalho p-cabecalho--voltar">
        <button type="button" className="modal__voltar" onClick={aoVoltar} aria-label="Voltar">
          <IconeVoltar tamanho={19} />
        </button>
        <div style={{ flex: 1 }}>
          <span className="p-cabecalho__sub">Histórico</span>
          <h1 className="p-cabecalho__titulo">Atendimentos anteriores</h1>
        </div>
        {itens && itens.some(podeApagar) && (
          <button type="button" className="link-ouro" onClick={() => setApagar('todos')}>
            Limpar
          </button>
        )}
      </div>

      {erro && !itens && <ErroCarregar texto={erro} aoTentar={() => void carregar()} />}
      {!itens && !erro && <Carregando />}

      {itens && itens.length === 0 && (
        <Vazio titulo="Nada no histórico ainda" texto="Os atendimentos já realizados aparecem aqui." />
      )}

      {itens && itens.length > 0 && (
        <ul className="p-lista">
          {itens.map((a) => (
            <li key={a.id} className="p-cartao p-hist">
              <div className="p-hist__topo">
                <span className="p-hist__data">
                  {dataCurta(a.data)} · {hora(a.horario_inicio)}
                </span>
                {a.cancelado_em ? (
                  <Etiqueta tom="vermelho">Cancelado</Etiqueta>
                ) : (
                  <Etiqueta tom={a.status === 'concluido' ? 'verde' : a.status === 'nao_compareceu' ? 'vermelho' : 'neutro'}>
                    {rotuloStatus(a.status)}
                  </Etiqueta>
                )}
              </div>
              <strong>{a.clientes?.nome ?? 'Cliente'}</strong>
              <span className="p-texto-suave">
                {a.servico_nome} · {duracao(a.servico_duracao)} · {moeda(a.servico_preco)}
              </span>
              {podeApagar(a) && (
                <button type="button" className="link-ouro p-hist__apagar" onClick={() => setApagar(a)}>
                  Apagar atendimento
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {temMais && (
        <button type="button" className="botao botao--contorno botao--bloco" onClick={() => void carregarMais()} disabled={carregandoMais}>
          {carregandoMais ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}

      {apagar && (
        <Confirmar
          titulo={apagar === 'todos' ? 'Apagar quem já passou pela cadeira?' : 'Apagar este atendimento?'}
          texto={
            apagar === 'todos'
              ? 'Apaga todos os atendimentos que já aconteceram e os cancelados. Os horários marcados para frente continuam. Não pode ser desfeito.'
              : `${apagar.clientes?.nome ?? 'Cliente'} · ${dataCurta(apagar.data)} às ${hora(apagar.horario_inicio)}. Some do app e não pode ser desfeito. O cadastro do cliente continua.`
          }
          rotuloAcao="Apagar"
          perigoso
          ocupado={ocupado}
          aoConfirmar={() => void confirmarApagar()}
          aoFechar={() => setApagar(null)}
        />
      )}
    </div>
  )
}
