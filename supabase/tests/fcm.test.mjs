// Testes das regras puras da Edge Function de push (fcm.ts).
// Rodar: node --test supabase/tests/fcm.test.mjs   (Node 22.6+ lê TypeScript)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classificarRespostaFcm,
  iguaisEmTempoConstante,
  montarMensagem,
  statusFinal,
  UUID,
} from '../functions/notificar-agendamento/fcm.ts'

const erroFcm = (status, errorCode, extras = {}) =>
  JSON.stringify({
    error: {
      code: status,
      status: extras.status ?? 'INVALID_ARGUMENT',
      message: extras.message ?? 'erro',
      details: [
        { '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode },
        ...(extras.campos ? [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: extras.campos }] : []),
      ],
    },
  })

test('200 é entrega', () => {
  assert.equal(classificarRespostaFcm(200, ''), 'entregue')
})

test('token desinstalado (UNREGISTERED / 404) desativa só aquele aparelho', () => {
  assert.equal(classificarRespostaFcm(404, erroFcm(404, 'UNREGISTERED', { status: 'NOT_FOUND' })), 'token_invalido')
  assert.equal(classificarRespostaFcm(403, erroFcm(403, 'SENDER_ID_MISMATCH', { status: 'PERMISSION_DENIED' })), 'token_invalido')
})

test('INVALID_ARGUMENT de PAYLOAD não desativa aparelhos (bug antigo)', () => {
  const payloadRuim = erroFcm(400, 'INVALID_ARGUMENT', {
    message: 'Invalid value at message.android.ttl',
    campos: [{ field: 'message.android.ttl', description: 'Invalid duration' }],
  })
  assert.equal(classificarRespostaFcm(400, payloadRuim), 'permanente')
})

test('INVALID_ARGUMENT apontando o token desativa o aparelho', () => {
  const tokenRuim = erroFcm(400, 'INVALID_ARGUMENT', {
    message: 'The registration token is not a valid FCM registration token',
    campos: [{ field: 'message.token', description: 'Invalid registration token' }],
  })
  assert.equal(classificarRespostaFcm(400, tokenRuim), 'token_invalido')
})

test('instabilidade do Google e credencial expirada são passageiras', () => {
  for (const s of [401, 429, 500, 503]) {
    assert.equal(classificarRespostaFcm(s, erroFcm(s, 'UNAVAILABLE', { status: 'UNAVAILABLE' })), 'passageiro')
  }
  assert.equal(classificarRespostaFcm(503, '<html>Service Unavailable</html>'), 'passageiro')
})

test('status final: entregue ganha; passageiro volta para a fila; o resto falha', () => {
  assert.equal(statusFinal(['passageiro', 'entregue']), 'enviada')
  assert.equal(statusFinal(['passageiro']), 'pendente')
  assert.equal(statusFinal(['token_invalido']), 'pendente')
  assert.equal(statusFinal([]), 'pendente')
  assert.equal(statusFinal(['permanente']), 'falhou')
})

test('mensagem: só strings em data, sem chaves reservadas, com tag por agendamento', () => {
  const m = montarMensagem('tok', {
    id: 'n1',
    agendamento_id: 'a1',
    titulo: 'Novo agendamento',
    corpo: 'João marcou Corte',
    dados: { data: '2026-10-01', from: 'x', google_x: 'y', gcm_z: 'w', nulo: null, numero: 3 },
    tentativas: 1,
  })
  assert.equal(m.message.token, 'tok')
  assert.equal(m.message.android.notification.tag, 'a1')
  assert.equal(m.message.android.notification.channel_id, 'agendamentos')
  assert.deepEqual(m.message.data, {
    data: '2026-10-01',
    numero: '3',
    titulo: 'Novo agendamento',
    corpo: 'João marcou Corte',
  })
})

test('comparação do token é exata', () => {
  assert.equal(iguaisEmTempoConstante('abc', 'abc'), true)
  assert.equal(iguaisEmTempoConstante('abc', 'abd'), false)
  assert.equal(iguaisEmTempoConstante('abc', 'abcd'), false)
  assert.equal(iguaisEmTempoConstante('', 'x'), false)
})

test('id da notificação precisa ser UUID', () => {
  assert.equal(UUID.test('0f8fad5b-d9cb-469f-a165-70867728950e'), true)
  assert.equal(UUID.test("x'; drop table"), false)
})
