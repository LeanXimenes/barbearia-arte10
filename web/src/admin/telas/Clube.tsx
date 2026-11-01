import { useCallback, useEffect, useState } from 'react'
import {
  assinaturas as buscarAssinaturas,
  ativarAssinatura,
  atualizarPlano,
  criarPlano,
  encerrarAssinatura,
  excluirAssinatura,
  excluirAssinaturasEncerradas,
  excluirPlano,
  planos as buscarPlanos,
  promocoes as buscarPromocoes,
  servicos as buscarServicos,
} from '../api'
import type { AssinaturaResumo, PlanoAdmin, PromocaoAdmin } from '../tipos'
import { DialogoPromocao } from './Promocoes'
import { carimbo } from '../formatoPainel'
import { dataCurtaDoInstante, linkWhatsapp, moeda, telefoneBonito } from '../../lib/formato'
import { contaDoPlano, precoDoCorteDoPlano, sufixoDoPreco, textoValidade } from '../../lib/planos'
import { Campo, Carregando, Chave, Confirmar, ErroCarregar, Etiqueta, Folha, TituloSecao, Vazio, useAviso, type Tom } from '../componentes'
import { IconeWhatsapp } from '../../componentes/Icones'

type Acao = { tipo: 'ativar' | 'encerrar' | 'excluir'; assinatura: AssinaturaResumo } | { tipo: 'excluir_todos' }

const ROTULO: Record<AssinaturaResumo['status'], [string, Tom]> = {
  solicitada: ['Esperando pagamento', 'ouro'],
  ativa: ['Ativo', 'verde'],
  encerrada: ['Cortes usados / vencido', 'neutro'],
  recusada: ['Recusado', 'vermelho'],
  cancelada: ['Cancelado', 'vermelho'],
}

