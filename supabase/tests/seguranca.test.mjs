// =====================================================================
// Blindagem (migração 16): limites por IP e por conta, funções fechadas,
// aparelhos de aviso só em serviços de push e pedidos recusados pela
// checagem que o PostgREST roda antes de cada chamada.
//
// Os contadores ficam numa tabela do banco: os testes "enchem" a janela
// direto nela (em vez de disparar centenas de chamadas) e conferem o que
// acontece no pedido seguinte.
// =====================================================================
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { criarBanco, comoAnonimo, comoAdmin, comoInterno, comoPedido } from './harness.mjs'

const db = await criarBanco()
const uma = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const todas = async (sql, params = []) => (await db.query(sql, params)).rows

const CORTE = (await uma("select id from public.servicos where nome = 'Corte de cabelo'")).id
const ELITE = (await uma("select id from public.planos where nome = 'Plano Elite'")).id
const DIA = (await uma(
  `select g::date::text as d from generate_series((now() at time zone 'America/Sao_Paulo')::date + 1,
     (now() at time zone 'America/Sao_Paulo')::date + 30, interval '1 day') g
    where extract(dow from g) between 1 and 4 order by g limit 1`
)).d

const ID_DONO = randomUUID()
await db.query("insert into auth.users (id, email) values ($1, 'dono@blindagem.test')", [ID_DONO])
await db.query("insert into public.administradores (user_id, nome) values ($1, 'Dono')", [ID_DONO])

/** Chamada do site (anon) a uma função, vinda de um IP. */
async function rpc(funcao, args, { ip = null, papel = 'anon', userId = null } = {}) {
  const marcas = args.map((_, i) => `$${i + 1}`).join(', ')
  return comoPedido(db, { papel, userId, ip, caminho: `/rpc/${funcao}` }, async () => {
    const r = (await db.query(`select public.${funcao}(${marcas}) as r`, args)).rows[0].r
    const status = (await db.query("select current_setting('response.status', true) as s")).rows[0].s
    const cab = (await db.query("select current_setting('response.headers', true) as h")).rows[0].h
    return { ...r, _status: status || null, _cabecalhos: cab ? JSON.parse(cab) : null }
  })
}

/** Enche a janela atual de uma chave até `n` (como se já tivesse havido n pedidos). */
async function encher(chave, janela, n) {
  await db.query(
    `insert into private.limites (chave, janela, contagem)
     values ($1 || '|' || $2::int, to_timestamp(floor(extract(epoch from clock_timestamp()) / $2::int) * $2::int), $3)
     on conflict (chave, janela) do update set contagem = excluded.contagem`,
    [chave, janela, n]
  )
}

/** A checagem do PostgREST para um pedido. Devolve null (passou) ou o erro. */
async function checar({ papel = 'anon', ip = '200.10.10.10', metodo = 'POST', caminho = '/rpc/minha_conta', somenteLeitura = false, cabecalhos = {} } = {}) {
  try {
    await comoPedido(db, { papel, ip, metodo, caminho, somenteLeitura, cabecalhos }, () =>
      db.query('select private.checar_requisicao()')
    )
    return null
  } catch (erro) {
    return erro
  }
}

/** Erro no formato que o PostgREST transforma em resposta HTTP. */
function respostaHttp(erro) {
  assert.ok(erro, 'o pedido deveria ter sido recusado')
  assert.equal(erro.code, 'PGRST', `SQLSTATE inesperado: ${erro.code} ${erro.message}`)
  return { corpo: JSON.parse(erro.message), http: JSON.parse(erro.detail) }
}

const contaNova = async (nome, telefone, ip = null) => {
  const r = await rpc('criar_conta', [nome, telefone, 'CorteBom2026', null], { ip })
  assert.equal(r.ok, true, r.mensagem)
  return r.sessao.token
}

