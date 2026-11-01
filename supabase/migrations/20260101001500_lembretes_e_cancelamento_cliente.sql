-- =====================================================================
-- BARBEARIA ARTE 10 — 15. Próximos horários, cancelamento pelo cliente
--                         e lembretes 30 minutos antes
-- =====================================================================
--   * proximos_agendamentos(): hoje e os próximos dias, para a tela
--     inicial do dono (app Android e painel), com o telefone do cliente.
--   * cancelar_meu_agendamento(): o próprio cliente cancela pelo site,
--     só até 40 minutos antes. Depois disso, só falando com a barbearia.
--     O dono recebe um aviso do cancelamento.
--   * Lembrete 30 minutos antes: para o dono (app e painel) e para o
--     cliente que ativou os avisos no site. Roda a cada minuto (pg_cron)
--     e nunca manda o mesmo lembrete duas vezes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DONO: próximos horários (hoje + próximos dias), já com o telefone.
-- ---------------------------------------------------------------------
create or replace function public.proximos_agendamentos(p_dias integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_fuso  text;
  v_hoje  date;
  v_dias  integer := greatest(1, least(coalesce(p_dias, 7), 60));
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  select fuso into v_fuso from public.config_barbearia where id;
  v_hoje := (now() at time zone coalesce(v_fuso, 'America/Sao_Paulo'))::date;

  return jsonb_build_object(
    'ok',    true,
    'hoje',  v_hoje,
    'agendamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',               a.id,
               'data',             a.data,
               'horario_inicio',   to_char(a.horario_inicio, 'HH24:MI'),
               'horario_fim',      to_char(a.horario_fim, 'HH24:MI'),
               'inicio_em',        a.inicio_em,
               'fim_em',           a.fim_em,
               'cliente_nome',     a.cliente_nome,
               'cliente_telefone', c.telefone,
               'servico_nome',     a.servico_nome,
               'servico_preco',    a.servico_preco,
               'duracao_minutos',  a.servico_duracao,
               'status',           a.status,
               'em_andamento',     a.inicio_em <= now()
             ) order by a.inicio_em)
        from public.agendamentos a
        join public.clientes c on c.id = a.cliente_id
       where a.cancelado_em is null
         and a.fim_em > now()
         and a.data <= v_hoje + v_dias
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- CLIENTE: aparelhos que recebem os avisos (Web Push), por conta.
-- ---------------------------------------------------------------------
create table if not exists public.aparelhos_conta (
  id         uuid        primary key default gen_random_uuid(),
  conta_id   uuid        not null references public.contas (id) on delete cascade,
  endpoint   text        not null,
  p256dh     text        not null,
  auth       text        not null,
  ativo      boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint aparelhos_conta_endpoint_valido check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
  constraint aparelhos_conta_chaves_validas check (
    p256dh ~ '^[A-Za-z0-9_-]{80,100}$' and auth ~ '^[A-Za-z0-9_-]{16,32}$'
  )
);

create unique index if not exists aparelhos_conta_endpoint_key on public.aparelhos_conta (endpoint);
create index if not exists aparelhos_conta_conta_idx on public.aparelhos_conta (conta_id) where ativo;

drop trigger if exists trg_aparelhos_conta_updated_at on public.aparelhos_conta;
create trigger trg_aparelhos_conta_updated_at
  before update on public.aparelhos_conta
  for each row execute function public.tg_set_updated_at();

alter table public.aparelhos_conta enable row level security;
revoke all on public.aparelhos_conta from public, anon, authenticated;

