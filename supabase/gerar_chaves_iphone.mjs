// =====================================================================
// Gera as chaves dos avisos do iPhone (VAPID). Rodar UMA vez:
//
//   node supabase/gerar_chaves_iphone.mjs
//
// * A chave PÚBLICA vai para o site (web/.env -> VITE_VAPID_PUBLIC_KEY).
// * A chave PRIVADA fica em supabase/chaves-iphone.local.txt (o git
//   ignora) para colar em Supabase > Edge Functions > Secrets.
//
// Não gera de novo se as chaves já existem: trocar as chaves faz os
// iPhones já cadastrados pararem de receber até abrirem o painel de novo.
// =====================================================================
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const ARQ_CHAVES = join(aqui, 'chaves-iphone.local.txt')
const ARQ_ENV = join(aqui, '..', 'web', '.env')
const CONTATO = 'https://arte10barbarbearia.netlify.app'

const b64url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

let publica
if (existsSync(ARQ_CHAVES)) {
  publica = /VAPID_PUBLIC_KEY=(\S+)/.exec(readFileSync(ARQ_CHAVES, 'utf8'))?.[1]
  console.log('As chaves já existem (não foram trocadas):', ARQ_CHAVES)
} else {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  publica = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey)))
  const privada = (await crypto.subtle.exportKey('jwk', par.privateKey)).d

  writeFileSync(
    ARQ_CHAVES,
    [
      '# Chaves dos avisos do iPhone (VAPID) — NÃO compartilhe a privada.',
      '# Cole as três linhas em: Supabase > Edge Functions > Secrets',
      '# (nome à esquerda do "=", valor à direita).',
      '',
      `VAPID_PUBLIC_KEY=${publica}`,
      `VAPID_PRIVATE_KEY=${privada}`,
      `VAPID_SUBJECT=${CONTATO}`,
      '',
    ].join('\n'),
  )
  console.log('Chaves geradas em:', ARQ_CHAVES)
}

// A pública vai para o site (o painel usa para cadastrar o iPhone).
if (publica && existsSync(ARQ_ENV)) {
  const env = readFileSync(ARQ_ENV, 'utf8')
  const linha = `VITE_VAPID_PUBLIC_KEY=${publica}`
  const novo = /^VITE_VAPID_PUBLIC_KEY=.*$/m.test(env)
    ? env.replace(/^VITE_VAPID_PUBLIC_KEY=.*$/m, linha)
    : `${env.replace(/\s*$/, '')}\n${linha}\n`
  writeFileSync(ARQ_ENV, novo)
  console.log('web/.env atualizado com a chave pública.')
}
