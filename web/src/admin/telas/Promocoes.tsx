import { useState } from 'react'
import { atualizarPromocao, criarPromocao, excluirPromocao } from '../api'
import type { PromocaoAdmin } from '../tipos'
import { Campo, Chave, Folha } from '../componentes'

/** Criar ou editar uma promoção. O site mostra exatamente o que for salvo aqui. */
export function DialogoPromocao({
  promocao,
  proximaOrdem,
  aoFechar,
  aoConcluir,
}: {
  promocao: PromocaoAdmin | null
  proximaOrdem: number
  aoFechar: () => void
  aoConcluir: (mensagem: string) => void
}) {
  const [titulo, setTitulo] = useState(promocao?.titulo ?? '')
  const [chamada, setChamada] = useState(promocao?.chamada ?? '')
  const [descricao, setDescricao] = useState(promocao?.descricao ?? '')
  const [itens, setItens] = useState((promocao?.itens ?? []).join('\n'))
  const [observacao, setObservacao] = useState(promocao?.observacao ?? '')
  const [ativo, setAtivo] = useState(promocao?.ativo ?? true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)

  async function salvar() {
    const nome = titulo.trim()
    if (nome.length < 2 || nome.length > 40) {
      setErro('O título precisa ter entre 2 e 40 letras.')
      return
    }
    setErro(null)
    setSalvando(true)
    const dados = {
      titulo: nome,
      chamada: chamada.trim() || null,
      descricao: descricao.trim() || null,
      itens: itens.split('\n').map((i) => i.trim()).filter(Boolean),
      observacao: observacao.trim() || null,
      ativo,
      ordem: promocao?.ordem ?? proximaOrdem,
    }
    try {
      if (promocao) await atualizarPromocao(promocao.id, dados)
      else await criarPromocao(dados)
      aoConcluir(ativo ? 'Promoção salva. Já aparece assim no site.' : 'Promoção salva (escondida do site).')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    if (!promocao) return
    if (!confirmarExclusao) {
      setConfirmarExclusao(true)
      return
    }
    setSalvando(true)
    try {
      await excluirPromocao(promocao.id)
      aoConcluir(`${promocao.titulo} excluída.`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir.')
      setConfirmarExclusao(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha
      titulo={promocao ? 'Editar promoção' : 'Nova promoção'}
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
      <Campo id="promo-titulo" rotulo="Título (ex.: Terça do corte)" valor={titulo} aoMudar={setTitulo} maximo={40} />
      <Campo id="promo-chamada" rotulo="Frase de destaque (opcional)" valor={chamada} aoMudar={setChamada} maximo={120} />
      <div className="campo">
        <label className="campo__rotulo" htmlFor="promo-descricao">
          Descrição (opcional)
        </label>
        <textarea id="promo-descricao" className="campo__entrada" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </div>
      <div className="campo">
        <label className="campo__rotulo" htmlFor="promo-itens">
          O que está incluído (um por linha)
        </label>
        <textarea id="promo-itens" className="campo__entrada" rows={4} value={itens} onChange={(e) => setItens(e.target.value)} />
      </div>
      <Campo
        id="promo-obs"
        rotulo="Letra miúda (opcional)"
        valor={observacao}
        aoMudar={setObservacao}
        placeholder="Ex.: válido de segunda a quinta"
        maximo={200}
      />
      <Chave rotulo="Aparece no site" ligado={ativo} aoMudar={setAtivo} />

      {promocao && (
        <button type="button" className="botao botao--fantasma p-texto-perigo" onClick={() => void excluir()} disabled={salvando}>
          {confirmarExclusao ? 'Toque de novo para excluir de vez' : 'Excluir esta promoção'}
        </button>
      )}
      {erro && <p className="campo__erro" style={{ marginTop: 10 }}>{erro}</p>}
    </Folha>
  )
}