// ---------------------------------------------------------------------
test('IP: vale o cf-connecting-ip; no x-forwarded-for só o último endereço', async () => {
  const ip = (cabecalhos) =>
    comoPedido(db, { papel: null, cabecalhos }, async () =>
      (await uma('select private.ip_do_cliente() as ip')).ip
    )
  assert.equal(await ip({ 'cf-connecting-ip': '200.1.2.3', 'x-forwarded-for': '9.9.9.9' }), '200.1.2.3')
  // O começo do x-forwarded-for é o visitante que escreve: não vale.
  assert.equal(await ip({ 'x-forwarded-for': '1.2.3.4, 200.9.9.9' }), '200.9.9.9')
  assert.equal(await ip({ 'x-forwarded-for': '200.9.9.9' }), '200.9.9.9')
  // IP interno ou lixo: não dá para confiar, ninguém é travado por engano.
  assert.equal(await ip({ 'x-forwarded-for': '200.1.1.1, 10.0.0.5' }), null)
  assert.equal(await ip({ 'cf-connecting-ip': 'nao-e-ip' }), null)
  assert.equal(await ip({ 'cf-connecting-ip': '127.0.0.1' }), null)
  assert.equal(await ip({}), null)
  // IPv6: a casa inteira (bloco /64) conta como um endereço.
  assert.equal(await ip({ 'cf-connecting-ip': '2804:14c:5b:1234:abcd::1' }), '2804:14c:5b:1234::/64')
  assert.equal(await ip({ 'cf-connecting-ip': '2804:14c:5b:1234:ffff::9' }), '2804:14c:5b:1234::/64')
})

test('contador: segue até o limite, depois manda esperar; cada chave é separada', async () => {
  const consumir = (chave) =>
    comoInterno(db, async () => (await uma("select private.consumir_limite($1, 3, 60) as e", [chave])).e)
  for (let i = 0; i < 3; i++) assert.equal(await consumir('teste:a'), 0, `pedido ${i + 1}`)
  const espera = await consumir('teste:a')
  assert.ok(espera >= 1 && espera <= 60, `espera fora do esperado: ${espera}`)
  assert.equal(await consumir('teste:b'), 0, 'outra chave travou junto')
})

test('contador: a janela anterior ainda pesa (não dá para dobrar o limite na virada)', async () => {
  const chave = 'teste:virada'
  const peso = (await uma(
    `select 1 - (extract(epoch from clock_timestamp()) - floor(extract(epoch from clock_timestamp()) / 600) * 600) / 600 as p`
  )).p
  const anterior = Math.ceil(6 / Math.max(peso - 0.001, 0.0005)) + 1
  await db.query(
    `insert into private.limites (chave, janela, contagem)
     values ($1 || '|600', to_timestamp(floor(extract(epoch from clock_timestamp()) / 600) * 600 - 600), $2)`,
    [chave, anterior]
  )
  const e = await comoInterno(db, async () => (await uma('select private.consumir_limite($1, 5, 600) as e', [chave])).e)
  assert.ok(e > 0, 'a janela anterior cheia foi ignorada')
})

// ---------------------------------------------------------------------
test('checagem da API: freio geral por IP responde 429 com Retry-After', async () => {
  assert.equal(await checar({ ip: '200.20.20.1' }), null, 'primeiro pedido barrado')
  await encher('ip:200.20.20.2', 60, 120)
  const { corpo, http } = respostaHttp(await checar({ ip: '200.20.20.2' }))
  assert.equal(http.status, 429)
  assert.ok(Number(http.headers['Retry-After']) >= 1, 'sem Retry-After')
  assert.equal(corpo.code, 'MUITOS_PEDIDOS')
  // Outro IP segue normal.
  assert.equal(await checar({ ip: '200.20.20.3' }), null, 'IP vizinho travou junto')
  // Painel do dono (authenticated) tem folga maior.
  assert.equal(await checar({ papel: 'authenticated', ip: '200.20.20.2' }), null, 'dono travado no limite do site')
})

