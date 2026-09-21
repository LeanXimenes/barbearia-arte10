// =====================================================================
// BARBEARIA ARTE 10 — Edge Function: notificar-agendamento
// =====================================================================
// Entrega a notificação push para o celular do proprietário usando a
// API HTTP v1 do Firebase Cloud Messaging (item 19).
//
// É chamada pelo gatilho do banco (pg_net) sempre que uma linha nova
// entra em public.notificacoes.
//
// Segredos necessários (Supabase > Edge Functions > Secrets):
//   FIREBASE_PROJECT_ID     — id do projeto no Firebase
//   FIREBASE_CLIENT_EMAIL   — client_email da conta de serviço
//   FIREBASE_PRIVATE_KEY    — private_key da conta de serviço (com \n)
//   EDGE_TOKEN              — o mesmo valor gravado em private.segredos
//
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados pela própria
// plataforma. A service_role key vive somente aqui, no servidor —
// nunca no site e nunca no aplicativo.
// =====================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

const FCM_ESCOPO = 'https://www.googleapis.com/auth/firebase.messaging'

interface Notificacao {
  id: string
  titulo: string
  corpo: string
  dados: Record<string, unknown>
  status: string
  tentativas: number
}

// ---------------------------------------------------------------------
// OAuth2: troca a conta de serviço por um access token de curta duração
// ---------------------------------------------------------------------
let tokenEmCache: { valor: string; expiraEm: number } | null = null

async function obterAccessToken(): Promise<string> {
  const agora = Math.floor(Date.now() / 1000)

  if (tokenEmCache && tokenEmCache.expiraEm > agora + 60) {
    return tokenEmCache.valor
  }

  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL')
  const privateKeyPem = Deno.env.get('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n')

  if (!clientEmail || !privateKeyPem) {
    throw new Error('Credenciais do Firebase ausentes nas variáveis de ambiente.')
  }

  const cabecalho = { alg: 'RS256', typ: 'JWT' }
  const corpo = {
    iss: clientEmail,
    scope: FCM_ESCOPO,
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  }

  const entrada = `${base64url(JSON.stringify(cabecalho))}.${base64url(JSON.stringify(corpo))}`
  const chave = await importarChave(privateKeyPem)
  const assinatura = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    chave,
    new TextEncoder().encode(entrada),
  )
  const jwt = `${entrada}.${base64urlBytes(new Uint8Array(assinatura))}`

  const resposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!resposta.ok) {
    throw new Error(`Falha ao obter token do Google: ${await resposta.text()}`)
  }

  const dados = await resposta.json()
  tokenEmCache = { valor: dados.access_token, expiraEm: agora + (dados.expires_in ?? 3600) }
  return tokenEmCache.valor
}

async function importarChave(pem: string): Promise<CryptoKey> {
  const corpo = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const bytes = Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0))

  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

function base64url(texto: string): string {
  return base64urlBytes(new TextEncoder().encode(texto))
}

function base64urlBytes(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ---------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ erro: 'Método não permitido' }, 405)
  }

  // Confere o token compartilhado com o banco.
  const esperado = Deno.env.get('EDGE_TOKEN')
  const recebido = req.headers.get('Authorization')?.replace('Bearer ', '').trim()
  if (esperado && recebido !== esperado) {
    return json({ erro: 'Não autorizado' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  let notificacaoId: string | null = null

  try {
    const corpo = await req.json().catch(() => ({}))
    notificacaoId = corpo?.notificacao_id ?? null

    if (!notificacaoId) {
      return json({ erro: 'notificacao_id ausente' }, 400)
    }

    const { data: notificacao, error: erroBusca } = await supabase
      .from('notificacoes')
      .select('id, titulo, corpo, dados, status, tentativas')
      .eq('id', notificacaoId)
      .maybeSingle<Notificacao>()

    if (erroBusca) throw erroBusca
    if (!notificacao) return json({ erro: 'Notificação não encontrada' }, 404)

    // Já entregue: nada a fazer (protege contra reenvio duplicado).
    if (notificacao.status === 'enviada') {
      return json({ ok: true, ja_enviada: true })
    }

    const { data: dispositivos, error: erroTokens } = await supabase
      .from('dispositivos_push')
      .select('id, token')
      .eq('ativo', true)

    if (erroTokens) throw erroTokens

    if (!dispositivos || dispositivos.length === 0) {
      await supabase
        .from('notificacoes')
        .update({
          status: 'falhou',
          tentativas: notificacao.tentativas + 1,
          erro: 'Nenhum aparelho registrado para receber a notificação.',
        })
        .eq('id', notificacaoId)

      return json({ ok: false, motivo: 'sem_dispositivos' })
    }

    const accessToken = await obterAccessToken()
    const projeto = Deno.env.get('FIREBASE_PROJECT_ID')
    if (!projeto) throw new Error('FIREBASE_PROJECT_ID ausente.')

    const url = `https://fcm.googleapis.com/v1/projects/${projeto}/messages:send`

    let entregues = 0
    const invalidos: string[] = []
    const erros: string[] = []

    for (const dispositivo of dispositivos) {
      const mensagem = {
        message: {
          token: dispositivo.token,
          notification: {
            title: notificacao.titulo,
            body: notificacao.corpo,
          },
          data: Object.fromEntries(
            Object.entries(notificacao.dados ?? {}).map(([k, v]) => [k, String(v)]),
          ),
          android: {
            priority: 'HIGH',
            notification: {
              channel_id: 'agendamentos',
              sound: 'default',
              default_vibrate_timings: true,
            },
          },
        },
      }

      const resposta = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mensagem),
      })

      if (resposta.ok) {
        entregues++
        continue
      }

      const texto = await resposta.text()
      erros.push(texto.slice(0, 200))

      // Token morto (app desinstalado / reinstalado): desativa.
      if (resposta.status === 404 || texto.includes('UNREGISTERED') || texto.includes('INVALID_ARGUMENT')) {
        invalidos.push(dispositivo.id)
      }
    }

    if (invalidos.length > 0) {
      await supabase.from('dispositivos_push').update({ ativo: false }).in('id', invalidos)
    }

    await supabase
      .from('notificacoes')
      .update({
        status: entregues > 0 ? 'enviada' : 'falhou',
        tentativas: notificacao.tentativas + 1,
        enviada_em: entregues > 0 ? new Date().toISOString() : null,
        erro: entregues > 0 ? null : erros.join(' | ').slice(0, 500),
      })
      .eq('id', notificacaoId)

    return json({ ok: entregues > 0, entregues, invalidos: invalidos.length })
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro)

    if (notificacaoId) {
      // Marca a falha mas mantém "pendente" para o reenvio automático.
      await supabase
        .from('notificacoes')
        .update({ erro: mensagem.slice(0, 500) })
        .eq('id', notificacaoId)
    }

    console.error('notificar-agendamento:', mensagem)
    return json({ erro: mensagem }, 500)
  }
})

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
