-- =====================================================================
-- BARBEARIA ARTE 10 — INSTALADOR COMPLETO DO BANCO
-- =====================================================================
-- ARQUIVO GERADO por supabase/gerar_instalador.mjs — não edite à mão.
--
-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
-- Pode ser executado mais de uma vez sem problema.
-- =====================================================================

-- >>>>>>>>>> 20260101000100_extensoes_e_enums.sql
-- =====================================================================
-- BARBEARIA ARTE 10 — 01. Extensoes, tipos e utilitarios
-- =====================================================================
-- Observacoes:
--  * gen_random_uuid() e nativo no PostgreSQL >= 13 (nao exige pgcrypto).
--  * O operador de exclusao usa GiST com range_ops, que e nativo.
-- =====================================================================

-- Status possiveis de um agendamento.
-- ATENCAO: nao existe status "cancelado" de proposito.
-- A regra de negocio (item 14 da especificacao) determina que um
-- agendamento feito por um cliente NUNCA pode ser cancelado/excluido
-- pelo proprietario. Todos os status abaixo continuam ocupando o horario.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'agendamento_status') then
    create type public.agendamento_status as enum ('agendado', 'concluido', 'nao_compareceu');
  end if;
end
$$;

-- Origem do agendamento (permite futuras integracoes).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'agendamento_origem') then
    create type public.agendamento_origem as enum ('site', 'balcao', 'telefone');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Utilitario: mantem a coluna updated_at sempre coerente.
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Utilitario: normaliza telefone brasileiro para apenas digitos.
-- Aceita "(17) 99731-3480", "+55 17 99731 3480", "17997313480" ...
-- Retorna NULL quando o telefone nao tiver 10 ou 11 digitos uteis.
-- ---------------------------------------------------------------------
create or replace function public.normalizar_telefone(p_telefone text)
returns text
language plpgsql
immutable
as $$
declare
  v_digitos text;
begin
  if p_telefone is null then
    return null;
  end if;

  v_digitos := regexp_replace(p_telefone, '[^0-9]', '', 'g');

  -- Remove o codigo do pais (55) quando informado.
  if length(v_digitos) in (12, 13) and left(v_digitos, 2) = '55' then
    v_digitos := substring(v_digitos from 3);
  end if;

  if length(v_digitos) not in (10, 11) then
    return null;
  end if;

  return v_digitos;
end;
$$;

