// =====================================================================
// BARBEARIA ARTE 10 — Suite de testes do banco de dados
// =====================================================================
// Cobre os 27 casos exigidos no item 33 da especificacao, alem das
// regras de RLS e da regra absoluta de imutabilidade dos agendamentos.
//
// Roda um PostgreSQL real (PGlite) com as migracoes de producao.
//
// LIMITE CONHECIDO: o PGlite expoe uma unica conexao, entao nao da para
// disparar duas transacoes simultaneas de verdade. A protecao contra
// corrida e testada pelo seu mecanismo real — a constraint de exclusao
// GiST — provocando a violacao diretamente (teste "constraint de
// exclusao recusa sobreposicao"), que e exatamente o erro que a segunda
// transacao receberia em producao.
// =====================================================================
import { randomUUID } from 'node:crypto'
import {
  criarBanco,
  comoAnonimo,
  comoAdmin,
  comoUsuarioComum,
  comoServico,
  grupo,
  teste,
  igual,
  verdadeiro,
  falso,
  lancaErro,
  relatorio,
} from './harness.mjs'

const db = await criarBanco()

// ---------------------------------------------------------------------
// Utilitarios
// ---------------------------------------------------------------------
const uma = async (sql, params = []) => (await db.query(sql, params)).rows[0]
const todas = async (sql, params = []) => (await db.query(sql, params)).rows

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))

async function servico(nome) {
  return uma('select * from public.servicos where nome = $1', [nome])
}

async function hojeLocal() {
  const r = await uma(
    "select (now() at time zone 'America/Sao_Paulo')::date as d, " +
      "(now() at time zone 'America/Sao_Paulo')::time as t"
  )
  return { data: iso(r.d), hora: String(r.t) }
}

/**
 * Proximo dia de segunda a QUINTA a pelo menos `minDias` de hoje.
 * (Sexta fecha as 20:00 no seed; os asserts supoem fechamento as 19:00.)
 */
async function proximoDiaUtil(n = 1) {
  // O n-esimo dia de segunda a quinta depois de hoje: DIA, DIA2, DIA3 e DIA4
  // sao sempre dias DIFERENTES, qualquer que seja o dia em que a suite roda.
  const r = await uma(
    `select g::date as d
       from generate_series(
              (now() at time zone 'America/Sao_Paulo')::date + 1,
              (now() at time zone 'America/Sao_Paulo')::date + 30,
              interval '1 day') g
      where extract(dow from g) between 1 and 4
      order by g
      offset $1::int - 1
      limit 1`,
    [n]
  )
  return iso(r.d)
}

async function proximoDomingo() {
  const r = await uma(
    `select g::date as d
       from generate_series(
              (now() at time zone 'America/Sao_Paulo')::date + 1,
              (now() at time zone 'America/Sao_Paulo')::date + 10,
              interval '1 day') g
      where extract(dow from g) = 0
      order by g
      limit 1`
  )
  return iso(r.d)
}

/** Cria direto no banco (como o dono do banco) um atendimento que ja aconteceu. */
async function criarAgendamentoPassado(nome, telefone, diasAtras = 1, hora = '10:00') {
  const r = await uma(
    `with c as (
       insert into public.clientes (nome, telefone) values ($1, $2)
       on conflict (telefone) do update set nome = excluded.nome
       returning id
     ), s as (select * from public.servicos where nome = 'Corte de cabelo'),
     d as (select ((now() at time zone 'America/Sao_Paulo')::date - $3::int) as dia)
     insert into public.agendamentos
       (cliente_id, cliente_nome, servico_id, data, horario_inicio, horario_fim, inicio_em, fim_em,
        servico_nome, servico_preco, servico_duracao, origem)
     select c.id, $1, s.id, d.dia, $4::time, $4::time + interval '35 minutes',
            (d.dia + $4::time) at time zone 'America/Sao_Paulo',
            (d.dia + $4::time + interval '35 minutes') at time zone 'America/Sao_Paulo',
            s.nome, s.preco, s.duracao_minutos, 'balcao'
       from c, s, d
     returning id`,
    [nome, telefone, diasAtras, hora]
  )
  return r.id
}

/** Chama criar_agendamento como o site publico faria (role anon). */
function agendar({ servicoId, data, horario, nome = 'João Silva', telefone = '17999990001', chave = null }) {
  return comoAnonimo(db, async () => {
    const r = await uma('select public.criar_agendamento($1,$2,$3,$4,$5,$6) as res', [
      servicoId,
      data,
      horario,
      nome,
      telefone,
      chave,
    ])
    return r.res
  })
}

function horarios(servicoId, data) {
  return comoAnonimo(db, () =>
    todas('select * from public.horarios_disponiveis($1,$2) order by horario', [servicoId, data])
  )
}

// Usuarios de teste
const ID_DONO = randomUUID()
const ID_INTRUSO = randomUUID()
await db.query('insert into auth.users (id, email) values ($1,$2), ($3,$4)', [
  ID_DONO,
  'dono@arte10.test',
  ID_INTRUSO,
  'intruso@arte10.test',
])
await db.query('insert into public.administradores (user_id, nome) values ($1, $2)', [
  ID_DONO,
  'Proprietário',
])

const CORTE = await servico('Corte de cabelo')
const BARBA = await servico('Barba completa')
// Serviço longo só dos testes: o catálogo real não tem nenhum de 60 min.
const COMBO = await uma(
  "insert into public.servicos (nome, preco, duracao_minutos, ordem) values ('Combo dos testes', 60, 60, 99) returning *"
)

const DIA = await proximoDiaUtil(1)
const DIA2 = await proximoDiaUtil(2)
const DIA3 = await proximoDiaUtil(3)
const DIA4 = await proximoDiaUtil(4)
const DOMINGO = await proximoDomingo()

// =====================================================================
grupo('Estrutura e blindagem do banco')
// =====================================================================

await teste('todas as tabelas publicas estao com RLS habilitado', async () => {
  const semRls = await todas(
    `select relname from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`
  )
  igual(semRls.map((r) => r.relname), [], 'tabelas sem RLS')
})

await teste('constraint de exclusao protege agendamentos contra sobreposicao', async () => {
  const r = await uma(
    `select count(*)::int as n from pg_constraint
      where conname = 'agendamentos_sem_sobreposicao' and contype = 'x'`
  )
  igual(r.n, 1, 'constraint de exclusao ausente')
})

await teste('indices essenciais existem', async () => {
  const idx = (await todas("select indexname from pg_indexes where schemaname='public'")).map(
    (r) => r.indexname
  )
  for (const esperado of [
    'agendamentos_data_idx',
    'agendamentos_idempotency_key',
    'clientes_telefone_key',
    'bloqueios_data_idx',
    'agenda_publica_data_idx',
  ]) {
    verdadeiro(idx.includes(esperado), `indice ausente: ${esperado}`)
  }
})

await teste('anon NAO consegue ler agendamentos', async () => {
  await lancaErro(
    () => comoAnonimo(db, () => todas('select * from public.agendamentos')),
    'permission denied',
    'anon leu agendamentos'
  )
})

await teste('anon NAO consegue ler clientes', async () => {
  await lancaErro(
    () => comoAnonimo(db, () => todas('select * from public.clientes')),
    'permission denied',
    'anon leu clientes'
  )
})

await teste('anon NAO consegue inserir agendamento direto', async () => {
  await lancaErro(
    () =>
      comoAnonimo(db, () =>
        db.query(
          `insert into public.agendamentos
             (cliente_id, servico_id, data, horario_inicio, horario_fim, inicio_em, fim_em,
              servico_nome, servico_preco, servico_duracao)
           values (gen_random_uuid(), gen_random_uuid(), current_date, '10:00','10:35',
                   now(), now() + interval '35 min', 'x', 1, 35)`
        )
      ),
    'permission denied',
    'anon inseriu agendamento'
  )
})

await teste('anon so enxerga servicos ativos', async () => {
  await db.query("update public.servicos set ativo = false where nome = 'Sobrancelha'")
  const vistos = await comoAnonimo(db, () => todas('select nome from public.servicos'))
  falso(
    vistos.some((s) => s.nome === 'Sobrancelha'),
    'anon enxergou servico inativo'
  )
  await db.query("update public.servicos set ativo = true where nome = 'Sobrancelha'")
})

await teste('usuario autenticado que nao e admin nao le dados de clientes', async () => {
  const linhas = await comoUsuarioComum(db, ID_INTRUSO, () =>
    todas('select * from public.clientes')
  )
  igual(linhas.length, 0, 'RLS deixou vazar clientes para nao-admin')
})

// =====================================================================
grupo('Disponibilidade (itens 9, 24, 25, 27)')
// =====================================================================

await teste('dia fechado (domingo) nao oferece horarios', async () => {
  const slots = await horarios(CORTE.id, DOMINGO)
  igual(slots.length, 0, 'domingo ofereceu horarios')
})

await teste('todo horario oferecido cabe dentro do expediente', async () => {
  const slots = await horarios(CORTE.id, DIA)
  verdadeiro(slots.length > 0, 'nenhum horario disponivel no dia util')
  for (const s of slots) {
    verdadeiro(String(s.horario) >= '09:00:00', `horario antes da abertura: ${s.horario}`)
    verdadeiro(String(s.horario_fim) <= '19:00:00', `horario depois do fechamento: ${s.horario_fim}`)
  }
})

await teste('nenhum horario invade o intervalo de almoco', async () => {
  const slots = await horarios(CORTE.id, DIA)
  for (const s of slots) {
    const invade = String(s.horario) < '13:30:00' && String(s.horario_fim) > '12:00:00'
    falso(invade, `horario invadiu o intervalo: ${s.horario}-${s.horario_fim}`)
  }
})

