import type { ConfigBarbearia, HorarioFuncionamento } from '../lib/tipos'
import { hora, nomeDoDiaDaSemana } from '../lib/formato'
import { agoraNaBarbearia } from '../lib/relogio'
import { IconeCalendario } from './Icones'

interface Props {
  funcionamento: HorarioFuncionamento[]
  config: ConfigBarbearia | null
  aoAgendar: () => void
}

/** Ordena a semana começando na segunda-feira, como as pessoas leem. */
const ORDEM = [1, 2, 3, 4, 5, 6, 0]

export function SecaoFuncionamento({ funcionamento, config, aoAgendar }: Props) {
  const agora = agoraNaBarbearia(config?.fuso)

  const dias = ORDEM.map((dia) => funcionamento.find((f) => f.dia_semana === dia)).filter(
    (d): d is HorarioFuncionamento => Boolean(d)
  )

  return (
    <section className="secao" id="funcionamento">
      <div className="container">
        <span className="etiqueta">Funcionamento</span>
        <h2 className="titulo-secao">Quando estamos abertos</h2>
        <p className="subtitulo-secao">
          Os horários abaixo são os mesmos que alimentam a agenda: nada aparece para reserva fora
          desta grade.
        </p>

        <div className="funcionamento">
          <div className="cartao horarios-lista">
            {dias.length === 0 && (
              <div className="horarios-lista__item">
                <span className="horarios-lista__valor">Carregando horários…</span>
              </div>
            )}

            {dias.map((dia) => {
              const ehHoje = dia.dia_semana === agora.diaSemana
              return (
                <div
                  key={dia.dia_semana}
                  className={`horarios-lista__item ${ehHoje ? 'horarios-lista__item--hoje' : ''}`}
                >
                  <span className="horarios-lista__dia">
                    {nomeDoDiaDaSemana(dia.dia_semana)}
                    {ehHoje && <span className="marcador-hoje">Hoje</span>}
                  </span>

                  {dia.aberto && dia.abre && dia.fecha ? (
                    <span className="horarios-lista__valor">
                      {hora(dia.abre)} — {hora(dia.fecha)}
                      {dia.intervalo_inicio && dia.intervalo_fim && (
                        <>
                          <br />
                          <small style={{ opacity: 0.7 }}>
                            intervalo {hora(dia.intervalo_inicio)} — {hora(dia.intervalo_fim)}
                          </small>
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="horarios-lista__valor horarios-lista__valor--fechado">
                      Fechado
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="cartao painel-agendar">
            <IconeCalendario tamanho={30} className="destaque__icone" />
            <h3 className="painel-agendar__titulo">Veja os horários livres</h3>
            <p style={{ color: 'var(--texto-suave)', fontSize: '0.94rem' }}>
              A disponibilidade é conferida no servidor na hora de confirmar. Se alguém marcar
              antes de você, o site avisa e mostra as opções que sobraram.
            </p>
            <button type="button" className="botao botao--ouro botao--bloco" onClick={aoAgendar}>
              Ver horários disponíveis
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