-- ---------------------------------------------------------------------
-- Utilitario: normaliza nome (espacos duplicados, espacos nas pontas).
-- ---------------------------------------------------------------------
create or replace function public.normalizar_nome(p_nome text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
$$;

-- >>>>>>>>>> 20260101000200_tabelas.sql
-- =====================================================================
-- BARBEARIA ARTE 10 — 02. Tabelas principais
-- =====================================================================

-- ---------------------------------------------------------------------
-- CONFIGURACAO GERAL DA BARBEARIA (registro unico)
-- ---------------------------------------------------------------------
create table if not exists public.config_barbearia (
  id                          boolean     primary key default true,
  nome                        text        not null default 'Barbearia Arte 10',
  fuso                        text        not null default 'America/Sao_Paulo',
  telefone_whatsapp           text,
  instagram                   text,
  endereco                    text,
  cidade                      text,
  uf                          char(2),
  mapa_url                    text,
  -- Passo da grade de horarios oferecida ao cliente (em minutos).
  granularidade_minutos       integer     not null default 15,
  -- Antecedencia minima para agendar (evita marcar "para agora").
  antecedencia_minima_minutos integer     not null default 30,
  -- Ate quantos dias no futuro o cliente pode agendar.
  antecedencia_maxima_dias    integer     not null default 60,
  -- Quantos agendamentos futuros um mesmo telefone pode ter em aberto.
  max_agendamentos_futuros    integer     not null default 3,
  -- Freio contra robôs: máximo de reservas pelo site em qualquer janela de 10 minutos.
  limite_agendamentos_10min   integer     not null default 20,
  updated_at                  timestamptz not null default now(),

  constraint config_barbearia_unica         check (id),
  constraint config_granularidade_valida    check (granularidade_minutos between 5 and 60),
  constraint config_antecedencia_min_valida check (antecedencia_minima_minutos between 0 and 1440),
  constraint config_antecedencia_max_valida check (antecedencia_maxima_dias between 1 and 180),
  constraint config_max_futuros_valido      check (max_agendamentos_futuros between 1 and 20),
  constraint config_limite_10min_valido     check (limite_agendamentos_10min between 1 and 500)
);

drop trigger if exists trg_config_barbearia_updated_at on public.config_barbearia;
create trigger trg_config_barbearia_updated_at
  before update on public.config_barbearia
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- HORARIO DE FUNCIONAMENTO POR DIA DA SEMANA
-- dia_semana segue extract(dow): 0 = domingo ... 6 = sabado
-- ---------------------------------------------------------------------
create table if not exists public.config_horarios (
  dia_semana       smallint    primary key,
  aberto           boolean     not null default true,
  abre             time,
  fecha            time,
  intervalo_inicio time,
  intervalo_fim    time,
  updated_at       timestamptz not null default now(),

  constraint config_horarios_dia_valido check (dia_semana between 0 and 6),
  -- Se o dia esta aberto, precisa ter expediente coerente.
  constraint config_horarios_expediente check (
    (not aberto) or (abre is not null and fecha is not null and fecha > abre)
  ),
  -- O intervalo (almoco) precisa ser coerente e estar dentro do expediente.
  constraint config_horarios_intervalo check (
    (intervalo_inicio is null and intervalo_fim is null)
    or (
      intervalo_inicio is not null and intervalo_fim is not null
      and intervalo_fim > intervalo_inicio
      and abre is not null and fecha is not null
      and intervalo_inicio >= abre and intervalo_fim <= fecha
    )
  )
);

drop trigger if exists trg_config_horarios_updated_at on public.config_horarios;
create trigger trg_config_horarios_updated_at
  before update on public.config_horarios
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- ADMINISTRADORES (proprietario / equipe com acesso ao aplicativo)
-- Liga um usuario do Supabase Auth ao papel administrativo.
-- ---------------------------------------------------------------------
create table if not exists public.administradores (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  nome       text        not null,
  ativo      boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_administradores_updated_at on public.administradores;
create trigger trg_administradores_updated_at
  before update on public.administradores
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- CLIENTES
-- ---------------------------------------------------------------------
create table if not exists public.clientes (
  id         uuid        primary key default gen_random_uuid(),
  nome       text        not null,
  telefone   text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clientes_nome_valido     check (char_length(btrim(nome)) between 2 and 80),
  -- Telefone e sempre gravado normalizado (somente digitos, 10 ou 11).
  constraint clientes_telefone_valido check (telefone ~ '^[0-9]{10,11}$')
);

-- Um telefone identifica um cliente: reagendamentos reutilizam o cadastro.
create unique index if not exists clientes_telefone_key on public.clientes (telefone);
create index if not exists clientes_nome_idx on public.clientes (lower(nome));

drop trigger if exists trg_clientes_updated_at on public.clientes;
create trigger trg_clientes_updated_at
  before update on public.clientes
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- SERVICOS
-- ---------------------------------------------------------------------
create table if not exists public.servicos (
  id              uuid           primary key default gen_random_uuid(),
  nome            text           not null,
  descricao       text,
  preco           numeric(10, 2) not null,
  duracao_minutos integer        not null,
  ativo           boolean        not null default true,
  ordem           integer        not null default 0,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now(),

  constraint servicos_nome_valido    check (char_length(btrim(nome)) between 2 and 60),
  constraint servicos_preco_valido   check (preco >= 0 and preco <= 100000),
  constraint servicos_duracao_valida check (duracao_minutos between 5 and 480)
);

create unique index if not exists servicos_nome_key on public.servicos (lower(btrim(nome)));
create index if not exists servicos_ativo_ordem_idx on public.servicos (ativo, ordem, nome);

drop trigger if exists trg_servicos_updated_at on public.servicos;
create trigger trg_servicos_updated_at
  before update on public.servicos
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- AGENDAMENTOS
-- ---------------------------------------------------------------------
-- A coluna "periodo" e gerada a partir de inicio_em/fim_em e sustenta a
-- constraint de exclusao, que e a garantia REAL contra dois clientes
-- reservarem o mesmo horario (item 7 da especificacao).
-- ---------------------------------------------------------------------
create table if not exists public.agendamentos (
  id              uuid                      primary key default gen_random_uuid(),
  cliente_id      uuid                      not null references public.clientes (id) on delete restrict,
  servico_id      uuid                      not null references public.servicos (id) on delete restrict,
  data            date                      not null,
  horario_inicio  time                      not null,
  horario_fim     time                      not null,
  inicio_em       timestamptz               not null,
  fim_em          timestamptz               not null,
  status          public.agendamento_status not null default 'agendado',
  origem          public.agendamento_origem not null default 'site',
  -- Chave de idempotencia enviada pelo site: protege contra cliques repetidos
  -- e contra reenvio da mesma requisicao (itens 21 e 22).
  idempotency_key text,
  -- "Fotografia" do servico no momento da reserva: preserva o historico
  -- mesmo que o servico seja renomeado, tenha preco alterado ou desativado.
  servico_nome    text                      not null,
  -- "Fotografia" do nome do cliente: o histórico não muda se o cadastro
  -- (telefone) for usado depois com outro nome.
  cliente_nome    text                      not null,
  servico_preco   numeric(10, 2)            not null,
  servico_duracao integer                   not null,
  observacoes     text,
  created_at      timestamptz               not null default now(),
  updated_at      timestamptz               not null default now(),

  periodo tstzrange generated always as (tstzrange(inicio_em, fim_em, '[)')) stored,

  constraint agendamentos_periodo_valido check (fim_em > inicio_em),
  constraint agendamentos_horario_valido check (horario_fim > horario_inicio),
  constraint agendamentos_duracao_valida check (servico_duracao between 5 and 480),
  constraint agendamentos_observacoes_tam check (observacoes is null or char_length(observacoes) <= 1000),
  constraint agendamentos_chave_tam      check (idempotency_key is null or char_length(idempotency_key) <= 100),

  -- >>> TRAVA DE CONCORRENCIA <<<
  -- O banco recusa qualquer agendamento que se sobreponha a outro,
  -- mesmo que duas transacoes cheguem exatamente no mesmo instante.
  constraint agendamentos_sem_sobreposicao exclude using gist (periodo with &&)
);

create unique index if not exists agendamentos_idempotency_key
  on public.agendamentos (idempotency_key)
  where idempotency_key is not null;

create index if not exists agendamentos_data_idx      on public.agendamentos (data, horario_inicio);
create index if not exists agendamentos_inicio_em_idx on public.agendamentos (inicio_em);
create index if not exists agendamentos_cliente_idx   on public.agendamentos (cliente_id, inicio_em desc);
create index if not exists agendamentos_servico_idx   on public.agendamentos (servico_id);
create index if not exists agendamentos_criacao_idx    on public.agendamentos (created_at);

drop trigger if exists trg_agendamentos_updated_at on public.agendamentos;
create trigger trg_agendamentos_updated_at
  before update on public.agendamentos
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- BLOQUEIOS (horarios fechados manualmente pelo proprietario)
-- ---------------------------------------------------------------------
create table if not exists public.bloqueios (
  id             uuid        primary key default gen_random_uuid(),
  data           date        not null,
  horario_inicio time        not null,
  horario_fim    time        not null,
  inicio_em      timestamptz not null,
  fim_em         timestamptz not null,
  motivo         text,
  criado_por     uuid        references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),

  periodo tstzrange generated always as (tstzrange(inicio_em, fim_em, '[)')) stored,

  constraint bloqueios_periodo_valido     check (fim_em > inicio_em),
  constraint bloqueios_horario_valido     check (horario_fim > horario_inicio),
  constraint bloqueios_sem_sobreposicao   exclude using gist (periodo with &&)
);

create index if not exists bloqueios_data_idx on public.bloqueios (data, horario_inicio);

-- ---------------------------------------------------------------------
-- DISPOSITIVOS PUSH (tokens FCM do aplicativo do proprietario)
-- ---------------------------------------------------------------------
create table if not exists public.dispositivos_push (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  token      text        not null,
  plataforma text        not null default 'android',
  modelo     text,
  ativo      boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint dispositivos_push_token_valido check (char_length(btrim(token)) between 10 and 4096)
);

create unique index if not exists dispositivos_push_token_key on public.dispositivos_push (token);
create index if not exists dispositivos_push_user_idx on public.dispositivos_push (user_id) where ativo;

drop trigger if exists trg_dispositivos_push_updated_at on public.dispositivos_push;
create trigger trg_dispositivos_push_updated_at
  before update on public.dispositivos_push
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- NOTIFICACOES (caixa de saida: 1 linha por push a ser entregue)
-- ---------------------------------------------------------------------
create table if not exists public.notificacoes (
  id             uuid        primary key default gen_random_uuid(),
  agendamento_id uuid        references public.agendamentos (id) on delete set null,
  tipo           text        not null default 'novo_agendamento',
  titulo         text        not null,
  corpo          text        not null,
  dados          jsonb       not null default '{}'::jsonb,
  status         text        not null default 'pendente',
  -- tentativas: quantas vezes a Edge Function assumiu o envio.
  -- disparos: quantas vezes o banco chamou a Edge Function (pg_net).
  tentativas     integer     not null default 0,
  disparos       integer     not null default 0,
  request_id     bigint,
  reservada_em   timestamptz,
  erro           text,
  created_at     timestamptz not null default now(),
  enviada_em     timestamptz,

  constraint notificacoes_status_valido check (status in ('pendente', 'enviando', 'enviada', 'falhou'))
);

create index if not exists notificacoes_pendentes_idx
  on public.notificacoes (created_at)
  where status = 'pendente';

-- >>>>>>>>>> 20260101000300_regras_de_integridade.sql
-- =====================================================================
-- BARBEARIA ARTE 10 — 03. Regras de integridade e agenda publica
-- =====================================================================

-- ---------------------------------------------------------------------
-- REGRA ABSOLUTA (item 14 da especificacao)
-- Um agendamento feito por um cliente NAO pode ser excluido nem ter os
-- seus dados essenciais alterados. Isso e garantido no banco, e nao
-- apenas na interface: mesmo um acesso direto a API com token de
-- administrador e recusado.
--
-- O que ainda pode mudar: "status" (desfecho do atendimento, e só
-- depois que o horário começou) e "observacoes". Nenhum dos dois libera
-- o horário.
-- ---------------------------------------------------------------------
create or replace function public.tg_agendamento_imutavel()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'AGENDAMENTO_IMUTAVEL'
      using detail  = 'Agendamentos de clientes nao podem ser excluidos.',
            errcode = 'check_violation';
  end if;

  if new.id is distinct from old.id
     or new.cliente_id      is distinct from old.cliente_id
     or new.cliente_nome    is distinct from old.cliente_nome
     or new.servico_id      is distinct from old.servico_id
     or new.data            is distinct from old.data
     or new.horario_inicio  is distinct from old.horario_inicio
     or new.horario_fim     is distinct from old.horario_fim
     or new.inicio_em       is distinct from old.inicio_em
     or new.fim_em          is distinct from old.fim_em
     or new.servico_nome    is distinct from old.servico_nome
     or new.servico_preco   is distinct from old.servico_preco
     or new.servico_duracao is distinct from old.servico_duracao
     or new.idempotency_key is distinct from old.idempotency_key
     or new.origem          is distinct from old.origem
     or new.created_at      is distinct from old.created_at
  then
    raise exception 'AGENDAMENTO_IMUTAVEL'
      using detail  = 'Somente status e observacoes podem ser alterados em um agendamento.',
            errcode = 'check_violation';
  end if;

  -- O desfecho (atendido / não compareceu) só existe depois que o horário
  -- começou. Isso impede, por exemplo, marcar reservas futuras como falta
  -- para contornar o limite de reservas por telefone.
  if new.status is distinct from old.status and old.inicio_em > now() then
    raise exception 'ATENDIMENTO_NAO_COMECOU'
      using detail  = 'O status so pode ser alterado depois do horario marcado.',
            errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_agendamentos_sem_exclusao on public.agendamentos;
create trigger trg_agendamentos_sem_exclusao
  before delete on public.agendamentos
  for each row execute function public.tg_agendamento_imutavel();

drop trigger if exists trg_agendamentos_sem_alteracao on public.agendamentos;
create trigger trg_agendamentos_sem_alteracao
  before update on public.agendamentos
  for each row execute function public.tg_agendamento_imutavel();

-- ---------------------------------------------------------------------
-- TRUNCATE não dispara gatilhos de linha. Sem esta trava, um
-- "truncate clientes cascade" (ou servicos cascade) apagaria todo o
-- histórico em silêncio. O gatilho por instrução também dispara quando a
-- tabela é atingida pela cascata.
-- ---------------------------------------------------------------------
create or replace function public.tg_agendamento_sem_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'AGENDAMENTO_IMUTAVEL'
    using detail  = 'O historico de agendamentos nao pode ser apagado (TRUNCATE).',
          errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_agendamentos_sem_truncate on public.agendamentos;
create trigger trg_agendamentos_sem_truncate
  before truncate on public.agendamentos
  for each statement execute function public.tg_agendamento_sem_truncate();

-- ---------------------------------------------------------------------
-- Servicos nunca sao apagados quando ja foram usados: a FK com
-- ON DELETE RESTRICT ja impede. O trigger abaixo devolve uma mensagem
-- clara para o aplicativo (item 27: desative, nao apague).
-- ---------------------------------------------------------------------
create or replace function public.tg_servico_em_uso()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.agendamentos a where a.servico_id = old.id) then
    raise exception 'SERVICO_EM_USO'
      using detail  = 'Este servico possui agendamentos no historico. Desative-o em vez de excluir.',
            errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_servicos_sem_exclusao_em_uso on public.servicos;
create trigger trg_servicos_sem_exclusao_em_uso
  before delete on public.servicos
  for each row execute function public.tg_servico_em_uso();

-- ---------------------------------------------------------------------
-- AGENDA PUBLICA
-- ---------------------------------------------------------------------
-- Espelho SEM DADOS PESSOAIS dos periodos ocupados (agendamentos +
-- bloqueios). E a unica tabela de ocupacao que o site publico consegue
-- ler e assinar via Realtime. Assim o navegador sabe "algo mudou na
-- agenda" sem nunca ter acesso a nome, telefone ou servico de terceiros.
-- ---------------------------------------------------------------------
create table if not exists public.agenda_publica (
  id             uuid        primary key,
  origem         text        not null,
  data           date        not null,
  horario_inicio time        not null,
  horario_fim    time        not null,
  inicio_em      timestamptz not null,
  fim_em         timestamptz not null,
  atualizado_em  timestamptz not null default now(),

  constraint agenda_publica_origem_valida check (origem in ('agendamento', 'bloqueio'))
);

create index if not exists agenda_publica_data_idx on public.agenda_publica (data, horario_inicio);

create or replace function public.tg_sincronizar_agenda_publica()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_origem text := tg_argv[0];
begin
  if tg_op = 'DELETE' then
    delete from public.agenda_publica where id = old.id;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Mudou só status/observações/motivo: o período ocupado é o mesmo, então
    -- não há por que gerar um evento público (e revelar que o registro mudou).
    if new.id = old.id
       and new.data = old.data
       and new.inicio_em = old.inicio_em
       and new.fim_em = old.fim_em then
      return new;
    end if;

    if new.id <> old.id then
      delete from public.agenda_publica where id = old.id;
    end if;
  end if;

  insert into public.agenda_publica
    (id, origem, data, horario_inicio, horario_fim, inicio_em, fim_em, atualizado_em)
  values
    (new.id, v_origem, new.data, new.horario_inicio, new.horario_fim, new.inicio_em, new.fim_em, now())
  on conflict (id) do update set
    data           = excluded.data,
    horario_inicio = excluded.horario_inicio,
    horario_fim    = excluded.horario_fim,
    inicio_em      = excluded.inicio_em,
    fim_em         = excluded.fim_em,
    atualizado_em  = now();

  return new;