await teste('servicos de duracoes diferentes geram grades diferentes', async () => {
  const curtos = await horarios(BARBA.id, DIA) // 30 min
  const longos = await horarios(COMBO.id, DIA) // 60 min
  verdadeiro(curtos.length > longos.length, 'servico longo deveria oferecer menos horarios')
})

await teste('servico desativado nao oferece horario nenhum', async () => {
  await db.query("update public.servicos set ativo = false where id = $1", [BARBA.id])
  const slots = await horarios(BARBA.id, DIA)
  igual(slots.length, 0, 'servico inativo ofereceu horarios')
  await db.query("update public.servicos set ativo = true where id = $1", [BARBA.id])
})

await teste('datas passadas nao oferecem horarios', async () => {
  const { data } = await hojeLocal()
  const ontem = iso(new Date(new Date(data + 'T12:00:00Z').getTime() - 86400000))
  const slots = await horarios(CORTE.id, ontem)
  igual(slots.length, 0, 'data passada ofereceu horarios')
})

await teste('datas alem da janela de agendamento nao oferecem horarios', async () => {
  const r = await uma(
    "select ((now() at time zone 'America/Sao_Paulo')::date + 200) as d"
  )
  const slots = await horarios(CORTE.id, iso(r.d))
  igual(slots.length, 0, 'data muito distante ofereceu horarios')
})

await teste('dias_disponiveis marca domingo como fechado', async () => {
  const dias = await comoAnonimo(db, () =>
    todas('select * from public.dias_disponiveis($1,$2,$3) order by data', [
      CORTE.id,
      DIA,
      DOMINGO > DIA ? DOMINGO : DIA,
    ])
  )
  const domingo = dias.find((d) => iso(d.data) === DOMINGO)
  if (domingo) {
    falso(domingo.aberto, 'domingo marcado como aberto')
    igual(domingo.disponiveis, 0, 'domingo com horarios disponiveis')
  }
  const util = dias.find((d) => iso(d.data) === DIA)
  verdadeiro(util.aberto, 'dia util marcado como fechado')
  verdadeiro(util.disponiveis > 0, 'dia util sem horarios')
})

// =====================================================================
grupo('Agendamento do cliente (itens 5, 6, 8, 32)')
// =====================================================================

let agendamentoJoao = null

await teste('agendamento valido e gravado e devolve os dados completos', async () => {
  const res = await agendar({
    servicoId: CORTE.id,
    data: DIA,
    horario: '14:00',
    nome: 'João Silva',
    telefone: '(17) 99999-0001',
  })
  verdadeiro(res.ok, `agendamento recusado: ${res.erro} ${res.mensagem || ''}`)
  igual(res.agendamento.servico, 'Corte de cabelo', 'servico errado')
  igual(res.agendamento.horario_inicio, '14:00', 'horario inicial errado')
  igual(res.agendamento.horario_fim, '14:35', 'horario final errado (duracao ignorada)')
  igual(res.agendamento.duracao_minutos, 35, 'duracao errada')
  igual(res.agendamento.cliente, 'João Silva', 'nome errado')
  igual(res.agendamento.telefone, '17999990001', 'telefone nao normalizado')
  verdadeiro(res.agendamento.codigo?.length === 6, 'codigo de confirmacao ausente')
  agendamentoJoao = res.agendamento
})

await teste('o horario agendado passa a aparecer como INDISPONIVEL (item 6)', async () => {
  const slots = await horarios(CORTE.id, DIA)
  const s = slots.find((x) => String(x.horario) === '14:00:00')
  verdadeiro(s, 'horario 14:00 sumiu da lista em vez de aparecer indisponivel')
  falso(s.disponivel, '14:00 continua disponivel depois de agendado')
  igual(s.motivo, 'ocupado', 'motivo errado')
})

await teste('segundo cliente NAO consegue o mesmo horario (item 7)', async () => {
  const res = await agendar({
    servicoId: CORTE.id,
    data: DIA,
    horario: '14:00',
    nome: 'Pedro Souza',
    telefone: '17999990002',
  })
  falso(res.ok, 'dois clientes conseguiram o mesmo horario')
  igual(res.erro, 'HORARIO_OCUPADO', 'codigo de erro errado')
  verdadeiro(
    res.mensagem.includes('acabou de ser reservado'),
    `mensagem inesperada: ${res.mensagem}`
  )
})

await teste('sobreposicao parcial e recusada (14:30 dentro de 14:00-14:35)', async () => {
  const res = await agendar({
    servicoId: CORTE.id,
    data: DIA,
    horario: '14:30',
    nome: 'Carlos Lima',
    telefone: '17999990003',
  })
  falso(res.ok, 'aceitou agendamento sobreposto')
  igual(res.erro, 'HORARIO_OCUPADO', 'codigo de erro errado')
})

await teste('sobreposicao pela frente e recusada (13:45 + 35min invade 14:00)', async () => {
  const res = await agendar({
    servicoId: CORTE.id,
    data: DIA,
    horario: '13:45',
    nome: 'Rafael Dias',
    telefone: '17999990004',
  })
  falso(res.ok, 'aceitou agendamento que invade o proximo')
  igual(res.erro, 'HORARIO_OCUPADO', 'codigo de erro errado')
})

await teste('horarios consecutivos sao aceitos (14:45 depois de 14:00-14:35)', async () => {
  const res = await agendar({
    servicoId: CORTE.id,
    data: DIA,
    horario: '14:45',
    nome: 'Bruno Alves',
    telefone: '17999990005',
  })
  verdadeiro(res.ok, `horario consecutivo recusado: ${res.erro}`)
  igual(res.agendamento.horario_fim, '15:20', 'fim errado')
})

await teste('a constraint de exclusao recusa sobreposicao mesmo por dentro do banco', async () => {
  // Reproduz o que a segunda transacao concorrente receberia em producao.
  await lancaErro(
    () =>
      db.query(
        `insert into public.agendamentos
           (cliente_id, cliente_nome, servico_id, data, horario_inicio, horario_fim, inicio_em, fim_em,
            servico_nome, servico_preco, servico_duracao)
         select a.cliente_id, a.cliente_nome, a.servico_id, a.data, a.horario_inicio, a.horario_fim,
                a.inicio_em, a.fim_em, a.servico_nome, a.servico_preco, a.servico_duracao
           from public.agendamentos a
          where a.id = $1`,
        [agendamentoJoao.id]
      ),
    'agendamentos_sem_sobreposicao',
    'banco aceitou duas reservas no mesmo periodo'
  )
})

await teste('cliques repetidos no confirmar nao criam dois agendamentos (item 21)', async () => {
  const chave = randomUUID()
  const dados = {
    servicoId: CORTE.id,
    data: DIA2,
    horario: '10:00',
    nome: 'Marcos Teste',
    telefone: '17999990010',
    chave,
  }
  const r1 = await agendar(dados)
  const r2 = await agendar(dados)
  const r3 = await agendar(dados)

  verdadeiro(r1.ok && r2.ok && r3.ok, 'alguma repeticao falhou')
  falso(r1.duplicado, 'primeira chamada marcada como duplicada')
  verdadeiro(r2.duplicado && r3.duplicado, 'repeticoes nao foram detectadas como duplicadas')
  igual(r2.agendamento.id, r1.agendamento.id, 'ids diferentes para a mesma chave')

  const n = await uma(
    'select count(*)::int as n from public.agendamentos where idempotency_key = $1',
    [chave]
  )
  igual(n.n, 1, 'mais de um agendamento gravado para a mesma chave')
})

await teste('horario passado e recusado pelo servidor (item 24)', async () => {
  const { data } = await hojeLocal()
  const ontem = iso(new Date(new Date(data + 'T12:00:00Z').getTime() - 86400000))
  const res = await agendar({ servicoId: CORTE.id, data: ontem, horario: '10:00' })
  falso(res.ok, 'aceitou horario passado')
  igual(res.erro, 'HORARIO_PASSADO', 'codigo de erro errado')
})

await teste('dia fechado e recusado (item 25)', async () => {
  const res = await agendar({ servicoId: CORTE.id, data: DOMINGO, horario: '10:00' })
  falso(res.ok, 'aceitou agendamento em dia fechado')
  igual(res.erro, 'DIA_FECHADO', 'codigo de erro errado')
  igual(res.mensagem, 'Barbearia fechada neste dia.', 'mensagem errada')
})

await teste('horario fora do expediente e recusado', async () => {
  const res = await agendar({ servicoId: CORTE.id, data: DIA3, horario: '07:00' })
  falso(res.ok, 'aceitou horario fora do expediente')
  igual(res.erro, 'FORA_EXPEDIENTE', 'codigo de erro errado')
})

await teste('servico que nao cabe antes do fechamento e recusado', async () => {
  const res = await agendar({ servicoId: COMBO.id, data: DIA3, horario: '18:30' })
  falso(res.ok, 'aceitou servico que ultrapassa o fechamento')
  igual(res.erro, 'FORA_EXPEDIENTE', 'codigo de erro errado')
})

await teste('horario dentro do intervalo e recusado', async () => {
  const res = await agendar({ servicoId: CORTE.id, data: DIA3, horario: '12:30' })
  falso(res.ok, 'aceitou horario no intervalo')
  igual(res.erro, 'INTERVALO', 'codigo de erro errado')
})

await teste('horario fora da grade e recusado', async () => {
  const res = await agendar({ servicoId: CORTE.id, data: DIA3, horario: '10:07' })
  falso(res.ok, 'aceitou horario fora da grade')
  igual(res.erro, 'HORARIO_INVALIDO', 'codigo de erro errado')
})

