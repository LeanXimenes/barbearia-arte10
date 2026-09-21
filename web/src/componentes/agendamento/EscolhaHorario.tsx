import type { HorarioDoDia } from '../../lib/tipos'
import { dataPorExtenso, hora } from '../../lib/formato'
import { IconeAlerta, IconeAtualizar } from '../Icones'

interface Props {
  data: string
  horarios: HorarioDoDia[]
  carregando: boolean
  erro: boolean
  avisoAtualizacao: boolean
  selecionado: string | null
  aoSelecionar: (horario: string) => void
  aoTentarNovamente: () => void
}

export function EscolhaHorario({
  data,
  horarios,
  carregando,
  erro,
  avisoAtualizacao,
  selecionado,
  aoSelecionar,
  aoTentarNovamente,
}: Props) {
  const livres = horarios.filter((h) => h.disponivel).length

  return (
    <div>
      {avisoAtualizacao && (
        <div className="toque-realtime" role="status">
          <IconeAtualizar tamanho={15} />
          A agenda mudou agora há pouco — a lista abaixo já está atualizada.
        </div>
      )}

      <p className="passo-legenda" style={{ padding: 0, marginBottom: 14 }}>
        {dataPorExtenso(data)}
      </p>

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

      {!carregando && !erro && horarios.length === 0 && (
        <div className="vazio">
          <p className="vazio__titulo">Sem horários neste dia</p>
          <p>Escolha outra data — o dia selecionado não tem mais encaixe para este serviço.</p>
        </div>
      )}

      {!carregando && !erro && horarios.length > 0 && (
        <>
          <div className="grade-horarios" role="group" aria-label="Horários disponíveis">
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
                    <span className="horario__etiqueta">
                      {ocupado ? 'Já agendado' : 'Indisponível'}
                    </span>
                  )}
                  {h.disponivel && (
                    <span className="horario__etiqueta">até {hora(h.horario_fim)}</span>
                  )}
                </button>
              )
            })}
          </div>

          {livres === 0 && (
            <div className="aviso aviso--atencao" style={{ marginTop: 16 }}>
              <IconeAlerta className="aviso__icone" tamanho={18} />
              Todos os horários deste dia já foram preenchidos. Escolha outra data.
            </div>
          )}
        </>
      )}
    </div>
  )
}
