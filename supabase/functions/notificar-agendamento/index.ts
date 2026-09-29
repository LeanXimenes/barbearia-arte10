// =====================================================================
// BARBEARIA ARTE 10 — Edge Function: notificar-agendamento
// =====================================================================
// Entrega a notificação push para o celular do proprietário usando a
// API HTTP v1 do Firebase Cloud Messaging (item 19).
//
// Chamada pelo próprio banco (pg_net) quando nasce uma linha em
// public.notificacoes, e de novo pelo reenvio periódico (pg_cron).
//
// Segredos necessários (Supabase > Edge Functions > Secrets):
//   FIREBASE_PROJECT_ID     — project_id da conta de serviço do Firebase
//   FIREBASE_CLIENT_EMAIL   — client_email da conta de serviço
//   FIREBASE_PRIVATE_KEY    — private_key da conta de serviço (com \n)
//   EDGE_TOKEN              — o mesmo valor gravado por supabase/ativar_push.sql
//
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados pela plataforma.
// A service_role key vive somente aqui, no servidor.
// =====================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  type ClasseResposta,
  type NotificacaoReservada,
  UUID,
  classificarRespostaFcm,
  iguaisEmTempoConstante,
  montarMensagem,
  statusFinal,
} from './fcm.ts'

const FCM_ESCOPO = 'https://www.googleapis.com/auth/firebase.messaging'

class ErroDeConfiguracao extends Error {}

// ---------------------------------------------------------------------
// OAuth2: troca a conta de serviço por um access token de curta duração
// ---------------------------------------------------------------------
let tokenEmCache: { valor: string; expiraEm: number } | null = null

async function obterAccessToken(): Promise<string> {
  const agora = Math.floor(Date.now() / 1000)
  if (tokenEmCache && tokenEmCache.expiraEm > agora + 60) return tokenEmCache.valor

  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL')?.trim()
  const privateKeyPem = Deno.env
    .get('FIREBASE_PRIVATE_KEY')
    ?.trim()
    .replace(/^"|"$/g, '') // colado com aspas por engano
    .replace(/\\n/g, '\n')

  if (!clientEmail || !privateKeyPem) {
    throw new ErroDeConfiguracao('FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY não configurados.')
  }

  let chave: CryptoKey
  try {
    chave = await importarChave(privateKeyPem)
  } catch {
    throw new ErroDeConfiguracao('FIREBASE_PRIVATE_KEY inválida (confira se foi colada inteira).')
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
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(entrada))
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
    const texto = await resposta.text()
    // 400/401 aqui = credencial errada (não adianta repetir); 5xx = instabilidade.
    if (resposta.status >= 500) throw new Error(`Google OAuth indisponível (${resposta.status})`)
    throw new ErroDeConfiguracao(`Credenciais do Firebase recusadas pelo Google: ${texto.slice(0, 200)}`)
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
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

function base64url(texto: string): string {
  return base64urlBytes(new TextEncoder().encode(texto))
}

function base64urlBytes(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

// ---------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  // Falha FECHADA: sem EDGE_TOKEN configurado a função não aceita nada.
  const esperado = Deno.env.get('EDGE_TOKEN')?.trim()
  if (!esperado) {
    console.error('notificar-agendamento: EDGE_TOKEN não configurado')
    return json({ erro: 'Função não configurada' }, 503)
  }
  const recebido = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!iguaisEmTempoConstante(recebido, esperado)) return json({ erro: 'Não autorizado' }, 401)

  const corpo = await req.json().catch(() => null)
  const notificacaoId = typeof corpo?.notificacao_id === 'string' ? corpo.notificacao_id : ''
  if (!UUID.test(notificacaoId)) return json({ erro: 'notificacao_id inválido' }, 400)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // Reserva atômica: se outra chamada já pegou (ou já foi enviada), sai.
  const { data: reservadas, error: erroReserva } = await supabase.rpc('reservar_notificacao', {
    p_id: notificacaoId,
  })
  if (erroReserva) {
    console.error('reservar_notificacao:', erroReserva.message)
    return json({ erro: 'Falha interna' }, 500)
  }
  const notificacao = (reservadas as NotificacaoReservada[] | null)?.[0]
  if (!notificacao) return json({ ok: true, ignorada: true })

  const finalizar = async (status: 'enviada' | 'pendente' | 'falhou', erro: string | null) => {
    const { error } = await supabase.rpc('finalizar_notificacao', {
      p_id: notificacaoId,
      p_status: status,
      p_erro: erro,
    })
    if (error) console.error('finalizar_notificacao:', error.message)
  }

  try {
    const { data: destinos, error: erroDestinos } = await supabase.rpc('destinos_push')
    if (erroDestinos) throw new Error(`destinos_push: ${erroDestinos.message}`)

    const lista = (destinos ?? []) as Array<{ id: string; token: string }>
    if (lista.length === 0) {
      await finalizar('pendente', 'Nenhum aparelho do barbeiro registrado (abra o app uma vez).')
      return json({ ok: false, motivo: 'sem_aparelhos' })
    }

    const projeto = Deno.env.get('FIREBASE_PROJECT_ID')?.trim()
    if (!projeto) throw new ErroDeConfiguracao('FIREBASE_PROJECT_ID não configurado.')
    const url = `https://fcm.googleapis.com/v1/projects/${projeto}/messages:send`
    const accessToken = await obterAccessToken()

    const classes: ClasseResposta[] = []
    const invalidos: string[] = []
    const erros: string[] = []

    for (const destino of lista) {
      const resposta = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(montarMensagem(destino.token, notificacao)),
      })
      const texto = resposta.ok ? '' : await resposta.text()
      const classe = classificarRespostaFcm(resposta.status, texto)
      classes.push(classe)

      if (classe === 'token_invalido') invalidos.push(destino.id)
      if (classe !== 'entregue') erros.push(`${resposta.status}: ${texto.slice(0, 150)}`)
      if (resposta.status === 401) tokenEmCache = null
    }

    if (invalidos.length > 0) {
      const { error } = await supabase.rpc('desativar_dispositivos', { p_ids: invalidos })
      if (error) console.error('desativar_dispositivos:', error.message)
    }

    const status = statusFinal(classes)
    await finalizar(status, status === 'enviada' ? null : erros.join(' | ').slice(0, 500))
    return json({ ok: status === 'enviada', status, entregues: classes.filter((c) => c === 'entregue').length })
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro)
    console.error('notificar-agendamento:', mensagem)
    // Configuração errada não se resolve repetindo; o resto volta para a fila.
    await finalizar(erro instanceof ErroDeConfiguracao ? 'falhou' : 'pendente', mensagem)
    return json({ erro: 'Falha ao enviar' }, 500)
  }
})
