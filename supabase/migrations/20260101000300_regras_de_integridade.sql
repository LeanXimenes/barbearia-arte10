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

  -- Cancelamento (só pelo dono, via cancelar_agendamento): acontece uma
  -- vez, antes do horário, e não se desfaz.
  if new.cancelado_em is distinct from old.cancelado_em then
    if old.cancelado_em is not null or new.cancelado_em is null then
      raise exception 'AGENDAMENTO_JA_CANCELADO'
        using detail  = 'Um cancelamento nao pode ser desfeito nem alterado.',
              errcode = 'check_violation';
    end if;
    if old.inicio_em <= now() or old.status <> 'agendado' then
      raise exception 'CANCELAMENTO_TARDE'
        using detail  = 'So da para cancelar antes do horario marcado.',
              errcode = 'check_violation';
    end if;
  elsif new.cancelado_motivo is distinct from old.cancelado_motivo then
    raise exception 'AGENDAMENTO_IMUTAVEL'
      using detail  = 'O motivo so e gravado junto com o cancelamento.',
            errcode = 'check_violation';
  end if;

  if old.cancelado_em is not null and new.status is distinct from old.status then
    raise exception 'AGENDAMENTO_JA_CANCELADO'
      using detail  = 'Agendamento cancelado nao recebe desfecho.',
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

  -- Agendamento cancelado libera o horário no site.
  if tg_op = 'UPDATE' and v_origem = 'agendamento' then
    if new.cancelado_em is not null then
      delete from public.agenda_publica where id = new.id;
      return new;
    end if;
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