/** Clube Arte 10: pedidos de plano, planos ativos, encerrados e os planos à venda. */
export function Clube() {
  const mostrarAviso = useAviso()
  const [planos, setPlanos] = useState<PlanoAdmin[] | null>(null)
  const [assinaturas, setAssinaturas] = useState<AssinaturaResumo[]>([])
  const [precoCorte, setPrecoCorte] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [acao, setAcao] = useState<Acao | null>(null)
  const [editando, setEditando] = useState<PlanoAdmin | 'novo' | null>(null)
  const [promocoes, setPromocoes] = useState<PromocaoAdmin[]>([])
  const [editandoPromo, setEditandoPromo] = useState<PromocaoAdmin | 'nova' | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [p, a, s, pr] = await Promise.all([buscarPlanos(), buscarAssinaturas(), buscarServicos(), buscarPromocoes()])
      setPlanos(p)
      setPromocoes(pr)
      setAssinaturas(a)
      setPrecoCorte(precoDoCorteDoPlano(s))
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const pedidos = assinaturas.filter((a) => a.status === 'solicitada')
  const ativos = assinaturas.filter((a) => a.status === 'ativa')
  const encerrados = assinaturas.filter((a) => a.status !== 'solicitada' && a.status !== 'ativa')

  async function confirmar() {
    if (!acao) return
    setOcupado(true)
    try {
      if (acao.tipo === 'excluir_todos') {
        await excluirAssinaturasEncerradas()
        mostrarAviso('Planos encerrados excluídos.')
      } else {
        const a = acao.assinatura
        if (acao.tipo === 'ativar') {
          await ativarAssinatura(a.id)
          mostrarAviso(`Plano de ${a.cliente_nome} ativado!`)
        } else if (acao.tipo === 'encerrar') {
          await encerrarAssinatura(a.id)
          mostrarAviso(a.status === 'solicitada' ? 'Pedido recusado.' : 'Plano cancelado.')
        } else {
          await excluirAssinatura(a.id)
          mostrarAviso(`Plano de ${a.cliente_nome} excluído.`)
        }
      }
      setAcao(null)
      await carregar()
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setOcupado(false)
    }
  }

  const textosAcao = (a: Acao): [string, string, string, boolean] => {
    if (a.tipo === 'excluir_todos') {
      return [
        'Excluir os planos encerrados?',
        'Some da lista todo plano que já acabou, foi cancelado ou recusado. Planos ativos e pedidos continuam. Não pode ser desfeito.',
        'Excluir',
        true,
      ]
    }
    const s = a.assinatura
    if (a.tipo === 'ativar') {
      return [
        'Confirmar pagamento?',
        `${s.cliente_nome} pagou ${moeda(s.preco)} pelo ${s.plano_nome}? Os ${s.cortes_total} cortes passam a valer por ${textoValidade(s.validade_dias)} a partir de agora.`,
        'Sim, recebi',
        false,
      ]
    }
    if (a.tipo === 'encerrar') {
      return [
        s.status === 'solicitada' ? 'Recusar o pedido?' : 'Cancelar o plano?',
        `${s.cliente_nome} deixa de ter o ${s.plano_nome}. Isso não pode ser desfeito.`,
        'Sim',
        true,
      ]
    }
    return ['Excluir do app?', `O ${s.plano_nome} de ${s.cliente_nome}, que já acabou, some da lista.`, 'Sim', true]
  }

  return (
    <div className="p-tela">
      <div className="p-cabecalho">
        <span className="p-cabecalho__sub">Clube Arte 10</span>
        <h1 className="p-cabecalho__titulo">Planos dos clientes</h1>
        <p className="p-texto-suave">
          Quando o cliente pedir um plano pelo app, ele aparece aqui. Confirme depois de receber o pagamento: cada
          corte que ele agendar desconta sozinho.
        </p>
      </div>

      {erro && !planos && <ErroCarregar texto={erro} aoTentar={() => void carregar()} />}
      {!planos && !erro && <Carregando />}

      {planos && (
        <>
          {assinaturas.length === 0 && (
            <Vazio titulo="Nenhum plano ainda" texto="Os pedidos feitos na aba Clube do app dos clientes chegam aqui." />
          )}

          {pedidos.length > 0 && (
            <>
              <TituloSecao>Esperando pagamento ({pedidos.length})</TituloSecao>
              {pedidos.map((a) => (
                <CartaoAssinatura key={a.id} a={a} aoAcao={(tipo) => setAcao({ tipo, assinatura: a })} />
              ))}
            </>
          )}

          {ativos.length > 0 && (
            <>
              <TituloSecao>Planos ativos ({ativos.length})</TituloSecao>
              {ativos.map((a) => (
                <CartaoAssinatura key={a.id} a={a} aoAcao={(tipo) => setAcao({ tipo, assinatura: a })} />
              ))}
            </>
          )}

          {encerrados.length > 0 && (
            <>
              <TituloSecao
                acao={
                  <button type="button" className="link-ouro" onClick={() => setAcao({ tipo: 'excluir_todos' })}>
                    Excluir todos
                  </button>
                }
              >
                Encerrados
              </TituloSecao>
              {encerrados.map((a) => (
                <CartaoAssinatura key={a.id} a={a} aoAcao={(tipo) => setAcao({ tipo, assinatura: a })} />
              ))}
            </>
          )}

          <TituloSecao
            acao={
              <button type="button" className="link-ouro" onClick={() => setEditando('novo')}>
                Novo plano
              </button>
            }
          >
            Planos à venda no site
          </TituloSecao>
          {planos.length === 0 && <Vazio titulo="Nenhum plano à venda" />}
          {planos.map((p) => {
            const { avulso, economia } = contaDoPlano(p, precoCorte)
            return (
              <button key={p.id} type="button" className="p-cartao p-plano" onClick={() => setEditando(p)}>
                <span className="p-plano__topo">
                  <strong>{p.nome}</strong>
                  <span className="p-plano__etiquetas">
                    {!p.ativo && <Etiqueta tom="neutro">Escondido do site</Etiqueta>}
                    {p.destaque && <Etiqueta tom="ouro">Mais escolhido</Etiqueta>}
                  </span>
                </span>
                <span className="p-texto-suave">
                  {moeda(p.preco)} · {p.cortes} cortes · vale {textoValidade(p.validade_dias)} (pago uma vez)
                </span>
                {economia !== null && avulso !== null && (
                  <span className="p-plano__economia">
                    Economia de {moeda(economia)} (avulso {moeda(avulso)})
                  </span>
                )}
                <span className="link-ouro">Editar {p.nome}</span>
              </button>
            )
          })}

          <TituloSecao
            acao={
              <button type="button" className="link-ouro" onClick={() => setEditandoPromo('nova')}>
                Nova promoção
              </button>
            }
          >
            Promoções no site
          </TituloSecao>
          {promocoes.length === 0 && <Vazio titulo="Nenhuma promoção ainda" texto="Crie uma e ela aparece na aba Clube do site." />}
          {promocoes.map((p) => (
            <button key={p.id} type="button" className="p-cartao p-plano" onClick={() => setEditandoPromo(p)}>
              <span className="p-plano__topo">
                <strong>{p.titulo}</strong>
                {!p.ativo && <Etiqueta tom="neutro">Escondida do site</Etiqueta>}
              </span>
              {p.chamada && <span>{p.chamada}</span>}
              {p.itens.length > 0 && <span className="p-texto-suave">{p.itens.join(' · ')}</span>}
              <span className="link-ouro">Editar {p.titulo}</span>
            </button>
          ))}
        </>
      )}

      {editandoPromo && (
        <DialogoPromocao
          promocao={editandoPromo === 'nova' ? null : editandoPromo}
          proximaOrdem={promocoes.reduce((m, p) => Math.max(m, p.ordem), 0) + 1}
          aoFechar={() => setEditandoPromo(null)}
          aoConcluir={(mensagem) => {
            setEditandoPromo(null)
            mostrarAviso(mensagem)
            void carregar()
          }}
        />
      )}

      {acao &&
        (() => {
          const [titulo, texto, rotulo, perigoso] = textosAcao(acao)
          return (
            <Confirmar
              titulo={titulo}
              texto={texto}
              rotuloAcao={rotulo}
              perigoso={perigoso}
              ocupado={ocupado}
              aoConfirmar={() => void confirmar()}
              aoFechar={() => setAcao(null)}
            />
          )
        })()}

      {editando && (
        <DialogoPlano
          plano={editando === 'novo' ? null : editando}
          proximaOrdem={(planos ?? []).reduce((m, p) => Math.max(m, p.ordem), 0) + 1}
          precoCorte={precoCorte}
          aoFechar={() => setEditando(null)}
          aoConcluir={(mensagem) => {
            setEditando(null)
            mostrarAviso(mensagem)
            void carregar()
          }}
        />
      )}
    </div>
  )
}