test('checagem da API: freio por rota (login) não trava as outras rotas', async () => {
  await encher('rota:entrar:200.30.30.1', 60, 10)
  const { http } = respostaHttp(await checar({ ip: '200.30.30.1', caminho: '/rpc/entrar' }))
  assert.equal(http.status, 429)
  assert.equal(await checar({ ip: '200.30.30.1', caminho: '/rpc/dias_disponiveis' }), null)
  // O caminho pode vir com o prefixo da API.
  const comPrefixo = await checar({ ip: '200.30.30.1', caminho: '/rest/v1/rpc/entrar' })
  assert.equal(respostaHttp(comPrefixo).http.status, 429)
})

test('checagem da API: Edge Function (service_role) e pedido sem IP confiável não são travados', async () => {
  await encher('ip:200.40.40.1', 60, 1000)
  assert.equal(await checar({ papel: 'service_role', ip: '200.40.40.1' }), null)
  assert.equal(await checar({ ip: null, cabecalhos: { 'x-forwarded-for': '10.1.1.1' } }), null)
})

test('checagem da API: /rpc só por POST para o site; GET de tabela não grava nada', async () => {
  const get = respostaHttp(await checar({ metodo: 'GET', caminho: '/rpc/dias_disponiveis' }))
  assert.equal(get.http.status, 405)
  assert.equal(respostaHttp(await checar({ metodo: 'HEAD', caminho: '/rpc/entrar' })).http.status, 405)

  const antes = (await uma("select count(*)::int as n from private.limites where chave like 'ip:200.50.50.1|%'")).n
  assert.equal(
    await checar({ ip: '200.50.50.1', metodo: 'GET', caminho: '/servicos', somenteLeitura: true }),
    null,
    'leitura de tabela barrada'
  )
  const depois = (await uma("select count(*)::int as n from private.limites where chave like 'ip:200.50.50.1|%'")).n
  assert.equal(depois, antes, 'gravou contador numa transação só de leitura')
})

test('checagem da API: pedido grande demais é recusado (413)', async () => {
  const grande = respostaHttp(await checar({ cabecalhos: { 'content-length': '20000' } }))
  assert.equal(grande.http.status, 413)
  assert.equal(await checar({ cabecalhos: { 'content-length': '900' } }), null)
  assert.equal(await checar({ papel: 'authenticated', cabecalhos: { 'content-length': '20000' } }), null)
})

test('o visitante só consegue chamar a checagem; contadores e registros ficam fechados', async () => {
  for (const sql of [
    'select * from private.limites',
    'select * from private.eventos_seguranca',
    "select private.consumir_limite('x', 1, 60)",
    'select private.ip_do_cliente()',
    'select private.resposta_limite(5)',
    "insert into private.limites values ('x', now(), 0)",
  ]) {
    await assert.rejects(() => comoAnonimo(db, () => db.query(sql)), /permission denied/, sql)
  }
})

// ---------------------------------------------------------------------
test('login: mais de 30 tentativas em 15 min no mesmo IP recebem 429 antes da senha', async () => {
  await encher('entrar:ip:200.60.60.1', 900, 30)
  const r = await rpc('entrar', ['17999990001', 'qualquer1'], { ip: '200.60.60.1' })
  assert.equal(r.erro, 'MUITOS_PEDIDOS')
  assert.equal(r._status, '429')
  assert.ok(Number(r._cabecalhos[0]['Retry-After']) >= 1)
  assert.ok(r.tentar_em_segundos >= 1)
  // Outro IP continua recebendo a resposta normal.
  assert.equal((await rpc('entrar', ['17999990001', 'qualquer1'], { ip: '200.60.60.2' })).erro, 'LOGIN_INVALIDO')
  // O bloqueio fica registrado (uma vez por janela).
  await rpc('entrar', ['17999990001', 'qualquer1'], { ip: '200.60.60.1' })
  const ev = await todas("select ip from private.eventos_seguranca where tipo = 'limite' and chave like 'entrar:ip:200.60.60.1|%'")
  assert.equal(ev.length, 1, 'registro repetido ou ausente')
  assert.equal(ev[0].ip, '200.60.60.1')
})

