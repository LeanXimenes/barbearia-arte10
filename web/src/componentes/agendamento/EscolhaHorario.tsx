import type { DiaDisponivel, HorarioDoDia } from '../../lib/tipos'
import { hora } from '../../lib/formato'
import { rotuloDoDia } from '../../lib/diaEscolhido'
import { IconeAlerta, IconeAtualizar, IconeAvancar, IconeCalendario } from '../Icones'

interface Props {
  data: string
  hoje: string
  /** Se o dia abre e quantos horários livres tem (null enquanto carrega). */
  infoDoDia: DiaDisponivel | null
  /** Próximo dia com horário livre, para o atalho quando este está cheio. */
  proximoLivre: string | null
  horarios: HorarioDoDia[]
  carregando: boolean
  erro: boolean
  avisoAtualizacao: boolean
  selecionado: string | null
  aoSelecionar: (horario: string) => void
  aoTentarNovamente: () => void
  aoEscolherOutroDia: () => void
  aoIrParaDia: (data: string) => void
}

export function EscolhaHorario({
  data,
  hoje,
  infoDoDia,
  proximoLivre,
  horarios,
  carregando,
  erro,
  avisoAtualizacao,
  selecionado,
  aoSelecionar,
  aoTentarNovamente,
  aoEscolherOutroDia,
  aoIrParaDia,
}: Props) {
  const livres = horarios.filter((h) => h.disponivel).length
  const dia = rotuloDoDia(data, hoje)
  const ehHoje = data === hoje
  const fechado = infoDoDia !== null && !infoDoDia.aberto
  const semVaga = !carregando && !erro && livres === 0

  const proximo = proximoLivre ? rotuloDoDia(proximoLivre, hoje) : null

  return (
    <div>
      {avisoAtualizacao && (
        <div className="toque-realtime" role="status">
          <IconeAtualizar tamanho={15} />
          A agenda mudou agora há pouco — a lista abaixo já está atualizada.
        </div>
      )}

      <div className="dia-escolhido">
        <div className="dia-escolhido__linha">
          <span className="dia-escolhido__icone" aria-hidden>
            <IconeCalendario tamanho={20} />
          </span>
          <span className="dia-escolhido__texto">
            <span className="dia-escolhido__titulo">{dia.titulo}</span>
            <span className="dia-escolhido__sub">{dia.subtitulo}</span>
          </span>
          {!carregando && !erro && livres > 0 && (
            <span className="dia-escolhido__livres">
              {livres} {livres === 1 ? 'livre' : 'livres'}
            </span>
          )}
        </div>
        <button type="button" className="botao-outro-dia" onClick={aoEscolherOutroDia}>
          <IconeCalendario tamanho={18} />
          Escolher outro dia
        </button>
      </div>

      {carregando && (
        <div className="carregando-grade" aria-hidden>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="esqueleto" />
          ))}
        </div>
      )}

      {!carregando && erro && (
        <div className="aviso aviso--erro" role="alert">
          <IconeAlerta className="aviso__icone" tamanho={18} />
          <span>
            Não conseguimos carregar os horários.{' '}
            <button type="button" className="botao botao--fantasma" onClick={aoTentarNovamente}>
              Tentar novamente
            </button>
          </span>
        </div>
      )}

      {semVaga && (
        <div className="vazio vazio--dia">
          <p className="vazio__titulo">
            {fechado
              ? `A barbearia não abre ${ehHoje ? 'hoje' : 'neste dia'}`
              : ehHoje
                ? 'Hoje não tem mais horário livre'
                : 'Esse dia já está sem horário livre'}
          </p>
          {proximoLivre && proximo ? (
            <button
              type="button"
              className="botao botao--ouro botao--bloco proximo-livre"
              onClick={() => aoIrParaDia(proximoLivre)}
            >
              <span className="proximo-livre__texto">
                <span className="proximo-livre__rotulo">Próximo dia com horário</span>
                <span>
                  {proximo.titulo} · {proximo.subtitulo}
                </span>
              </span>
              <IconeAvancar tamanho={18} />
            </button>
          ) : (
            <p>Toque em “Escolher outro dia” para ver o calendário.</p>
          )}
        </div>
      )}

      {!carregando && !erro && livres > 0 && (
        <div className="grade-horarios" role="group" aria-label="Horários do dia">
          {horarios.map((h) => {
            const valor = hora(h.horario)
            const ocupado = h.motivo === 'ocupado'

            return (
              <button
                key={h.horario}
                type="button"
                disabled={!h.disponivel}
                onClick={() => aoSelecionar(valor)}
                className={[
                  'horario',
                  !h.disponivel ? 'horario--indisponivel' : '',
                  selecionado === valor ? 'horario--selecionado' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={
                  h.disponivel
                    ? `${valor}, disponível`
                    : `${valor}, indisponível — ${ocupado ? 'já agendado' : 'bloqueado'}`
                }
              >
                <span className="horario__hora">{valor}</span>
                {!h.disponivel && (
                  <span className="horario__etiqueta">{ocupado ? 'Já agendado' : 'Indisponível'}</span>
                )}
                {h.disponivel && <span className="horario__etiqueta">até {hora(h.horario_fim)}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
