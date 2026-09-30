import type { AgendamentoConfirmado, DadosBarbearia } from '../../lib/tipos'
import {
  dataPorExtenso,
  dataCurtaDoInstante,
  duracao,
  linkMapa,
  linkWhatsapp,
  moeda,
  telefoneBonito,
} from '../../lib/formato'
import { IconeCheck, IconeLocal, IconeWhatsapp } from '../Icones'

interface Props {
  agendamento: AgendamentoConfirmado
  barbearia: DadosBarbearia
}

export function Confirmacao({ agendamento, barbearia }: Props) {
  const mapa = linkMapa({
    mapa_url: barbearia.mapa_url,
    endereco: barbearia.endereco,
    cidade: barbearia.cidade,
    uf: barbearia.uf,
  })

  const whats = linkWhatsapp(
    barbearia.telefone_whatsapp,
    `Olá! Sou ${agendamento.cliente}, confirmei o horário de ${agendamento.horario_inicio} ` +
      `para ${agendamento.servico} (código ${agendamento.codigo}).`,
  )

  const endereco = [barbearia.endereco, barbearia.cidade, barbearia.uf].filter(Boolean).join(' · ')

  return (
    <div className="confirmado">
      <div className="confirmado__selo">
        <IconeCheck tamanho={34} />
      </div>

      <h3 className="confirmado__titulo">Agendamento confirmado!</h3>
      <p className="confirmado__texto">
        Seu horário está reservado e já apareceu na agenda da barbearia.
      </p>
      <span className="confirmado__codigo">Código {agendamento.codigo}</span>

      <div className="confirmado__cartao">
        <div className="confirmado__cabecalho">
          <img src="/logo-arte10-mini.jpg" alt="" width={38} height={38} />
          <span className="confirmado__marca">{barbearia.nome || 'Barbearia Arte 10'}</span>
        </div>

        <div className="confirmado__corpo">
          <div className="revisao__linha">
            <span className="revisao__rotulo">Nome</span>
            <span className="revisao__valor">{agendamento.cliente}</span>
          </div>
          <div className="revisao__linha">
            <span className="revisao__rotulo">Telefone</span>
            <span className="revisao__valor">{telefoneBonito(agendamento.telefone)}</span>
          </div>
          <div className="revisao__linha">
            <span className="revisao__rotulo">Serviço</span>
            <span className="revisao__valor">{agendamento.servico}</span>
          </div>
          <div className="revisao__linha">
            <span className="revisao__rotulo">Data</span>
            <span className="revisao__valor">{dataPorExtenso(agendamento.data)}</span>
          </div>
          <div className="revisao__linha">
            <span className="revisao__rotulo">Horário</span>
            <span className="revisao__valor revisao__valor--destaque">
              {agendamento.horario_inicio} — {agendamento.horario_fim}
            </span>
          </div>
          <div className="revisao__linha">
            <span className="revisao__rotulo">Duração</span>
            <span className="revisao__valor">{duracao(agendamento.duracao_minutos)}</span>
          </div>
          <div className="revisao__linha">
            <span className="revisao__rotulo">Valor</span>
            <span className="revisao__valor">{moeda(agendamento.preco)}</span>
          </div>
        </div>

        {(endereco || barbearia.telefone_whatsapp) && (
          <div className="confirmado__rodape">
            {endereco && (
              <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <IconeLocal tamanho={15} />
                {endereco}
              </span>
            )}
            {barbearia.telefone_whatsapp && (
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <IconeWhatsapp tamanho={15} />
                {telefoneBonito(barbearia.telefone_whatsapp)}
              </span>
            )}
          </div>
        )}
      </div>

      {agendamento.plano && (
        <div className="aviso-plano aviso-plano--confirmado" role="status">
          <strong>
            {agendamento.plano.nome}: {agendamento.plano.numero}º corte de {agendamento.plano.total}
          </strong>
          {agendamento.plano.restantes > 0 ? (
            <span>
              Ainda restam {agendamento.plano.restantes}{' '}
              {agendamento.plano.restantes === 1 ? 'corte' : 'cortes'} no seu plano, válido até{' '}
              {dataCurtaDoInstante(agendamento.plano.expira_em)}.
            </span>
          ) : (
            <span>Esse foi o último corte do seu plano. Renove na aba Clube!</span>
          )}
        </div>
      )}

      <p className="campo__dica" style={{ marginTop: 16 }}>
        Chegue com alguns minutos de antecedência. Se precisar remarcar, fale com a barbearia.
      </p>

      {(mapa || whats) && (
        <div className="hero__botoes" style={{ marginTop: 18 }}>
          {mapa && (
            <a
              href={mapa}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao--contorno"
            >
              Como chegar
            </a>
          )}
          {whats && (
            <a
              href={whats}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao--contorno"
            >
              <IconeWhatsapp tamanho={16} />
              Falar no WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  )
}