function CartaoAssinatura({
  a,
  aoAcao,
}: {
  a: AssinaturaResumo
  aoAcao: (tipo: 'ativar' | 'encerrar' | 'excluir') => void
}) {
  const [rotulo, tom] = ROTULO[a.status]
  const restantes = a.cortes_total - a.cortes_usados
  const whats = linkWhatsapp(a.cliente_telefone, `Olá, ${a.cliente_nome}! Aqui é da Barbearia Arte 10 sobre o seu ${a.plano_nome}.`)

  return (
    <div className="p-cartao p-assinatura">
      <div className="p-assinatura__topo">
        <strong>{a.cliente_nome}</strong>
        <Etiqueta tom={tom}>{rotulo}</Etiqueta>
      </div>
      <span>
        {a.plano_nome} · {moeda(a.preco)}
      </span>
      <span className="p-texto-suave">
        {a.status === 'solicitada'
          ? `Pedido em ${carimbo(a.solicitada_em)} · ${telefoneBonito(a.cliente_telefone)}`
          : a.status === 'ativa'
            ? `${restantes} de ${a.cortes_total} cortes restantes · vale até ${a.expira_em ? dataCurtaDoInstante(a.expira_em) : '—'}`
            : `Usou ${a.cortes_usados} de ${a.cortes_total} cortes`}
      </span>
      <div className="p-assinatura__acoes">
        {a.status === 'solicitada' && (
          <button type="button" className="botao botao--ouro" onClick={() => aoAcao('ativar')}>
            Recebi o pagamento
          </button>
        )}
        {whats && (
          <a className="botao botao--contorno" href={whats} target="_blank" rel="noopener noreferrer" aria-label={`Falar com ${a.cliente_nome}`}>
            <IconeWhatsapp tamanho={16} />
          </a>
        )}
        <button type="button" className="link-ouro" onClick={() => aoAcao(a.status === 'solicitada' || a.status === 'ativa' ? 'encerrar' : 'excluir')}>
          {a.status === 'solicitada' ? 'Recusar' : a.status === 'ativa' ? 'Cancelar plano' : 'Excluir do app'}
        </button>
      </div>
    </div>
  )
}