end;
$$;

drop trigger if exists trg_agendamentos_agenda_publica on public.agendamentos;
create trigger trg_agendamentos_agenda_publica
  after insert or update or delete on public.agendamentos
  for each row execute function public.tg_sincronizar_agenda_publica('agendamento');

drop trigger if exists trg_bloqueios_agenda_publica on public.bloqueios;
create trigger trg_bloqueios_agenda_publica
  after insert or update or delete on public.bloqueios
  for each row execute function public.tg_sincronizar_agenda_publica('bloqueio');

-- Um TRUNCATE em bloqueios não passa pelo gatilho de linha: limpa o espelho.
create or replace function public.tg_bloqueios_truncate_agenda_publica()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.agenda_publica where origem = 'bloqueio';
  return null;
end;
$$;

drop trigger if exists trg_bloqueios_truncate_agenda_publica on public.bloqueios;
create trigger trg_bloqueios_truncate_agenda_publica
  after truncate on public.bloqueios
  for each statement execute function public.tg_bloqueios_truncate_agenda_publica();

-- ---------------------------------------------------------------------
-- Quem e administrador?
-- SECURITY DEFINER para poder ser usada dentro das policies de RLS sem
-- provocar recursao infinita na propria tabela administradores.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.administradores a
    where a.user_id = auth.uid()
      and a.ativo
  );
$$;

-- >>>>>>>>>> 20260101000400_funcoes_disponibilidade.sql
-- =====================================================================
-- BARBEARIA ARTE 10 — 04. Calculo de disponibilidade
-- =====================================================================
-- Toda a disponibilidade mostrada no site vem DAQUI, do servidor.
-- O navegador nunca decide o que esta livre (item 34).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mensagens padronizadas (site e aplicativo mostram o mesmo texto).
-- ---------------------------------------------------------------------
create or replace function public.mensagem_erro(p_codigo text)
returns text
language sql
immutable
as $$
  select case p_codigo
    when 'HORARIO_OCUPADO'      then 'Esse horário acabou de ser reservado. Por favor, escolha outro horário.'
    when 'HORARIO_BLOQUEADO'    then 'Esse horário não está mais disponível.'
    when 'HORARIO_PASSADO'      then 'Esse horário já passou. Escolha um horário futuro.'
    when 'HORARIO_INVALIDO'     then 'Horário inválido. Escolha um dos horários oferecidos.'
    when 'FORA_EXPEDIENTE'      then 'Esse horário está fora do expediente da barbearia.'
    when 'INTERVALO'            then 'Esse horário cai no intervalo da barbearia.'
    when 'DIA_FECHADO'          then 'Barbearia fechada neste dia.'
    when 'DATA_MUITO_DISTANTE'  then 'Ainda não é possível agendar para essa data.'
    when 'SERVICO_NAO_ENCONTRADO' then 'Serviço não encontrado.'
    when 'SERVICO_INDISPONIVEL' then 'Esse serviço não está disponível no momento.'
    when 'NOME_INVALIDO'        then 'Informe seu nome completo (mínimo 2 caracteres).'
    when 'TELEFONE_INVALIDO'    then 'Informe um telefone válido com DDD.'
    when 'DADOS_INCOMPLETOS'    then 'Preencha todos os campos para confirmar o agendamento.'
    when 'LIMITE_AGENDAMENTOS'  then 'Você já possui agendamentos em aberto. Conclua ou aguarde antes de marcar outro.'
    when 'EXISTE_AGENDAMENTO'   then 'Não é possível bloquear: já existe um cliente agendado nesse período.'
    when 'JA_BLOQUEADO'         then 'Esse período já está bloqueado.'
    when 'BLOQUEIO_NAO_ENCONTRADO' then 'Bloqueio não encontrado (talvez já tenha sido removido).'
    when 'NAO_AUTORIZADO'       then 'Você não tem permissão para executar esta ação.'
    when 'CONFIG_AUSENTE'       then 'A barbearia ainda não finalizou a configuração da agenda.'
    when 'PERIODO_INVALIDO'     then 'Período inválido.'
    when 'STATUS_INVALIDO'      then 'Status inválido.'
    when 'AGENDAMENTO_NAO_ENCONTRADO' then 'Agendamento não encontrado.'
    when 'ATENDIMENTO_NAO_COMECOU' then 'Só dá para registrar o atendimento depois do horário marcado.'
    when 'MUITAS_TENTATIVAS'    then 'Muitos agendamentos em pouco tempo. Tente novamente em alguns minutos.'
    when 'DADOS_INVALIDOS'      then 'Não foi possível processar o pedido. Atualize a página e tente novamente.'
    else 'Não foi possível concluir a operação. Tente novamente.'
  end;
$$;

create or replace function public.resposta_erro(p_codigo text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'ok', false,
    'erro', p_codigo,
    'mensagem', public.mensagem_erro(p_codigo)
  );
$$;

