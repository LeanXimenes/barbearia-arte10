// Testes do Web Push (iPhone/navegador) da Edge Function (webpush.ts).
// Rodar: node --test supabase/tests/webpush.test.mjs   (Node 22.6+ lê TypeScript)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  b64urlParaBytes,
  bytesParaB64url,
  cabecalhoVapid,
  classificarRespostaWebPush,
  criptografar,
  lerChavesVapid,
  montarPayloadWeb,
  montarPedidoWebPush,
} from '../functions/notificar-agendamento/webpush.ts'

// Exemplo oficial da RFC 8291 (seção 5 e apêndice A).
const RFC = {
  mensagem: 'When I grow up, I want to be a watermelon',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPrivada: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublica:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPrivada: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublica:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  corpo:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

const enc = new TextEncoder()

/** Descriptografa como o aparelho faria (para testar o caminho aleatório). */
async function descriptografar(corpo, uaPrivadaB64, uaPublicaB64, authB64) {
  const salt = corpo.slice(0, 16)
  const tamanhoChave = corpo[20]
  const asPublica = corpo.slice(21, 21 + tamanhoChave)
  const cifrado = corpo.slice(21 + tamanhoChave)
  const uaPublica = b64urlParaBytes(uaPublicaB64)

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesParaB64url(uaPublica.slice(1, 33)),
    y: bytesParaB64url(uaPublica.slice(33, 65)),
    d: uaPrivadaB64,
  }
  const privada = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ])
  const remetente = await crypto.subtle.importKey('raw', asPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: remetente }, privada, 256))

  const hmac = async (k, d) =>
    new Uint8Array(
      await crypto.subtle.sign(
        'HMAC',
        await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
        d,
      ),
    )
  const junta = (...p) => Uint8Array.from(p.flatMap((x) => [...x]))
  const prkChave = await hmac(b64urlParaBytes(authB64), ecdh)
  const ikm = await hmac(prkChave, junta(enc.encode('WebPush: info\0'), uaPublica, asPublica, [1]))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, junta(enc.encode('Content-Encoding: aes128gcm\0'), [1]))).slice(0, 16)
  const nonce = (await hmac(prk, junta(enc.encode('Content-Encoding: nonce\0'), [1]))).slice(0, 12)
  const chave = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt'])
  const registro = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, chave, cifrado))
  assert.equal(registro.at(-1), 2, 'delimitador do último registro')
  return new TextDecoder().decode(registro.slice(0, -1))
}

test('criptografia bate exatamente com o exemplo oficial da RFC 8291', async () => {
  const corpo = await criptografar(
    enc.encode(RFC.mensagem),
    { p256dh: RFC.uaPublica, auth: RFC.auth },
    {
      publica: b64urlParaBytes(RFC.asPublica),
      privada: b64urlParaBytes(RFC.asPrivada),
      salt: b64urlParaBytes(RFC.salt),
    },
  )
  assert.equal(bytesParaB64url(corpo), RFC.corpo)
})

test('com chaves novas a cada envio, o aparelho consegue abrir a mensagem', async () => {
  const corpo = await criptografar(enc.encode('Novo agendamento: Corte 10:00'), {
    p256dh: RFC.uaPublica,
    auth: RFC.auth,
  })
  assert.equal(await descriptografar(corpo, RFC.uaPrivada, RFC.uaPublica, RFC.auth), 'Novo agendamento: Corte 10:00')
  // Duas mensagens iguais nunca saem iguais (salt e chave novos).
  const outro = await criptografar(enc.encode('x'), { p256dh: RFC.uaPublica, auth: RFC.auth })
  const denovo = await criptografar(enc.encode('x'), { p256dh: RFC.uaPublica, auth: RFC.auth })
  assert.notEqual(bytesParaB64url(outro), bytesParaB64url(denovo))
})

