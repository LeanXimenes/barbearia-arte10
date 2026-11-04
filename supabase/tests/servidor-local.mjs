// =====================================================================
// SERVIDOR DE DESENVOLVIMENTO (não é produção)
// =====================================================================
// Sobe o banco real da Barbearia Arte 10 em memória (PGlite) e expõe os
// endpoints do Supabase que o site e o painel do dono usam. Serve para
// rodar e testar tudo sem precisar de um projeto Supabase.
//
//   node supabase/tests/servidor-local.mjs
//   (em outro terminal)  cd web && npm run dev:demo
//
// Painel do dono (/admin/): entre com o administrador de demonstração
// impresso no console. Cada pedido roda com o papel certo (anon ou
// authenticated + claims do JWT), então RLS e permissões valem de verdade.
//
// Em produção quem responde isso é o Supabase — este arquivo nunca é
// publicado.
// =====================================================================
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { criarBanco } from './harness.mjs'

const PORTA = Number(process.env.PORTA ?? 54321)
const ADMIN_EMAIL = 'dono@arte10.local'
const ADMIN_SENHA = 'demo1234'

// Só estas tabelas e funções são acessíveis (as que o site e o painel usam).
const TABELAS_LEITURA = new Set([
  'servicos',
  'config_barbearia',
  'config_horarios',
  'agenda_publica',
  'planos',
  'promocoes',
  'agendamentos',
  'clientes',
  'clientes_resumo',
  'assinaturas_resumo',
  'administradores',
  'dispositivos_push',
])
const TABELAS_ESCRITA = new Set([
  'servicos',
  'planos',
  'promocoes',
  'config_barbearia',
  'config_horarios',
  'dispositivos_push',
])

const FUNCOES_PERMITIDAS = new Set([
  // site
  'horarios_disponiveis',
  'dias_disponiveis',
  'solicitar_plano_conta',
  'meu_plano_conta',
  'criar_conta',
  'entrar',
  'sair',
  'minha_conta',
  'criar_agendamento_conta',
  'cancelar_meu_agendamento',
  'registrar_aparelho_conta',
  'remover_aparelho_conta',
  // painel do dono (o banco ainda exige is_admin em cada uma)
  'is_admin',
  'proximos_agendamentos',
  'agenda_do_dia',
  'visao_geral_periodo',
  'criar_bloqueio',
  'remover_bloqueio',
  'atualizar_status_agendamento',
  'cancelar_agendamento',
  'apagar_atendimento',
  'apagar_atendimentos_passados',
  'apagar_cliente',
  'reordenar_servicos',
  'excluir_plano',
  'ativar_assinatura',
  'encerrar_assinatura',
  'excluir_assinatura',
  'excluir_assinaturas_encerradas',
  'registrar_dispositivo',
  'registrar_dispositivo_web',
])

// Relações que o painel embute no select (ex.: agendamentos -> clientes).
const EMBUTIDOS = {
  agendamentos: { clientes: { tabela: 'clientes', chave: 'cliente_id' } },
}

const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/

// Os dados e horários REAIS do seed: a demonstração mostra o site como ele vai ficar.
const db = await criarBanco({ agendaDeTeste: false })

// Anti-robô (Turnstile) na demonstração, com as chaves de TESTE oficiais da
// Cloudflare: o desafio aparece de verdade e sempre passa. Sem internet para
// o banco local, a conferência responde como a Cloudflare responderia.
await db.exec(`
  update public.config_barbearia set turnstile_site_key = '1x00000000000000000000AA' where id;
  insert into private.segredos (chave, valor) values ('turnstile_secret', '1x0000000000000000000000000000000AA')
    on conflict (chave) do update set valor = excluded.valor;
  create or replace function private.turnstile_siteverify(p_secret text, p_token text)
  returns jsonb language sql as $f$
    select case when p_secret like '1x%' and p_token = 'XXXX.DUMMY.TOKEN.XXXX'
      then '{"success": true, "action": "criar_conta", "hostname": "localhost"}'
      else '{"success": false, "error-codes": ["invalid-input-response"]}' end::jsonb
  $f$;
`)
const ADMIN_ID = randomUUID()
await db.query('insert into auth.users (id, email) values ($1, $2)', [ADMIN_ID, ADMIN_EMAIL])
await db.query("insert into public.administradores (user_id, nome) values ($1, 'Dono (demonstração)')", [ADMIN_ID])
console.log('Banco carregado (migrações + seed).')

