import { useConta } from '../../hooks/useConta'
import { rotuloDoDia } from '../../lib/diaEscolhido'
import { dataDeTexto, nomeDoMes } from '../../lib/formato'
import { agoraNaBarbearia } from '../../lib/relogio'
import { IconeAvancar } from '../Icones'

/** Na tela inicial: "Seu próximo horário" de quem marcou pela conta. */
export function AvisoProximoHorario({ fuso, aoAbrir }: { fuso?: string; aoAbrir: () => void }) {
  const { proximos } = useConta()
  const agora = Date.now()
  const proximo = proximos.find((a) => !a.cancelado && new Date(a.fim_em).getTime() > agora)
  if (!proximo) return null

  const dia = dataDeTexto(proximo.data)
  const rotulo = rotuloDoDia(proximo.data, agoraNaBarbearia(fuso).data)
  const comecou = new Date(proximo.inicio_em).getTime() <= agora

  return (
    <button type="button" className="aviso-horario" onClick={aoAbrir}>
      <span className="aviso-horario__data" aria-hidden>
        <span className="aviso-horario__dia">{dia.getDate()}</span>
        <span className="aviso-horario__mes">{nomeDoMes(dia.getMonth()).slice(0, 3)}</span>
      </span>
      <span className="aviso-horario__texto">
        <span className="aviso-horario__rotulo">{comecou ? 'É agora!' : 'Seu próximo horário'}</span>
        <span className="aviso-horario__principal">
          {rotulo.titulo} às {proximo.horario_inicio}
        </span>
        <span>
          {proximo.servico} · toque para ver ou cancelar
        </span>
      </span>
      <IconeAvancar tamanho={18} />
    </button>
  )
}
