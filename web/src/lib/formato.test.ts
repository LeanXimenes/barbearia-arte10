import { describe, expect, it } from 'vitest'
import {
  dataCurta,
  dataPorExtenso,
  duracao,
  hora,
  linkWhatsapp,
  mascararTelefone,
  moeda,
  nomeValido,
  telefoneValido,
  textoDeData,
} from './formato'
import { estadoAgora, somarDias } from './relogio'
import { exigeRecarregarHorarios, pareceFalhaDeRede } from './erros'

describe('datas', () => {
  it('não escorrega de dia por causa do fuso', () => {
    // O bug clássico: new Date('2026-09-21') vira 20/09 em fusos negativos.
    expect(dataCurta('2026-09-21')).toBe('21/09/2026')
    expect(dataCurta('2026-01-01')).toBe('01/01/2026')
    expect(dataCurta('2026-12-31')).toBe('31/12/2026')
  })

  it('escreve a data por extenso em português', () => {
    expect(dataPorExtenso('2026-09-21')).toBe('Segunda-feira, 21 de setembro')
  })

  it('soma dias atravessando o fim do mês e do ano', () => {
    expect(somarDias('2026-09-30', 1)).toBe('2026-10-01')
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('converte Date para texto sem usar UTC', () => {
    expect(textoDeData(new Date(2026, 8, 21))).toBe('2026-09-21')
  })
})

describe('apresentação', () => {
  it('corta os segundos do horário', () => {
    expect(hora('14:00:00')).toBe('14:00')
    expect(hora(null)).toBe('')
  })

  it('formata duração', () => {
    expect(duracao(35)).toBe('35 min')
    expect(duracao(60)).toBe('1h')
    expect(duracao(90)).toBe('1h30')
  })

  it('formata preço em real', () => {
    // O separador pode ser espaço normal ou não-quebrável conforme o ICU.
    expect(moeda(35).replace(/ /g, ' ')).toBe('R$ 35,00')
  })
})

describe('telefone', () => {
  it('aplica a máscara progressivamente', () => {
    expect(mascararTelefone('17')).toBe('17')
    expect(mascararTelefone('1799')).toBe('(17) 99')
    expect(mascararTelefone('1799731')).toBe('(17) 9973-1')
    expect(mascararTelefone('17997313480')).toBe('(17) 99731-3480')
  })

  it('ignora o excesso de dígitos', () => {
    expect(mascararTelefone('179973134809999')).toBe('(17) 99731-3480')
  })

  it('valida 10 e 11 dígitos', () => {
    expect(telefoneValido('(17) 99731-3480')).toBe(true)
    expect(telefoneValido('(17) 3456-7890')).toBe(true)
    expect(telefoneValido('123')).toBe(false)
  })

  it('monta o link do WhatsApp com DDI', () => {
    expect(linkWhatsapp('17997313480')).toBe('https://wa.me/5517997313480')
    expect(linkWhatsapp('5517997313480')).toBe('https://wa.me/5517997313480')
    expect(linkWhatsapp(null)).toBeNull()
    expect(linkWhatsapp('123')).toBeNull()
  })
})

describe('nome', () => {
  it('recusa nomes vazios ou curtos demais', () => {
    expect(nomeValido('  ')).toBe(false)
    expect(nomeValido('A')).toBe(false)
    expect(nomeValido('Jô')).toBe(true)
  })
})

describe('estado da barbearia agora', () => {
  const semana = [
    { dia_semana: 0, aberto: false, abre: null, fecha: null, intervalo_inicio: null, intervalo_fim: null },
    {
      dia_semana: 1,
      aberto: true,
      abre: '09:00:00',
      fecha: '19:00:00',
      intervalo_inicio: '12:00:00',
      intervalo_fim: '13:30:00',
    },
  ]

  it('diz fechado no domingo', () => {
    const r = estadoAgora(semana, { data: '2026-09-20', hora: '10:00', diaSemana: 0 })
    expect(r.aberto).toBe(false)
    expect(r.detalhe).toBe('Fechado hoje')
  })

  it('diz aberto durante o expediente', () => {
    const r = estadoAgora(semana, { data: '2026-09-21', hora: '10:00', diaSemana: 1 })
    expect(r.aberto).toBe(true)
    expect(r.detalhe).toBe('Aberto até 19:00')
  })

  it('reconhece o intervalo', () => {
    const r = estadoAgora(semana, { data: '2026-09-21', hora: '12:30', diaSemana: 1 })
    expect(r.aberto).toBe(false)
    expect(r.detalhe).toBe('Intervalo até 13:30')
  })

  it('avisa antes de abrir e depois de fechar', () => {
    expect(estadoAgora(semana, { data: '2026-09-21', hora: '07:00', diaSemana: 1 }).detalhe).toBe(
      'Abre às 09:00'
    )
    expect(estadoAgora(semana, { data: '2026-09-21', hora: '20:00', diaSemana: 1 }).detalhe).toBe(
      'Fechado agora'
    )
  })
})

describe('tratamento de falhas', () => {
  it('reconhece falha de rede', () => {
    expect(pareceFalhaDeRede(new TypeError('Failed to fetch'))).toBe(true)
    expect(pareceFalhaDeRede({ message: 'fetch failed' })).toBe(true)
    expect(pareceFalhaDeRede({ message: 'duplicate key value' })).toBe(false)
  })

  it('sabe quando precisa recarregar a lista de horários', () => {
    expect(exigeRecarregarHorarios('HORARIO_OCUPADO')).toBe(true)
    expect(exigeRecarregarHorarios('HORARIO_BLOQUEADO')).toBe(true)
    expect(exigeRecarregarHorarios('TELEFONE_INVALIDO')).toBe(false)
    expect(exigeRecarregarHorarios(undefined)).toBe(false)
  })
})