-- ---------------------------------------------------------------------
-- horarios_disponiveis(servico, data)
-- ---------------------------------------------------------------------
-- Regras aplicadas (item 9):
--   * dia precisa estar aberto;
--   * o servico inteiro precisa caber dentro do expediente;
--   * o servico nao pode invadir o intervalo (almoco);
--   * horarios ja passados nao sao devolvidos;
--   * datas alem da janela de agendamento nao sao devolvidas;
--   * horarios ocupados/bloqueados SAO devolvidos, marcados como
--     indisponiveis, para que o cliente enxergue "14:00 — INDISPONÍVEL"
--     (item 6) em vez de simplesmente nao ver o horario.
-- ---------------------------------------------------------------------
create or replace function public.horarios_disponiveis(
  p_servico_id uuid,
  p_data       date
)
returns table (
  horario     time,
  horario_fim time,
  inicio_em   timestamptz,
  fim_em      timestamptz,
  disponivel  boolean,
  motivo      text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg        public.config_barbearia%rowtype;
  v_h          public.config_horarios%rowtype;
  v_duracao    integer;
  v_ativo      boolean;
  v_hoje       date;
  v_limite     timestamptz;
  v_passo      interval;
  v_dur        interval;
  v_abre_ts    timestamp;
  v_fecha_ts   timestamp;
  v_int_ini    timestamp;
  v_int_fim    timestamp;
  v_cursor     timestamp;
  v_fim_ts     timestamp;
  v_ini_tz     timestamptz;
  v_fim_tz     timestamptz;
  v_range      tstzrange;
  v_janela     tstzrange;
  v_ocupados   tstzrange[];
  v_bloqueados tstzrange[];
begin
  if p_servico_id is null or p_data is null then
    return;
  end if;

  select * into v_cfg from public.config_barbearia where id;
  if not found then
    return;
  end if;

  select s.duracao_minutos, s.ativo
    into v_duracao, v_ativo
    from public.servicos s
   where s.id = p_servico_id;

  -- Servico inexistente ou desativado nao oferece horario nenhum (item 27).
  if not found or not v_ativo then
    return;
  end if;

  v_hoje := (now() at time zone v_cfg.fuso)::date;
  if p_data < v_hoje or p_data > v_hoje + v_cfg.antecedencia_maxima_dias then
    return;
  end if;

  select * into v_h
    from public.config_horarios
   where dia_semana = extract(dow from p_data)::smallint;

  if not found or not v_h.aberto then
    return; -- Barbearia fechada neste dia (item 25).
  end if;

  v_passo    := make_interval(mins => v_cfg.granularidade_minutos);
  v_dur      := make_interval(mins => v_duracao);
  v_limite   := now() + make_interval(mins => v_cfg.antecedencia_minima_minutos);
  v_abre_ts  := p_data + v_h.abre;
  v_fecha_ts := p_data + v_h.fecha;

  if v_h.intervalo_inicio is not null then
    v_int_ini := p_data + v_h.intervalo_inicio;
    v_int_fim := p_data + v_h.intervalo_fim;
  end if;

  -- Carrega uma unica vez tudo que ocupa o dia (com folga nas bordas).
  v_janela := tstzrange(
    (v_abre_ts - interval '12 hours') at time zone v_cfg.fuso,
    (v_fecha_ts + interval '12 hours') at time zone v_cfg.fuso,
    '[)'
  );

  select coalesce(array_agg(a.periodo), '{}')
    into v_ocupados
    from public.agendamentos a
   where a.periodo && v_janela;

  select coalesce(array_agg(b.periodo), '{}')
    into v_bloqueados
    from public.bloqueios b
   where b.periodo && v_janela;

  v_cursor := v_abre_ts;

  while v_cursor < v_fecha_ts loop
    v_fim_ts := v_cursor + v_dur;

    -- O servico inteiro precisa caber antes do fechamento.
    exit when v_fim_ts > v_fecha_ts;

    -- Nao pode invadir o intervalo.
    if v_int_ini is null or not (v_cursor < v_int_fim and v_fim_ts > v_int_ini) then
      v_ini_tz := v_cursor at time zone v_cfg.fuso;
      v_fim_tz := v_fim_ts at time zone v_cfg.fuso;

      -- Horarios passados simplesmente nao aparecem (item 24).
      if v_ini_tz >= v_limite then
        v_range := tstzrange(v_ini_tz, v_fim_tz, '[)');

        horario     := v_cursor::time;
        horario_fim := v_fim_ts::time;
        inicio_em   := v_ini_tz;
        fim_em      := v_fim_tz;

        if exists (select 1 from unnest(v_ocupados) r where r && v_range) then
          disponivel := false;
          motivo     := 'ocupado';
        elsif exists (select 1 from unnest(v_bloqueados) r where r && v_range) then
          disponivel := false;
          motivo     := 'bloqueado';
        else
          disponivel := true;
          motivo     := null;
        end if;

        return next;
      end if;
    end if;

    v_cursor := v_cursor + v_passo;
  end loop;

  return;
end;
$$;

-- ---------------------------------------------------------------------
-- dias_disponiveis(servico, inicio, fim)
-- Alimenta o calendario do site: diz, para cada dia, se a barbearia
-- abre, se a data esta dentro da janela de agendamento e quantos
-- horarios ainda estao livres.
-- ---------------------------------------------------------------------
create or replace function public.dias_disponiveis(
  p_servico_id uuid,
  p_inicio     date,
  p_fim        date
)
returns table (
  data             date,
  aberto           boolean,
  dentro_da_janela boolean,
  disponiveis      integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg   public.config_barbearia%rowtype;
  v_hoje  date;
  v_dia   date;
  v_aberto boolean;
begin
  if p_servico_id is null or p_inicio is null or p_fim is null or p_fim < p_inicio then
    return;
  end if;

  -- Protege o banco contra varreduras gigantes vindas do cliente.
  if p_fim - p_inicio > 92 then
    p_fim := p_inicio + 92;
  end if;

  select * into v_cfg from public.config_barbearia where id;
  if not found then
    return;
  end if;

  v_hoje := (now() at time zone v_cfg.fuso)::date;

  for v_dia in select g::date from generate_series(p_inicio, p_fim, interval '1 day') g loop
    select h.aberto into v_aberto
      from public.config_horarios h
     where h.dia_semana = extract(dow from v_dia)::smallint;

    data             := v_dia;
    aberto           := coalesce(v_aberto, false);
    dentro_da_janela := v_dia >= v_hoje and v_dia <= v_hoje + v_cfg.antecedencia_maxima_dias;

    if aberto and dentro_da_janela then
      select count(*)::integer
        into disponiveis
        from public.horarios_disponiveis(p_servico_id, v_dia) hd
       where hd.disponivel;
    else
      disponiveis := 0;
    end if;

    return next;
  end loop;

  return;
end;
$$;

-- >>>>>>>>>> 20260101000500_funcao_criar_agendamento.sql
-- =====================================================================
-- BARBEARIA ARTE 10 — 05. Criacao de agendamento (fluxo do cliente)
-- =====================================================================
-- Este e o unico caminho pelo qual o site consegue gravar um
-- agendamento. O cliente anonimo NAO tem INSERT direto em nenhuma
-- tabela: ele so pode chamar esta funcao, que revalida tudo do zero
-- no servidor (itens 7, 23 e 34).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Monta o JSON de retorno de um agendamento (usado no sucesso e na
-- resposta idempotente).
-- ---------------------------------------------------------------------
create or replace function public.agendamento_json(p_agendamento_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id',              a.id,
    'codigo',          upper(substring(replace(a.id::text, '-', '') from 1 for 6)),
    'cliente',         a.cliente_nome,
    'telefone',        c.telefone,
    'servico',         a.servico_nome,
    'preco',           a.servico_preco,
    'duracao_minutos', a.servico_duracao,
    'data',            a.data,
    'horario_inicio',  to_char(a.horario_inicio, 'HH24:MI'),
    'horario_fim',     to_char(a.horario_fim, 'HH24:MI'),
    'inicio_em',       a.inicio_em,
    'fim_em',          a.fim_em,
    'status',          a.status,
    'created_at',      a.created_at
  )
  from public.agendamentos a
  join public.clientes c on c.id = a.cliente_id
  where a.id = p_agendamento_id;
$$;

create or replace function public.barbearia_json()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'nome',              cfg.nome,
    'endereco',          cfg.endereco,
    'cidade',            cfg.cidade,
    'uf',                cfg.uf,
    'telefone_whatsapp', cfg.telefone_whatsapp,
    'instagram',         cfg.instagram,
    'mapa_url',          cfg.mapa_url
  )
  from public.config_barbearia cfg
  where cfg.id;
$$;

-- ---------------------------------------------------------------------
-- criar_agendamento
-- ---------------------------------------------------------------------
create or replace function public.criar_agendamento(
  p_servico_id      uuid,
  p_data            date,
  p_horario_inicio  time,
  p_nome            text,
  p_telefone        text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg       public.config_barbearia%rowtype;
  v_h         public.config_horarios%rowtype;
  v_srv       public.servicos%rowtype;
  v_nome      text;
  v_tel       text;
  v_chave     text;
  v_ini_ts    timestamp;
  v_fim_ts    timestamp;
  v_ini       timestamptz;
  v_fim       timestamptz;
  v_range     tstzrange;
  v_cliente_id uuid;
  v_agendamento_id uuid;
  v_existente uuid;
  v_futuros   integer;
  v_falha     text;
  v_passo_seg bigint;
begin
  v_chave := nullif(btrim(coalesce(p_idempotency_key, '')), '');

  -- A chave vem do navegador: limita o tamanho (evita erro de índice e abuso).
  if v_chave is not null and char_length(v_chave) > 100 then
    return public.resposta_erro('DADOS_INVALIDOS');
  end if;

  -- 0) IDEMPOTENCIA (item 21): a mesma chave sempre devolve a mesma reserva.
  if v_chave is not null then
    select a.id into v_existente
      from public.agendamentos a
     where a.idempotency_key = v_chave;

    if found then
      return jsonb_build_object(
        'ok',          true,
        'duplicado',   true,
        'agendamento', public.agendamento_json(v_existente),
        'barbearia',   public.barbearia_json()
      );
    end if;
  end if;

  select * into v_cfg from public.config_barbearia where id;
  if not found then
    return public.resposta_erro('CONFIG_AUSENTE');
  end if;

  -- 1) Dados obrigatorios.
  if p_servico_id is null or p_data is null or p_horario_inicio is null then
    return public.resposta_erro('DADOS_INCOMPLETOS');
  end if;

  v_nome := public.normalizar_nome(p_nome);
  if v_nome is null or char_length(v_nome) < 2 then
    return public.resposta_erro('NOME_INVALIDO');
  end if;
  v_nome := left(v_nome, 80);

  v_tel := public.normalizar_telefone(p_telefone);
  if v_tel is null then
    return public.resposta_erro('TELEFONE_INVALIDO');
  end if;

  -- 2) Servico precisa existir e estar ativo (item 27).
  select * into v_srv from public.servicos s where s.id = p_servico_id;
  if not found then
    return public.resposta_erro('SERVICO_NAO_ENCONTRADO');
  end if;
  if not v_srv.ativo then
    return public.resposta_erro('SERVICO_INDISPONIVEL');
  end if;

  -- 3) Periodo real ocupado = horario escolhido + duracao do servico (item 8).
  v_ini_ts := p_data + p_horario_inicio;
  v_fim_ts := v_ini_ts + make_interval(mins => v_srv.duracao_minutos);
  v_ini    := v_ini_ts at time zone v_cfg.fuso;
  v_fim    := v_fim_ts at time zone v_cfg.fuso;
  v_range  := tstzrange(v_ini, v_fim, '[)');

  -- 4) Nunca aceitar horario passado, mesmo vindo de uma pagina antiga (item 24).
  if v_ini < now() + make_interval(mins => v_cfg.antecedencia_minima_minutos) then
    return public.resposta_erro('HORARIO_PASSADO');
  end if;

  -- 5) Janela maxima de agendamento.
  if p_data > (now() at time zone v_cfg.fuso)::date + v_cfg.antecedencia_maxima_dias then
    return public.resposta_erro('DATA_MUITO_DISTANTE');
  end if;

  -- 6) Dia precisa estar aberto (item 25).
  select * into v_h
    from public.config_horarios
   where dia_semana = extract(dow from p_data)::smallint;

  if not found or not v_h.aberto then
    return public.resposta_erro('DIA_FECHADO');
  end if;

  -- 7) O servico inteiro precisa caber no expediente.
  if v_ini_ts < p_data + v_h.abre or v_fim_ts > p_data + v_h.fecha then
    return public.resposta_erro('FORA_EXPEDIENTE');
  end if;

  -- 8) E nao pode invadir o intervalo.
  if v_h.intervalo_inicio is not null
     and v_ini_ts < p_data + v_h.intervalo_fim
     and v_fim_ts > p_data + v_h.intervalo_inicio then
    return public.resposta_erro('INTERVALO');
  end if;

  -- 9) O horario precisa pertencer a grade oferecida.
  v_passo_seg := v_cfg.granularidade_minutos * 60;
  if mod(extract(epoch from (v_ini_ts - (p_data + v_h.abre)))::bigint, v_passo_seg) <> 0 then
    return public.resposta_erro('HORARIO_INVALIDO');
  end if;

  -- 10) A partir daqui a operacao e serializada com os bloqueios do
  --     proprietario. Duas reservas concorrentes entram uma de cada vez.
  perform pg_advisory_xact_lock(hashtext('barbearia_arte10:agenda'));

  -- 10b) Freio contra robôs. A chave anon é pública e, pela regra do item 14,
  --      o dono não pode apagar reservas: sem este limite, um script poderia
  --      lotar a agenda com telefones inventados.
  if (select count(*) from public.agendamentos a
       where a.origem = 'site'
         and a.created_at > now() - interval '10 minutes') >= v_cfg.limite_agendamentos_10min then
    return public.resposta_erro('MUITAS_TENTATIVAS');
  end if;

  -- 11) Bloqueio administrativo (itens 15 e 23).
  if exists (select 1 from public.bloqueios b where b.periodo && v_range) then
    return public.resposta_erro('HORARIO_BLOQUEADO');
  end if;

  -- 12) Conferencia explicita de sobreposicao (item 32).
  if exists (select 1 from public.agendamentos a where a.periodo && v_range) then
    return public.resposta_erro('HORARIO_OCUPADO');
  end if;

  -- 13) Limite de reservas futuras em aberto por telefone (anti-abuso).
  select c.id into v_cliente_id from public.clientes c where c.telefone = v_tel;
  if v_cliente_id is not null then
    select count(*) into v_futuros
      from public.agendamentos a
     where a.cliente_id = v_cliente_id
       and a.inicio_em > now()
       and a.status = 'agendado';

    if v_futuros >= v_cfg.max_agendamentos_futuros then
      return public.resposta_erro('LIMITE_AGENDAMENTOS');
    end if;
  end if;

  -- 14) Gravacao. Cliente e agendamento entram no mesmo bloco: se o
  --     agendamento falhar, nada fica gravado pela metade (item 22).
  begin
    insert into public.clientes (nome, telefone)
    values (v_nome, v_tel)
    on conflict (telefone) do update set nome = excluded.nome
    returning id into v_cliente_id;

    insert into public.agendamentos (
      cliente_id, cliente_nome, servico_id, data, horario_inicio, horario_fim,
      inicio_em, fim_em, origem, idempotency_key,
      servico_nome, servico_preco, servico_duracao
    )
    values (
      v_cliente_id, v_nome, v_srv.id, p_data, v_ini_ts::time, v_fim_ts::time,
      v_ini, v_fim, 'site', v_chave,
      v_srv.nome, v_srv.preco, v_srv.duracao_minutos
    )
    returning id into v_agendamento_id;

  exception
    -- A constraint de exclusao venceu a corrida: outra pessoa reservou
    -- este exato periodo em paralelo (item 7).
    when exclusion_violation then
      v_falha := 'HORARIO_OCUPADO';
    -- Duas requisicoes identicas chegaram juntas com a mesma chave.
    when unique_violation then
      v_falha := 'IDEMPOTENCIA';
  end;

  if v_falha = 'HORARIO_OCUPADO' then
    return public.resposta_erro('HORARIO_OCUPADO');
  end if;

  if v_falha = 'IDEMPOTENCIA' then
    select a.id into v_existente
      from public.agendamentos a
     where a.idempotency_key = v_chave;

    if found then
      return jsonb_build_object(
        'ok',          true,
        'duplicado',   true,
        'agendamento', public.agendamento_json(v_existente),
        'barbearia',   public.barbearia_json()
      );
    end if;

    return public.resposta_erro('HORARIO_OCUPADO');
  end if;

  -- 15) Enfileira a notificacao push do proprietario (item 19).
  insert into public.notificacoes (agendamento_id, tipo, titulo, corpo, dados)
  values (
    v_agendamento_id,
    'novo_agendamento',
    'Novo agendamento',
    v_nome || ' marcou ' || v_srv.nome || ' — ' ||
      to_char(p_data, 'DD/MM') || ' às ' || to_char(v_ini_ts::time, 'HH24:MI'),
    jsonb_build_object(
      'agendamento_id', v_agendamento_id,
      'data',           p_data,
      'horario',        to_char(v_ini_ts::time, 'HH24:MI'),
      'servico',        v_srv.nome,
      'cliente',        v_nome
    )
  );

  return jsonb_build_object(
    'ok',          true,
    'duplicado',   false,
    'agendamento', public.agendamento_json(v_agendamento_id),
    'barbearia',   public.barbearia_json()
  );