create or replace function public.registrar_aparelho_conta(
  p_token    text,
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conta uuid;
begin
  v_conta := public.conta_da_sessao(p_token);
  if v_conta is null then
    return public.resposta_erro('SESSAO_EXPIRADA');
  end if;

  if p_endpoint is null or p_endpoint !~ '^https://[^[:space:]]+$' or char_length(p_endpoint) > 2048
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}$'
     or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,32}$' then
    return public.resposta_erro('DADOS_INCOMPLETOS');
  end if;

  -- O mesmo aparelho passa para a conta que entrou nele por último.
  insert into public.aparelhos_conta (conta_id, endpoint, p256dh, auth)
  values (v_conta, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set conta_id = excluded.conta_id,
        p256dh   = excluded.p256dh,
        auth     = excluded.auth,
        ativo    = true;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.remover_aparelho_conta(p_token text, p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conta uuid;
begin
  v_conta := public.conta_da_sessao(p_token);
  if v_conta is null then
    return public.resposta_erro('SESSAO_EXPIRADA');
  end if;
  delete from public.aparelhos_conta where endpoint = p_endpoint and conta_id = v_conta;
  return jsonb_build_object('ok', true);
end;
$$;

-- Edge Function: aparelhos de uma conta e limpeza dos que morreram.
create or replace function public.destinos_web_conta(p_conta_id uuid)
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.endpoint, a.p256dh, a.auth
    from public.aparelhos_conta a
   where a.conta_id = p_conta_id and a.ativo;
$$;

create or replace function public.desativar_aparelhos_conta(p_ids uuid[])
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.aparelhos_conta set ativo = false where id = any(p_ids);
$$;

-- ---------------------------------------------------------------------
-- CLIENTE: cancelar o próprio horário (até 40 minutos antes).
-- ---------------------------------------------------------------------
create or replace function public.cancelar_meu_agendamento(p_token text, p_agendamento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conta uuid;
  v_a     public.agendamentos%rowtype;
begin
  v_conta := public.conta_da_sessao(p_token);
  if v_conta is null then
    return public.resposta_erro('SESSAO_EXPIRADA');
  end if;

  select * into v_a
    from public.agendamentos
   where id = p_agendamento_id and conta_id = v_conta
   for update;
  if not found then
    return public.resposta_erro('AGENDAMENTO_NAO_ENCONTRADO');
  end if;
  if v_a.cancelado_em is not null then
    return public.resposta_erro('AGENDAMENTO_JA_CANCELADO');
  end if;
  if v_a.status <> 'agendado' or v_a.inicio_em - now() < interval '40 minutes' then
    return public.resposta_erro('CANCELAMENTO_CLIENTE_TARDE');
  end if;

  update public.agendamentos
     set cancelado_em     = now(),
         cancelado_motivo = 'Cancelado pelo cliente no site'
   where id = v_a.id;

  -- O dono fica sabendo na hora (app Android e painel).
  insert into public.notificacoes (agendamento_id, tipo, titulo, corpo, dados)
  values (
    v_a.id,
    'cancelamento_cliente',
    'Horário cancelado pelo cliente',
    v_a.cliente_nome || ' cancelou ' || v_a.servico_nome || ' — ' ||
      to_char(v_a.data, 'DD/MM') || ' às ' || to_char(v_a.horario_inicio, 'HH24:MI'),
    jsonb_build_object(
      'agendamento_id', v_a.id,
      'data',           v_a.data,
      'horario',        to_char(v_a.horario_inicio, 'HH24:MI'),
      'servico',        v_a.servico_nome,
      'cliente',        v_a.cliente_nome
    )
  );

  return jsonb_build_object('ok', true, 'agendamento', public.agendamento_json(v_a.id));
end;
$$;

-- ---------------------------------------------------------------------
-- LEMBRETES 30 minutos antes (dono e cliente), uma vez só cada um.
-- ---------------------------------------------------------------------
create table if not exists public.lembretes_enviados (
  agendamento_id uuid        not null references public.agendamentos (id) on delete cascade,
  destino        text        not null,
  enviado_em     timestamptz not null default now(),

  primary key (agendamento_id, destino),
  constraint lembretes_destino_valido check (destino in ('dono', 'cliente'))
);

alter table public.lembretes_enviados enable row level security;
revoke all on public.lembretes_enviados from public, anon, authenticated;

create or replace function public.enviar_lembretes()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        record;
  v_hora   text;
  v_total  integer := 0;
begin
  for r in
    select a.id, a.data, a.horario_inicio, a.cliente_nome, a.servico_nome, a.conta_id
      from public.agendamentos a
     where a.cancelado_em is null
       and a.status = 'agendado'
       and a.inicio_em > now()
       and a.inicio_em <= now() + interval '30 minutes'
     order by a.inicio_em
  loop
    v_hora := to_char(r.horario_inicio, 'HH24:MI');

    -- Para o dono (app Android e painel do iPhone).
    insert into public.lembretes_enviados (agendamento_id, destino)
    values (r.id, 'dono')
    on conflict do nothing;
    if found then
      insert into public.notificacoes (agendamento_id, tipo, titulo, corpo, dados)
      values (
        r.id,
        'lembrete',
        'Daqui a 30 minutos',
        r.cliente_nome || ' — ' || r.servico_nome || ' às ' || v_hora,
        jsonb_build_object('agendamento_id', r.id, 'data', r.data, 'horario', v_hora,
                           'servico', r.servico_nome, 'cliente', r.cliente_nome)
      );
      v_total := v_total + 1;
    end if;

    -- Para o cliente que ativou os avisos no site.
    if r.conta_id is not null
       and exists (select 1 from public.aparelhos_conta ap where ap.conta_id = r.conta_id and ap.ativo) then
      insert into public.lembretes_enviados (agendamento_id, destino)
      values (r.id, 'cliente')
      on conflict do nothing;
      if found then
        insert into public.notificacoes (agendamento_id, tipo, titulo, corpo, dados)
        values (
          r.id,
          'lembrete_cliente',
          'Seu horário é daqui a 30 minutos',
          r.servico_nome || ' às ' || v_hora || ' na Barbearia Arte 10. Até já!',
          jsonb_build_object('destino', 'cliente', 'conta_id', r.conta_id,
                             'agendamento_id', r.id, 'data', r.data, 'horario', v_hora)
        );
        v_total := v_total + 1;
      end if;
    end if;
  end loop;

  return v_total;
end;
$$;

-- Roda a cada minuto quando o pg_cron estiver ligado (o ativar_push.sql
-- também agenda, para quem ligar depois).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('arte10-lembretes', '* * * * *', 'select public.enviar_lembretes()');
  end if;
exception when others then
  raise notice 'Nao foi possivel agendar os lembretes: %', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------
-- PERMISSÕES
-- ---------------------------------------------------------------------
revoke all on function public.proximos_agendamentos(integer)                     from public, anon;
revoke all on function public.registrar_aparelho_conta(text, text, text, text)  from public;
revoke all on function public.remover_aparelho_conta(text, text)                from public;
revoke all on function public.cancelar_meu_agendamento(text, uuid)              from public;
revoke all on function public.destinos_web_conta(uuid)                          from public, anon, authenticated;
revoke all on function public.desativar_aparelhos_conta(uuid[])                 from public, anon, authenticated;
revoke all on function public.enviar_lembretes()                                from public, anon, authenticated;

grant execute on function public.proximos_agendamentos(integer)                    to authenticated;
grant execute on function public.registrar_aparelho_conta(text, text, text, text) to anon, authenticated;
grant execute on function public.remover_aparelho_conta(text, text)               to anon, authenticated;
grant execute on function public.cancelar_meu_agendamento(text, uuid)             to anon, authenticated;
grant execute on function public.destinos_web_conta(uuid)                         to service_role;
grant execute on function public.desativar_aparelhos_conta(uuid[])                to service_role;
grant execute on function public.enviar_lembretes()                               to service_role;