test('login: a trava por número continua e fica registrada sem o número inteiro', async () => {
  await contaNova('Teste Trava', '17944440001')
  for (let i = 0; i < 5; i++) {
    assert.equal((await rpc('entrar', ['17944440001', 'errada99'], { ip: `200.61.0.${i + 1}` })).erro, 'LOGIN_INVALIDO')
  }
  assert.equal((await rpc('entrar', ['17944440001', 'CorteBom2026'], { ip: '200.61.0.9' })).erro, 'LOGIN_TRAVADO')
  const ev = await uma("select chave from private.eventos_seguranca where tipo = 'login_travado' order by id desc limit 1")
  assert.equal(ev.chave, '1794***')
})

test('criar conta: senha óbvia recusada; só tentativa válida conta no limite do IP', async () => {
  for (const senha of ['123456', '111111', 'aaaaaaa', 'senha123', '17933330001']) {
    const r = await rpc('criar_conta', ['Fulano Senha', '17933330001', senha, null], { ip: '200.70.70.1' })
    assert.equal(r.erro, 'SENHA_FRACA', senha)
  }
  // Errar os dados várias vezes não gasta o limite de contas novas.
  for (let i = 0; i < 12; i++) {
    await rpc('criar_conta', ['X', '17933330001', 'CorteBom2026', null], { ip: '200.70.70.1' })
  }
  assert.equal((await rpc('criar_conta', ['Fulano Senha', '17933330001', 'CorteBom2026', null], { ip: '200.70.70.1' })).ok, true)

  await encher('criar_conta:ip:200.70.70.2', 3600, 10)
  const r = await rpc('criar_conta', ['Ciclano Limite', '17933330002', 'CorteBom2026', null], { ip: '200.70.70.2' })
  assert.equal(r.erro, 'MUITOS_PEDIDOS')
  assert.equal(r._status, '429')
  assert.equal((await uma("select count(*)::int as n from public.contas where telefone = '17933330002'")).n, 0)
})

test('agendar e cancelar pela conta têm limite por conta (e por IP)', async () => {
  const token = await contaNova('Teste Agenda', '17922220001')
  const conta = (await uma("select id from public.contas where telefone = '17922220001'")).id

  const ok = await rpc('criar_agendamento_conta', [token, CORTE, DIA, '09:00', null], { ip: '200.80.80.1' })
  assert.equal(ok.ok, true, ok.mensagem)

  await encher(`agendar:conta:${conta}`, 86400, 15)
  const barrado = await rpc('criar_agendamento_conta', [token, CORTE, DIA, '10:00', null], { ip: '200.80.80.1' })
  assert.equal(barrado.erro, 'MUITOS_PEDIDOS')
  assert.equal(barrado._status, '429')

  await encher(`cancelar:conta:${conta}`, 86400, 5)
  const c = await rpc('cancelar_meu_agendamento', [token, ok.agendamento.id], { ip: '200.80.80.1' })
  assert.equal(c.erro, 'MUITOS_PEDIDOS')
  assert.equal((await uma('select cancelado_em from public.agendamentos where id = $1', [ok.agendamento.id])).cancelado_em, null)

  const outro = await contaNova('Outra Conta', '17922220002')
  await encher('agendar:ip:200.80.80.2', 3600, 30)
  assert.equal(
    (await rpc('criar_agendamento_conta', [outro, CORTE, DIA, '11:00', null], { ip: '200.80.80.2' })).erro,
    'MUITOS_PEDIDOS'
  )
})

