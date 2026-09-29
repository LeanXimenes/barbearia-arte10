import { describe, expect, it } from 'vitest'
import { abaDoEndereco, direcaoDoDeslize } from './abas'

describe('abaDoEndereco', () => {
  it('abre a aba do endereço', () => {
    expect(abaDoEndereco('#servicos')).toBe(1)
    expect(abaDoEndereco('#contato')).toBe(3)
  })

  it('aceita os endereços antigos', () => {
    expect(abaDoEndereco('#funcionamento')).toBe(2)
    expect(abaDoEndereco('#localizacao')).toBe(3)
  })

  it('cai no início quando o endereço é vazio ou desconhecido', () => {
    expect(abaDoEndereco('')).toBe(0)
    expect(abaDoEndereco('#xyz')).toBe(0)
  })
})

describe('direcaoDoDeslize', () => {
  it('dedo para a esquerda vai para a próxima aba', () => {
    expect(direcaoDoDeslize(-80, 5)).toBe(1)
  })

  it('dedo para a direita volta', () => {
    expect(direcaoDoDeslize(80, 5)).toBe(-1)
  })

  it('ignora toque curto ou gesto vertical', () => {
    expect(direcaoDoDeslize(-20, 0)).toBe(0)
    expect(direcaoDoDeslize(-70, 90)).toBe(0)
  })
})

describe('aba App', () => {
  it('abre pelo endereço #app', () => {
    expect(abaDoEndereco('#app')).toBe(4)
  })

  it('no app instalado (sem a aba App) o endereço #app cai no início', () => {
    expect(abaDoEndereco('#app', 4)).toBe(0)
  })
})
