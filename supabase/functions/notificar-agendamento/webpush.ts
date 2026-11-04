// =====================================================================
// Web Push (iPhone e navegadores): regras puras, só WebCrypto.
// Roda no Deno da Edge Function e no Node dos testes.
//
//   * criptografia da mensagem: RFC 8291 (aes128gcm);
//   * identificação do servidor: VAPID, RFC 8292 (JWT ES256).
//
// O iPhone (iOS 16.4+) recebe push do painel instalado na Tela de Início.
// O caminho do Android (Firebase) fica no fcm.ts e não muda.
// =====================================================================

import type { ClasseResposta, NotificacaoReservada } from './fcm.ts'

export interface AssinaturaWeb {
  endpoint: string
  /** Chave pública do aparelho (base64url, 65 bytes). */
  p256dh: string
  /** Segredo do aparelho (base64url, 16 bytes). */
  auth: string
}

export interface ChavesVapid {
  /** Chave pública (base64url, 65 bytes, formato "04 || x || y"). */
  publica: string
  /** Chave privada (base64url, 32 bytes). */
  privada: string
  /** Contato do dono do servidor: "mailto:..." ou "https://...". */
  contato: string
}

/** Tamanho do registro declarado no cabeçalho (um registro só). */
const TAMANHO_REGISTRO = 4096

const texto = new TextEncoder()

/** Bytes para o WebCrypto (os tipos do TS 5.7+ separam ArrayBuffer de SharedArrayBuffer). */
const bs = (b: Uint8Array) => b as unknown as BufferSource

// ---------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------
export function b64urlParaBytes(valor: string): Uint8Array {
  const base64 = valor.replace(/-/g, '+').replace(/_/g, '/')
  const completo = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binario = atob(completo)
  return Uint8Array.from(binario, (c) => c.charCodeAt(0))
}

export function bytesParaB64url(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function juntar(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((soma, p) => soma + p.length, 0)
  const saida = new Uint8Array(total)
  let pos = 0
  for (const p of partes) {
    saida.set(p, pos)
    pos += p.length
  }
  return saida
}

async function hmac(chave: Uint8Array, dados: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', bs(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, bs(dados)))
}

/** HKDF-Expand para no máximo 32 bytes (um bloco do SHA-256). */
async function expandir(prk: Uint8Array, info: Uint8Array, tamanho: number): Promise<Uint8Array> {
  return (await hmac(prk, juntar(info, new Uint8Array([1])))).slice(0, tamanho)
}

/** JWK de uma chave P-256 a partir da pública "04||x||y" (e da privada, se houver). */
function jwkP256(publica: Uint8Array, privada?: Uint8Array): JsonWebKey {
  if (publica.length !== 65 || publica[0] !== 4) throw new Error('Chave pública P-256 inválida')
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesParaB64url(publica.slice(1, 33)),
    y: bytesParaB64url(publica.slice(33, 65)),
    ext: true,
  }
  if (privada) jwk.d = bytesParaB64url(privada)
  return jwk
}

// ---------------------------------------------------------------------
// Criptografia da mensagem (RFC 8291)
// ---------------------------------------------------------------------
export interface RemetenteFixo {
  /** Chaves do servidor para ESTA mensagem (só os testes fixam). */
  publica: Uint8Array
  privada: Uint8Array
  salt: Uint8Array
}

/**
 * Criptografa a mensagem para um aparelho. Devolve o corpo pronto para o
 * POST (cabeçalho aes128gcm + texto cifrado).
 */
export async function criptografar(
  mensagem: Uint8Array,
  aparelho: Pick<AssinaturaWeb, 'p256dh' | 'auth'>,
  fixo?: RemetenteFixo,
): Promise<Uint8Array> {
  const uaPublica = b64urlParaBytes(aparelho.p256dh)
  const segredo = b64urlParaBytes(aparelho.auth)
  if (segredo.length !== 16) throw new Error('Segredo do aparelho inválido')

  // Par de chaves descartável do servidor (novo a cada mensagem).
  let asPublica: Uint8Array
  let asPrivada: CryptoKey
  if (fixo) {
    asPublica = fixo.publica
    asPrivada = await crypto.subtle.importKey(
      'jwk',
      jwkP256(fixo.publica, fixo.privada),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    )
  } else {
    const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair
    asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))
    asPrivada = par.privateKey
  }
  const salt = fixo?.salt ?? crypto.getRandomValues(new Uint8Array(16))

  const uaChave = await crypto.subtle.importKey(
    'raw',
    bs(uaPublica),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const segredoEcdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaChave }, asPrivada, 256),
  )

  // Combina o segredo ECDH com o segredo do aparelho.
  const prkChave = await hmac(segredo, segredoEcdh)
  const infoChave = juntar(texto.encode('WebPush: info\0'), uaPublica, asPublica)
  const ikm = await expandir(prkChave, infoChave, 32)

  // Chave e nonce do conteúdo.
  const prk = await hmac(salt, ikm)
  const cek = await expandir(prk, texto.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await expandir(prk, texto.encode('Content-Encoding: nonce\0'), 12)

  // Um registro só: mensagem + delimitador 0x02 (último registro).
  const registro = juntar(mensagem, new Uint8Array([2]))
  const chaveAes = await crypto.subtle.importKey('raw', bs(cek), { name: 'AES-GCM' }, false, ['encrypt'])
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(nonce) }, chaveAes, bs(registro)),
  )

  const cabecalho = new Uint8Array(16 + 4 + 1 + asPublica.length)
  cabecalho.set(salt, 0)
  new DataView(cabecalho.buffer).setUint32(16, TAMANHO_REGISTRO)
  cabecalho[20] = asPublica.length
  cabecalho.set(asPublica, 21)

  return juntar(cabecalho, cifrado)
}