await teste('data alem da janela e recusada', async () => {
  const r = await uma("select ((now() at time zone 'America/Sao_Paulo')::date + 200) as d")
  const res = await agendar({ servicoId: CORTE.id, data: iso(r.d), horario: '10:00' })
  falso(res.ok, 'aceitou data muito distante')
  igual(res.erro, 'DATA_MUITO_DISTANTE', 'codigo de erro errado')
})

await teste('servico desativado e recusado (item 27)', async () => {
  await db.query('update public.servicos set ativo = false where id = $1', [BARBA.id])
  const res = await agendar({ servicoId: BARBA.id, data: DIA3, horario: '10:00' })
  await db.query('update public.servicos set ativo = true where id = $1', [BARBA.id])
  falso(res.ok, 'aceitou servico desativado')
  igual(res.erro, 'SERVICO_INDISPONIVEL', 'codigo de erro errado')
})

await teste('servico inexistente e recusado', async () => {
  const res = await agendar({ servicoId: randomUUID(), data: DIA3, horario: '10:00' })
  falso(res.ok, 'aceitou servico inexistente')
  igual(res.erro, 'SERVICO_NAO_ENCONTRADO', 'codigo de erro errado')
})

await teste('nome e telefone invalidos sao recusados', async () => {
  const semNome = await agendar({ servicoId: CORTE.id, data: DIA3, horario: '10:00', nome: ' ' })
  igual(semNome.erro, 'NOME_INVALIDO', 'nome vazio aceito')

  const telRuim = await agendar({
    servicoId: CORTE.id,
    data: DIA3,
    horario: '10:00',
    telefone: '123',
  })
  igual(telRuim.erro, 'TELEFONE_INVALIDO', 'telefone invalido aceito')
})

await teste('telefone com DDI e mascara e normalizado', async () => {
  const res = await agendar({
    servicoId: CORTE.id,
    data: DIA3,
    horario: '09:00',
    nome: '  Ana   Paula  ',
    telefone: '+55 (17) 98888-1234',
  })
  verdadeiro(res.ok, `recusou telefone valido: ${res.erro}`)
  igual(res.agendamento.telefone, '17988881234', 'telefone nao normalizado')
  igual(res.agendamento.cliente, 'Ana Paula', 'nome nao normalizado')
})

await teste('limite de agendamentos futuros por telefone', async () => {
  const tel = '17977770001'
  const oks = []
  for (const h of ['09:45', '10:30', '11:15']) {
    oks.push(await agendar({ servicoId: CORTE.id, data: DIA4, horario: h, telefone: tel, nome: 'Zeca Limite' }))
  }
  verdadeiro(oks.every((r) => r.ok), 'as tres primeiras reservas deveriam passar')

  const quarta = await agendar({
    servicoId: CORTE.id,
    data: DIA4,
    horario: '14:00',
    telefone: tel,
    nome: 'Zeca Limite',
  })
  falso(quarta.ok, 'passou do limite de agendamentos futuros')
  igual(quarta.erro, 'LIMITE_AGENDAMENTOS', 'codigo de erro errado')
})

await teste('o mesmo telefone reaproveita o cadastro do cliente', async () => {
  const r = await uma('select count(*)::int as n from public.clientes where telefone = $1', [
    '17977770001',
  ])
  igual(r.n, 1, 'cliente duplicado para o mesmo telefone')
})

// =====================================================================
grupo('Bloqueios do proprietario (itens 15, 16, 23)')
// =====================================================================

let bloqueioId = null

await teste('usuario nao autorizado nao consegue bloquear', async () => {
  const res = await comoUsuarioComum(db, ID_INTRUSO, async () =>
    (await uma('select public.criar_bloqueio($1,$2,$3,$4) as res', [DIA, '16:00', '16:15', 'teste']))
      .res
  )
  falso(res.ok, 'intruso conseguiu bloquear')
  igual(res.erro, 'NAO_AUTORIZADO', 'codigo de erro errado')
})

await teste('anonimo nao consegue nem executar a funcao de bloqueio', async () => {
  await lancaErro(
    () =>
      comoAnonimo(db, () =>
        uma('select public.criar_bloqueio($1,$2,$3,$4) as res', [DIA, '16:00', '16:15', 'x'])
      ),
    'permission denied',
    'anon executou criar_bloqueio'
  )
})

await teste('proprietario bloqueia um horario livre', async () => {
  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.criar_bloqueio($1,$2,$3,$4) as res', [
      DIA,
      '16:00',
      '16:15',
      'Compromisso pessoal',
    ])).res
  )
  verdadeiro(res.ok, `bloqueio recusado: ${res.erro}`)
  bloqueioId = res.bloqueio.id
})

await teste('o site passa a mostrar o horario bloqueado como INDISPONIVEL', async () => {
  const slots = await horarios(CORTE.id, DIA)
  const s = slots.find((x) => String(x.horario) === '16:00:00')
  verdadeiro(s, 'horario 16:00 desapareceu')
  falso(s.disponivel, '16:00 continua disponivel apos bloqueio')
  igual(s.motivo, 'bloqueado', 'motivo errado')
})

await teste('cliente nao consegue reservar horario bloqueado', async () => {
  const res = await agendar({
    servicoId: CORTE.id,
    data: DIA,
    horario: '16:00',
    telefone: '17966660001',
    nome: 'Tentativa Bloqueio',
  })
  falso(res.ok, 'cliente reservou horario bloqueado')
  igual(res.erro, 'HORARIO_BLOQUEADO', 'codigo de erro errado')
})

await teste('bloqueio sobreposto a outro bloqueio e recusado', async () => {
  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.criar_bloqueio($1,$2,$3,$4) as res', [DIA, '16:05', '16:30', null]))
      .res
  )
  falso(res.ok, 'aceitou bloqueios sobrepostos')
  igual(res.erro, 'JA_BLOQUEADO', 'codigo de erro errado')
})

await teste('NAO e possivel bloquear em cima de um cliente agendado', async () => {
  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.criar_bloqueio($1,$2,$3,$4) as res', [DIA, '14:00', '14:35', 'tentativa']))
      .res
  )
  falso(res.ok, 'bloqueou por cima de um agendamento de cliente')
  igual(res.erro, 'EXISTE_AGENDAMENTO', 'codigo de erro errado')
})

await teste('proprietario desbloqueia e o horario volta a ficar disponivel (item 16)', async () => {
  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.remover_bloqueio($1) as res', [bloqueioId])).res
  )
  verdadeiro(res.ok, `desbloqueio falhou: ${res.erro}`)

  const slots = await horarios(CORTE.id, DIA)
  const s = slots.find((x) => String(x.horario) === '16:00:00')
  verdadeiro(s.disponivel, '16:00 nao voltou a ficar disponivel')
})

await teste('remover bloqueio inexistente devolve erro tratado', async () => {
  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.remover_bloqueio($1) as res', [randomUUID()])).res
  )
  falso(res.ok, 'aceitou remocao de bloqueio inexistente')
  igual(res.erro, 'BLOQUEIO_NAO_ENCONTRADO', 'codigo de erro errado')
})

await teste('remover_bloqueio nunca toca em agendamentos', async () => {
  const antes = await uma('select count(*)::int as n from public.agendamentos')
  await comoAdmin(db, ID_DONO, () => uma('select public.remover_bloqueio($1) as res', [agendamentoJoao.id]))
  const depois = await uma('select count(*)::int as n from public.agendamentos')
  igual(depois.n, antes.n, 'remover_bloqueio apagou um agendamento')
})

// =====================================================================
grupo('REGRA ABSOLUTA: agendamento de cliente e permanente (item 14)')
// =====================================================================

await teste('o proprietario nao tem permissao de DELETE em agendamentos', async () => {
  await lancaErro(
    () => comoAdmin(db, ID_DONO, () => db.query('delete from public.agendamentos')),
    'permission denied',
    'admin conseguiu deletar agendamentos'
  )
})

await teste('nem o dono do banco consegue apagar um agendamento', async () => {
  await lancaErro(
    () => db.query('delete from public.agendamentos where id = $1', [agendamentoJoao.id]),
    'AGENDAMENTO_IMUTAVEL',
    'trigger de imutabilidade nao bloqueou o DELETE'
  )
})

await teste('nao e possivel mudar data/horario de um agendamento', async () => {
  await lancaErro(
    () =>
      db.query("update public.agendamentos set horario_inicio = '08:00' where id = $1", [
        agendamentoJoao.id,
      ]),
    'AGENDAMENTO_IMUTAVEL',
    'permitiu alterar o horario'
  )
})

await teste('nao e possivel trocar o cliente de um agendamento', async () => {
  await lancaErro(
    () =>
      db.query('update public.agendamentos set cliente_id = gen_random_uuid() where id = $1', [
        agendamentoJoao.id,
      ]),
    'AGENDAMENTO_IMUTAVEL',
    'permitiu trocar o cliente'
  )
})

await teste('nao existe status que libere o horario', async () => {
  const valores = await todas(
    `select e.enumlabel as v from pg_enum e
       join pg_type t on t.oid = e.enumtypid
      where t.typname = 'agendamento_status'`
  )
  const labels = valores.map((r) => r.v)
  falso(labels.includes('cancelado'), 'existe status "cancelado" que poderia liberar o horario')
  igual(labels.sort(), ['agendado', 'concluido', 'nao_compareceu'], 'status inesperados')
})