// ---------------------------------------------------------------------
// Auth de mentira (só o administrador de demonstração)
// ---------------------------------------------------------------------
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')

function sessao() {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const usuario = {
    id: ADMIN_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: ADMIN_EMAIL,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: new Date().toISOString(),
  }
  const jwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub: ADMIN_ID,
    role: 'authenticated',
    aud: 'authenticated',
    email: ADMIN_EMAIL,
    exp,
  })}.demo`
  return {
    access_token: jwt,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: `demo-${randomUUID()}`,
    user: usuario,
  }
}

/** Claims do pedido: o JWT do administrador de demonstração ou anon. */
function claimsDoPedido(req) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const partes = token.split('.')
  if (partes.length === 3) {
    try {
      const c = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
      if (c.sub === ADMIN_ID && c.role === 'authenticated' && c.exp > Date.now() / 1000) {
        return { sub: c.sub, role: 'authenticated' }
      }
    } catch {
      // token qualquer: segue como anon
    }
  }
  return { role: 'anon' }
}

// IP de mentira do visitante da demonstração (um IP local não é contado
// pelos freios). Troque com ARTE10_DEMO_IP para simular outra rede.
const IP_DEMO = process.env.ARTE10_DEMO_IP || '203.0.113.10'

/** Erro que o PostgREST devolveria com outro status HTTP (SQLSTATE PGRST). */
class RespostaHttp extends Error {
  constructor(status, corpo, cabecalhos = {}) {
    super(corpo?.message ?? 'erro')
    this.status = status
    this.corpo = corpo
    this.cabecalhos = cabecalhos
  }
}

/**
 * Roda como o PostgREST do Supabase: papel + cabeçalhos do pedido, a
 * checagem antes de tudo (db_pre_request) e o status/cabeçalhos que a
 * função pedir (response.status / response.headers).
 */
async function comPapel(claims, fn, pedido = {}) {
  const { metodo = 'POST', caminho = '/', somenteLeitura = false, tamanho = 0 } = pedido
  await db.exec('begin')
  try {
    if (somenteLeitura) await db.exec('set transaction read only')
    const cabecalhos = { 'cf-connecting-ip': IP_DEMO, 'content-length': String(tamanho) }
    for (const [nome, valor] of [
      ['request.jwt.claims', JSON.stringify(claims)],
      ['request.headers', JSON.stringify(cabecalhos)],
      ['request.method', metodo],
      ['request.path', caminho],
    ]) {
      await db.query('select set_config($1,$2,true)', [nome, valor])
    }
    await db.exec(`set local role ${claims.role === 'authenticated' ? 'authenticated' : 'anon'}`)
    await db.query('select private.checar_requisicao()')
    const r = await fn()
    const extra = (await db.query(
      "select current_setting('response.status', true) as s, current_setting('response.headers', true) as h"
    )).rows[0]
    await db.exec('commit')
    if (extra?.s && extra.s !== '200') {
      const cab = extra.h ? Object.assign({}, ...JSON.parse(extra.h)) : {}
      throw new RespostaHttp(Number(extra.s), r?.rows?.[0]?.r ?? null, cab)
    }
    return r
  } catch (e) {
    await db.exec('rollback').catch(() => {})
    if (e?.code === 'PGRST') {
      const http = JSON.parse(e.detail)
      throw new RespostaHttp(http.status, JSON.parse(e.message), http.headers ?? {})
    }
    throw e
  }
}

// ---------------------------------------------------------------------
// PostgREST mínimo
// ---------------------------------------------------------------------
function cabecalhosCors(req) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': req?.headers['access-control-request-headers'] ?? '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range',
    'Content-Type': 'application/json; charset=utf-8',
  }
}

function responder(req, res, status, corpo, extras = {}) {
  res.writeHead(status, { ...cabecalhosCors(req), ...extras })
  res.end(corpo === undefined ? '' : JSON.stringify(corpo))
}

/** Converte um filtro do PostgREST ("eq.5", "ilike.%ana%") em SQL. */
function condicao(coluna, expressao, valores) {
  const [operador, ...resto] = expressao.split('.')
  const bruto = resto.join('.')
  const valor = bruto === 'true' ? true : bruto === 'false' ? false : bruto === 'null' ? null : bruto
  const ops = { eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=', like: 'like', ilike: 'ilike' }
  if (operador === 'is') return `${coluna} is ${valor === null ? 'null' : valor ? 'true' : 'false'}`
  const sqlOp = ops[operador]
  if (!sqlOp) return null
  valores.push(operador.endsWith('like') ? String(valor).replace(/\*/g, '%') : valor)
  return `${coluna} ${sqlOp} $${valores.length}`
}

function montarFiltros(params, valores) {
  const condicoes = []
  for (const [chave, valor] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(chave)) continue
    if (chave === 'or') {
      // or=(nome.ilike.%ana%,telefone.ilike.%17%)
      const itens = valor.replace(/^\(|\)$/g, '').split(',')
      const partes = itens
        .map((item) => {
          const [col, ...exp] = item.split('.')
          return IDENTIFICADOR.test(col) ? condicao(col, exp.join('.'), valores) : null
        })
        .filter(Boolean)
      if (partes.length) condicoes.push(`(${partes.join(' or ')})`)
      continue
    }
    if (!IDENTIFICADOR.test(chave)) continue
    const c = condicao(chave, valor, valores)
    if (c) condicoes.push(c)
  }
  return condicoes
}

function montarSelect(tabela, params) {
  const valores = []
  const colunas = []
  const texto = (params.get('select') ?? '*').replace(/\s+/g, '')
  // Divide por vírgula fora de parênteses: "id,clientes(nome,telefone)".
  for (const parte of texto.match(/[^,(]+(\([^)]*\))?/g) ?? ['*']) {
    const embutido = /^([a-z_]+)\(([^)]*)\)$/.exec(parte)
    if (embutido) {
      const rel = EMBUTIDOS[tabela]?.[embutido[1]]
      const campos = embutido[2].split(',').filter((c) => IDENTIFICADOR.test(c))
      if (rel && campos.length) {
        const obj = campos.map((c) => `'${c}', e.${c}`).join(', ')
        colunas.push(
          `(select jsonb_build_object(${obj}) from public.${rel.tabela} e where e.id = t.${rel.chave}) as ${embutido[1]}`,
        )
      }
    } else if (parte === '*' || IDENTIFICADOR.test(parte)) {
      colunas.push(parte === '*' ? 't.*' : `t.${parte}`)
    }
  }
  if (colunas.length === 0) colunas.push('t.*')

  const condicoes = montarFiltros(params, valores)
  const ordens = params
    .getAll('order')
    .flatMap((o) => o.split(','))
    .map((o) => {
      const [coluna, direcao] = o.split('.')
      if (!coluna || !IDENTIFICADOR.test(coluna)) return null
      return `t.${coluna} ${direcao === 'desc' ? 'desc' : 'asc'}`
    })
    .filter(Boolean)

  let sql = `select ${colunas.join(', ')} from public.${tabela} t`
  if (condicoes.length) sql += ` where ${condicoes.join(' and ')}`
  if (ordens.length) sql += ` order by ${ordens.join(', ')}`
  const limite = Number(params.get('limit'))
  const deslocamento = Number(params.get('offset'))
  if (Number.isInteger(limite) && limite > 0) sql += ` limit ${limite}`
  if (Number.isInteger(deslocamento) && deslocamento > 0) sql += ` offset ${deslocamento}`
  return { sql, valores }
}

async function lerCorpo(req) {
  const pedacos = []
  for await (const p of req) pedacos.push(p)
  if (pedacos.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(pedacos).toString('utf8'))
  } catch {
    return {}
  }
}

const servidor = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cabecalhosCors(req))
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORTA}`)
  const caminho = url.pathname

  try {
    // -------------------------------------------------------- AUTH ---
    if (caminho === '/auth/v1/token' && req.method === 'POST') {
      const corpo = await lerCorpo(req)
      const tipo = url.searchParams.get('grant_type')
      if (tipo === 'password' && (corpo.email !== ADMIN_EMAIL || corpo.password !== ADMIN_SENHA)) {
        return responder(req, res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
      }
      return responder(req, res, 200, sessao())
    }
    if (caminho === '/auth/v1/user' && req.method === 'GET') {
      const claims = claimsDoPedido(req)
      if (claims.role !== 'authenticated') return responder(req, res, 401, { message: 'sem sessão' })
      return responder(req, res, 200, sessao().user)
    }
    if (caminho === '/auth/v1/logout') return responder(req, res, 204)

    const claims = claimsDoPedido(req)

    // --------------------------------------------------------- RPC ---
    if (caminho.startsWith('/rest/v1/rpc/') && req.method === 'POST') {
      const funcao = caminho.slice('/rest/v1/rpc/'.length)
      if (!FUNCOES_PERMITIDAS.has(funcao)) {
        return responder(req, res, 404, { message: `função não exposta: ${funcao}` })
      }

      const corpo = await lerCorpo(req)
      const nomes = Object.keys(corpo).filter((n) => IDENTIFICADOR.test(n))
      const valores = nomes.map((n) => corpo[n])
      const argumentos = nomes.map((n, i) => `${n} := $${i + 1}`).join(', ')

      const meta = await db.query(
        `select p.proretset from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = $1
          limit 1`,
        [funcao]
      )
      const retornaConjunto = meta.rows[0]?.proretset === true

      const sql = retornaConjunto
        ? `select * from public.${funcao}(${argumentos})`
        : `select public.${funcao}(${argumentos}) as r`

      const resultado = await comPapel(claims, () => db.query(sql, valores), {
        metodo: 'POST',
        caminho: `/rpc/${funcao}`,
        tamanho: Number(req.headers['content-length'] ?? 0),
      })
      return responder(req, res, 200, retornaConjunto ? resultado.rows : resultado.rows[0]?.r ?? null)
    }

    // ------------------------------------------------------ TABELAS ---
    if (caminho.startsWith('/rest/v1/')) {
      const tabela = caminho.slice('/rest/v1/'.length)

      if (req.method === 'GET') {
        if (!TABELAS_LEITURA.has(tabela)) return responder(req, res, 404, { message: `tabela não exposta: ${tabela}` })
        const { sql, valores } = montarSelect(tabela, url.searchParams)
        const resultado = await comPapel(claims, () => db.query(sql, valores), {
          metodo: 'GET',
          caminho: `/${tabela}`,
          somenteLeitura: true,
        })
        const umSo = (req.headers.accept ?? '').includes('vnd.pgrst.object')
        if (umSo) {
          if (resultado.rows.length !== 1) return responder(req, res, 406, { message: 'esperava uma linha' })
          return responder(req, res, 200, resultado.rows[0])
        }
        return responder(req, res, 200, resultado.rows)
      }

      if (!TABELAS_ESCRITA.has(tabela)) return responder(req, res, 404, { message: `tabela não exposta: ${tabela}` })

      if (req.method === 'POST') {
        const corpo = await lerCorpo(req)
        const linhas = Array.isArray(corpo) ? corpo : [corpo]
        await comPapel(claims, async () => {
          for (const linha of linhas) {
            const cols = Object.keys(linha).filter((c) => IDENTIFICADOR.test(c))
            const marcas = cols.map((_, i) => `$${i + 1}`).join(', ')
            await db.query(`insert into public.${tabela} (${cols.join(', ')}) values (${marcas})`, cols.map((c) => linha[c]))
          }
        })
        return responder(req, res, 201)
      }

      if (req.method === 'PATCH' || req.method === 'DELETE') {
        const valores = []
        const condicoes = montarFiltros(url.searchParams, valores)
        if (condicoes.length === 0) return responder(req, res, 400, { message: 'filtro obrigatório' })
        let sql
        if (req.method === 'PATCH') {
          const corpo = await lerCorpo(req)
          const cols = Object.keys(corpo).filter((c) => IDENTIFICADOR.test(c))
          const sets = cols.map((c) => {
            valores.push(corpo[c])
            return `${c} = $${valores.length}`
          })
          sql = `update public.${tabela} t set ${sets.join(', ')} where ${condicoes.join(' and ')}`
        } else {
          sql = `delete from public.${tabela} t where ${condicoes.join(' and ')}`
        }
        // Os filtros ficam com $1..$n e os valores do SET vêm depois, na mesma lista.
        await comPapel(claims, () => db.query(sql, valores))
        return responder(req, res, 204)
      }
    }

    responder(req, res, 404, { message: 'rota inexistente' })
  } catch (erro) {
    if (erro instanceof RespostaHttp) {
      return responder(req, res, erro.status, erro.corpo, erro.cabecalhos)
    }
    console.error('Erro:', erro.message)
    const negado = /permission denied|row-level security/i.test(erro.message)
    responder(req, res, negado ? 403 : 400, { message: erro.message, code: erro.code ?? 'LOCAL' })
  }
})

servidor.listen(PORTA, () => {
  console.log(`\nAPI local em http://localhost:${PORTA}`)
  console.log('Use no site:')
  console.log(`  VITE_SUPABASE_URL=http://localhost:${PORTA}`)
  console.log('  VITE_SUPABASE_ANON_KEY=local')
  console.log(`\nPainel do dono (/admin/): ${ADMIN_EMAIL} / ${ADMIN_SENHA}\n`)
})
