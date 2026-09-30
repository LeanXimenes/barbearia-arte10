import { describe, expect, it } from 'vitest'
import {
  contaDoPlano,
  precoDoCorteDoPlano,
  sufixoDoPreco,
  textoValidade,
  vantagensDoPlano,
} from './planos'

const corte = {
  id: '1',
  nome: 'Corte de cabelo',
  descricao: null,
  preco: 35,
  duracao_minutos: 35,
  ativo: true,
  ordem: 1,
  usa_plano: true,
}
const barba = { ...corte, id: '2', nome: 'Barba', preco: 30, usa_plano: false }

describe('conta dos planos', () => {
  it('usa o preço do corte (o serviço que desconta do plano)', () => {
    expect(precoDoCorteDoPlano([barba, corte])).toBe(35)
    expect(precoDoCorteDoPlano([barba])).toBeNull()
  })

  it('Elite: 4 cortes de R$ 35 = R$ 140, por R$ 110 economiza R$ 30', () => {
    expect(contaDoPlano({ preco: 110, cortes: 4, preco_referencia: null }, 35)).toEqual({
      avulso: 140,
      economia: 30,
    })
  })

  it('Classic: 2 cortes de R$ 35 = R$ 70, por R$ 65 economiza R$ 5', () => {
    expect(contaDoPlano({ preco: 65, cortes: 2, preco_referencia: null }, 35)).toEqual({
      avulso: 70,
      economia: 5,
    })
  })

  it('mudou o preço do corte, a economia acompanha', () => {
    expect(contaDoPlano({ preco: 110, cortes: 4, preco_referencia: 140 }, 40).economia).toBe(50)
  })

  it('sem serviço marcado usa o valor guardado; sem economia não mostra', () => {
    expect(contaDoPlano({ preco: 110, cortes: 4, preco_referencia: 140 }, null).economia).toBe(30)
    expect(contaDoPlano({ preco: 200, cortes: 4, preco_referencia: null }, 35).economia).toBeNull()
  })
})

describe('prazo do plano (pago uma vez)', () => {
  it('escreve o prazo do jeito que se fala', () => {
    expect(textoValidade(30)).toBe('1 mês')
    expect(textoValidade(90)).toBe('3 meses')
    expect(textoValidade(365)).toBe('1 ano')
    expect(textoValidade(14)).toBe('2 semanas')
    expect(textoValidade(10)).toBe('10 dias')
    expect(textoValidade(1)).toBe('1 dia')
  })

  it('só 30 dias vira "/mês"; 90 dias não parece mensalidade', () => {
    expect(sufixoDoPreco(30)).toBe('/mês')
    expect(sufixoDoPreco(90)).toBe('por 3 meses')
    expect(sufixoDoPreco(45)).toBe('por 45 dias')
  })

  it('vantagens calculadas substituem as escritas à mão que poderiam mentir', () => {
    expect(
      vantagensDoPlano({
        cortes: 6,
        validade_dias: 90,
        beneficios: [
          '4 cortes de cabelo',
          'Válido por 30 dias',
          'Economize R$ 30',
          'Bebida grátis',
        ],
      }),
    ).toEqual(['6 cortes de cabelo', 'Vale por 3 meses', 'Bebida grátis'])
  })
})
