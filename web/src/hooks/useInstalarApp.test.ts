import { describe, expect, it } from 'vitest'
import { plataformaDe } from './useInstalarApp'

describe('plataformaDe', () => {
  it('reconhece iPhone e iPad (que se diz Mac, mas tem toque)', () => {
    expect(plataformaDe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', true)).toBe(
      'iphone',
    )
    expect(plataformaDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', true)).toBe('iphone')
  })

  it('reconhece Android', () => {
    expect(plataformaDe('Mozilla/5.0 (Linux; Android 14; SM-A546E)', true)).toBe('android')
  })

  it('Mac sem toque e Windows são computador', () => {
    expect(plataformaDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', false)).toBe(
      'computador',
    )
    expect(plataformaDe('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', false)).toBe('computador')
  })
})