// ---------------------------------------------------------------------
// VAPID (RFC 8292)
// ---------------------------------------------------------------------
/** Cabeçalho Authorization para o serviço de push do aparelho. */
export async function cabecalhoVapid(
  endpoint: string,
  chaves: ChavesVapid,
  agora: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const publica = b64urlParaBytes(chaves.publica)
  const privada = b64urlParaBytes(chaves.privada)
  const chave = await crypto.subtle.importKey(
    'jwk',
    jwkP256(publica, privada),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const cabecalho = { typ: 'JWT', alg: 'ES256' }
  // A Apple exige validade de no máximo 24 h e o "sub" de contato.
  const corpo = { aud: new URL(endpoint).origin, exp: agora + 12 * 3600, sub: chaves.contato }
  const entrada =
    `${bytesParaB64url(texto.encode(JSON.stringify(cabecalho)))}.` +
    `${bytesParaB64url(texto.encode(JSON.stringify(corpo)))}`
  // O WebCrypto já devolve a assinatura no formato do JWT (r || s).
  const assinatura = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave, bs(texto.encode(entrada))),
  )

  return `vapid t=${entrada}.${bytesParaB64url(assinatura)}, k=${chaves.publica}`
}

// ---------------------------------------------------------------------
// Mensagem e classificação da resposta
// ---------------------------------------------------------------------
/** O que o service worker do painel mostra (e para onde abre ao tocar). */
export function montarPayloadWeb(n: NotificacaoReservada) {
  const dia = typeof n.dados?.data === 'string' ? n.dados.data : null
  // Lembrete do cliente abre o site dele; o resto abre o painel do dono.
  const paraCliente = n.dados?.destino === 'cliente'
  return {
    titulo: n.titulo,
    corpo: n.corpo,
    // Mesmo agendamento = mesma notificação (não empilha repetida).
    tag: n.agendamento_id ?? n.id,
    url: paraCliente ? '/' : dia ? `/admin/#agenda=${dia}` : '/admin/',
  }
}

// Só os serviços de push dos navegadores (Chrome/Android, Safari/iPhone,
// Firefox, Edge). O banco já recusa outros endereços; aqui é a segunda trava:
// sem ela, um endereço qualquer faria esta função mandar pedidos para fora.
const SERVICOS_DE_PUSH = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
]

/** O endereço é de um serviço de push de verdade (https, porta padrão)? */
export function endpointPushPermitido(endpoint: string): boolean {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false
  return SERVICOS_DE_PUSH.some((re) => re.test(url.hostname))
}

/** Tempo máximo de cada envio: um serviço lento não prende a fila toda. */
export const TEMPO_MAXIMO_PUSH_MS = 10_000

/** Monta o pedido HTTP do push para um aparelho. */
export async function montarPedidoWebPush(
  aparelho: AssinaturaWeb,
  n: NotificacaoReservada,
  chaves: ChavesVapid,
): Promise<{ url: string; init: RequestInit }> {
  if (!endpointPushPermitido(aparelho.endpoint)) {
    throw new Error('endereço de aviso fora dos serviços de push')
  }
  const corpo = await criptografar(texto.encode(JSON.stringify(montarPayloadWeb(n))), aparelho)
  return {
    url: aparelho.endpoint,
    init: {
      method: 'POST',
      // Serviço de push não redireciona: um redirecionamento é recusado.
      redirect: 'error',
      signal: AbortSignal.timeout(TEMPO_MAXIMO_PUSH_MS),
      headers: {
        Authorization: await cabecalhoVapid(aparelho.endpoint, chaves),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(24 * 3600),
        Urgency: 'high',
        Topic: (n.agendamento_id ?? n.id).replace(/-/g, '').slice(0, 32),
      },
      body: bs(corpo),
    },
  }
}

/** Classifica a resposta do serviço de push (Apple, Google, Mozilla) para UM aparelho. */
export function classificarRespostaWebPush(status: number): ClasseResposta {
  if (status >= 200 && status < 300) return 'entregue'
  // Assinatura vencida ou removida (app apagado, permissão retirada).
  if (status === 404 || status === 410) return 'token_invalido'
  if (status === 429 || status >= 500) return 'passageiro'
  // 400/401/403/413: mensagem ou chaves VAPID erradas — repetir não resolve.
  return 'permanente'
}

/** Lê as chaves VAPID dos segredos; null se ainda não foram configuradas. */
export function lerChavesVapid(ler: (nome: string) => string | undefined): ChavesVapid | null {
  const publica = ler('VAPID_PUBLIC_KEY')?.trim()
  const privada = ler('VAPID_PRIVATE_KEY')?.trim()
  const contato = ler('VAPID_SUBJECT')?.trim() || 'https://arte10barbarbearia.netlify.app'
  if (!publica || !privada) return null
  return { publica, privada, contato }
}