await teste('reserva FUTURA nao pode ter o desfecho marcado (nem pela RPC, nem direto)', async () => {
  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.atualizar_status_agendamento($1,$2) as res', [
      agendamentoJoao.id,
      'nao_compareceu',
    ])).res
  )
  falso(res.ok, 'marcou falta numa reserva que ainda nao aconteceu')
  igual(res.erro, 'ATENDIMENTO_NAO_COMECOU', 'codigo de erro errado')

  // O app nao tem UPDATE direto na tabela (so a RPC)...
  await lancaErro(
    () =>
      comoAdmin(db, ID_DONO, () =>
        db.query("update public.agendamentos set status = 'concluido' where id = $1", [agendamentoJoao.id])
      ),
    'permission denied',
    'admin conseguiu UPDATE direto em agendamentos'
  )
  // ...e nem o dono do banco consegue burlar pelo SQL.
  await lancaErro(
    () => db.query("update public.agendamentos set status = 'concluido' where id = $1", [agendamentoJoao.id]),
    'ATENDIMENTO_NAO_COMECOU',
    'trigger permitiu mudar status antes do horario'
  )
})

await teste('depois do horario, o proprietario registra o desfecho sem liberar nada', async () => {
  const passado = await criarAgendamentoPassado('Cliente de Ontem', '17911112222')
  const antes = await uma('select atualizado_em from public.agenda_publica where id = $1', [passado])

  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.atualizar_status_agendamento($1,$2) as res', [passado, 'concluido'])).res
  )
  verdadeiro(res.ok, `nao conseguiu concluir: ${res.erro}`)
  igual(res.agendamento.status, 'concluido', 'status nao gravado')

  const ainda = await uma('select count(*)::int as n from public.agendamentos where id = $1', [passado])
  igual(ainda.n, 1, 'o registro sumiu')

  // Mudar so o status nao gera evento publico (o periodo e o mesmo).
  const depois = await uma('select atualizado_em from public.agenda_publica where id = $1', [passado])
  igual(String(depois.atualizado_em), String(antes.atualizado_em), 'mudanca de status vazou para a agenda publica')
})

await teste('atualizar_status_agendamento devolve codigos de erro corretos', async () => {
  const chamar = (id, st) =>
    comoAdmin(db, ID_DONO, async () =>
      (await uma('select public.atualizar_status_agendamento($1,$2) as res', [id, st])).res
    )
  igual((await chamar(agendamentoJoao.id, 'cancelado')).erro, 'STATUS_INVALIDO', 'status invalido')
  igual((await chamar(agendamentoJoao.id, null)).erro, 'STATUS_INVALIDO', 'status nulo')
  igual((await chamar(randomUUID(), 'concluido')).erro, 'AGENDAMENTO_NAO_ENCONTRADO', 'id inexistente')
})

await teste('nada disso libera o horario de uma reserva', async () => {
  const slots = await horarios(CORTE.id, DIA)
  const s = slots.find((x) => String(x.horario) === '14:00:00')
  falso(s.disponivel, 'o horario de Joao ficou livre')
})

await teste('TRUNCATE (inclusive em cascata) nao apaga o historico', async () => {
  for (const sql of [
    'truncate public.agendamentos cascade',
    'truncate public.clientes cascade',
    'truncate public.servicos cascade',
  ]) {
    await lancaErro(() => db.query(sql), 'AGENDAMENTO_IMUTAVEL', `${sql} passou`)
  }
  const n = await uma('select count(*)::int as n from public.agendamentos')
  verdadeiro(n.n > 0, 'historico apagado')
})

await teste('servico com historico nao pode ser apagado, apenas desativado (item 27)', async () => {
  await lancaErro(
    () => comoAdmin(db, ID_DONO, () => db.query('delete from public.servicos where id = $1', [CORTE.id])),
    'SERVICO_EM_USO',
    'apagou servico com agendamentos'
  )
})

// =====================================================================
grupo('Sincronizacao site <-> aplicativo (itens 17, 18, 31)')
// =====================================================================

await teste('agendamento aparece imediatamente na agenda publica', async () => {
  const r = await uma('select * from public.agenda_publica where id = $1', [agendamentoJoao.id])
  verdadeiro(r, 'agendamento nao replicado para a agenda publica')
  igual(r.origem, 'agendamento', 'origem errada')
})

await teste('a agenda publica nao expoe nenhum dado pessoal', async () => {
  const colunas = (
    await todas(
      "select column_name from information_schema.columns where table_name = 'agenda_publica'"
    )
  ).map((c) => c.column_name)
  for (const proibida of ['nome', 'telefone', 'cliente_id', 'servico_id', 'servico_nome', 'motivo']) {
    falso(colunas.includes(proibida), `agenda publica expoe coluna sensivel: ${proibida}`)
  }
})

await teste('anon consegue ler a agenda publica (necessario para o Realtime)', async () => {
  const linhas = await comoAnonimo(db, () => todas('select * from public.agenda_publica'))
  verdadeiro(linhas.length > 0, 'anon nao enxergou a agenda publica')
})

await teste('bloqueio entra e sai da agenda publica', async () => {
  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.criar_bloqueio($1,$2,$3,$4) as res', [DIA, '17:00', '17:30', 'teste sync']))
      .res
  )
  const entrou = await uma('select count(*)::int as n from public.agenda_publica where id = $1', [
    res.bloqueio.id,
  ])
  igual(entrou.n, 1, 'bloqueio nao replicado')

  await comoAdmin(db, ID_DONO, () => uma('select public.remover_bloqueio($1) as res', [res.bloqueio.id]))
  const saiu = await uma('select count(*)::int as n from public.agenda_publica where id = $1', [
    res.bloqueio.id,
  ])
  igual(saiu.n, 0, 'bloqueio removido continuou na agenda publica')
})

// =====================================================================
grupo('Aplicativo do proprietario (itens 11, 12, 13)')
// =====================================================================

await teste('agenda_do_dia exige administrador', async () => {
  const res = await comoUsuarioComum(db, ID_INTRUSO, async () =>
    (await uma('select public.agenda_do_dia($1) as res', [DIA])).res
  )
  falso(res.ok, 'intruso leu a agenda do dia')
  igual(res.erro, 'NAO_AUTORIZADO', 'codigo de erro errado')
})

await teste('agenda_do_dia devolve a linha do tempo com todos os estados', async () => {
  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.agenda_do_dia($1) as res', [DIA])).res
  )
  verdadeiro(res.ok, `agenda_do_dia falhou: ${res.erro}`)
  verdadeiro(res.aberto, 'dia util veio como fechado')
  igual(res.abre, '09:00', 'horario de abertura errado')

  const tipos = new Set(res.itens.map((i) => i.tipo))
  verdadeiro(tipos.has('agendamento'), 'nenhum agendamento na linha do tempo')
  verdadeiro(tipos.has('livre'), 'nenhum horario livre na linha do tempo')
  verdadeiro(tipos.has('intervalo'), 'intervalo nao aparece na linha do tempo')

  const ag = res.itens.find((i) => i.tipo === 'agendamento' && i.horario_inicio === '14:00')
  verdadeiro(ag, 'agendamento das 14:00 ausente')
  igual(ag.cliente_nome, 'João Silva', 'nome do cliente ausente para o proprietario')
  igual(ag.cliente_telefone, '17999990001', 'telefone ausente para o proprietario')
  igual(ag.servico_nome, 'Corte de cabelo', 'servico ausente')
  igual(ag.duracao_minutos, 35, 'duracao ausente')
  verdadeiro(ag.criado_em, 'data de criacao ausente')
  verdadeiro(res.resumo.agendamentos >= 1, 'resumo sem contagem de agendamentos')
})

await teste('agenda_do_dia marca dia fechado corretamente', async () => {
  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.agenda_do_dia($1) as res', [DOMINGO])).res
  )
  verdadeiro(res.ok, 'falhou em dia fechado')
  falso(res.aberto, 'domingo veio como aberto')
})

await teste('a linha do tempo nunca sobrepoe itens', async () => {
  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.agenda_do_dia($1) as res', [DIA])).res
  )
  let anterior = '00:00'
  for (const item of res.itens) {
    verdadeiro(
      item.horario_inicio >= anterior,
      `itens fora de ordem ou sobrepostos: ${anterior} -> ${item.horario_inicio}`
    )
    anterior = item.horario_fim
  }
})

await teste('visao_geral_periodo conta os dias do calendario', async () => {
  const linhas = await comoAdmin(db, ID_DONO, () =>
    todas('select * from public.visao_geral_periodo($1,$2) order by data', [DIA, DIA4])
  )
  verdadeiro(linhas.length >= 1, 'periodo vazio')
  const dia = linhas.find((l) => iso(l.data) === DIA)
  verdadeiro(dia.agendamentos >= 1, 'nao contou os agendamentos do dia')
})

await teste('visao_geral_periodo recusa (com erro) quem nao e admin', async () => {
  // Erro explicito: uma lista vazia pareceria "agenda sem clientes".
  await lancaErro(
    () =>
      comoUsuarioComum(db, ID_INTRUSO, () =>
        todas('select * from public.visao_geral_periodo($1,$2)', [DIA, DIA4])
      ),
    'NAO_AUTORIZADO',
    'nao-admin recebeu o calendario'
  )
})

await teste('registrar_dispositivo guarda o token do proprietario', async () => {
  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.registrar_dispositivo($1,$2) as res', ['token-fcm-de-teste-123456', 'Pixel 7'])).res
  )
  verdadeiro(res.ok, 'nao registrou o dispositivo')

  const n = await uma('select count(*)::int as n from public.dispositivos_push where user_id = $1', [
    ID_DONO,
  ])
  igual(n.n, 1, 'token nao gravado')
})

