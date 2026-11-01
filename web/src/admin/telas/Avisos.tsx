import { useEffect, useState } from 'react'
import { ativarAvisos, desativarAvisos, estadoDosAvisos, type EstadoAvisos } from '../push'
import { useAviso } from '../componentes'
import { IconeAlerta, IconeCheck, IconeCompartilhar } from '../../componentes/Icones'

/**
 * Cartão dos avisos de novo agendamento neste aparelho.
 * No Início só aparece enquanto não estiver ativo; nos Ajustes, sempre.
 */
export function CartaoAvisos({ sempre = false }: { sempre?: boolean }) {
  const mostrarAviso = useAviso()
  const [estado, setEstado] = useState<EstadoAvisos>('verificando')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    estadoDosAvisos()
      .then(setEstado)
      .catch(() => setEstado('sem_suporte'))
  }, [])

  if (estado === 'verificando') return null
  if (estado === 'ativo' && !sempre) return null

  async function ativar() {
    setOcupado(true)
    try {
      const novo = await ativarAvisos()
      setEstado(novo)
      if (novo === 'ativo') mostrarAviso('Pronto! Os novos agendamentos vão avisar neste aparelho.')
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'Não foi possível ativar os avisos.')
    } finally {
      setOcupado(false)
    }
  }

  async function desativar() {
    setOcupado(true)
    await desativarAvisos()
    setEstado(await estadoDosAvisos().catch(() => 'pode_ativar' as const))
    setOcupado(false)
    mostrarAviso('Avisos desligados neste aparelho.')
  }

  if (estado === 'ativo') {
    return (
      <div className="p-cartao p-avisos p-avisos--ativo">
        <IconeCheck tamanho={20} />
        <div className="p-avisos__texto">
          <strong>Avisos ligados neste aparelho</strong>
          <span>Quando alguém agendar, chega uma notificação na hora.</span>
        </div>
        <button type="button" className="link-ouro" onClick={() => void desativar()} disabled={ocupado}>
          Desligar
        </button>
      </div>
    )
  }

  return (
    <div className="p-cartao p-avisos">
      <IconeAlerta tamanho={20} />
      <div className="p-avisos__texto">
        <strong>Avisos de novo agendamento</strong>
        {estado === 'precisa_instalar' && (
          <span>
            No iPhone, os avisos só funcionam com o painel na Tela de Início: no Safari, toque em{' '}
            <IconeCompartilhar tamanho={14} /> <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b> e abra o
            painel pelo ícone novo.
          </span>
        )}
        {estado === 'sem_suporte' && (
          <span>
            Este navegador não recebe avisos. No iPhone, atualize para o iOS 16.4 ou mais novo e use o painel
            pela Tela de Início.
          </span>
        )}
        {estado === 'sem_chave' && <span>Os avisos ainda não foram configurados no site (chave do iPhone).</span>}
        {estado === 'bloqueado' && (
          <span>
            Os avisos foram bloqueados. No iPhone: <b>Ajustes → Notificações → Arte 10 Painel → Permitir</b>.
          </span>
        )}
        {estado === 'pode_ativar' && <span>Ative para saber na hora quando alguém agendar pelo site.</span>}
      </div>
      {estado === 'pode_ativar' && (
        <button type="button" className="botao botao--ouro" onClick={() => void ativar()} disabled={ocupado}>
          {ocupado ? <span className="girando" /> : 'Ativar avisos'}
        </button>
      )}
    </div>
  )
}
