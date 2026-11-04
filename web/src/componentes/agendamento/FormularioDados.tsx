import { useEffect, useState } from 'react'
import type { Assinatura, Conta, Servico } from '../../lib/tipos'
import { consultarMeuPlano } from '../../servicos/api'
import { useConta } from '../../hooks/useConta'
import { dataCurta, duracao, moeda, telefoneBonito } from '../../lib/formato'

interface Props {
  servico: Servico
  data: string
  horario: string
  horarioFim: string
  /** O agendamento sai no nome e no número da conta: nada para digitar. */
  conta: Conta
}

/** Último passo do agendamento: revisão e "Agendando pela sua conta". */
export function FormularioDados({ servico, data, horario, horarioFim, conta }: Props) {
  const { token } = useConta()
  const plano = usePlanoDaConta(servico.usa_plano ? token : null)

  return (
    <div>
      <div className="revisao">
        <div className="revisao__linha">
          <span className="revisao__rotulo">Serviço</span>
          <span className="revisao__valor">{servico.nome}</span>
        </div>
        <div className="revisao__linha">
          <span className="revisao__rotulo">Data</span>
          <span className="revisao__valor">{dataCurta(data)}</span>
        </div>
        <div className="revisao__linha">
          <span className="revisao__rotulo">Horário</span>
          <span className="revisao__valor">
            {horario} — {horarioFim}
          </span>
        </div>
        <div className="revisao__linha">
          <span className="revisao__rotulo">Duração</span>
          <span className="revisao__valor">{duracao(servico.duracao_minutos)}</span>
        </div>
        <div className="revisao__linha">
          <span className="revisao__rotulo">Valor</span>
          <span className="revisao__valor revisao__valor--destaque">
            {plano ? 'Pelo plano' : moeda(servico.preco)}
          </span>
        </div>
      </div>

      {plano && (
        <div className="aviso-plano" role="status">
          <strong>{plano.plano}</strong>: este corte usa 1 dos seus cortes. Você tem{' '}
          {plano.restantes} de {plano.cortes_total}.
        </div>
      )}

      <div className="cliente-salvo">
        <span className="cliente-salvo__icone cliente-salvo__icone--conta" aria-hidden>
          {conta.nome.trim().charAt(0).toUpperCase()}
        </span>
        <span className="cliente-salvo__dados">
          <span className="cliente-salvo__rotulo">Agendando pela sua conta</span>
          <span className="cliente-salvo__nome">{conta.nome}</span>
          <span className="cliente-salvo__tel">{telefoneBonito(conta.telefone)}</span>
        </span>
      </div>
    </div>
  )
}

/** Plano ativo com cortes da conta logada (para avisar antes de confirmar). */
function usePlanoDaConta(token: string | null): Assinatura | null {
  const [plano, setPlano] = useState<Assinatura | null>(null)

  useEffect(() => {
    setPlano(null)
    if (!token) return
    let vivo = true
    const t = window.setTimeout(() => {
      consultarMeuPlano(token)
        .then((p) => {
          if (vivo && p && p.status === 'ativa' && p.restantes > 0) setPlano(p)
        })
        .catch(() => {
          // Sem o aviso não tem problema: o banco desconta do mesmo jeito.
        })
    }, 400)
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
  }, [token])

  return plano
}