await teste('registrar_dispositivo e idempotente para o mesmo token', async () => {
  await comoAdmin(db, ID_DONO, () =>
    uma('select public.registrar_dispositivo($1,$2) as res', ['token-fcm-de-teste-123456', 'Pixel 7'])
  )
  const n = await uma('select count(*)::int as n from public.dispositivos_push')
  igual(n.n, 1, 'token duplicado')
})

await teste('clientes_resumo consolida o historico para o proprietario', async () => {
  const linhas = await comoAdmin(db, ID_DONO, () =>
    todas('select * from public.clientes_resumo order by nome')
  )
  verdadeiro(linhas.length > 0, 'nenhum cliente listado para o admin')

  const joao = linhas.find((c) => c.nome === 'João Silva')
  verdadeiro(joao, 'cliente João Silva ausente')
  verdadeiro(joao.total_agendamentos >= 1, 'total de agendamentos nao contabilizado')
  verdadeiro(joao.telefone === '17999990001', 'telefone errado')
})

await teste('clientes_resumo nao vaza para anon nem para nao-admin', async () => {
  await lancaErro(
    () => comoAnonimo(db, () => todas('select * from public.clientes_resumo')),
    'permission denied',
    'anon leu clientes_resumo'
  )

  const linhas = await comoUsuarioComum(db, ID_INTRUSO, () =>
    todas('select * from public.clientes_resumo')
  )
  igual(linhas.length, 0, 'nao-admin enxergou clientes')
})

await teste('nao-admin nao registra dispositivo', async () => {
  const res = await comoUsuarioComum(db, ID_INTRUSO, async () =>
    (await uma('select public.registrar_dispositivo($1,$2) as res', ['token-intruso-000', 'X'])).res
  )
  falso(res.ok, 'intruso registrou dispositivo')
  igual(res.erro, 'NAO_AUTORIZADO', 'codigo de erro errado')
})

// =====================================================================
grupo('Notificacoes push (item 19)')
// =====================================================================

await teste('cada agendamento novo enfileira uma notificacao', async () => {
  const r = await uma(
    "select count(*)::int as n from public.notificacoes where agendamento_id = $1 and tipo = 'novo_agendamento'",
    [agendamentoJoao.id]
  )
  igual(r.n, 1, 'notificacao nao enfileirada')
})

await teste('a notificacao traz cliente, servico, data e horario', async () => {
  const r = await uma('select * from public.notificacoes where agendamento_id = $1', [
    agendamentoJoao.id,
  ])
  igual(r.titulo, 'Novo agendamento', 'titulo errado')
  verdadeiro(r.corpo.includes('João Silva'), `corpo sem o nome: ${r.corpo}`)
  verdadeiro(r.corpo.includes('Corte de cabelo'), `corpo sem o servico: ${r.corpo}`)
  verdadeiro(r.corpo.includes('14:00'), `corpo sem o horario: ${r.corpo}`)
  igual(r.status, 'pendente', 'status inicial errado')
})

await teste('push indisponivel nao derruba o agendamento (item 33, caso 21)', async () => {
  // Nesta base a extensao pg_net nao existe, exatamente como um ambiente
  // com a notificacao quebrada. Os agendamentos acima foram todos
  // gravados assim, provando que o fluxo do cliente nao depende do push.
  const r = await uma('select count(*)::int as n from public.agendamentos')
  verdadeiro(r.n > 0, 'nenhum agendamento sobreviveu sem o servico de push')
})

await teste('segredos ficam fora do alcance de anon e authenticated', async () => {
  await lancaErro(
    () => comoAnonimo(db, () => todas('select * from private.segredos')),
    'permission denied',
    'anon leu os segredos'
  )
  await lancaErro(
    () => comoAdmin(db, ID_DONO, () => todas('select * from private.segredos')),
    'permission denied',
    'usuario autenticado leu os segredos'
  )
})

// =====================================================================
grupo('Correcoes da auditoria: agenda e historico')
// =====================================================================

const ONTEM = await (async () => {
  const { data } = await hojeLocal()
  return iso(new Date(new Date(data + 'T12:00:00Z').getTime() - 86400000))
})()

await teste('o historico guarda o nome usado na reserva (outro nome no mesmo telefone nao reescreve)', async () => {
  const tel = '17933334444'
  const r1 = await agendar({ servicoId: CORTE.id, data: DIA2, horario: '15:00', nome: 'Maria Original', telefone: tel })
  verdadeiro(r1.ok, `primeira reserva falhou: ${r1.erro}`)
  const r2 = await agendar({ servicoId: CORTE.id, data: DIA2, horario: '16:30', nome: 'Nome Trocado', telefone: tel })
  verdadeiro(r2.ok, `segunda reserva falhou: ${r2.erro}`)

  const agenda = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.agenda_do_dia($1) as res', [DIA2])).res
  )
  const de15 = agenda.itens.find((i) => i.tipo === 'agendamento' && i.horario_inicio === '15:00')
  igual(de15.cliente_nome, 'Maria Original', 'o nome da primeira reserva foi reescrito')

  const json = await uma('select public.agendamento_json($1) as j', [r1.agendamento.id])
  igual(json.j.cliente, 'Maria Original', 'agendamento_json mostra o nome novo')
})

await teste('chave de idempotencia gigante e recusada sem erro 500', async () => {
  const res = await agendar({ servicoId: CORTE.id, data: DIA3, horario: '15:00', telefone: '17955556666', chave: 'x'.repeat(101) })
  falso(res.ok, 'aceitou chave gigante')
  igual(res.erro, 'DADOS_INVALIDOS', 'codigo de erro errado')
})

await teste('freio contra robos: limite de reservas por 10 minutos', async () => {
  await db.query(
    `update public.config_barbearia set limite_agendamentos_10min =
       (select count(*) from public.agendamentos
         where origem = 'site' and created_at > now() - interval '10 minutes') + 1
     where id`
  )
  try {
    const ok = await agendar({ servicoId: CORTE.id, data: DIA3, horario: '15:00', telefone: '17955550001', nome: 'Dentro do Limite' })
    verdadeiro(ok.ok, `reserva dentro do limite recusada: ${ok.erro}`)
    const bloqueada = await agendar({ servicoId: CORTE.id, data: DIA3, horario: '16:00', telefone: '17955550002', nome: 'Robo' })
    falso(bloqueada.ok, 'o limite nao segurou')
    igual(bloqueada.erro, 'MUITAS_TENTATIVAS', 'codigo de erro errado')
  } finally {
    await db.query('update public.config_barbearia set limite_agendamentos_10min = 500 where id')
  }
})

await teste('linha do tempo do dono usa a MESMA grade do site', async () => {
  const agenda = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.agenda_do_dia($1) as res', [DIA])).res
  )
  const livres = agenda.itens.filter((i) => i.tipo === 'livre')
  verdadeiro(livres.length > 0, 'nenhum horario livre')
  for (const l of livres) {
    const minuto = Number(l.horario_inicio.slice(3, 5))
    verdadeiro(minuto % 15 === 0, `livre fora da grade: ${l.horario_inicio}`)
  }
  falso(livres.some((l) => l.horario_inicio === '14:35'), 'livre comecando no fim do corte (14:35)')
  for (const h of agenda.proximos_livres) {
    verdadeiro(Number(h.slice(3, 5)) % 15 === 0, `proximo livre fora da grade: ${h}`)
  }
})

await teste('nenhum horario livre cruza agendamento, bloqueio ou intervalo', async () => {
  const agenda = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.agenda_do_dia($1) as res', [DIA])).res
  )
  const ocupados = agenda.itens.filter((i) => i.tipo !== 'livre')
  for (const l of agenda.itens.filter((i) => i.tipo === 'livre')) {
    for (const o of ocupados) {
      const cruza = l.horario_inicio < o.horario_fim && l.horario_fim > o.horario_inicio
      falso(cruza, `livre ${l.horario_inicio}-${l.horario_fim} cruza ${o.tipo} ${o.horario_inicio}-${o.horario_fim}`)
    }
  }
})

await teste('encurtar o expediente NAO esconde cliente ja marcado', async () => {
  const res = await agendar({ servicoId: CORTE.id, data: DIA4, horario: '18:15', nome: 'Joao Tarde', telefone: '17966667777' })
  verdadeiro(res.ok, `reserva falhou: ${res.erro}`)
  const dow = (await uma('select extract(dow from $1::date)::int as d', [DIA4])).d

  await db.query("update public.config_horarios set fecha = '18:00' where dia_semana = $1", [dow])
  try {
    const agenda = await comoAdmin(db, ID_DONO, async () =>
      (await uma('select public.agenda_do_dia($1) as res', [DIA4])).res
    )
    const joao = agenda.itens.find((i) => i.tipo === 'agendamento' && i.horario_inicio === '18:15')
    verdadeiro(joao, 'o cliente das 18:15 sumiu da agenda do dono')
    verdadeiro(joao.fora_expediente, 'o item nao foi marcado como fora do expediente')

    const calendario = await comoAdmin(db, ID_DONO, () =>
      todas('select * from public.visao_geral_periodo($1,$1)', [DIA4])
    )
    igual(agenda.resumo.agendamentos, calendario[0].agendamentos, 'agenda e calendario discordam')
  } finally {
    await db.query("update public.config_horarios set fecha = '19:00' where dia_semana = $1", [dow])
  }
})