test('VAPID: JWT ES256 assinado com a chave do servidor, para a origem do aparelho', async () => {
  const chaves = { publica: RFC.asPublica, privada: RFC.asPrivada, contato: 'mailto:dono@arte10.test' }
  const endpoint = 'https://web.push.apple.com/QGuQyavXutnMH5_abc'
  const agora = 1_800_000_000
  const cabecalho = await cabecalhoVapid(endpoint, chaves, agora)

  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(cabecalho) ?? []
  assert.equal(k, RFC.asPublica)
  const [h, c, s] = jwt.split('.')
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64urlParaBytes(h))), { typ: 'JWT', alg: 'ES256' })
  const claims = JSON.parse(new TextDecoder().decode(b64urlParaBytes(c)))
  assert.deepEqual(claims, { aud: 'https://web.push.apple.com', exp: agora + 12 * 3600, sub: 'mailto:dono@arte10.test' })

  const publica = await crypto.subtle.importKey(
    'raw',
    b64urlParaBytes(RFC.asPublica),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
  const valida = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publica,
    b64urlParaBytes(s),
    enc.encode(`${h}.${c}`),
  )
  assert.equal(valida, true, 'assinatura do JWT')
})

test('pedido do push leva os cabeçalhos que Apple e Google exigem', async () => {
  const n = {
    id: '11111111-2222-3333-4444-555555555555',
    agendamento_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    titulo: 'Novo agendamento',
    corpo: 'Maria marcou Corte — 04/11 às 10:00',
    dados: { data: '2026-11-04' },
    tentativas: 0,
  }
  const aparelho = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: RFC.uaPublica, auth: RFC.auth }
  const chaves = { publica: RFC.asPublica, privada: RFC.asPrivada, contato: 'mailto:dono@arte10.test' }
  const { url, init } = await montarPedidoWebPush(aparelho, n, chaves)

  assert.equal(url, aparelho.endpoint)
  assert.equal(init.headers['Content-Encoding'], 'aes128gcm')
  assert.equal(init.headers.TTL, '86400')
  assert.match(init.headers.Authorization, /^vapid t=.+, k=/)
  assert.equal(init.headers.Topic.length, 32)

  const aberto = JSON.parse(await descriptografar(init.body, RFC.uaPrivada, RFC.uaPublica, RFC.auth))
  assert.deepEqual(aberto, {
    titulo: 'Novo agendamento',
    corpo: 'Maria marcou Corte — 04/11 às 10:00',
    tag: n.agendamento_id,
    url: '/admin/#agenda=2026-11-04',
  })
  assert.equal(montarPayloadWeb({ ...n, dados: null, agendamento_id: null }).url, '/admin/')
  // Lembrete do cliente abre o site do cliente, não o painel.
  assert.equal(montarPayloadWeb({ ...n, dados: { destino: 'cliente', data: '2026-11-04' } }).url, '/')
})

test('classificação da resposta do serviço de push', () => {
  assert.equal(classificarRespostaWebPush(201), 'entregue')
  assert.equal(classificarRespostaWebPush(410), 'token_invalido') // assinatura vencida
  assert.equal(classificarRespostaWebPush(404), 'token_invalido')
  assert.equal(classificarRespostaWebPush(429), 'passageiro')
  assert.equal(classificarRespostaWebPush(503), 'passageiro')
  assert.equal(classificarRespostaWebPush(403), 'permanente') // chave VAPID errada
  assert.equal(classificarRespostaWebPush(400), 'permanente')
})

test('chaves VAPID: sem configurar, o envio para iPhone fica desligado', () => {
  assert.equal(lerChavesVapid(() => undefined), null)
  const lidas = lerChavesVapid((n) => ({ VAPID_PUBLIC_KEY: ' pub ', VAPID_PRIVATE_KEY: 'priv' })[n])
  assert.deepEqual(lidas, { publica: 'pub', privada: 'priv', contato: 'https://arte10barbarbearia.netlify.app' })
})