end;
$$;

comment on function public.criar_agendamento(uuid, date, time, text, text, text) is
  'Unico caminho de gravacao de agendamento pelo site. Revalida servico, expediente, intervalo, passado, bloqueios e sobreposicao no servidor antes de gravar.';

-- >>>>>>>>>> 20260101000600_funcoes_admin.sql
-- =====================================================================
-- BARBEARIA ARTE 10 — 06. Funcoes do proprietario (aplicativo Android)
-- =====================================================================
-- Todas exigem um usuario autenticado que exista em public.administradores.
-- =====================================================================

-- ---------------------------------------------------------------------
-- criar_bloqueio: fecha um periodo LIVRE (item 15).
-- Nunca sobrepoe um agendamento de cliente.
-- ---------------------------------------------------------------------
create or replace function public.criar_bloqueio(
  p_data           date,
  p_horario_inicio time,
  p_horario_fim    time,
  p_motivo         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg     public.config_barbearia%rowtype;
  v_h       public.config_horarios%rowtype;
  v_ini_ts  timestamp;
  v_fim_ts  timestamp;
  v_ini     timestamptz;
  v_fim     timestamptz;
  v_range   tstzrange;
  v_motivo  text;
  v_id      uuid;
  v_falha   text;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  if p_data is null or p_horario_inicio is null or p_horario_fim is null
     or p_horario_fim <= p_horario_inicio then
    return public.resposta_erro('PERIODO_INVALIDO');
  end if;

  select * into v_cfg from public.config_barbearia where id;
  if not found then
    return public.resposta_erro('CONFIG_AUSENTE');
  end if;

  v_ini_ts := p_data + p_horario_inicio;
  v_fim_ts := p_data + p_horario_fim;
  v_ini    := v_ini_ts at time zone v_cfg.fuso;
  v_fim    := v_fim_ts at time zone v_cfg.fuso;
  v_range  := tstzrange(v_ini, v_fim, '[)');
  v_motivo := left(nullif(btrim(coalesce(p_motivo, '')), ''), 200);

  -- Bloquear o que já passou não tem efeito nenhum para o cliente.
  if v_fim <= now() then
    return public.resposta_erro('HORARIO_PASSADO');
  end if;

  -- Dia fechado já não recebe agendamentos: um bloqueio ali seria só ruído.
  select * into v_h
    from public.config_horarios
   where dia_semana = extract(dow from p_data)::smallint;

  if not found or not v_h.aberto then
    return public.resposta_erro('DIA_FECHADO');
  end if;

  -- Fora do expediente o site também não oferece nada.
  if v_ini_ts < p_data + v_h.abre or v_fim_ts > p_data + v_h.fecha then
    return public.resposta_erro('FORA_EXPEDIENTE');
  end if;

  -- Serializa com criar_agendamento: ou entra a reserva, ou entra o bloqueio.
  perform pg_advisory_xact_lock(hashtext('barbearia_arte10:agenda'));

  -- REGRA: bloquear nunca pode apagar/atropelar o agendamento de um cliente.
  if exists (select 1 from public.agendamentos a where a.periodo && v_range) then
    return public.resposta_erro('EXISTE_AGENDAMENTO');
  end if;

  begin
    insert into public.bloqueios (
      data, horario_inicio, horario_fim, inicio_em, fim_em, motivo, criado_por
    )
    values (
      p_data, p_horario_inicio, p_horario_fim, v_ini, v_fim, v_motivo, auth.uid()
    )
    returning id into v_id;
  exception
    when exclusion_violation then
      v_falha := 'JA_BLOQUEADO';
  end;

  if v_falha is not null then
    return public.resposta_erro(v_falha);
  end if;

  return jsonb_build_object(
    'ok', true,
    'bloqueio', jsonb_build_object(
      'id',             v_id,
      'data',           p_data,
      'horario_inicio', to_char(p_horario_inicio, 'HH24:MI'),
      'horario_fim',    to_char(p_horario_fim, 'HH24:MI'),
      'motivo',         v_motivo
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- remover_bloqueio: desbloqueia (item 16).
-- Opera EXCLUSIVAMENTE na tabela de bloqueios. Nao existe caminho, aqui
-- ou em qualquer outro lugar da API, que transforme um agendamento de
-- cliente em horario livre.
-- ---------------------------------------------------------------------
create or replace function public.remover_bloqueio(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_removidos integer;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  if p_id is null then
    return public.resposta_erro('BLOQUEIO_NAO_ENCONTRADO');
  end if;

  delete from public.bloqueios where id = p_id;
  get diagnostics v_removidos = row_count;

  if v_removidos = 0 then
    return public.resposta_erro('BLOQUEIO_NAO_ENCONTRADO');
  end if;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

-- ---------------------------------------------------------------------
-- agenda_do_dia: alimenta o painel e o calendario do aplicativo.
--
-- Devolve a linha do tempo do dia com os estados do item 12:
--   agendamento  (AGENDADO)
--   bloqueio     (BLOQUEADO)
--   livre        (DISPONÍVEL)
--   intervalo / fora_expediente (FORA DO EXPEDIENTE)
--
-- Regras:
--   * Agendamentos e bloqueios são buscados pela DATA, nunca pelo
--     expediente atual: se o dono encurtar o horário depois de haver
--     clientes marcados, eles continuam aparecendo (marcados com
--     "fora_expediente").
--   * Os horários livres usam a MESMA grade que o site oferece ao cliente
--     (a partir da abertura, de granularidade em granularidade), para o
--     dono e o cliente enxergarem os mesmos horários.
-- ---------------------------------------------------------------------
create or replace function public.agenda_do_dia(p_data date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg       public.config_barbearia%rowtype;
  v_h         public.config_horarios%rowtype;
  v_aberto    boolean := false;
  v_passo     interval;
  v_abre_ts   timestamp;
  v_fecha_ts  timestamp;
  v_int_ini   timestamp;
  v_int_fim   timestamp;
  v_agora     timestamptz := now();
  v_itens     jsonb;
  v_resumo    jsonb;
  v_proximo   jsonb;
  v_livres    jsonb;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  if p_data is null then
    return public.resposta_erro('PERIODO_INVALIDO');
  end if;

  select * into v_cfg from public.config_barbearia where id;
  if not found then
    return public.resposta_erro('CONFIG_AUSENTE');
  end if;

  select * into v_h
    from public.config_horarios
   where dia_semana = extract(dow from p_data)::smallint;

  v_aberto := found and v_h.aberto;
  v_passo  := make_interval(mins => v_cfg.granularidade_minutos);

  if v_aberto then
    v_abre_ts  := p_data + v_h.abre;
    v_fecha_ts := p_data + v_h.fecha;
    if v_h.intervalo_inicio is not null then
      v_int_ini := p_data + v_h.intervalo_inicio;
      v_int_fim := p_data + v_h.intervalo_fim;
    end if;
  end if;

  with ocupacoes as (
    select 'agendamento'::text                                as tipo,
           a.id,
           a.inicio_em,
           a.fim_em,
           (a.inicio_em at time zone v_cfg.fuso)::timestamp  as ini_ts,
           (a.fim_em at time zone v_cfg.fuso)::timestamp     as fim_ts,
           a.status::text                                     as status,
           a.servico_nome,
           a.servico_preco,
           a.servico_duracao,
           a.cliente_nome,
           c.telefone                                         as cliente_telefone,
           a.created_at,
           null::text                                         as motivo
      from public.agendamentos a
      join public.clientes c on c.id = a.cliente_id
     where a.data = p_data
    union all
    select 'bloqueio', b.id, b.inicio_em, b.fim_em,
           (b.inicio_em at time zone v_cfg.fuso)::timestamp,
           (b.fim_em at time zone v_cfg.fuso)::timestamp,
           null, null, null, null, null, null, b.created_at, b.motivo
      from public.bloqueios b
     where b.data = p_data
    union all
    select 'intervalo', null::uuid,
           v_int_ini at time zone v_cfg.fuso,
           v_int_fim at time zone v_cfg.fuso,
           v_int_ini, v_int_fim,
           null, null, null, null, null, null, null::timestamptz, 'Intervalo'
     where v_int_ini is not null
  ),
  grade as (
    -- Mesma grade do site: começa na abertura e anda de passo em passo.
    select t as ini_ts, t + v_passo as fim_ts
      from generate_series(v_abre_ts, v_fecha_ts - v_passo, v_passo) as t
     where v_aberto
  ),
  livres as (
    select g.ini_ts, g.fim_ts,
           g.ini_ts at time zone v_cfg.fuso as inicio_em,
           g.fim_ts at time zone v_cfg.fuso as fim_em
      from grade g
     where not exists (
       select 1 from ocupacoes o
        where o.ini_ts < g.fim_ts and o.fim_ts > g.ini_ts
     )
  ),
  itens as (
    select o.ini_ts,
           case o.tipo when 'intervalo' then 0 when 'agendamento' then 1 else 2 end as ordem,
           jsonb_build_object(
             'tipo',             o.tipo,
             'id',               o.id,
             'horario_inicio',   to_char(o.ini_ts, 'HH24:MI'),
             'horario_fim',      to_char(o.fim_ts, 'HH24:MI'),
             'inicio_em',        o.inicio_em,
             'fim_em',           o.fim_em,
             'cliente_nome',     o.cliente_nome,
             'cliente_telefone', o.cliente_telefone,
             'servico_nome',     o.servico_nome,
             'servico_preco',    o.servico_preco,
             'duracao_minutos',  o.servico_duracao,
             'status',           o.status,
             'motivo',           o.motivo,
             'criado_em',        o.created_at,
             'passado',          o.fim_em <= v_agora,
             'fora_expediente',  o.tipo <> 'intervalo' and (
                                   not v_aberto
                                   or o.ini_ts < v_abre_ts
                                   or o.fim_ts > v_fecha_ts
                                 )
           ) as item
      from ocupacoes o
    union all
    select l.ini_ts, 3,
           jsonb_build_object(
             'tipo',           'livre',
             'horario_inicio', to_char(l.ini_ts, 'HH24:MI'),
             'horario_fim',    to_char(l.fim_ts, 'HH24:MI'),
             'inicio_em',      l.inicio_em,
             'fim_em',         l.fim_em,
             'passado',        l.inicio_em < v_agora,
             'fora_expediente', false
           )
      from livres l
  )
  select
    coalesce((select jsonb_agg(i.item order by i.ini_ts, i.ordem) from itens i), '[]'::jsonb),
    jsonb_build_object(
      'agendamentos', (select count(*) from ocupacoes where tipo = 'agendamento'),
      'bloqueios',    (select count(*) from ocupacoes where tipo = 'bloqueio'),
      -- "Livres" = o que ainda dá para oferecer hoje (não conta o que passou).
      'livres',       (select count(*) from livres where inicio_em >= v_agora)
    ),
    (select jsonb_build_object(
              'cliente', o.cliente_nome,
              'servico', o.servico_nome,
              'horario', to_char(o.ini_ts, 'HH24:MI'))
       from ocupacoes o
      where o.tipo = 'agendamento'
        and o.status = 'agendado'
        and o.inicio_em >= v_agora
      order by o.inicio_em
      limit 1),
    coalesce((select jsonb_agg(to_char(x.ini_ts, 'HH24:MI') order by x.ini_ts)
                from (select ini_ts from livres
                       where inicio_em >= v_agora
                       order by ini_ts
                       limit 3) x), '[]'::jsonb)
  into v_itens, v_resumo, v_proximo, v_livres;

  return jsonb_build_object(
    'ok',     true,
    'data',   p_data,
    'aberto', v_aberto,
    'abre',   case when v_aberto then to_char(v_h.abre, 'HH24:MI') end,
    'fecha',  case when v_aberto then to_char(v_h.fecha, 'HH24:MI') end,
    'intervalo', case when v_int_ini is null then null else jsonb_build_object(
      'inicio', to_char(v_h.intervalo_inicio, 'HH24:MI'),
      'fim',    to_char(v_h.intervalo_fim, 'HH24:MI')
    ) end,
    'itens',           v_itens,
    'resumo',          v_resumo,
    'proximo',         v_proximo,
    'proximos_livres', v_livres
  );
end;
$$;

-- ---------------------------------------------------------------------
-- visao_geral_periodo: pinta o calendario do aplicativo.
-- Quem não é administrador recebe ERRO (e não uma lista vazia, que
-- pareceria "agenda sem clientes").
-- ---------------------------------------------------------------------
create or replace function public.visao_geral_periodo(p_inicio date, p_fim date)
returns table (
  data          date,
  aberto        boolean,
  agendamentos  integer,
  bloqueios     integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'NAO_AUTORIZADO' using errcode = '42501';
  end if;

  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    return;
  end if;

  if p_fim - p_inicio > 92 then
    p_fim := p_inicio + 92;
  end if;

  return query
    select g::date                                          as data,
           coalesce(h.aberto, false)                        as aberto,
           coalesce(ag.qtd, 0)::integer                     as agendamentos,
           coalesce(bl.qtd, 0)::integer                     as bloqueios
      from generate_series(p_inicio, p_fim, interval '1 day') g
      left join public.config_horarios h
        on h.dia_semana = extract(dow from g)::smallint
      left join lateral (
        select count(*) as qtd from public.agendamentos a where a.data = g::date
      ) ag on true
      left join lateral (
        select count(*) as qtd from public.bloqueios b where b.data = g::date
      ) bl on true
      order by g;
end;
$$;

-- ---------------------------------------------------------------------
-- registrar_dispositivo: guarda o token FCM do celular do proprietario.
-- ---------------------------------------------------------------------
create or replace function public.registrar_dispositivo(
  p_token   text,
  p_modelo  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  if p_token is null or char_length(btrim(p_token)) not between 10 and 4096 then
    return public.resposta_erro('DADOS_INCOMPLETOS');
  end if;

  insert into public.dispositivos_push (user_id, token, modelo, plataforma, ativo)
  values (auth.uid(), btrim(p_token), left(p_modelo, 120), 'android', true)
  on conflict (token) do update
    set user_id    = excluded.user_id,
        modelo     = coalesce(excluded.modelo, public.dispositivos_push.modelo),
        ativo      = true,
        updated_at = now()
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------
-- atualizar_status_agendamento: única alteração permitida em um
-- agendamento. Registra o desfecho do atendimento — não libera o horário.
-- Só vale depois que o horário começou (o gatilho de imutabilidade
-- também garante isso, mesmo por acesso direto).
-- ---------------------------------------------------------------------
create or replace function public.atualizar_status_agendamento(
  p_id     uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inicio timestamptz;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  if p_status is null or p_status not in ('agendado', 'concluido', 'nao_compareceu') then
    return public.resposta_erro('STATUS_INVALIDO');
  end if;

  select a.inicio_em into v_inicio from public.agendamentos a where a.id = p_id;
  if not found then
    return public.resposta_erro('AGENDAMENTO_NAO_ENCONTRADO');
  end if;

  if v_inicio > now() then
    return public.resposta_erro('ATENDIMENTO_NAO_COMECOU');
  end if;

  update public.agendamentos
     set status = p_status::public.agendamento_status
   where id = p_id;

  return jsonb_build_object('ok', true, 'agendamento', public.agendamento_json(p_id));
end;
$$;

-- >>>>>>>>>> 20260101000700_rls_e_permissoes.sql
-- =====================================================================
-- BARBEARIA ARTE 10 — 07. Row Level Security e permissoes (item 20)
-- =====================================================================
-- Principio: o site publico (role "anon") NAO enxerga nenhum dado
-- pessoal e NAO escreve em nenhuma tabela. Ele so consegue:
--   * ler servicos ativos e a configuracao da barbearia;
--   * ler a agenda publica (periodos ocupados, sem nome/telefone);
--   * chamar as funcoes de disponibilidade e criar_agendamento.
-- =====================================================================

alter table public.config_barbearia  enable row level security;
alter table public.config_horarios   enable row level security;
alter table public.administradores   enable row level security;
alter table public.clientes          enable row level security;
alter table public.servicos          enable row level security;
alter table public.agendamentos      enable row level security;
alter table public.bloqueios         enable row level security;
alter table public.agenda_publica    enable row level security;
alter table public.dispositivos_push enable row level security;
alter table public.notificacoes      enable row level security;

-- ---------------------------------------------------------------------
-- Zera privilegios herdados e concede apenas o necessario.
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Leitura publica (conteudo do site, sem dados pessoais).
grant select on public.servicos         to anon, authenticated;
grant select on public.config_barbearia to anon, authenticated;
grant select on public.config_horarios  to anon, authenticated;
grant select on public.agenda_publica   to anon, authenticated;

-- Area administrativa (o RLS ainda exige is_admin()).
grant select         on public.clientes          to authenticated;
grant select         on public.agendamentos      to authenticated;
grant select         on public.bloqueios         to authenticated;
grant select         on public.administradores   to authenticated;
grant select, delete on public.dispositivos_push to authenticated;
grant select         on public.notificacoes      to authenticated;
grant insert, update, delete on public.servicos  to authenticated;
grant insert, update on public.config_barbearia  to authenticated;
grant insert, update on public.config_horarios   to authenticated;

-- ---------------------------------------------------------------------
-- POLICIES
-- ---------------------------------------------------------------------

-- SERVICOS: todo mundo ve os ativos; o administrador ve e gerencia todos.
drop policy if exists servicos_leitura_publica on public.servicos;
create policy servicos_leitura_publica
  on public.servicos for select
  to anon, authenticated
  using (ativo);

drop policy if exists servicos_admin on public.servicos;
create policy servicos_admin
  on public.servicos for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- CONFIGURACAO: leitura livre (endereco, horarios de funcionamento).
drop policy if exists config_barbearia_leitura on public.config_barbearia;
create policy config_barbearia_leitura
  on public.config_barbearia for select
  to anon, authenticated
  using (true);

drop policy if exists config_barbearia_admin on public.config_barbearia;
create policy config_barbearia_admin
  on public.config_barbearia for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists config_horarios_leitura on public.config_horarios;
create policy config_horarios_leitura
  on public.config_horarios for select
  to anon, authenticated
  using (true);

drop policy if exists config_horarios_admin on public.config_horarios;
create policy config_horarios_admin
  on public.config_horarios for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- AGENDA PUBLICA: periodos ocupados, sem qualquer dado pessoal.
-- Serve para o Realtime do site saber que precisa recarregar (item 18).
drop policy if exists agenda_publica_leitura on public.agenda_publica;
create policy agenda_publica_leitura
  on public.agenda_publica for select
  to anon, authenticated
  using (true);
-- Sem policy de escrita: so os triggers SECURITY DEFINER gravam aqui.

-- CLIENTES: dado pessoal. Somente o administrador le. Ninguem escreve
-- pela API (o cadastro nasce dentro de criar_agendamento).
drop policy if exists clientes_admin_leitura on public.clientes;
create policy clientes_admin_leitura
  on public.clientes for select
  to authenticated
  using ((select public.is_admin()));

-- AGENDAMENTOS: somente o administrador le.
-- Nao existe policy de INSERT (so via criar_agendamento), de UPDATE (so via
-- atualizar_status_agendamento) nem de DELETE (item 14 — o agendamento do
-- cliente e permanente).
drop policy if exists agendamentos_admin_leitura on public.agendamentos;
create policy agendamentos_admin_leitura
  on public.agendamentos for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists agendamentos_admin_status on public.agendamentos;

-- BLOQUEIOS: o administrador le; criar/remover apenas pelas funcoes.
drop policy if exists bloqueios_admin_leitura on public.bloqueios;
create policy bloqueios_admin_leitura
  on public.bloqueios for select
  to authenticated
  using ((select public.is_admin()));

-- ADMINISTRADORES: cada usuario so enxerga o proprio vinculo.
drop policy if exists administradores_proprio on public.administradores;
create policy administradores_proprio
  on public.administradores for select
  to authenticated
  using (user_id = (select auth.uid()));

-- DISPOSITIVOS PUSH: cada administrador gerencia os proprios aparelhos.
drop policy if exists dispositivos_push_proprios on public.dispositivos_push;
create policy dispositivos_push_proprios
  on public.dispositivos_push for select
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()));

drop policy if exists dispositivos_push_remover on public.dispositivos_push;
create policy dispositivos_push_remover
  on public.dispositivos_push for delete
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()));

-- NOTIFICACOES: historico de envios, somente leitura administrativa.
drop policy if exists notificacoes_admin_leitura on public.notificacoes;
create policy notificacoes_admin_leitura
  on public.notificacoes for select
  to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- EXECUCAO DE FUNCOES
-- ---------------------------------------------------------------------

-- Funcoes do site publico.
grant execute on function public.horarios_disponiveis(uuid, date)            to anon, authenticated;
grant execute on function public.dias_disponiveis(uuid, date, date)          to anon, authenticated;
grant execute on function public.criar_agendamento(uuid, date, time, text, text, text)
                                                                             to anon, authenticated;
grant execute on function public.mensagem_erro(text)                         to anon, authenticated;

-- Funcoes do aplicativo do proprietario.
grant execute on function public.is_admin()                                  to authenticated;
grant execute on function public.criar_bloqueio(date, time, time, text)      to authenticated;
grant execute on function public.remover_bloqueio(uuid)                      to authenticated;
grant execute on function public.agenda_do_dia(date)                         to authenticated;
grant execute on function public.visao_geral_periodo(date, date)             to authenticated;
grant execute on function public.registrar_dispositivo(text, text)           to authenticated;
grant execute on function public.atualizar_status_agendamento(uuid, text)    to authenticated;

-- Funcoes de gatilho usadas por tabelas que o administrador altera.
grant execute on function public.tg_set_updated_at()                         to authenticated;
grant execute on function public.tg_servico_em_uso()                         to authenticated;
grant execute on function public.tg_agendamento_imutavel()                   to authenticated;
grant execute on function public.tg_sincronizar_agenda_publica()             to authenticated;

-- Novos objetos criados depois desta migracao nao nascem liberados.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- >>>>>>>>>> 20260101000800_notificacoes_e_realtime.sql
-- =====================================================================
-- BARBEARIA ARTE 10 — 08. Notificacoes push e Realtime
-- =====================================================================
-- Fluxo de um push:
--   1. criar_agendamento insere uma linha em notificacoes ('pendente').
--   2. O gatilho abaixo chama a Edge Function pelo pg_net.
--   3. A Edge Function RESERVA a notificação (reservar_notificacao), envia
--      ao FCM e FINALIZA (finalizar_notificacao): enviada / pendente / falhou.
--   4. O job do pg_cron (reenviar_notificacoes_pendentes, a cada 2 min)
--      tenta de novo o que ficou pendente, sem nunca duplicar: a reserva é
--      atômica e uma notificação em envio não é pega por outra chamada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Segredos do backend.
-- Schema isolado, sem grants e sem policies: nem "anon" nem
-- "authenticated" conseguem ler. Somente funcoes SECURITY DEFINER
-- (que rodam como dono do banco) enxergam estes valores (item 20).
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.segredos (
  chave      text primary key,
  valor      text not null,
  updated_at timestamptz not null default now()
);

alter table private.segredos enable row level security;
revoke all on private.segredos from public, anon, authenticated;

comment on table private.segredos is
  'Preencher com supabase/ativar_push.sql: edge_notificacoes_url e edge_notificacoes_token.';

-- Máximo de vezes que a Edge Function assume uma notificação.
create or replace function public.push_max_tentativas()
returns integer language sql immutable as $$ select 6 $$;

-- ---------------------------------------------------------------------
-- Chamada da Edge Function (usada pelo gatilho e pelo reenvio).
-- Devolve o id do pedido no pg_net, ou null se não deu para chamar.
-- ---------------------------------------------------------------------
create or replace function public.chamar_edge_push(p_notificacao_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_url   text;
  v_token text;
  v_req   bigint;
begin
  -- A extensao pg_net pode nao estar habilitada ainda.
  if to_regnamespace('net') is null then
    update public.notificacoes set erro = 'pg_net não habilitado' where id = p_notificacao_id;
    return null;
  end if;

  select valor into v_url   from private.segredos where chave = 'edge_notificacoes_url';
  select valor into v_token from private.segredos where chave = 'edge_notificacoes_token';

  if coalesce(btrim(v_url), '') = '' or coalesce(btrim(v_token), '') = '' then
    update public.notificacoes
       set erro = 'Push não configurado: rode supabase/ativar_push.sql'
     where id = p_notificacao_id;
    return null;
  end if;

  begin
    select net.http_post(
      url     := v_url,
      body    := jsonb_build_object('notificacao_id', p_notificacao_id),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      timeout_milliseconds := 8000
    ) into v_req;
  exception when others then
    update public.notificacoes
       set erro = left('Falha ao chamar a Edge Function: ' || coalesce(sqlerrm, '?'), 500)
     where id = p_notificacao_id;
    return null;
  end;

  update public.notificacoes
     set request_id = v_req,
         disparos   = disparos + 1
   where id = p_notificacao_id;

  return v_req;
end;
$$;

-- ---------------------------------------------------------------------
-- Gatilho: dispara o push assim que a notificação nasce.
-- Qualquer falha aqui é registrada, mas NUNCA derruba o agendamento
-- do cliente (item 33, caso 21).
-- ---------------------------------------------------------------------
create or replace function public.tg_disparar_push()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.status = 'pendente' then
    begin
      perform public.chamar_edge_push(new.id);
    exception when others then
      null; -- o reenvio periódico cuida disso
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificacoes_push on public.notificacoes;
create trigger trg_notificacoes_push
  after insert on public.notificacoes
  for each row execute function public.tg_disparar_push();

-- ---------------------------------------------------------------------
-- Reenvio periódico (pg_cron, a cada 2 minutos).
--   * Só pega o que tem mais de 1 minuto (a primeira chamada ainda pode
--     estar em andamento) ou envios travados há mais de 5 minutos.
--   * Registra o código HTTP da última chamada, para diagnóstico.
--   * Desiste depois de muitos disparos sem resposta da Edge Function.
-- ---------------------------------------------------------------------
create or replace function public.reenviar_notificacoes_pendentes(p_limite integer default 20)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_n      record;
  v_qtd    integer := 0;
  v_status integer;
  v_msg    text;
begin
  for v_n in
    select n.id, n.request_id, n.disparos
      from public.notificacoes n
     where n.created_at > now() - interval '1 day'
       and n.tentativas < public.push_max_tentativas()
       and (
         (n.status = 'pendente' and n.created_at < now() - interval '1 minute')
         or (n.status = 'enviando' and n.reservada_em < now() - interval '5 minutes')
       )
     order by n.created_at
     limit greatest(1, least(coalesce(p_limite, 20), 100))
  loop
    -- Diagnóstico: o que a última chamada respondeu? (tabela interna do pg_net)
    if v_n.request_id is not null and to_regclass('net._http_response') is not null then
      begin
        execute 'select status_code, coalesce(error_msg, left(content, 200))
                   from net._http_response where id = $1'
          into v_status, v_msg
          using v_n.request_id;
        if v_status is not null and (v_status < 200 or v_status >= 300) then
          update public.notificacoes
             set erro = left(format('Edge Function respondeu HTTP %s: %s', v_status, coalesce(v_msg, '')), 500)
           where id = v_n.id;
        elsif v_status is null and v_msg is not null then
          update public.notificacoes
             set erro = left('Chamada à Edge Function falhou: ' || v_msg, 500)
           where id = v_n.id;
        end if;
      exception when others then
        null;
      end;
    end if;

    if v_n.disparos >= 30 then
      update public.notificacoes
         set status = 'falhou',
             erro   = coalesce(erro, 'A Edge Function não respondeu. Confira a URL, o token e o deploy.')
       where id = v_n.id;
    else
      if public.chamar_edge_push(v_n.id) is not null then
        v_qtd := v_qtd + 1;
      end if;
    end if;
  end loop;

  return v_qtd;
end;
$$;

-- ---------------------------------------------------------------------
-- Funções usadas SOMENTE pela Edge Function (papel service_role).
-- ---------------------------------------------------------------------

-- Reserva atômica: devolve a notificação só para UMA chamada por vez.
create or replace function public.reservar_notificacao(p_id uuid)
returns table (id uuid, agendamento_id uuid, titulo text, corpo text, dados jsonb, tentativas integer)
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notificacoes n
     set status       = 'enviando',
         tentativas   = n.tentativas + 1,
         reservada_em = now()
   where n.id = p_id
     and n.tentativas < public.push_max_tentativas()
     and (
       n.status = 'pendente'
       or (n.status = 'enviando' and n.reservada_em < now() - interval '5 minutes')
     )
  returning n.id, n.agendamento_id, n.titulo, n.corpo, n.dados, n.tentativas;
$$;

-- Fecha o envio: 'enviada', 'pendente' (erro passageiro) ou 'falhou'.
create or replace function public.finalizar_notificacao(p_id uuid, p_status text, p_erro text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('enviada', 'pendente', 'falhou') then
    raise exception 'status invalido: %', p_status;
  end if;

  update public.notificacoes n
     set status     = case
                        when p_status = 'pendente' and n.tentativas >= public.push_max_tentativas() then 'falhou'
                        else p_status
                      end,
         erro       = left(p_erro, 500),
         enviada_em = case when p_status = 'enviada' then now() else n.enviada_em end
   where n.id = p_id
     and n.status = 'enviando';
end;
$$;

-- Destinos: só aparelhos ativos de administradores ATIVOS.
create or replace function public.destinos_push()
returns table (id uuid, token text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.token
    from public.dispositivos_push d
    join public.administradores a on a.user_id = d.user_id and a.ativo
   where d.ativo;
$$;

-- Tokens que o FCM declarou mortos (app desinstalado, token trocado).
create or replace function public.desativar_dispositivos(p_ids uuid[])
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.dispositivos_push set ativo = false where id = any(p_ids);
$$;

-- ---------------------------------------------------------------------
-- Administrador desativado ou removido: os aparelhos dele deixam de
-- receber push na hora (ex.: celular perdido).
-- ---------------------------------------------------------------------
create or replace function public.tg_admin_desativado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    update public.dispositivos_push set ativo = false where user_id = old.user_id;
    return old;
  end if;

  if not new.ativo then
    update public.dispositivos_push set ativo = false where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_desativado on public.administradores;
create trigger trg_admin_desativado
  after update of ativo or delete on public.administradores
  for each row execute function public.tg_admin_desativado();

revoke all on function public.chamar_edge_push(uuid)                     from public, anon, authenticated;
revoke all on function public.reenviar_notificacoes_pendentes(integer)  from public, anon, authenticated;
revoke all on function public.reservar_notificacao(uuid)                 from public, anon, authenticated;
revoke all on function public.finalizar_notificacao(uuid, text, text)    from public, anon, authenticated;
revoke all on function public.destinos_push()                            from public, anon, authenticated;
revoke all on function public.desativar_dispositivos(uuid[])             from public, anon, authenticated;

grant execute on function public.reservar_notificacao(uuid)              to service_role;
grant execute on function public.finalizar_notificacao(uuid, text, text) to service_role;
grant execute on function public.destinos_push()                         to service_role;
grant execute on function public.desativar_dispositivos(uuid[])          to service_role;
grant execute on function public.push_max_tentativas()                   to service_role;

-- ---------------------------------------------------------------------
-- Agenda o reenvio se o pg_cron já estiver habilitado. (O arquivo
-- supabase/ativar_push.sql faz o mesmo, para quem habilitar depois.)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'arte10-reenviar-notificacoes',
      '*/2 * * * *',
      'select public.reenviar_notificacoes_pendentes(20)'
    );
  end if;
exception when others then
  raise notice 'Nao foi possivel agendar o reenvio de push: %', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------
-- REALTIME (item 18)
-- ---------------------------------------------------------------------
-- agenda_publica  -> assinada pelo SITE (anon), sem dados pessoais.
-- agendamentos /
-- bloqueios       -> assinadas pelo APLICATIVO (administrador logado).
--
-- REPLICA IDENTITY FULL garante que o evento de DELETE carregue a linha
-- antiga: e assim que o site descobre que um bloqueio foi removido.
-- ---------------------------------------------------------------------
alter table public.agenda_publica replica identity full;
alter table public.bloqueios      replica identity full;

do $$
declare
  v_tabela text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return; -- Fora do Supabase (ex.: banco local de teste).
  end if;

  foreach v_tabela in array array['agenda_publica', 'agendamentos', 'bloqueios', 'servicos', 'config_horarios']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = v_tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabela);
    end if;
  end loop;
end
$$;

-- >>>>>>>>>> 20260101000900_visoes_do_aplicativo.sql
-- =====================================================================
-- BARBEARIA ARTE 10 — 09. Visões usadas pelo aplicativo do proprietário
-- =====================================================================

-- ---------------------------------------------------------------------
-- clientes_resumo: lista de clientes com histórico consolidado.
-- security_invoker = true faz a view respeitar o RLS de quem chama,
-- então ela só devolve dados para um administrador autenticado.
--
--   ultima_visita   = último atendimento que já aconteceu (sem faltas)
--   proximo_horario = próxima reserva ainda em aberto
-- ---------------------------------------------------------------------
drop view if exists public.clientes_resumo;

create view public.clientes_resumo
with (security_invoker = true) as
select
  c.id,
  c.nome,
  c.telefone,
  c.created_at,
  count(a.id)::integer                                                    as total_agendamentos,
  count(a.id) filter (where a.status = 'nao_compareceu')::integer         as faltas,
  max(a.inicio_em) filter (where a.inicio_em <= now()
                             and a.status <> 'nao_compareceu')            as ultima_visita,
  min(a.inicio_em) filter (where a.inicio_em > now()
                             and a.status = 'agendado')                   as proximo_horario
from public.clientes c
left join public.agendamentos a on a.cliente_id = c.id
group by c.id, c.nome, c.telefone, c.created_at;

revoke all on public.clientes_resumo from public, anon, authenticated;
grant select on public.clientes_resumo to authenticated;

comment on view public.clientes_resumo is
  'Clientes com total de visitas, faltas, última visita e próximo horário. Respeita o RLS de clientes/agendamentos.';

-- >>>>>>>>>> seed.sql
-- =====================================================================
-- BARBEARIA ARTE 10 — Dados iniciais
-- =====================================================================
-- Rode UMA vez depois das migracoes (SQL Editor do Supabase ou
-- `supabase db reset`). Pode rodar de novo sem duplicar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DADOS DA BARBEARIA
-- (depois, edite pela tela Ajustes do aplicativo)
-- ---------------------------------------------------------------------
insert into public.config_barbearia (
  id, nome, fuso,
  telefone_whatsapp,   -- somente digitos, com DDD
  instagram,           -- sem o @
  endereco,
  cidade, uf,
  mapa_url,
  granularidade_minutos, antecedencia_minima_minutos,
  antecedencia_maxima_dias, max_agendamentos_futuros
)
values (
  true, 'Barbearia Arte 10', 'America/Sao_Paulo',
  '17997313480',
  'aquiles.hiroshi',
  'Rua Joaquim Iglesias, 889',
  'Santa Albertina', 'SP',
  null,                -- vazio = o site monta o link do Google Maps pelo endereco
  15, 30, 60, 3
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- HORARIO DE FUNCIONAMENTO
-- dia_semana: 0 = domingo, 1 = segunda ... 6 = sabado
-- ---------------------------------------------------------------------
insert into public.config_horarios (dia_semana, aberto, abre, fecha, intervalo_inicio, intervalo_fim)
values
  (0, true,  '09:00',  '23:00',  null,     null),      -- domingo
  (1, true,  '08:00',  '12:30',  null,     null),      -- segunda
  (2, true,  '08:00',  '12:30',  null,     null),      -- terca
  (3, true,  '08:00',  '12:30',  null,     null),      -- quarta
  (4, true,  '08:00',  '12:30',  null,     null),      -- quinta
  (5, true,  '08:00',  '12:30',  null,     null),      -- sexta
  (6, true,  '09:00',  '23:00',  null,     null)       -- sabado
on conflict (dia_semana) do nothing;

-- ---------------------------------------------------------------------
-- SERVICOS
-- ---------------------------------------------------------------------
insert into public.servicos (nome, descricao, preco, duracao_minutos, ativo, ordem)
values
  ('Corte de cabelo', 'Corte personalizado com acabamento completo.',         35.00, 35, true, 1),
  ('Barba completa',  'Modelagem e acabamento para deixar a barba alinhada.', 30.00, 30, true, 2),
  ('Pezinho',         'Acabamento limpo e preciso para completar o visual.',  15.00, 20, true, 3),
  ('Só raspar',       'Apenas raspagem.',                                     10.00, 20, true, 4),
  ('Sobrancelha',     'Acabamento simples para deixar o olhar alinhado.',      5.00, 10, true, 5)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- ADMINISTRADOR (proprietario)
-- ---------------------------------------------------------------------
-- 1. Crie o usuario em Authentication > Users no painel do Supabase
--    (e-mail + senha). NAO habilite cadastro publico.
-- 2. Rode o comando abaixo trocando o e-mail:
--
--    insert into public.administradores (user_id, nome)
--    select id, 'Proprietário'
--      from auth.users
--     where email = 'proprietario@barbeariaarte10.com.br'
--    on conflict (user_id) do update set ativo = true;
--
-- ---------------------------------------------------------------------
-- NOTIFICACOES PUSH (preencha depois de publicar a Edge Function)
-- ---------------------------------------------------------------------
--    insert into private.segredos (chave, valor) values
--      ('edge_notificacoes_url',   'https://SEU-PROJETO.supabase.co/functions/v1/notificar-agendamento'),
--      ('edge_notificacoes_token', 'UM_SEGREDO_LONGO_E_ALEATORIO')  -- o mesmo valor de EDGE_TOKEN
--    on conflict (chave) do update set valor = excluded.valor, updated_at = now();

select 'Barbearia Arte 10: banco instalado com sucesso.' as resultado;