await teste('criar_bloqueio recusa passado, dia fechado e fora do expediente', async () => {
  const bloquear = (d, i, f) =>
    comoAdmin(db, ID_DONO, async () =>
      (await uma('select public.criar_bloqueio($1,$2,$3,$4) as res', [d, i, f, null])).res
    )
  igual((await bloquear(ONTEM, '10:00', '11:00')).erro, 'HORARIO_PASSADO', 'bloqueou o passado')
  igual((await bloquear(DOMINGO, '10:00', '11:00')).erro, 'DIA_FECHADO', 'bloqueou dia fechado')
  igual((await bloquear(DIA3, '07:00', '08:00')).erro, 'FORA_EXPEDIENTE', 'bloqueou fora do expediente')

  // Cobrir o intervalo continua permitido (ex.: fechar a tarde inteira).
  const ok = await bloquear(DIA3, '11:30', '14:00')
  verdadeiro(ok.ok, `nao deixou bloquear por cima do intervalo: ${ok.erro}`)
  await comoAdmin(db, ID_DONO, () => uma('select public.remover_bloqueio($1) as r', [ok.bloqueio.id]))
})

await teste('clientes_resumo: ultima visita so conta atendimento que ja aconteceu', async () => {
  await criarAgendamentoPassado('Faltoso da Silva', '17977778888', 2, '11:00')
  const idFalta = (await uma(
    "select a.id from public.agendamentos a join public.clientes c on c.id = a.cliente_id where c.telefone = '17977778888'"
  )).id
  await comoAdmin(db, ID_DONO, () =>
    uma('select public.atualizar_status_agendamento($1,$2) as r', [idFalta, 'nao_compareceu'])
  )

  const linhas = await comoAdmin(db, ID_DONO, () => todas('select * from public.clientes_resumo'))
  const joao = linhas.find((c) => c.telefone === '17999990001')
  igual(joao.ultima_visita, null, 'reserva futura contou como ultima visita')
  verdadeiro(joao.proximo_horario, 'proximo horario ausente')

  const faltoso = linhas.find((c) => c.telefone === '17977778888')
  igual(faltoso.faltas, 1, 'falta nao contada')
  igual(faltoso.ultima_visita, null, 'falta contou como visita')
})

await teste('TRUNCATE em bloqueios limpa o espelho publico', async () => {
  const b = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.criar_bloqueio($1,$2,$3,$4) as res', [DIA3, '17:00', '17:15', 'teste'])).res
  )
  verdadeiro(b.ok, `bloqueio falhou: ${b.erro}`)
  await db.query('truncate public.bloqueios')
  const n = await uma("select count(*)::int as n from public.agenda_publica where origem = 'bloqueio'")
  igual(n.n, 0, 'sobrou bloqueio fantasma na agenda publica')
})

// =====================================================================
grupo('Push de ponta a ponta no banco (pg_net simulado)')
// =====================================================================

const dbp = await criarBanco()
await dbp.exec(`
  create schema net;
  create table net.chamadas (id bigserial primary key, url text, body jsonb, headers jsonb);
  create table net._http_response (id bigint primary key, status_code integer, content text, error_msg text);
  create function net.http_post(
    url text, body jsonb default '{}', params jsonb default '{}',
    headers jsonb default '{}', timeout_milliseconds integer default 5000
  ) returns bigint language sql as $f$
    insert into net.chamadas (url, body, headers) values (url, body, headers) returning id
  $f$;
`)

const umaP = async (sql, params = []) => (await dbp.query(sql, params)).rows[0]
const todasP = async (sql, params = []) => (await dbp.query(sql, params)).rows
const ID_DONO_P = randomUUID()
const ID_EX = randomUUID()
await dbp.query('insert into auth.users (id, email) values ($1,$2), ($3,$4)', [ID_DONO_P, 'dono@p.test', ID_EX, 'ex@p.test'])
await dbp.query("insert into public.administradores (user_id, nome) values ($1,'Dono'), ($2,'Ex-funcionario')", [ID_DONO_P, ID_EX])
const CORTE_P = (await umaP("select id from public.servicos where nome = 'Corte de cabelo'")).id
const DIA_P = DIA

function agendarP(horario, telefone) {
  return comoAnonimo(dbp, async () =>
    (await umaP('select public.criar_agendamento($1,$2,$3,$4,$5,$6) as res', [
      CORTE_P, DIA_P, horario, 'Cliente Push', telefone, null,
    ])).res
  )
}
async function notificacaoDe(agendamentoId) {
  return umaP('select * from public.notificacoes where agendamento_id = $1', [agendamentoId])
}

await teste('sem configurar o push, a reserva funciona e o motivo fica registrado', async () => {
  const r = await agendarP('09:00', '17900000001')
  verdadeiro(r.ok, `reserva falhou: ${r.erro}`)
  const n = await notificacaoDe(r.agendamento.id)
  verdadeiro(String(n.erro).includes('Push não configurado'), `motivo nao registrado: ${n.erro}`)
  igual((await umaP('select count(*)::int as n from net.chamadas')).n, 0, 'chamou a funcao sem token')
})

await dbp.query(
  "insert into private.segredos (chave, valor) values ('edge_notificacoes_url','https://x.test/fn'), ('edge_notificacoes_token','segredo-de-teste')"
)

let notifId = null

await teste('com o push configurado, a reserva chama a Edge Function com o token', async () => {
  const r = await agendarP('09:45', '17900000002')
  verdadeiro(r.ok, `reserva falhou: ${r.erro}`)
  const n = await notificacaoDe(r.agendamento.id)
  notifId = n.id
  igual(n.disparos, 1, 'nao contou o disparo')
  verdadeiro(n.request_id, 'request_id nao guardado')
  const chamada = await umaP('select * from net.chamadas where id = $1', [n.request_id])
  igual(chamada.body.notificacao_id, n.id, 'corpo sem o id da notificacao')
  igual(chamada.headers.Authorization, 'Bearer segredo-de-teste', 'token nao enviado')
})

await teste('o reenvio NAO pega notificacao recem-criada (evita push duplicado)', async () => {
  const antes = (await umaP('select count(*)::int as n from net.chamadas')).n
  await umaP('select public.reenviar_notificacoes_pendentes(20) as n')
  igual((await umaP('select count(*)::int as n from net.chamadas')).n, antes, 'reenviou algo recem-criado')
})

await teste('o reenvio registra o HTTP de erro da ultima chamada e tenta de novo', async () => {
  const n = await umaP('select * from public.notificacoes where id = $1', [notifId])
  await dbp.query("insert into net._http_response (id, status_code, content) values ($1, 401, 'Invalid JWT')", [n.request_id])
  await dbp.query("update public.notificacoes set created_at = now() - interval '2 minutes' where id = $1", [notifId])
  await umaP('select public.reenviar_notificacoes_pendentes(20) as n')
  const depois = await umaP('select * from public.notificacoes where id = $1', [notifId])
  verdadeiro(String(depois.erro).includes('HTTP 401'), `erro nao registrado: ${depois.erro}`)
  igual(depois.disparos, 2, 'nao disparou de novo')
})

await teste('a reserva da notificacao pela Edge Function e atomica', async () => {
  const primeira = await comoServico(dbp, () => todasP('select * from public.reservar_notificacao($1)', [notifId]))
  igual(primeira.length, 1, 'nao reservou')
  igual(primeira[0].tentativas, 1, 'tentativa nao contada')
  const segunda = await comoServico(dbp, () => todasP('select * from public.reservar_notificacao($1)', [notifId]))
  igual(segunda.length, 0, 'duas chamadas reservaram a mesma notificacao (push duplicado)')

  const antes = (await umaP('select count(*)::int as n from net.chamadas')).n
  await umaP('select public.reenviar_notificacoes_pendentes(20) as n')
  igual((await umaP('select count(*)::int as n from net.chamadas')).n, antes, 'reenvio pegou notificacao em envio')
})

await teste('erro passageiro volta para pendente; envio confirmado vira enviada', async () => {
  await comoServico(dbp, () => umaP("select public.finalizar_notificacao($1, 'pendente', 'FCM 503') as r", [notifId]))
  igual((await umaP('select status from public.notificacoes where id = $1', [notifId])).status, 'pendente', 'nao voltou para pendente')

  await comoServico(dbp, () => todasP('select * from public.reservar_notificacao($1)', [notifId]))
  await comoServico(dbp, () => umaP("select public.finalizar_notificacao($1, 'enviada') as r", [notifId]))
  const n = await umaP('select * from public.notificacoes where id = $1', [notifId])
  igual(n.status, 'enviada', 'nao marcou enviada')
  verdadeiro(n.enviada_em, 'sem data de envio')
})

await teste('depois do maximo de tentativas a notificacao para de ser reenviada', async () => {
  const r = await agendarP('10:30', '17900000003')
  const n = await notificacaoDe(r.agendamento.id)
  await dbp.query('update public.notificacoes set tentativas = public.push_max_tentativas() - 1 where id = $1', [n.id])
  await comoServico(dbp, () => todasP('select * from public.reservar_notificacao($1)', [n.id]))
  await comoServico(dbp, () => umaP("select public.finalizar_notificacao($1, 'pendente', 'FCM fora') as r", [n.id]))
  igual((await umaP('select status from public.notificacoes where id = $1', [n.id])).status, 'falhou', 'continuou pendente para sempre')
})

await teste('Edge Function que nunca responde: desiste depois de muitos disparos', async () => {
  const r = await agendarP('11:15', '17900000004')
  const n = await notificacaoDe(r.agendamento.id)
  await dbp.query("update public.notificacoes set disparos = 30, created_at = now() - interval '2 minutes' where id = $1", [n.id])
  await umaP('select public.reenviar_notificacoes_pendentes(20) as n')
  const depois = await umaP('select * from public.notificacoes where id = $1', [n.id])
  igual(depois.status, 'falhou', 'continuou disparando para sempre')
})

