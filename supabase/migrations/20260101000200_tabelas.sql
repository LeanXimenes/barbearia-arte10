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

-- Serviço que consome um corte do plano do cliente (ex.: "Corte de cabelo").
alter table public.servicos add column if not exists usa_plano boolean not null default false;

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

-- Cancelamento pelo dono (pelo app). O agendamento continua no histórico,
-- mas deixa de ocupar o horário.
alter table public.agendamentos add column if not exists cancelado_em     timestamptz;
alter table public.agendamentos add column if not exists cancelado_motivo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agendamentos_cancel_motivo_tam') then
    alter table public.agendamentos
      add constraint agendamentos_cancel_motivo_tam
      check (cancelado_motivo is null or char_length(cancelado_motivo) <= 300);
  end if;

  -- Bancos instalados antes do cancelamento: a trava passa a ignorar
  -- os cancelados (o horário cancelado volta a ficar livre).
  if exists (
    select 1 from pg_constraint
     where conname = 'agendamentos_sem_sobreposicao'
       and pg_get_constraintdef(oid) not like '%cancelado_em%'
  ) then
    alter table public.agendamentos drop constraint agendamentos_sem_sobreposicao;
    alter table public.agendamentos
      add constraint agendamentos_sem_sobreposicao
      exclude using gist (periodo with &&) where (cancelado_em is null);
  end if;
end
$$;

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