// ---------------------------------------------------------------------
test('ninguém de fora agenda sem conta nem mexe em plano pelo telefone', async () => {
  const chamadas = [
    ['select public.criar_agendamento($1,$2,$3,$4,$5,null)', [CORTE, DIA, '15:00', 'Robô', '17911110000']],
    ['select public.meu_plano($1)', ['17911110000']],
    ['select public.solicitar_plano($1,$2,$3)', [ELITE, 'Robô', '17911110000']],
  ]
  for (const [sql, args] of chamadas) {
    await assert.rejects(() => comoAnonimo(db, () => db.query(sql, args)), /permission denied/, `anon: ${sql}`)
    await assert.rejects(
      () => comoAdmin(db, randomUUID(), () => db.query(sql, args)),
      /permission denied/,
      `authenticated: ${sql}`
    )
  }
})

test('plano pela conta: cada um vê só o seu; pedir para outra pessoa não renomeia o cadastro dela', async () => {
  const token = await contaNova('Dono Do Plano', '17955550001')
  assert.equal((await rpc('meu_plano_conta', ['x'.repeat(64)])).erro, 'SESSAO_EXPIRADA')
  assert.equal((await rpc('meu_plano_conta', [token])).plano, null)

  const pedido = await rpc('solicitar_plano_conta', [token, ELITE, null, null])
  assert.equal(pedido.ok, true, pedido.mensagem)
  assert.equal((await rpc('meu_plano_conta', [token])).plano.status, 'solicitada')

  // Alguém já cadastrado (veio cortar no balcão)...
  await db.query("insert into public.clientes (nome, telefone) values ('Avô Cadastrado', '17955550099')")
  const paraOutro = await rpc('solicitar_plano_conta', [token, ELITE, 'Nome Inventado', '(17) 95555-0099'])
  assert.equal(paraOutro.ok, true, paraOutro.mensagem)
  assert.equal((await uma("select nome from public.clientes where telefone = '17955550099'")).nome, 'Avô Cadastrado')

  // Outra conta não enxerga o plano da primeira.
  const vizinho = await contaNova('Vizinho Curioso', '17955550002')
  assert.equal((await rpc('meu_plano_conta', [vizinho])).plano, null)
})

// ---------------------------------------------------------------------
const P256 = 'B' + 'A'.repeat(86)
const AUTH = 'C'.repeat(22)

test('aviso no celular: só endereços dos serviços de push (sem SSRF)', async () => {
  const token = await contaNova('Teste Push', '17966660001')
  for (const ruim of [
    'https://evil.example/push',
    'https://fcm.googleapis.com.evil.example/x',
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/x',
  ]) {
    assert.equal((await rpc('registrar_aparelho_conta', [token, ruim, P256, AUTH])).erro, 'DADOS_INCOMPLETOS', ruim)
  }
  for (const bom of [
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://web.push.apple.com/QGx1',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAA',
    'https://wns2-bn3p.notify.windows.com/w/?token=BQYAAA',
  ]) {
    assert.equal((await rpc('registrar_aparelho_conta', [token, bom, P256, AUTH])).ok, true, bom)
  }
  // Nem por dentro do banco entra endereço estranho.
  await assert.rejects(
    () =>
      db.query(
        `insert into public.aparelhos_conta (conta_id, endpoint, p256dh, auth)
         select id, 'https://evil.example/x', $1, $2 from public.contas where telefone = '17966660001'`,
        [P256, AUTH]
      ),
    /aparelhos_conta_servico_push/
  )
  // Painel do dono: mesma regra.
  const web = await comoAdmin(db, ID_DONO, async () =>
    (await uma("select public.registrar_dispositivo_web('https://evil.example/x', $1, $2) as r", [P256, AUTH])).r
  )
  assert.equal(web.erro, 'DADOS_INCOMPLETOS')
})

