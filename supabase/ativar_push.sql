-- =====================================================================
-- BARBEARIA ARTE 10 — ATIVAR AS NOTIFICAÇÕES PUSH
-- =====================================================================
-- Rode DEPOIS de:
--   1) habilitar as extensões pg_net e pg_cron (Database > Extensions);
--   2) publicar a Edge Function "notificar-agendamento".
--
-- Troque as DUAS linhas marcadas abaixo e rode no SQL Editor.
-- Pode rodar de novo quando quiser trocar a URL ou o token.
-- =====================================================================

do $$
declare
  -- >>> TROQUE AQUI <<< ------------------------------------------------
  v_url   text := 'https://SEU-PROJETO.supabase.co/functions/v1/notificar-agendamento';
  v_token text := 'COLE-AQUI-O-MESMO-EDGE_TOKEN-DA-FUNCAO';
  -- --------------------------------------------------------------------
begin
  if v_url like '%SEU-PROJETO%' or v_token like 'COLE-AQUI%' then
    raise exception 'Edite a URL e o token no começo deste arquivo antes de rodar.';
  end if;
  if char_length(v_token) < 24 then
    raise exception 'Use um EDGE_TOKEN longo (24 caracteres ou mais).';
  end if;
  if to_regnamespace('net') is null then
    raise exception 'Habilite a extensão pg_net em Database > Extensions e rode de novo.';
  end if;

  insert into private.segredos (chave, valor) values
    ('edge_notificacoes_url',   v_url),
    ('edge_notificacoes_token', v_token)
  on conflict (chave) do update set valor = excluded.valor, updated_at = now();

  -- Reenvio automático do que falhar (a cada 2 minutos).
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'arte10-reenviar-notificacoes',
      '*/2 * * * *',
      'select public.reenviar_notificacoes_pendentes(20)'
    );
  else
    raise exception 'Habilite a extensão pg_cron em Database > Extensions e rode de novo.';
  end if;

  raise notice 'Push ativado. Faça um agendamento de teste pelo site.';
end
$$;

-- Conferência: as últimas notificações e o que aconteceu com cada uma.
select created_at, status, tentativas, disparos, erro
  from public.notificacoes
 order by created_at desc
 limit 10;
