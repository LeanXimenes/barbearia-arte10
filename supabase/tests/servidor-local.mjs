// =====================================================================
// SERVIDOR DE DESENVOLVIMENTO (não é produção)
// =====================================================================
// Sobe o banco real da Barbearia Arte 10 em memória (PGlite) e expõe os
// poucos endpoints do PostgREST que o site usa. Serve para rodar e
// testar o site inteiro sem precisar de um projeto Supabase.
//
//   node supabase/tests/servidor-local.mjs
//   (em outro terminal)
//   cd web && VITE_SUPABASE_URL=http://localhost:54321 \
//             VITE_SUPABASE_ANON_KEY=local npm run dev
//
// Em produção quem responde isso é o Supabase — este arquivo nunca é
// publicado.
// =====================================================================
import { createServer } from 'node:http'
import { criarBanco } from './harness.mjs'

const PORTA = Number(process.env.PORTA ?? 54321)

// Só estas tabelas e funções são acessíveis, exatamente como o site usa.
const TABELAS_PERMITIDAS = new Set([
  'servicos',
  'config_barbearia',
  'config_horarios',
  'agenda_publica',
  'planos',
  'promocoes',
])
const FUNCOES_PERMITIDAS = new Set([
  'horarios_disponiveis',
  'dias_disponiveis',
  'criar_agendamento',
  'solicitar_plano',
  'meu_plano',
])

const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/

// Os dados e horários REAIS do seed: a demonstração mostra o site como ele vai ficar.
const db = await criarBanco({ agendaDeTeste: false })
console.log('Banco carregado (migrações + seed).')

function cabecalhosCors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  }
}

function responder(res, status, corpo) {
  res.writeHead(status, cabecalhosCors())
  res.end(JSON.stringify(corpo))
}

/** Executa a consulta com o papel "anon", igual ao site público. */
async function comoAnon(fn) {
  await db.exec('begin')
  try {
    await db.query('select set_config($1,$2,true)', [
      'request.jwt.claims',
      JSON.stringify({ role: 'anon' }),
    ])
    await db.exec('set local role anon')
    const r = await fn()
    await db.exec('commit')
    return r
  } catch (e) {
    await db.exec('rollback').catch(() => {})
    throw e
  }
}

function montarSelect(tabela, params) {
  const colunas = (params.get('select') ?? '*')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c === '*' || IDENTIFICADOR.test(c))

  if (colunas.length === 0) colunas.push('*')

  const valores = []
  const condicoes = []

  for (const [chave, valor] of params.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(chave)) continue
    if (!IDENTIFICADOR.test(chave)) continue

    const [operador, ...resto] = valor.split('.')
    const alvo = resto.join('.')
    if (operador !== 'eq') continue

    valores.push(alvo === 'true' ? true : alvo === 'false' ? false : alvo)
    condicoes.push(`${chave} = $${valores.length}`)
  }

  const ordens = params
    .getAll('order')
    .map((o) => {
      const [coluna, direcao] = o.split('.')
      if (!coluna || !IDENTIFICADOR.test(coluna)) return null
      return `${coluna} ${direcao === 'desc' ? 'desc' : 'asc'}`
    })
    .filter(Boolean)

  let sql = `select ${colunas.join(', ')} from public.${tabela}`
  if (condicoes.length) sql += ` where ${condicoes.join(' and ')}`
  if (ordens.length) sql += ` order by ${ordens.join(', ')}`

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
    res.writeHead(204, cabecalhosCors())
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORTA}`)
  const caminho = url.pathname

  try {
    // --------------------------------------------------------- RPC ---
    if (caminho.startsWith('/rest/v1/rpc/') && req.method === 'POST') {
      const funcao = caminho.slice('/rest/v1/rpc/'.length)
      if (!FUNCOES_PERMITIDAS.has(funcao)) {
        return responder(res, 404, { message: `função não exposta: ${funcao}` })
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

      const resultado = await comoAnon(() => db.query(sql, valores))
      return responder(res, 200, retornaConjunto ? resultado.rows : resultado.rows[0]?.r ?? null)
    }

    // ------------------------------------------------------ TABELAS ---
    if (caminho.startsWith('/rest/v1/') && req.method === 'GET') {
      const tabela = caminho.slice('/rest/v1/'.length)
      if (!TABELAS_PERMITIDAS.has(tabela)) {
        return responder(res, 404, { message: `tabela não exposta: ${tabela}` })
      }

      const { sql, valores } = montarSelect(tabela, url.searchParams)
      const resultado = await comoAnon(() => db.query(sql, valores))
      return responder(res, 200, resultado.rows)
    }

    responder(res, 404, { message: 'rota inexistente' })
  } catch (erro) {
    console.error('Erro:', erro.message)
    responder(res, 400, { message: erro.message, code: 'LOCAL' })
  }
})

servidor.listen(PORTA, () => {
  console.log(`\nAPI local em http://localhost:${PORTA}`)
  console.log('Use no site:')
  console.log(`  VITE_SUPABASE_URL=http://localhost:${PORTA}`)
  console.log('  VITE_SUPABASE_ANON_KEY=local\n')
})
