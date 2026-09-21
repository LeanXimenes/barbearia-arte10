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

/** Proximo dia util (segunda a sexta) a pelo menos `minDias` de hoje. */
async function proximoDiaUtil(minDias = 1) {
  const r = await uma(
    `select g::date as d
       from generate_series(
              (now() at time zone 'America/Sao_Paulo')::date + $1::int,
              (now() at time zone 'America/Sao_Paulo')::date + $1::int + 10,
              interval '1 day') g
      where extract(dow from g) between 1 and 5
      order by g
      limit 1`,
    [minDias]
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
const COMBO = await servico('Corte + Barba')

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
           (cliente_id, servico_id, data, horario_inicio, horario_fim, inicio_em, fim_em,
            servico_nome, servico_preco, servico_duracao)
         select a.cliente_id, a.servico_id, a.data, a.horario_inicio, a.horario_fim,
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

await teste('o proprietario pode marcar como concluido (sem liberar o horario)', async () => {
  const res = await comoAdmin(db, ID_DONO, async () =>
    (await uma('select public.atualizar_status_agendamento($1,$2) as res', [
      agendamentoJoao.id,
      'concluido',
    ])).res
  )
  verdadeiro(res.ok, `nao conseguiu concluir: ${res.erro}`)

  const slots = await horarios(CORTE.id, DIA)
  const s = slots.find((x) => String(x.horario) === '14:00:00')
  falso(s.disponivel, 'concluir o atendimento liberou o horario')
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

await teste('visao_geral_periodo nao devolve nada para nao-admin', async () => {
  const linhas = await comoUsuarioComum(db, ID_INTRUSO, () =>
    todas('select * from public.visao_geral_periodo($1,$2)', [DIA, DIA4])
  )
  igual(linhas.length, 0, 'vazou calendario para nao-admin')
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
const falhas = relatorio()
await db.close()
process.exit(falhas > 0 ? 1 : 0)