await teste('push so vai para aparelhos de administradores ATIVOS', async () => {
  for (const [uid, token] of [[ID_DONO_P, 'token-do-dono-0001'], [ID_EX, 'token-do-ex-0002']]) {
    await comoAdmin(dbp, uid, () => umaP('select public.registrar_dispositivo($1,$2) as r', [token, 'teste']))
  }
  igual((await comoServico(dbp, () => todasP('select * from public.destinos_push()'))).length, 2, 'destinos iniciais')

  await dbp.query('update public.administradores set ativo = false where user_id = $1', [ID_EX])
  const destinos = await comoServico(dbp, () => todasP('select * from public.destinos_push()'))
  igual(destinos.map((d) => d.token), ['token-do-dono-0001'], 'aparelho do ex-funcionario continua recebendo')
  const dev = await umaP("select ativo from public.dispositivos_push where token = 'token-do-ex-0002'")
  falso(dev.ativo, 'aparelho do administrador desativado nao foi desligado')
})

await teste('funcoes internas do push nao sao chamaveis pelo site nem pelo app', async () => {
  for (const sql of [
    'select * from public.reservar_notificacao(gen_random_uuid())',
    'select * from public.destinos_push()',
    'select public.reenviar_notificacoes_pendentes(1)',
  ]) {
    await lancaErro(() => comoAnonimo(dbp, () => todasP(sql)), 'permission denied', `anon executou: ${sql}`)
    await lancaErro(() => comoAdmin(dbp, ID_DONO_P, () => todasP(sql)), 'permission denied', `app executou: ${sql}`)
  }
})

await teste('se o pg_net falhar, a reserva do cliente continua valendo', async () => {
  await dbp.exec(`
    create or replace function net.http_post(
      url text, body jsonb default '{}', params jsonb default '{}',
      headers jsonb default '{}', timeout_milliseconds integer default 5000
    ) returns bigint language plpgsql as $f$ begin raise exception 'pg_net fora do ar'; end $f$;
  `)
  const r = await agendarP('14:00', '17900000005')
  verdadeiro(r.ok, `a falha do push derrubou a reserva: ${r.erro}`)
  const n = await notificacaoDe(r.agendamento.id)
  verdadeiro(String(n.erro).includes('pg_net fora do ar'), `falha nao registrada: ${n.erro}`)
})

await dbp.close()

// =====================================================================
grupo('Clube Arte 10: planos, promoções, cancelamento e ordem dos serviços')
// =====================================================================
// Banco próprio: estes testes mexem em limites e horários do dia.
const dbc = await criarBanco({ agendaDeTeste: false })
const umaC = async (sql, params = []) => (await dbc.query(sql, params)).rows[0]
const todasC = async (sql, params = []) => (await dbc.query(sql, params)).rows
const ID_DONO_C = randomUUID()
await dbc.query("insert into auth.users (id, email) values ($1, 'dono@clube.test')", [ID_DONO_C])
await dbc.query("insert into public.administradores (user_id, nome) values ($1, 'Dono')", [ID_DONO_C])

const CORTE_C = await umaC("select * from public.servicos where nome = 'Corte de cabelo'")
const BARBA_C = await umaC("select * from public.servicos where nome = 'Barba completa'")
const ELITE = await umaC("select * from public.planos where nome = 'Plano Elite'")
const DIA_C = iso((await umaC(
  `select g::date as d from generate_series((now() at time zone 'America/Sao_Paulo')::date + 1,
     (now() at time zone 'America/Sao_Paulo')::date + 30, interval '1 day') g
    where extract(dow from g) between 1 and 4 order by g limit 1`
)).d)
const DIA_C2 = iso((await umaC(
  `select g::date as d from generate_series((now() at time zone 'America/Sao_Paulo')::date + 1,
     (now() at time zone 'America/Sao_Paulo')::date + 30, interval '1 day') g
    where extract(dow from g) between 1 and 4 order by g offset 1 limit 1`
)).d)
const TEL_PLANO = '17911112222'

const anonC = (sql, params = []) => comoAnonimo(dbc, () => umaC(sql, params))
const donoC = (sql, params = []) => comoAdmin(dbc, ID_DONO_C, () => umaC(sql, params))
const agendarC = (servicoId, horario, telefone = TEL_PLANO, nome = 'Cliente do Plano', data = DIA_C) =>
  anonC('select public.criar_agendamento($1,$2,$3,$4,$5) as r', [
    servicoId, data, horario, nome, telefone,
  ]).then((x) => x.r)
const meuPlano = async (tel = TEL_PLANO) => (await anonC('select public.meu_plano($1) as r', [tel])).r.plano

await teste('o site lê os planos e promoções ativos, mas não os planos dos clientes', async () => {
  const planos = await comoAnonimo(dbc, () => todasC('select nome from public.planos order by ordem'))
  igual(planos.map((p) => p.nome), ['Plano Classic', 'Plano Elite'], 'planos do site')
  const promos = await comoAnonimo(dbc, () => todasC('select titulo from public.promocoes order by ordem'))
  igual(promos.map((p) => p.titulo), ['Cliente Fiel', 'Corrente'], 'promoções do site')
  await lancaErro(() => comoAnonimo(dbc, () => todasC('select * from public.assinaturas')), 'permission denied')
  await lancaErro(
    () => comoAnonimo(dbc, () => todasC("update public.planos set preco = 1")),
    'permission denied'
  )
  verdadeiro(CORTE_C.usa_plano, 'corte de cabelo deveria descontar do plano')
  falso(BARBA_C.usa_plano, 'barba não deveria descontar do plano')
})

await teste('pedir um plano avisa o dono e não deixa pedir dois', async () => {
  const r = (await anonC('select public.solicitar_plano($1,$2,$3) as r', [ELITE.id, 'Cliente do Plano', '(17) 91111-2222'])).r
  verdadeiro(r.ok, `pedido recusado: ${r.mensagem}`)
  igual(r.assinatura.status, 'solicitada')
  const n = await umaC("select * from public.notificacoes where tipo = 'plano_solicitado'")
  verdadeiro(n.corpo.includes('Cliente do Plano') && n.corpo.includes('Plano Elite') && n.corpo.includes('110,00'), n.corpo)
  const de_novo = (await anonC('select public.solicitar_plano($1,$2,$3) as r', [ELITE.id, 'Cliente do Plano', TEL_PLANO])).r
  igual(de_novo.erro, 'PLANO_JA_SOLICITADO')
  igual((await meuPlano()).status, 'solicitada')
})

await teste('plano pedido (ainda não pago) não desconta corte', async () => {
  const r = await agendarC(CORTE_C.id, '09:00')
  verdadeiro(r.ok, r.mensagem)
  igual(r.agendamento.plano, null, 'descontou antes do dono ativar')
})

await teste('só o dono ativa o plano; a validade começa na ativação', async () => {
  const s = await umaC("select id from public.assinaturas where status = 'solicitada'")
  await lancaErro(() => anonC('select public.ativar_assinatura($1)', [s.id]), 'permission denied')
  const r = (await donoC('select public.ativar_assinatura($1) as r', [s.id])).r
  verdadeiro(r.ok, r.mensagem)
  const dias = await umaC("select round(extract(epoch from expira_em - now()) / 86400) as d from public.assinaturas where id = $1", [s.id])
  igual(Number(dias.d), 30, 'validade')
  igual((await donoC('select public.ativar_assinatura($1) as r', [s.id])).r.erro, 'ASSINATURA_ESTADO')
})

await teste('agendar corte desconta 1 do plano e conta ao cliente quantos restam', async () => {
  const r = await agendarC(CORTE_C.id, '10:00')
  verdadeiro(r.ok, r.mensagem)
  igual(r.agendamento.plano.nome, 'Plano Elite')
  igual(r.agendamento.plano.numero, 1)
  igual(r.agendamento.plano.restantes, 3)
  const n = await umaC('select corpo from public.notificacoes where agendamento_id = $1', [r.agendamento.id])
  verdadeiro(n.corpo.endsWith('Plano Elite (1/4)'), `push do dono sem o plano: ${n.corpo}`)
  igual((await meuPlano()).restantes, 3)
})

await teste('serviço que não é corte não mexe no plano', async () => {
  const r = await agendarC(BARBA_C.id, '11:00')
  verdadeiro(r.ok, r.mensagem)
  igual(r.agendamento.plano, null)
  igual((await meuPlano()).restantes, 3)
})

await teste('o dono cancela: o horário volta a ficar livre e o corte volta para o plano', async () => {
  const ag = await umaC("select a.id from public.agendamentos a join public.plano_usos u on u.agendamento_id = a.id")
  await lancaErro(() => anonC('select public.cancelar_agendamento($1)', [ag.id]), 'permission denied')
  const r = (await donoC("select public.cancelar_agendamento($1, 'Barbeiro doente') as r", [ag.id])).r
  verdadeiro(r.ok, r.mensagem)
  verdadeiro(r.agendamento.cancelado, 'não ficou cancelado')
  igual((await meuPlano()).restantes, 4, 'corte não voltou')
  const livre = await comoAnonimo(dbc, () =>
    umaC("select disponivel from public.horarios_disponiveis($1,$2) where horario = '10:00'", [CORTE_C.id, DIA_C])
  )
  verdadeiro(livre.disponivel, 'horário cancelado continua ocupado no site')
  const pub = await umaC('select count(*)::int as n from public.agenda_publica where id = $1', [ag.id])
  igual(pub.n, 0, 'cancelado continua no espelho público')
  const agenda = (await donoC('select public.agenda_do_dia($1) as r', [DIA_C])).r
  falso(agenda.itens.some((i) => i.id === ag.id), 'cancelado continua na agenda do dia')
  // Outra pessoa consegue pegar o mesmo horário.
  const outro = await agendarC(BARBA_C.id, '10:00', '17933334444', 'Outro Cliente')
  verdadeiro(outro.ok, `horário liberado não aceitou nova reserva: ${outro.mensagem}`)
  igual((await donoC('select public.cancelar_agendamento($1) as r', [ag.id])).r.erro, 'AGENDAMENTO_JA_CANCELADO')
})

