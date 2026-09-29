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

test('dados_da_barbearia.sql corrige um banco instalado com os dados de exemplo', async () => {
  const db = await PGlite.create()
  await db.exec(readFileSync(join(aqui, 'auth_shim.sql'), 'utf8'))
  await db.exec(readFileSync(INSTALADOR, 'utf8'))

  // Situação real: instalado antes de o seed ter os dados verdadeiros.
  await db.exec(`
    update public.config_barbearia set telefone_whatsapp = null, instagram = null,
      endereco = null, cidade = null, uf = null where id;
    update public.config_horarios set aberto = false, abre = null, fecha = null,
      intervalo_inicio = null, intervalo_fim = null where dia_semana = 0;
    update public.config_horarios set aberto = true, abre = '09:00', fecha = '19:00',
      intervalo_inicio = '12:00', intervalo_fim = '13:30' where dia_semana between 1 and 5;

    -- Catálogo antigo: sem "Só raspar", textos e preços velhos, e dois
    -- serviços que saíram da lista (um deles já com cliente agendado).
    delete from public.servicos where nome = 'Só raspar';
    update public.servicos set descricao = 'texto antigo', preco = preco + 1, ordem = ordem + 10;
    insert into public.servicos (nome, preco, duracao_minutos, ordem)
    values ('Corte + Barba', 60, 60, 3), ('Hidratação', 40, 30, 6);
  `)
  const combo = (await db.query("select id from public.servicos where nome = 'Corte + Barba'")).rows[0].id
  const dia = (
    await db.query(
      `select g::date as d from generate_series((now() at time zone 'America/Sao_Paulo')::date + 1,
         (now() at time zone 'America/Sao_Paulo')::date + 10, interval '1 day') g
        where extract(dow from g) between 1 and 4 order by g limit 1`
    )
  ).rows[0].d
  const reserva = await db.query(
    "select public.criar_agendamento($1, $2, '10:00', 'Cliente do Combo', '17900000020', null) as r",
    [combo, dia]
  )
  assert.equal(reserva.rows[0].r.ok, true, 'não conseguiu agendar o combo antigo')

  const corrigir = readFileSync(join(aqui, '..', 'dados_da_barbearia.sql'), 'utf8')
  await db.exec(corrigir)
  await db.exec(corrigir) // pode rodar de novo

  const ativos = (
    await db.query(
      'select nome, descricao, preco::float as preco, duracao_minutos from public.servicos where ativo order by ordem'
    )
  ).rows
  assert.deepEqual(ativos, [
    { nome: 'Corte de cabelo', descricao: 'Corte personalizado com acabamento completo.', preco: 35, duracao_minutos: 35 },
    { nome: 'Barba completa', descricao: 'Modelagem e acabamento para deixar a barba alinhada.', preco: 30, duracao_minutos: 30 },
    { nome: 'Pezinho', descricao: 'Acabamento limpo e preciso para completar o visual.', preco: 15, duracao_minutos: 20 },
    { nome: 'Só raspar', descricao: 'Apenas raspagem.', preco: 10, duracao_minutos: 20 },
    { nome: 'Sobrancelha', descricao: 'Acabamento simples para deixar o olhar alinhado.', preco: 5, duracao_minutos: 10 },
  ])
  const saiu = (await db.query("select nome from public.servicos where not ativo")).rows.map((r) => r.nome)
  assert.deepEqual(saiu, ['Corte + Barba'], 'o combo com cliente deveria ficar só desativado')
  const cliente = (await db.query('select servico_nome, servico_preco::float as preco from public.agendamentos')).rows
  assert.deepEqual(cliente, [{ servico_nome: 'Corte + Barba', preco: 60 }], 'mexeu no agendamento do cliente')

  const cfg = (await db.query('select * from public.config_barbearia')).rows[0]
  assert.equal(cfg.endereco, 'Rua Joaquim Iglesias, 889')
  assert.equal(cfg.cidade, 'Santa Albertina')
  assert.equal(cfg.telefone_whatsapp, '17997313480')
  assert.equal(cfg.instagram, 'aquiles.hiroshi')

  const horas = (
    await db.query(
      `select dia_semana, aberto, to_char(abre,'HH24:MI') as abre, to_char(fecha,'HH24:MI') as fecha,
              intervalo_inicio from public.config_horarios order by dia_semana`
    )
  ).rows
  for (const h of horas) {
    const fimDeSemana = h.dia_semana === 0 || h.dia_semana === 6
    assert.equal(h.aberto, true, `dia ${h.dia_semana} fechado`)
    assert.equal(h.abre, fimDeSemana ? '09:00' : '08:00', `abertura do dia ${h.dia_semana}`)
    assert.equal(h.fecha, fimDeSemana ? '23:00' : '12:30', `fechamento do dia ${h.dia_semana}`)
    assert.equal(h.intervalo_inicio, null, `intervalo no dia ${h.dia_semana}`)
  }
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
