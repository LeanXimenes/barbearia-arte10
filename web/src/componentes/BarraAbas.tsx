import { ABAS, type IdAba } from '../lib/abas'
import {
  IconeCelular,
  IconeCoroa,
  IconeInicio,
  IconeLocal,
  IconeRelogio,
  IconeTesoura,
} from './Icones'

const ICONES: Record<IdAba, typeof IconeInicio> = {
  inicio: IconeInicio,
  servicos: IconeTesoura,
  clube: IconeCoroa,
  horarios: IconeRelogio,
  contato: IconeLocal,
  app: IconeCelular,
}

interface Props {
  aba: number
  total: number
  aoTrocarAba: (indice: number) => void
}

/** Abas no rodapé, só no celular (no computador elas ficam no cabeçalho). */
export function BarraAbas({ aba, total, aoTrocarAba }: Props) {
  return (
    <nav className="barra-abas" aria-label="Seções do site">
      {ABAS.slice(0, total).map((item, i) => {
        const Icone = ICONES[item.id]
        return (
          <button
            key={item.id}
            type="button"
            className={`barra-abas__item ${i === aba ? 'barra-abas__item--ativo' : ''}`}
            aria-current={i === aba ? 'page' : undefined}
            onClick={() => aoTrocarAba(i)}
          >
            <Icone tamanho={21} />
            {item.texto}
          </button>
        )
      })}
    </nav>
  )
}