test('aviso no celular: no máximo 5 aparelhos por conta; repetir o mesmo não gasta limite', async () => {
  const token = await contaNova('Teste Aparelhos', '17966660002')
  for (let i = 1; i <= 7; i++) {
    const r = await rpc('registrar_aparelho_conta', [token, `https://fcm.googleapis.com/fcm/send/aparelho-${i}`, P256, AUTH])
    assert.equal(r.ok, true, r.mensagem)
  }
  const ficaram = await todas(
    `select endpoint from public.aparelhos_conta a join public.contas c on c.id = a.conta_id
      where c.telefone = '17966660002' order by endpoint`
  )
  assert.equal(ficaram.length, 5)
  assert.ok(!ficaram.some((a) => a.endpoint.endsWith('-1') || a.endpoint.endsWith('-2')), 'os mais antigos ficaram')

  // O site confere o aparelho a cada visita: 20 visitas não travam nada.
  for (let i = 0; i < 20; i++) {
    const r = await rpc('registrar_aparelho_conta', [token, 'https://fcm.googleapis.com/fcm/send/aparelho-7', P256, AUTH])
    assert.equal(r.ok, true, `visita ${i + 1}: ${r.mensagem}`)
  }
})

// ---------------------------------------------------------------------
test('sessão: 1 ano, renovada no uso; as antigas de 10 anos foram encurtadas', async () => {
  const token = await contaNova('Teste Sessao', '17977770001')
  const s = await uma(
    "select expira_em <= now() + interval '366 days' as ok from public.sessoes_conta where token_hash = public.hash_sessao($1)",
    [token]
  )
  assert.ok(s.ok, 'sessão longa demais')
  const longas = await uma("select count(*)::int as n from public.sessoes_conta where expira_em > now() + interval '366 days'")
  assert.equal(longas.n, 0)
})

test('link do mapa: "javascript:" não entra nem pelo painel do dono', async () => {
  await assert.rejects(
    () => comoAdmin(db, ID_DONO, () => db.query("update public.config_barbearia set mapa_url = 'javascript:alert(1)' where id")),
    /config_mapa_url_segura/
  )
  await comoAdmin(db, ID_DONO, () =>
    db.query("update public.config_barbearia set mapa_url = 'https://maps.app.goo.gl/abc' where id")
  )
  assert.equal((await uma('select mapa_url from public.config_barbearia')).mapa_url, 'https://maps.app.goo.gl/abc')
})

test('agenda pública: o site não vê o histórico antigo, só o que ainda interessa', async () => {
  await db.query(
    `insert into public.agenda_publica (id, origem, data, horario_inicio, horario_fim, inicio_em, fim_em)
     values ($1, 'bloqueio', current_date - 10, '09:00', '09:30', now() - interval '10 days', now() - interval '10 days' + interval '30 minutes')`,
    [randomUUID()]
  )
  const antigos = await comoAnonimo(db, async () =>
    (await uma("select count(*)::int as n from public.agenda_publica where fim_em < now() - interval '2 days'")).n
  )
  assert.equal(antigos, 0)
  const futuros = await comoAnonimo(db, async () =>
    (await uma('select count(*)::int as n from public.agenda_publica where fim_em > now()')).n
  )
  assert.ok(futuros >= 1, 'o site deixou de ver os horários ocupados futuros')
})

test('horários e dias livres continuam funcionando para o site (agora contados)', async () => {
  const dias = await comoPedido(db, { ip: '200.90.90.1', caminho: '/rpc/dias_disponiveis' }, async () =>
    todas('select * from public.dias_disponiveis($1, $2::date, $2::date + 6)', [CORTE, DIA])
  )
  assert.equal(dias.length, 7)
  const horas = await comoPedido(db, { ip: '200.90.90.1', caminho: '/rpc/horarios_disponiveis' }, async () =>
    todas('select * from public.horarios_disponiveis($1, $2)', [CORTE, DIA])
  )
  assert.ok(horas.some((h) => h.disponivel), 'nenhum horário livre')
})
