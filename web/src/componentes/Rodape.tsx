import type { ConfigBarbearia, HorarioFuncionamento } from '../lib/tipos'
import { hora, linkInstagram, linkWhatsapp, nomeDoDiaDaSemana, telefoneBonito } from '../lib/formato'

interface Props {
  config: ConfigBarbearia | null
  funcionamento: HorarioFuncionamento[]
}

const ORDEM = [1, 2, 3, 4, 5, 6, 0]

export function Rodape({ config, funcionamento }: Props) {
  const whats = linkWhatsapp(config?.telefone_whatsapp ?? null)
  const insta = linkInstagram(config?.instagram ?? null)
  const ano = new Date().getFullYear()

  const abertos = ORDEM.map((d) => funcionamento.find((f) => f.dia_semana === d)).filter(
    (d): d is HorarioFuncionamento => Boolean(d?.aberto)
  )

  return (
    <footer className="rodape">
      <div className="container">
        <div className="rodape__grade">
          <div>
            <div className="marca" style={{ marginBottom: 16 }}>
              <img src="/logo-arte10.jpg" alt="" className="marca__logo" width={40} height={40} />
              <span className="marca__texto">
                <span className="marca__nome">Arte 10</span>
                <span className="marca__sub">Barbearia</span>
              </span>
            </div>
            <p className="rodape__texto">
              Corte, barba e acabamento com hora marcada. Agendamento online com confirmação
              imediata.
            </p>
          </div>

          <div>
            <p className="rodape__titulo">Funcionamento</p>
            {abertos.length === 0 && <p className="rodape__texto">Consulte os horários.</p>}
            {abertos.map((dia) => (
              <p key={dia.dia_semana} className="rodape__texto">
                {nomeDoDiaDaSemana(dia.dia_semana)} — {hora(dia.abre)} às {hora(dia.fecha)}
              </p>
            ))}
          </div>

          <div>
            <p className="rodape__titulo">Contato</p>
            {whats && config?.telefone_whatsapp && (
              <a href={whats} target="_blank" rel="noopener noreferrer" className="rodape__link">
                WhatsApp {telefoneBonito(config.telefone_whatsapp)}
              </a>
            )}
            {insta && (
              <a href={insta} target="_blank" rel="noopener noreferrer" className="rodape__link">
                Instagram {config?.instagram?.startsWith('@') ? config.instagram : `@${config?.instagram}`}
              </a>
            )}
            {config?.endereco && <p className="rodape__texto">{config.endereco}</p>}
            {!whats && !insta && !config?.endereco && (
              <p className="rodape__texto">Fale com a barbearia pelo agendamento online.</p>
            )}
          </div>
        </div>

        <div className="rodape__base">
          <span>© {ano} Barbearia Arte 10</span>
          <span>Agendamento online próprio</span>
        </div>
      </div>
    </footer>
  )
}
