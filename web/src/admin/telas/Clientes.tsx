import { useCallback, useEffect, useState } from 'react'
import { apagarCliente, clientes as buscarClientes } from '../api'
import type { ClienteResumo } from '../tipos'
import { carimbo } from '../formatoPainel'
import { linkWhatsapp, telefoneBonito } from '../../lib/formato'
import { Carregando, Confirmar, ErroCarregar, Etiqueta, Vazio, useAviso } from '../componentes'
import { IconeWhatsapp } from '../../componentes/Icones'

/** "Quem já passou pela cadeira": busca, visitas, faltas e apagar cliente. */
export function Clientes() {
  const mostrarAviso = useAviso()
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState<ClienteResumo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [apagar, setApagar] = useState<ClienteResumo | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async (texto: string) => {
    try {
      setLista(await buscarClientes(texto))
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
    }
  }, [])

  // Busca enquanto digita, sem disparar a cada letra.
  useEffect(() => {
    const t = window.setTimeout(() => void carregar(busca), busca ? 300 : 0)
    return () => window.clearTimeout(t)
  }, [busca, carregar])

  async function confirmarApagar() {
    if (!apagar) return
    setOcupado(true)
    try {
      await apagarCliente(apagar.id)
      mostrarAviso(`${apagar.nome} foi apagado.`)
      setApagar(null)
      await carregar(busca)
    } catch (e) {
      mostrarAviso(e instanceof Error ? e.message : 'Não foi possível apagar.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="p-tela">
      <div className="p-cabecalho">
        <span className="p-cabecalho__sub">Clientes</span>
        <h1 className="p-cabecalho__titulo">Quem já passou pela cadeira</h1>
      </div>

      <input
        className="campo__entrada p-busca"
        type="search"
        placeholder="Buscar por nome ou telefone"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {erro && !lista && <ErroCarregar texto={erro} aoTentar={() => void carregar(busca)} />}
      {!lista && !erro && <Carregando />}

      {lista && lista.length === 0 && (
        <Vazio
          titulo={busca ? 'Nada encontrado' : 'Nenhum cliente ainda'}
          texto={
            busca
              ? 'Tente outro nome ou telefone.'
              : 'Os clientes aparecem aqui assim que fizerem o primeiro agendamento pelo site.'
          }
        />
      )}

      {lista && lista.length > 0 && (
        <ul className="p-lista">
          {lista.map((c) => {
            const whats = linkWhatsapp(c.telefone, `Olá, ${c.nome}! Aqui é da Barbearia Arte 10.`)
            return (
              <li key={c.id} className="p-cartao p-cliente">
                <div className="p-cliente__topo">
                  <span className="p-cliente__avatar" aria-hidden>
                    {c.nome.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="p-cliente__dados">
                    <strong>{c.nome}</strong>
                    <span className="p-texto-suave">
                      {telefoneBonito(c.telefone)} · {c.total_agendamentos}{' '}
                      {c.total_agendamentos === 1 ? 'visita' : 'visitas'}
                    </span>
                  </span>
                  {whats && (
                    <a className="p-icone-botao" href={whats} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${c.nome}`}>
                      <IconeWhatsapp tamanho={18} />
                    </a>
                  )}
                </div>
                <div className="p-cliente__info">
                  {c.proximo_horario && <Etiqueta tom="ouro">Próximo {carimbo(c.proximo_horario)}</Etiqueta>}
                  {c.faltas > 0 && <Etiqueta tom="vermelho">{c.faltas === 1 ? '1 falta' : `${c.faltas} faltas`}</Etiqueta>}
                </div>
                {c.ultima_visita && <span className="p-texto-suave">Última visita: {carimbo(c.ultima_visita)}</span>}
                <button type="button" className="link-ouro p-hist__apagar" onClick={() => setApagar(c)}>
                  Apagar {c.nome}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {apagar && (
        <Confirmar
          titulo={`Apagar ${apagar.nome}?`}
          texto="Some da lista de clientes junto com as visitas antigas. Se ele agendar de novo pelo site, volta como cliente novo. Não pode ser desfeito."
          rotuloAcao="Apagar"
          perigoso
          ocupado={ocupado}
          aoConfirmar={() => void confirmarApagar()}
          aoFechar={() => setApagar(null)}
        />
      )}
    </div>
  )
}
