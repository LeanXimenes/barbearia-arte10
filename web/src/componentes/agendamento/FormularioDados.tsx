import type { Servico } from '../../lib/tipos'
import { dataCurta, duracao, mascararTelefone, moeda, nomeValido, telefoneValido } from '../../lib/formato'

interface Props {
  servico: Servico
  data: string
  horario: string
  horarioFim: string
  nome: string
  telefone: string
  tentouEnviar: boolean
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
  aoMudarNome,
  aoMudarTelefone,
}: Props) {
  const nomeRuim = tentouEnviar && !nomeValido(nome)
  const telefoneRuim = tentouEnviar && !telefoneValido(telefone)

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
          <span className="revisao__valor revisao__valor--destaque">{moeda(servico.preco)}</span>
        </div>
      </div>

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
    </div>
  )
}
