-- =====================================================================
-- BARBEARIA ARTE 10 — 08. Notificacoes push e Realtime
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
  'Preencher pelo SQL Editor do Supabase: edge_notificacoes_url e edge_notificacoes_token.';

-- ---------------------------------------------------------------------
-- Dispara a Edge Function que entrega o push via FCM.
-- Qualquer falha aqui e registrada, mas NUNCA derruba o agendamento
-- do cliente (item 33, caso 21).
-- ---------------------------------------------------------------------
create or replace function public.tg_disparar_push()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_url   text;
  v_token text;
begin
  if new.status <> 'pendente' then
    return new;
  end if;

  -- A extensao pg_net pode nao estar habilitada ainda.
  if to_regnamespace('net') is null then
    return new;
  end if;

  select valor into v_url   from private.segredos where chave = 'edge_notificacoes_url';
  select valor into v_token from private.segredos where chave = 'edge_notificacoes_token';

  if v_url is null or btrim(v_url) = '' then
    return new;
  end if;

  begin
    perform net.http_post(
      url     := v_url,
      body    := jsonb_build_object('notificacao_id', new.id),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || coalesce(v_token, '')
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    -- O push falhou; o agendamento continua valido e a notificacao
    -- permanece "pendente" para ser reenviada.
    update public.notificacoes
       set erro = left(coalesce(sqlerrm, 'falha ao chamar edge function'), 500)
     where id = new.id;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notificacoes_push on public.notificacoes;
create trigger trg_notificacoes_push
  after insert on public.notificacoes
  for each row execute function public.tg_disparar_push();

-- ---------------------------------------------------------------------
-- Reenvio: pode ser chamada por pg_cron (ex.: a cada 2 minutos) para
-- tentar de novo as notificacoes que nao sairam.
-- ---------------------------------------------------------------------
create or replace function public.reenviar_notificacoes_pendentes(p_limite integer default 20)
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_url   text;
  v_token text;
  v_n     record;
  v_qtd   integer := 0;
begin
  if to_regnamespace('net') is null then
    return 0;
  end if;

  select valor into v_url   from private.segredos where chave = 'edge_notificacoes_url';
  select valor into v_token from private.segredos where chave = 'edge_notificacoes_token';

  if v_url is null or btrim(v_url) = '' then
    return 0;
  end if;

  for v_n in
    select id from public.notificacoes
     where status = 'pendente'
       and tentativas < 5
       and created_at > now() - interval '2 days'
     order by created_at
     limit greatest(1, least(p_limite, 100))
  loop
    begin
      perform net.http_post(
        url     := v_url,
        body    := jsonb_build_object('notificacao_id', v_n.id),
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || coalesce(v_token, '')
        ),
        timeout_milliseconds := 5000
      );
      v_qtd := v_qtd + 1;
    exception when others then
      null;
    end;
  end loop;

  return v_qtd;
end;
$$;

revoke all on function public.reenviar_notificacoes_pendentes(integer) from public, anon, authenticated;

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
