import { useEffect, useState } from 'react'
import type { Assinatura, Servico } from '../../lib/tipos'
import type { ClienteSalvo } from '../../lib/clienteSalvo'
import { consultarMeuPlano } from '../../servicos/api'
import {
  dataCurta,
  duracao,
  mascararTelefone,
  moeda,
  nomeValido,
  telefoneBonito,
  telefoneValido,
} from '../../lib/formato'
import { IconeUsuario } from '../Icones'

interface Props {
  servico: Servico
  data: string
  horario: string
  horarioFim: string
  nome: string
  telefone: string
  tentouEnviar: boolean
  /** Cliente lembrado neste celular (do último agendamento). */
  salvo: ClienteSalvo | null
  usandoSalvo: boolean
  aoUsarOutro: () => void
  aoUsarSalvo: () => void
  aoMudarNome: (valor: string) => void
  aoMudarTelefone: (valor: string) => void
}

export function FormularioDados({
  servico,
  data,
  horario,
  horarioFim,
  nome,
  telefone,
  tentouEnviar,
  salvo,
  usandoSalvo,
  aoUsarOutro,
  aoUsarSalvo,
  aoMudarNome,
  aoMudarTelefone,
}: Props) {
  const nomeRuim = tentouEnviar && !nomeValido(nome)
  const telefoneRuim = tentouEnviar && !telefoneValido(telefone)
  const plano = usePlanoDoTelefone(servico.usa_plano ? telefone : '')

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

      {usandoSalvo && salvo ? (
        <div className="cliente-salvo">
          <span className="cliente-salvo__icone">
            <IconeUsuario tamanho={18} />
          </span>
          <span className="cliente-salvo__dados">
            <span className="cliente-salvo__rotulo">Agendando como</span>
            <span className="cliente-salvo__nome">{salvo.nome}</span>
            <span className="cliente-salvo__tel">{telefoneBonito(salvo.telefone)}</span>
          </span>
          <button
            type="button"
            className="botao botao--fantasma cliente-salvo__trocar"
            onClick={aoUsarOutro}
          >
            Usar outro nome e número
          </button>
        </div>
      ) : (
        <>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="campo-nome">
              Seu nome
            </label>
            <input
              id="campo-nome"
              className={`campo__entrada ${nomeRuim ? 'campo__entrada--erro' : ''}`}
              type="text"
              autoComplete="name"
              maxLength={80}
              placeholder="Como podemos te chamar?"
              value={nome}
              onChange={(e) => aoMudarNome(e.target.value)}
              aria-invalid={nomeRuim}
            />
            {nomeRuim && <span className="campo__erro">Informe seu nome (mínimo 2 letras).</span>}
          </div>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="campo-telefone">
              WhatsApp / telefone
            </label>
            <input
              id="campo-telefone"
              className={`campo__entrada ${telefoneRuim ? 'campo__entrada--erro' : ''}`}
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="(00) 00000-0000"
              value={telefone}
              onChange={(e) => aoMudarTelefone(mascararTelefone(e.target.value))}
              aria-invalid={telefoneRuim}
            />
            {telefoneRuim ? (
              <span className="campo__erro">Informe um telefone válido com DDD.</span>
            ) : (
              <span className="campo__dica">Usamos só para identificar o seu agendamento.</span>
            )}
          </div>

          {salvo && (
            <button
              type="button"
              className="botao botao--fantasma cliente-salvo__voltar"
              onClick={aoUsarSalvo}
            >
              Voltar para {salvo.nome.split(' ')[0]}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** Plano ativo com cortes para este telefone (para avisar antes de confirmar). */
function usePlanoDoTelefone(telefone: string): Assinatura | null {
  const [plano, setPlano] = useState<Assinatura | null>(null)

  useEffect(() => {
    setPlano(null)
    if (!telefoneValido(telefone)) return
    let vivo = true
    const t = window.setTimeout(() => {
      consultarMeuPlano(telefone)
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
  }, [telefone])

  return plano
}
