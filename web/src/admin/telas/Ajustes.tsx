import { useCallback, useEffect, useState } from 'react'
import { config as buscarConfig, funcionamento as buscarFuncionamento, sair, salvarConfig, salvarFuncionamento } from '../api'
import type { ConfigBarbearia, HorarioFuncionamento } from '../tipos'
import { horaValida, mascararHora } from '../formatoPainel'
import { hora, nomeDoDiaDaSemana, telefoneBonito } from '../../lib/formato'
import { Campo, Carregando, Chave, ErroCarregar, Folha, TituloSecao, useAviso } from '../componentes'
import { CartaoAvisos } from './Avisos'
import { IconeRelogio } from '../../componentes/Icones'
import { desativarAvisos } from '../push'

/** Como a barbearia funciona: expediente, dados e avisos deste aparelho. */
export function Ajustes({ email, aoAbrirHistorico }: { email: string; aoAbrirHistorico: () => void }) {
  const mostrarAviso = useAviso()
  const [config, setConfig] = useState<ConfigBarbearia | null>(null)
  const [dias, setDias] = useState<HorarioFuncionamento[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [editandoDia, setEditandoDia] = useState<HorarioFuncionamento | null>(null)
  const [editandoDados, setEditandoDados] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [c, f] = await Promise.all([buscarConfig(), buscarFuncionamento()])
      setConfig(c)
      setDias(f)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function sairDaConta() {
    // Este aparelho para de receber os avisos da conta que saiu.
    await desativarAvisos().catch(() => {})
    await sair()
  }

  return (
    <div className="p-tela">
      <div className="p-cabecalho">
        <span className="p-cabecalho__sub">Configurações</span>
        <h1 className="p-cabecalho__titulo">Como a barbearia funciona</h1>
      </div>

      <TituloSecao>Avisos neste aparelho</TituloSecao>
      <CartaoAvisos sempre />

      {erro && !dias && <ErroCarregar texto={erro} aoTentar={() => void carregar()} />}
      {!dias && !erro && <Carregando linhas={3} />}

      {dias && (
        <>
          <TituloSecao>Expediente</TituloSecao>
          <ul className="p-lista">
            {dias.map((d) => (
              <li key={d.dia_semana}>
                <button type="button" className="p-linha" onClick={() => setEditandoDia(d)}>
                  <span className="p-linha__info">
                    <strong>{nomeDoDiaDaSemana(d.dia_semana)}</strong>
                    <span>
                      {d.aberto
                        ? `${hora(d.abre)} — ${hora(d.fecha)}${
                            d.intervalo_inicio ? ` · intervalo ${hora(d.intervalo_inicio)}—${hora(d.intervalo_fim)}` : ''
                          }`
                        : 'Fechado'}
                    </span>
                  </span>
                  <span className="link-ouro">Editar</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {config && (
        <>
          <TituloSecao>Dados da barbearia</TituloSecao>
          <div className="p-cartao">
            <dl className="p-linhas">
              <Linha rotulo="Nome" valor={config.nome} />
              <Linha rotulo="Endereço" valor={config.endereco ?? ''} />
              <Linha rotulo="Cidade" valor={[config.cidade, config.uf].filter(Boolean).join(' — ')} />
              <Linha rotulo="WhatsApp" valor={config.telefone_whatsapp ? telefoneBonito(config.telefone_whatsapp) : ''} />
              <Linha rotulo="Instagram" valor={config.instagram ? `@${config.instagram}` : ''} />
              <Linha rotulo="Grade de horários" valor={`${config.granularidade_minutos} min`} />
              <Linha rotulo="Antecedência mínima" valor={`${config.antecedencia_minima_minutos} min`} />
              <Linha rotulo="Agendar até" valor={`${config.antecedencia_maxima_dias} dias`} />
            </dl>
            <button type="button" className="botao botao--contorno botao--bloco" onClick={() => setEditandoDados(true)}>
              Editar dados
            </button>
          </div>
        </>
      )}

      <button type="button" className="botao botao--contorno botao--bloco" style={{ marginTop: 18 }} onClick={aoAbrirHistorico}>
        <IconeRelogio tamanho={17} />
        Histórico de atendimentos
      </button>

      <TituloSecao>Conta</TituloSecao>
      <div className="p-cartao p-conta">
        <span className="p-texto-suave">Conectado como {email || 'administrador'}.</span>
        <button type="button" className="botao botao--fantasma" onClick={() => void sairDaConta()}>
          Sair do painel
        </button>
      </div>

      {editandoDia && (
        <EditarDia
          dia={editandoDia}
          aoFechar={() => setEditandoDia(null)}
          aoSalvar={() => {
            setEditandoDia(null)
            mostrarAviso('Expediente atualizado.')
            void carregar()
          }}
        />
      )}

      {editandoDados && config && (
        <EditarDados
          config={config}
          aoFechar={() => setEditandoDados(false)}
          aoSalvar={() => {
            setEditandoDados(false)
            mostrarAviso('Dados salvos.')
            void carregar()
          }}
        />
      )}
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="p-linhas__linha">
      <dt>{rotulo}</dt>
      <dd>{valor || '—'}</dd>
    </div>
  )
}

function EditarDia({
  dia,
  aoFechar,
  aoSalvar,
}: {
  dia: HorarioFuncionamento
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [aberto, setAberto] = useState(dia.aberto)
  const [abre, setAbre] = useState(hora(dia.abre))
  const [fecha, setFecha] = useState(hora(dia.fecha))
  const [intIni, setIntIni] = useState(hora(dia.intervalo_inicio))
  const [intFim, setIntFim] = useState(hora(dia.intervalo_fim))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    let problema: string | null = null
    if (aberto) {
      if (!horaValida(abre) || !horaValida(fecha)) problema = 'Use o formato HH:MM.'
      else if (fecha <= abre) problema = 'O fechamento precisa ser depois da abertura.'
      else if (Boolean(intIni) !== Boolean(intFim)) problema = 'Preencha o intervalo inteiro ou deixe os dois vazios.'
      else if (intIni && (!horaValida(intIni) || !horaValida(intFim))) problema = 'Use o formato HH:MM.'
      else if (intIni && intFim <= intIni) problema = 'O fim do intervalo precisa ser depois do início.'
      else if (intIni && (intIni < abre || intFim > fecha)) problema = 'O intervalo precisa ficar dentro do expediente.'
    }
    setErro(problema)
    if (problema) return

    setSalvando(true)
    try {
      await salvarFuncionamento({
        dia_semana: dia.dia_semana,
        aberto,
        abre: aberto ? `${abre}:00` : null,
        fecha: aberto ? `${fecha}:00` : null,
        intervalo_inicio: aberto && intIni ? `${intIni}:00` : null,
        intervalo_fim: aberto && intFim ? `${intFim}:00` : null,
      })
      aoSalvar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha
      titulo={nomeDoDiaDaSemana(dia.dia_semana)}
      aoFechar={aoFechar}
      ocupado={salvando}
      rodape={
        <>
          <button type="button" className="botao botao--ouro botao--bloco" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="botao botao--fantasma" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </button>
        </>
      }
    >
      <Chave rotulo="Aberto neste dia" ligado={aberto} aoMudar={setAberto} />
      {aberto && (
        <>
          <div className="p-duas-colunas">
            <Campo id="dia-abre" rotulo="Abre" valor={abre} aoMudar={(v) => setAbre(mascararHora(v))} modo="numeric" placeholder="08:00" />
            <Campo id="dia-fecha" rotulo="Fecha" valor={fecha} aoMudar={(v) => setFecha(mascararHora(v))} modo="numeric" placeholder="18:00" />
          </div>
          <p className="campo__rotulo" style={{ marginBottom: 8 }}>
            Intervalo (deixe vazio se não houver)
          </p>
          <div className="p-duas-colunas">
            <Campo id="dia-int-ini" rotulo="Início" valor={intIni} aoMudar={(v) => setIntIni(mascararHora(v))} modo="numeric" placeholder="12:00" />
            <Campo id="dia-int-fim" rotulo="Fim" valor={intFim} aoMudar={(v) => setIntFim(mascararHora(v))} modo="numeric" placeholder="13:00" />
          </div>
        </>
      )}
      {erro && <p className="campo__erro">{erro}</p>}
    </Folha>
  )
}

function EditarDados({
  config,
  aoFechar,
  aoSalvar,
}: {
  config: ConfigBarbearia
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [nome, setNome] = useState(config.nome)
  const [endereco, setEndereco] = useState(config.endereco ?? '')
  const [cidade, setCidade] = useState(config.cidade ?? '')
  const [uf, setUf] = useState(config.uf ?? '')
  const [whatsapp, setWhatsapp] = useState(config.telefone_whatsapp ?? '')
  const [instagram, setInstagram] = useState(config.instagram ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    setErro(null)
    try {
      await salvarConfig({
        ...config,
        nome: nome.trim() || 'Barbearia Arte 10',
        endereco: endereco.trim() || null,
        cidade: cidade.trim() || null,
        uf: uf.trim().toUpperCase().slice(0, 2) || null,
        telefone_whatsapp: whatsapp.replace(/\D/g, '') || null,
        instagram: instagram.trim().replace(/^@/, '') || null,
      })
      aoSalvar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Folha
      titulo="Dados da barbearia"
      aoFechar={aoFechar}
      ocupado={salvando}
      rodape={
        <>
          <button type="button" className="botao botao--ouro botao--bloco" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="botao botao--fantasma" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </button>
        </>
      }
    >
      <Campo id="cfg-nome" rotulo="Nome" valor={nome} aoMudar={setNome} placeholder="Barbearia Arte 10" />
      <Campo id="cfg-endereco" rotulo="Endereço" valor={endereco} aoMudar={setEndereco} />
      <div className="p-duas-colunas p-duas-colunas--larga">
        <Campo id="cfg-cidade" rotulo="Cidade" valor={cidade} aoMudar={setCidade} />
        <Campo id="cfg-uf" rotulo="UF" valor={uf} aoMudar={(v) => setUf(v.toUpperCase().slice(0, 2))} maximo={2} />
      </div>
      <Campo id="cfg-whats" rotulo="WhatsApp (só números)" valor={whatsapp} aoMudar={(v) => setWhatsapp(v.replace(/\D/g, ''))} modo="tel" />
      <Campo id="cfg-insta" rotulo="Instagram (sem @)" valor={instagram} aoMudar={(v) => setInstagram(v.replace(/^@/, ''))} />
      {erro && <p className="campo__erro">{erro}</p>}
    </Folha>
  )
}
