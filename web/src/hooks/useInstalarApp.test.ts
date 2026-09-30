import { describe, expect, it } from 'vitest'
import { linkAbrirNoChrome, navegadorDe, plataformaDe } from './useInstalarApp'

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

const UA = {
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  operaAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 OPR/83.0',
  samsung:
    'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
  instagramAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 Instagram 340.0',
  safari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  instagramIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0',
}

describe('navegadorDe', () => {
  it('Chrome de verdade no Android', () => {
    expect(navegadorDe(UA.chromeAndroid, 'android')).toBe('chrome')
  })

  it('Opera e Samsung não são o Chrome, mesmo dizendo "Chrome"', () => {
    expect(navegadorDe(UA.operaAndroid, 'android')).toBe('outro')
    expect(navegadorDe(UA.samsung, 'android')).toBe('outro')
  })

  it('navegador de dentro do Instagram é "interno" (não deixa instalar)', () => {
    expect(navegadorDe(UA.instagramAndroid, 'android')).toBe('interno')
    expect(navegadorDe(UA.instagramIphone, 'iphone')).toBe('interno')
  })

  it('no iPhone separa Safari de Chrome', () => {
    expect(navegadorDe(UA.safari, 'iphone')).toBe('safari')
    expect(navegadorDe(UA.chromeIphone, 'iphone')).toBe('outro')
  })
})

describe('linkAbrirNoChrome', () => {
  it('abre a mesma página no Chrome, já na aba App', () => {
    const link = linkAbrirNoChrome(new URL('https://arte10.netlify.app/#inicio'))
    expect(link.startsWith('intent://arte10.netlify.app/?instalar=1#Intent;')).toBe(true)
    expect(link).toContain('package=com.android.chrome')
    expect(link).toContain(
      'S.browser_fallback_url=https%3A%2F%2Farte10.netlify.app%2F%3Finstalar%3D1',
    )
  })
})