await teste('cancelamento não se desfaz, não vale para o passado e não passa por fora da função', async () => {
  const ag = await umaC('select id from public.agendamentos where cancelado_em is not null limit 1')
  await lancaErro(
    () => dbc.query('update public.agendamentos set cancelado_em = null where id = $1', [ag.id]),
    'AGENDAMENTO_JA_CANCELADO'
  )
  await lancaErro(
    () => comoAdmin(dbc, ID_DONO_C, () => dbc.query('delete from public.agendamentos where id = $1', [ag.id])),
    'permission denied'
  )
  const passado = await umaC(
    `with c as (insert into public.clientes (nome, telefone) values ('Antigo', '17955556666') returning id)
     insert into public.agendamentos (cliente_id, cliente_nome, servico_id, data, horario_inicio, horario_fim,
       inicio_em, fim_em, servico_nome, servico_preco, servico_duracao, origem)
     select c.id, 'Antigo', $1, current_date - 1, '10:00', '10:35', now() - interval '1 day',
            now() - interval '1 day' + interval '35 minutes', 'Corte de cabelo', 35, 35, 'balcao'
       from c returning id`,
    [CORTE_C.id]
  )
  igual((await donoC('select public.cancelar_agendamento($1) as r', [passado.id])).r.erro, 'CANCELAMENTO_TARDE')
})

await teste('usou todos os cortes: o plano fecha e o cliente pode pegar outro', async () => {
  // Libera o limite de reservas em aberto por telefone para este teste.
  await dbc.query('update public.config_barbearia set max_agendamentos_futuros = 20')
  for (const h of ['08:00', '08:45', '09:30', '10:15']) {
    const r = await agendarC(CORTE_C.id, h, TEL_PLANO, 'Cliente do Plano', DIA_C2)
    verdadeiro(r.ok && r.agendamento.plano, `${h}: ${r.mensagem}`)
  }
  const p = await meuPlano()
  igual([p.status, p.restantes], ['encerrada', 0])
  const extra = await agendarC(CORTE_C.id, '11:00', TEL_PLANO, 'Cliente do Plano', DIA_C2)
  igual(extra.agendamento.plano, null, 'descontou além do total')
  const novo = (await anonC('select public.solicitar_plano($1,$2,$3) as r', [ELITE.id, 'Cliente do Plano', TEL_PLANO])).r
  verdadeiro(novo.ok, `não deixou pedir novo plano: ${novo.mensagem}`)
})

await teste('o dono pode recusar um pedido', async () => {
  const s = await umaC("select id from public.assinaturas where status = 'solicitada'")
  igual((await donoC('select public.encerrar_assinatura($1) as r', [s.id])).r.assinatura.status, 'recusada')
  const lista = await comoAdmin(dbc, ID_DONO_C, () => todasC('select status from public.assinaturas_resumo order by solicitada_em'))
  igual(lista.map((x) => x.status), ['encerrada', 'recusada'])
  await lancaErro(() => comoAnonimo(dbc, () => todasC('select * from public.assinaturas_resumo')), 'permission denied')
})

await teste('o dono muda a ordem dos serviços (e o site segue essa ordem)', async () => {
  const antes = await todasC('select id, nome from public.servicos order by ordem, nome')
  const invertida = antes.map((s) => s.id).reverse()
  await lancaErro(() => anonC('select public.reordenar_servicos($1::uuid[])', [invertida]), 'permission denied')
  const r = (await donoC('select public.reordenar_servicos($1::uuid[]) as r', [invertida])).r
  verdadeiro(r.ok, r.mensagem)
  const depois = await comoAnonimo(dbc, () => todasC('select nome from public.servicos order by ordem, nome'))
  igual(depois.map((s) => s.nome), antes.map((s) => s.nome).reverse())
  const repetido = [invertida[0], invertida[0]]
  igual((await donoC('select public.reordenar_servicos($1::uuid[]) as r', [repetido])).r.erro, 'SERVICOS_INVALIDOS')
})

await teste('o dono apaga quem já passou pela cadeira, mas nunca um horário futuro', async () => {
  const passado = await umaC(
    `select a.id from public.agendamentos a
      where a.fim_em <= now() and a.cancelado_em is null limit 1`
  )
  const futuro = await umaC(
    `select a.id from public.agendamentos a join public.plano_usos u on u.agendamento_id = a.id
      where a.fim_em > now() limit 1`
  )
  await lancaErro(() => anonC('select public.apagar_atendimento($1)', [passado.id]), 'permission denied')
  igual((await donoC('select public.apagar_atendimento($1) as r', [futuro.id])).r.erro, 'ATENDIMENTO_NAO_PASSOU')
  // Mesmo com a marca ligada, horário futuro não sai.
  await lancaErro(
    () => dbc.exec(
      `select set_config('arte10.apagar_atendimento', 'sim', false);
       delete from public.agendamentos where id = '${futuro.id}'`
    ),
    'AGENDAMENTO_IMUTAVEL'
  )
  await dbc.query("select set_config('arte10.apagar_atendimento', '', false)")

  const r = (await donoC('select public.apagar_atendimento($1) as r', [passado.id])).r
  verdadeiro(r.ok, r.mensagem)
  igual((await umaC('select count(*)::int as n from public.agendamentos where id = $1', [passado.id])).n, 0)
  // Sem a função, continua proibido apagar.
  const outro = await umaC('select id from public.agendamentos where cancelado_em is not null limit 1')
  await lancaErro(() => dbc.query('delete from public.agendamentos where id = $1', [outro.id]), 'AGENDAMENTO_IMUTAVEL')
})

await teste('apagar tudo que já passou mantém os futuros e o plano como estava', async () => {
  const usadosAntes = await umaC("select cortes_usados from public.assinaturas where status = 'encerrada'")
  const futurosAntes = await umaC('select count(*)::int as n from public.agendamentos where fim_em > now() and cancelado_em is null')
  const r = (await donoC('select public.apagar_atendimentos_passados() as r')).r
  verdadeiro(r.ok && r.apagados >= 1, JSON.stringify(r))
  const sobra = await umaC('select count(*)::int as n from public.agendamentos where fim_em <= now() or cancelado_em is not null')
  igual(sobra.n, 0)
  const futurosDepois = await umaC('select count(*)::int as n from public.agendamentos where fim_em > now() and cancelado_em is null')
  igual(futurosDepois.n, futurosAntes.n, 'apagou horário futuro')
  const usadosDepois = await umaC("select cortes_usados from public.assinaturas where status = 'encerrada'")
  igual(usadosDepois.cortes_usados, usadosAntes.cortes_usados, 'mexeu no plano')
})

await teste('apagar cliente: só sem horário marcado e sem plano em aberto', async () => {
  const comFuturo = await umaC(
    `select c.id from public.clientes c join public.agendamentos a on a.cliente_id = c.id
      where a.fim_em > now() and a.cancelado_em is null limit 1`
  )
  await lancaErro(() => anonC('select public.apagar_cliente($1)', [comFuturo.id]), 'permission denied')
  igual((await donoC('select public.apagar_cliente($1) as r', [comFuturo.id])).r.erro, 'CLIENTE_TEM_HORARIO')

  const semNada = await umaC(
    `insert into public.clientes (nome, telefone) values ('Só Histórico', '17944445555') returning id`
  )
  const r = (await donoC('select public.apagar_cliente($1) as r', [semNada.id])).r
  verdadeiro(r.ok, r.mensagem)
  igual((await umaC('select count(*)::int as n from public.clientes where id = $1', [semNada.id])).n, 0)
})

await teste('planos encerrados podem ser excluídos; ativos e pedidos não', async () => {
  const novo = (await anonC('select public.solicitar_plano($1,$2,$3) as r', [ELITE.id, 'Fulano Plano', '17966667777'])).r
  igual((await donoC('select public.excluir_assinatura($1) as r', [novo.assinatura.id])).r.erro, 'ASSINATURA_ESTADO')
  await donoC('select public.encerrar_assinatura($1)', [novo.assinatura.id])
  verdadeiro((await donoC('select public.excluir_assinatura($1) as r', [novo.assinatura.id])).r.ok)
  const r = (await donoC('select public.excluir_assinaturas_encerradas() as r')).r
  verdadeiro(r.ok, r.mensagem)
  igual((await umaC("select count(*)::int as n from public.assinaturas where status not in ('solicitada','ativa')")).n, 0)
})

await teste('plano à venda: exclui se ninguém pegou; se já pegaram, pede para esconder', async () => {
  const usado = await umaC('select plano_id from public.assinaturas limit 1')
  if (usado) {
    igual((await donoC('select public.excluir_plano($1) as r', [usado.plano_id])).r.erro, 'PLANO_EM_USO')
  }
  const livre = await umaC(
    "insert into public.planos (nome, preco, cortes) values ('Plano Teste', 50, 1) returning id"
  )
  verdadeiro((await donoC('select public.excluir_plano($1) as r', [livre.id])).r.ok)
  await lancaErro(() => anonC('select public.excluir_plano($1)', [livre.id]), 'permission denied')
})

await dbc.close()

// =====================================================================
const falhas = relatorio()
await db.close()
process.exit(falhas > 0 ? 1 : 0)
