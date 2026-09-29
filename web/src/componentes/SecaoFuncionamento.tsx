import type { ConfigBarbearia, HorarioFuncionamento } from '../lib/tipos'
import { hora } from '../lib/formato'
import { agruparFuncionamento } from '../lib/funcionamento'
import { agoraNaBarbearia } from '../lib/relogio'
import { IconeCalendario } from './Icones'

interface Props {
  funcionamento: HorarioFuncionamento[]
  config: ConfigBarbearia | null
  aoAgendar: () => void
}

export function SecaoFuncionamento({ funcionamento, config, aoAgendar }: Props) {
  const agora = agoraNaBarbearia(config?.fuso)

  // Dias seguidos com o mesmo horário viram uma linha só ("Segunda a sexta").
  const grupos = agruparFuncionamento(funcionamento)

  return (
    <div className="container aba__conteudo">
      <span className="etiqueta">Horários</span>
      <h2 className="titulo-secao">Quando estamos abertos</h2>

      <div className="funcionamento">
        <div className="cartao horarios-lista">
          {grupos.length === 0 && (
            <div className="horarios-lista__item">
              <span className="horarios-lista__valor">Carregando horários…</span>
            </div>
          )}

          {grupos.map((grupo) => {
            const ehHoje = grupo.dias.includes(agora.diaSemana)
            return (
              <div
                key={grupo.dias.join('-')}
                className={`horarios-lista__item ${ehHoje ? 'horarios-lista__item--hoje' : ''}`}
              >
                <span className="horarios-lista__dia">
                  {grupo.rotulo}
                  {ehHoje && <span className="marcador-hoje">Hoje</span>}
                </span>

                {grupo.aberto && grupo.abre && grupo.fecha ? (
                  <span className="horarios-lista__valor">
                    {hora(grupo.abre)} — {hora(grupo.fecha)}
                    {grupo.intervaloInicio && grupo.intervaloFim && (
                      <>
                        <br />
                        <small style={{ opacity: 0.7 }}>
                          intervalo {hora(grupo.intervaloInicio)} — {hora(grupo.intervaloFim)}
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
          <IconeCalendario tamanho={26} className="destaque__icone so-desktop" />
          <p className="painel-agendar__titulo">Veja os horários livres</p>
          <p className="painel-agendar__texto">A agenda mostra na hora só o que ainda está vago.</p>
          <button type="button" className="botao botao--ouro botao--bloco" onClick={aoAgendar}>
            Ver horários disponíveis
          </button>
        </div>
      </div>
    </div>
  )
}