/** Criar ou editar um plano à venda. O site mostra exatamente o que for salvo aqui. */
function DialogoPlano({
  plano,
  proximaOrdem,
  precoCorte,
  aoFechar,
  aoConcluir,
}: {
  plano: PlanoAdmin | null
  proximaOrdem: number
  precoCorte: number | null
  aoFechar: () => void
  aoConcluir: (mensagem: string) => void
}) {
  const [nome, setNome] = useState(plano?.nome ?? '')
  const [chamada, setChamada] = useState(plano?.chamada ?? '')
  const [preco, setPreco] = useState(plano ? String(plano.preco).replace('.', ',') : '')
  const [cortes, setCortes] = useState(plano ? String(plano.cortes) : '')
  const [dias, setDias] = useState(String(plano?.validade_dias ?? 30))
  const [beneficios, setBeneficios] = useState((plano?.beneficios ?? []).join('\n'))
  const [destaque, setDestaque] = useState(plano?.destaque ?? false)
  const [ativo, setAtivo] = useState(plano?.ativo ?? true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)

  const valor = Number(preco.replace(',', '.'))
  const qtd = Number(cortes)
  const validade = Number(dias)
  const avulso = precoCorte !== null && Number.isInteger(qtd) && qtd > 0 ? precoCorte * qtd : null

  async function salvar() {
    const problema =
      nome.trim().length < 2
        ? 'Informe o nome do plano.'
        : !preco.trim() || Number.isNaN(valor) || valor < 0
          ? 'Informe um preço válido.'
          : !Number.isInteger(qtd) || qtd < 1 || qtd > 60
            ? 'Os cortes precisam ficar entre 1 e 60.'
            : !Number.isInteger(validade) || validade < 1 || validade > 365
              ? 'A validade precisa ficar entre 1 e 365 dias.'
              : null
    setErro(problema)
    if (problema) return

    const dados = {
      nome: nome.trim(),
      chamada: chamada.trim() || null,
      preco: valor,
      preco_referencia: avulso ?? plano?.preco_referencia ?? null,
      cortes: qtd,
      validade_dias: validade,
      beneficios: beneficios.split('\n').map((b) => b.trim()).filter(Boolean),
      destaque,
      ativo,
      ordem: plano?.ordem ?? proximaOrdem,
    }
    setSalvando(true)
    try {
      if (plano) await atualizarPlano(plano.id, dados)
      else await criarPlano(dados)
      aoConcluir('Plano salvo. Já aparece assim no site.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    if (!plano) return
    if (!confirmarExclusao) {
      setConfirmarExclusao(true)
      return
    }
    setSalvando(true)
    try {
      await excluirPlano(plano.id)
      aoConcluir(`${plano.nome} excluído.`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir.')
      setConfirmarExclusao(false)
    } finally {
      setSalvando(false)
    }
  }

  const precoSite = Number.isNaN(valor) || !preco.trim() ? '—' : moeda(valor)
  const prazoValido = Number.isInteger(validade) && validade > 0

  return (
    <Folha
      titulo={plano ? 'Editar plano' : 'Novo plano'}
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
      <Campo id="plano-nome" rotulo="Nome (ex.: Plano Elite)" valor={nome} aoMudar={setNome} maximo={60} />
      <Campo id="plano-chamada" rotulo="Frase de destaque (opcional)" valor={chamada} aoMudar={setChamada} maximo={120} />
      <div className="p-duas-colunas">
        <Campo id="plano-preco" rotulo="Preço do plano" valor={preco} aoMudar={setPreco} modo="decimal" />
        <Campo id="plano-cortes" rotulo="Cortes" valor={cortes} aoMudar={(v) => setCortes(v.replace(/\D/g, ''))} modo="numeric" />
      </div>
      <Campo id="plano-dias" rotulo="Validade (dias)" valor={dias} aoMudar={(v) => setDias(v.replace(/\D/g, ''))} modo="numeric" />
      {prazoValido && (
        <p className="campo__dica" style={{ marginTop: -8, marginBottom: 14 }}>
          No site: {precoSite} {sufixoDoPreco(validade)}, pago uma vez. Confira se a frase de destaque combina com esse prazo.
        </p>
      )}

      <div className="campo">
        <label className="campo__rotulo" htmlFor="plano-vantagens">
          Vantagens (uma por linha)
        </label>
        <textarea
          id="plano-vantagens"
          className="campo__entrada"
          rows={4}
          value={beneficios}
          onChange={(e) => setBeneficios(e.target.value)}
        />
      </div>

      <p className="campo__dica" style={{ marginBottom: 14 }}>
        {precoCorte === null
          ? 'Marque em Serviços qual serviço "Desconta do plano" para o app calcular a economia.'
          : avulso === null || Number.isNaN(valor) || !preco.trim()
            ? 'Preencha preço e cortes para ver a economia.'
            : avulso > valor
              ? `Avulso: ${qtd} × ${moeda(precoCorte)} = ${moeda(avulso)}. O cliente economiza ${moeda(avulso - valor)}.`
              : 'Atenção: o plano não sai mais barato que o avulso.'}
      </p>

      <Chave rotulo='Selo "Mais escolhido"' ligado={destaque} aoMudar={setDestaque} />
      <Chave rotulo="Aparece no site" ligado={ativo} aoMudar={setAtivo} />

      {plano && (
        <button type="button" className="botao botao--fantasma p-texto-perigo" onClick={() => void excluir()} disabled={salvando}>
          {confirmarExclusao ? 'Toque de novo para excluir de vez' : 'Excluir este plano'}
        </button>
      )}
      {erro && <p className="campo__erro" style={{ marginTop: 10 }}>{erro}</p>}
    </Folha>
  )
}
