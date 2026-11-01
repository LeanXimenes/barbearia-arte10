import { useCallback, useEffect, useState } from 'react'
import { atualizarServico, criarServico, definirAtivo, reordenarServicos, servicos as buscarServicos } from '../api'
import type { ServicoAdmin } from '../tipos'
import { duracao, moeda } from '../../lib/formato'
import { Campo, Carregando, Chave, ErroCarregar, Etiqueta, Folha, Vazio, useAviso } from '../componentes'
import { IconeAvancar, IconeVoltar } from '../../componentes/Icones'

/** O que a barbearia oferece: preço e duração alimentam o site e a grade de horários. */
export function Servicos() {
  const mostrarAviso = useAviso()
  const [lista, setLista] = useState<ServicoAdmin[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<ServicoAdmin | 'novo' | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setLista(await buscarServicos())
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function alternarAtivo(s: ServicoAdmin) {
    try {
      await definirAtivo(s.id, !s.ativo)
      mostrarAviso(s.ativo ? `${s.nome} não aparece mais para novos agendamentos.` : `${s.nome} voltou para o site.`)
      await carregar()
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'Não foi possível salvar.')
    }
  }

  async function mover(indice: number, delta: -1 | 1) {
    if (!lista || ocupado) return
    const destino = indice + delta
    if (destino < 0 || destino >= lista.length) return
    const nova = [...lista]
    ;[nova[indice], nova[destino]] = [nova[destino]!, nova[indice]!]
    setLista(nova)
    setOcupado(true)
    try {
      await reordenarServicos(nova.map((s) => s.id))
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'Não foi possível salvar a ordem.')
      await carregar()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="p-tela">
      <div className="p-cabecalho">
        <span className="p-cabecalho__sub">Serviços</span>
        <h1 className="p-cabecalho__titulo">O que a barbearia oferece</h1>
        <p className="p-texto-suave">Preço e duração daqui alimentam o site e o cálculo dos horários.</p>
      </div>

      {erro && !lista && <ErroCarregar texto={erro} aoTentar={() => void carregar()} />}
      {!lista && !erro && <Carregando />}
      {lista && lista.length === 0 && <Vazio titulo="Nenhum serviço ainda" />}

      {lista && lista.length > 0 && (
        <>
          <p className="campo__dica" style={{ marginBottom: 10 }}>
            Use as setas para mudar a ordem. O site mostra na mesma ordem.
          </p>
          <ul className="p-lista">
            {lista.map((s, i) => (
              <li key={s.id} className={`p-cartao p-servico ${s.ativo ? '' : 'p-servico--inativo'}`}>
                <div className="p-servico__ordem">
                  <button type="button" className="p-icone-botao p-seta-cima" disabled={i === 0 || ocupado} onClick={() => void mover(i, -1)} aria-label={`Subir ${s.nome}`}>
                    <IconeVoltar tamanho={16} />
                  </button>
                  <button type="button" className="p-icone-botao p-seta-baixo" disabled={i === lista.length - 1 || ocupado} onClick={() => void mover(i, 1)} aria-label={`Descer ${s.nome}`}>
                    <IconeAvancar tamanho={16} />
                  </button>
                </div>
                <div className="p-servico__info">
                  <strong>{s.nome}</strong>
                  <span className="p-texto-suave">
                    {moeda(s.preco)} · {duracao(s.duracao_minutos)}
                  </span>
                  <span className="p-servico__etiquetas">
                    {s.usa_plano && <Etiqueta tom="ouro">Desconta do plano do Clube</Etiqueta>}
                    {!s.ativo && <Etiqueta tom="neutro">Inativo — não aparece no site</Etiqueta>}
                  </span>
                </div>
                <div className="p-servico__acoes">
                  <label className="p-chave p-chave--compacta" aria-label={s.ativo ? `Desativar ${s.nome}` : `Ativar ${s.nome}`}>
                    <input type="checkbox" checked={s.ativo} onChange={() => void alternarAtivo(s)} />
                    <span className="p-chave__trilho" aria-hidden />
                  </label>
                  <button type="button" className="link-ouro" onClick={() => setEditando(s)}>
                    Editar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" className="botao botao--ouro botao--bloco" style={{ marginTop: 16 }} onClick={() => setEditando('novo')}>
        Novo serviço
      </button>

      {editando && (
        <EditarServico
          servico={editando === 'novo' ? null : editando}
          proximaOrdem={(lista ?? []).reduce((m, s) => Math.max(m, s.ordem), 0) + 1}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null)
            mostrarAviso('Serviço salvo.')
            void carregar()
          }}
        />
      )}
    </div>
  )
}

function EditarServico({
  servico,
  proximaOrdem,
  aoFechar,
  aoSalvar,
}: {
  servico: ServicoAdmin | null
  proximaOrdem: number
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [nome, setNome] = useState(servico?.nome ?? '')
  const [descricao, setDescricao] = useState(servico?.descricao ?? '')
  const [preco, setPreco] = useState(servico ? String(servico.preco).replace('.', ',') : '')
  const [minutos, setMinutos] = useState(servico ? String(servico.duracao_minutos) : '')
  const [usaPlano, setUsaPlano] = useState(servico?.usa_plano ?? false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    const valor = Number(preco.replace(',', '.'))
    const duracaoMin = Number(minutos)
    const problema =
      nome.trim().length < 2
        ? 'Informe o nome do serviço.'
        : !preco.trim() || Number.isNaN(valor) || valor < 0
          ? 'Informe um preço válido.'
          : !Number.isInteger(duracaoMin) || duracaoMin < 5 || duracaoMin > 480
            ? 'A duração precisa ficar entre 5 e 480 minutos.'
            : null
    setErro(problema)
    if (problema) return

    const dados = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      preco: valor,
      duracao_minutos: duracaoMin,
      ativo: servico?.ativo ?? true,
      ordem: servico?.ordem ?? proximaOrdem,
      usa_plano: usaPlano,
    }
    setSalvando(true)
    try {
      if (servico) await atualizarServico(servico.id, dados)
      else await criarServico(dados)
      aoSalvar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha
      titulo={servico ? 'Editar serviço' : 'Novo serviço'}
      aoFechar={aoFechar}
      ocupado={salvando}
      rodape={
        <>
          <button type="button" className="botao botao--ouro botao--bloco" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="botao botao--fantasma" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </button>
        </>
      }
    >
      <Campo id="serv-nome" rotulo="Nome" valor={nome} aoMudar={setNome} maximo={60} />
      <Campo id="serv-desc" rotulo="Descrição" valor={descricao} aoMudar={setDescricao} maximo={200} />
      <div className="p-duas-colunas">
        <Campo id="serv-preco" rotulo="Preço" valor={preco} aoMudar={setPreco} modo="decimal" placeholder="35,00" />
        <Campo id="serv-min" rotulo="Minutos" valor={minutos} aoMudar={(v) => setMinutos(v.replace(/\D/g, ''))} modo="numeric" />
      </div>
      <Chave
        rotulo="Desconta do plano"
        dica="Quem tem plano do Clube usa 1 corte ao agendar este serviço."
        ligado={usaPlano}
        aoMudar={setUsaPlano}
      />
      {erro && <p className="campo__erro" style={{ marginTop: 10 }}>{erro}</p>}
    </Folha>
  )
}
