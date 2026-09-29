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
