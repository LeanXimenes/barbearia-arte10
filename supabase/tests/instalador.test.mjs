// Confere o instalador de um arquivo só (supabase/instalar_tudo.sql).
// Rodar: node --test supabase/tests/instalador.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { montarInstalador } from '../gerar_instalador.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const INSTALADOR = join(aqui, '..', 'instalar_tudo.sql')

test('instalar_tudo.sql está em dia com as migrações e o seed', () => {
  const noDisco = readFileSync(INSTALADOR, 'utf8').replace(/\r\n/g, '\n')
  assert.equal(
    noDisco,
    montarInstalador(),
    'instalar_tudo.sql desatualizado: rode "node supabase/gerar_instalador.mjs"'
  )
})

test('o instalador roda do zero e pode ser rodado de novo sem erro', async () => {
  const db = await PGlite.create()
  await db.exec(readFileSync(join(aqui, 'auth_shim.sql'), 'utf8'))
  const sql = readFileSync(INSTALADOR, 'utf8')

  await db.exec(sql)
  await db.exec(sql) // segunda vez: idempotente

  const servicos = await db.query('select count(*)::int as n from public.servicos')
  assert.equal(servicos.rows[0].n, 5, 'o seed duplicou ou não entrou')

  const horarios = await db.query('select count(*)::int as n from public.config_horarios')
  assert.equal(horarios.rows[0].n, 7)

  const semRls = await db.query(
    `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`
  )
  assert.deepEqual(semRls.rows, [], 'tabela sem RLS depois de reinstalar')
  await db.close()
})

test('limpar_testes.sql apaga só os agendamentos "TESTE" e religa a proteção', async () => {
  const db = await PGlite.create()
  await db.exec(readFileSync(join(aqui, 'auth_shim.sql'), 'utf8'))
  await db.exec(readFileSync(INSTALADOR, 'utf8'))

  const corte = (await db.query("select id from public.servicos where nome = 'Corte de cabelo'")).rows[0].id
  const dia = (
    await db.query(
      `select g::date as d from generate_series((now() at time zone 'America/Sao_Paulo')::date + 1,
         (now() at time zone 'America/Sao_Paulo')::date + 10, interval '1 day') g
        where extract(dow from g) between 1 and 4 order by g limit 1`
    )
  ).rows[0].d
  for (const [hora, nome, tel] of [['10:00', 'TESTE Leandro', '17900000010'], ['11:00', 'Cliente Real', '17900000011']]) {
    const r = await db.query('select public.criar_agendamento($1,$2,$3,$4,$5,null) as r', [corte, dia, hora, nome, tel])
    assert.equal(r.rows[0].r.ok, true, `reserva de ${nome} falhou`)
  }

  await db.exec(readFileSync(join(aqui, '..', 'limpar_testes.sql'), 'utf8'))

  const nomes = (await db.query('select cliente_nome from public.agendamentos')).rows.map((r) => r.cliente_nome)
  assert.deepEqual(nomes, ['Cliente Real'], 'apagou demais ou de menos')
  const espelho = (await db.query('select count(*)::int as n from public.agenda_publica')).rows[0].n
  assert.equal(espelho, 1, 'o horário do teste continuou ocupado no site')

  // A proteção voltou a valer depois da limpeza.
  await assert.rejects(() => db.query('delete from public.agendamentos'), /AGENDAMENTO_IMUTAVEL/)
  await db.close()
})

test('ativar_push.sql recusa rodar com os valores de exemplo', async () => {
  const db = await PGlite.create()
  await db.exec(readFileSync(join(aqui, 'auth_shim.sql'), 'utf8'))
  await db.exec(readFileSync(INSTALADOR, 'utf8'))
  const ativar = readFileSync(join(aqui, '..', 'ativar_push.sql'), 'utf8')
  await assert.rejects(() => db.exec(ativar), /Edite a URL e o token/)
  await db.close()
})
