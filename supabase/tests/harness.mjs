// =====================================================================
// Infraestrutura da suite de testes do banco.
// Sobe um PostgreSQL real (PGlite/WASM), aplica o shim do Supabase,
// todas as migracoes e o seed — exatamente na ordem de producao.
// =====================================================================
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const DIR_MIGRACOES = join(aqui, '..', 'migrations')
const ARQ_SEED = join(aqui, '..', 'seed.sql')
const ARQ_SHIM = join(aqui, 'auth_shim.sql')

// Agenda FIXA dos testes, independente dos horários reais da barbearia
// (que ficam no seed e podem mudar a qualquer momento).
const AGENDA_DOS_TESTES = `
  update public.config_horarios
     set aberto = false, abre = null, fecha = null, intervalo_inicio = null, intervalo_fim = null
   where dia_semana = 0;
  update public.config_horarios
     set aberto = true, abre = '09:00', fecha = '19:00', intervalo_inicio = '12:00', intervalo_fim = '13:30'
   where dia_semana between 1 and 4;
  update public.config_horarios
     set aberto = true, abre = '09:00', fecha = '20:00', intervalo_inicio = '12:00', intervalo_fim = '13:30'
   where dia_semana = 5;
  update public.config_horarios
     set aberto = true, abre = '08:00', fecha = '18:00', intervalo_inicio = null, intervalo_fim = null
   where dia_semana = 6;
`

/** PostgreSQL vazio com a pgcrypto (no Supabase ela já vem instalada). */
export function novoPostgres() {
  return PGlite.create({ extensions: { pgcrypto } })
}

export async function criarBanco({ comSeed = true, agendaDeTeste = true } = {}) {
  const db = await novoPostgres()

  await db.exec(await readFile(ARQ_SHIM, 'utf8'))

  const arquivos = (await readdir(DIR_MIGRACOES)).filter((f) => f.endsWith('.sql')).sort()
  for (const arquivo of arquivos) {
    const sql = await readFile(join(DIR_MIGRACOES, arquivo), 'utf8')
    try {
      await db.exec(sql)
    } catch (erro) {
      throw new Error(`Falha na migracao ${arquivo}:\n${erro.message}`)
    }
  }

  if (comSeed) {
    await db.exec(await readFile(ARQ_SEED, 'utf8'))
    if (agendaDeTeste) await db.exec(AGENDA_DOS_TESTES)
  }

  return db
}

// ---------------------------------------------------------------------
// Execucao com identidade: reproduz o que o PostgREST faz em cada
// requisicao (SET ROLE + claims do JWT), para testar o RLS de verdade.
// PGlite mantem uma unica conexao, entao cada identidade roda dentro de
// uma transacao explicita com "set local".
// ---------------------------------------------------------------------
export async function comoAnonimo(db, fn) {
  return executarEmTransacao(db, 'anon', null, fn)
}

export async function comoAdmin(db, userId, fn) {
  return executarEmTransacao(db, 'authenticated', userId, fn)
}

export async function comoUsuarioComum(db, userId, fn) {
  return executarEmTransacao(db, 'authenticated', userId, fn)
}

/** Papel usado pela Edge Function (chave service_role, só no servidor). */
export async function comoServico(db, fn) {
  return executarEmTransacao(db, 'service_role', null, fn)
}

/**
 * Por dentro do banco (dono das funções), sem papel da API. É como as
 * funções da conta chamam o motor de agendamento e de planos.
 */
export async function comoInterno(db, fn) {
  return executarEmTransacao(db, null, null, fn)
}

/**
 * Um pedido HTTP de verdade, como o PostgREST monta: papel, cabeçalhos
 * (o IP vem do cf-connecting-ip), método, caminho e transação só de
 * leitura (GET) ou de escrita (POST).
 */
export async function comoPedido(
  db,
  { papel = 'anon', userId = null, ip = null, cabecalhos = {}, metodo = 'POST', caminho = '/rpc/x', somenteLeitura = false },
  fn,
) {
  const extras = {
    'request.headers': JSON.stringify({ ...(ip ? { 'cf-connecting-ip': ip } : {}), ...cabecalhos }),
    'request.method': metodo,
    'request.path': caminho,
  }
  return executarEmTransacao(db, papel, userId, fn, extras, somenteLeitura)
}

async function executarEmTransacao(db, papel, userId, fn, extras = {}, somenteLeitura = false) {
  const claims = userId
    ? JSON.stringify({ sub: userId, role: papel })
    : JSON.stringify({ role: papel ?? 'postgres' })

  await db.exec('begin')
  try {
    if (somenteLeitura) await db.exec('set transaction read only')
    await db.query('select set_config($1, $2, true)', ['request.jwt.claims', papel ? claims : ''])
    for (const [nome, valor] of Object.entries(extras)) {
      await db.query('select set_config($1, $2, true)', [nome, valor])
    }
    if (papel) await db.exec(`set local role ${papel}`)
    const resultado = await fn()
    await db.exec('commit')
    return resultado
  } catch (erro) {
    try {
      await db.exec('rollback')
    } catch {
      /* ignora */
    }
    throw erro
  }
}

// ---------------------------------------------------------------------
// Mini framework de asserts (sem dependencias externas).
// ---------------------------------------------------------------------
const resultados = []
let grupoAtual = 'geral'

export function grupo(nome) {
  grupoAtual = nome
  resultados.push({ tipo: 'grupo', nome })
}

export async function teste(nome, fn) {
  try {
    await fn()
    resultados.push({ tipo: 'ok', nome, grupo: grupoAtual })
  } catch (erro) {
    resultados.push({ tipo: 'falha', nome, grupo: grupoAtual, erro: erro.message })
  }
}

export function igual(recebido, esperado, mensagem = '') {
  const a = JSON.stringify(recebido)
  const b = JSON.stringify(esperado)
  if (a !== b) {
    throw new Error(`${mensagem} — esperado ${b}, recebido ${a}`)
  }
}

export function verdadeiro(valor, mensagem = 'condicao falsa') {
  if (!valor) throw new Error(mensagem)
}

export function falso(valor, mensagem = 'condicao verdadeira') {
  if (valor) throw new Error(mensagem)
}

export async function lancaErro(fn, trechoEsperado, mensagem = '') {
  let lancou = false
  let texto = ''
  try {
    await fn()
  } catch (erro) {
    lancou = true
    texto = erro.message || String(erro)
  }
  if (!lancou) {
    throw new Error(`${mensagem} — esperava erro contendo "${trechoEsperado}", mas nada foi lancado`)
  }
  if (trechoEsperado && !texto.includes(trechoEsperado)) {
    throw new Error(`${mensagem} — esperava erro contendo "${trechoEsperado}", recebido "${texto}"`)
  }
}

export function relatorio() {
  const falhas = resultados.filter((r) => r.tipo === 'falha')
  const oks = resultados.filter((r) => r.tipo === 'ok')

  for (const r of resultados) {
    if (r.tipo === 'grupo') {
      console.log(`\n\x1b[1m${r.nome}\x1b[0m`)
    } else if (r.tipo === 'ok') {
      console.log(`  \x1b[32mok\x1b[0m   ${r.nome}`)
    } else {
      console.log(`  \x1b[31mFALHA\x1b[0m ${r.nome}`)
      console.log(`        ${r.erro}`)
    }
  }

  console.log(
    `\n${oks.length} teste(s) passaram, ${falhas.length} falharam de ${oks.length + falhas.length}.`
  )
  return falhas.length
}
