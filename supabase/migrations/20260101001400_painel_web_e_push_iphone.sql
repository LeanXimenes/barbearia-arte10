-- =====================================================================
-- BARBEARIA ARTE 10 — 14. Painel do dono no iPhone (avisos por Web Push)
-- =====================================================================
-- O app do dono é Android. Para o iPhone existe o painel web (/admin),
-- instalado na Tela de Início, que faz tudo o que o app faz usando as
-- MESMAS funções e permissões (conta de administrador + RLS).
--
-- Os avisos de novo agendamento chegam no iPhone por Web Push (iOS 16.4+).
-- O aparelho fica em dispositivos_push com plataforma 'web':
--   * token      = endereço de entrega (endpoint) do serviço de push;
--   * web_p256dh = chave pública do aparelho;
--   * web_auth   = segredo do aparelho.
-- destinos_push() (Firebase/Android) não devolve esses aparelhos.
-- =====================================================================

alter table public.dispositivos_push add column if not exists web_p256dh text;
alter table public.dispositivos_push add column if not exists web_auth   text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dispositivos_push_web_chaves') then
    alter table public.dispositivos_push
      add constraint dispositivos_push_web_chaves check (
        plataforma <> 'web'
        or (web_p256dh ~ '^[A-Za-z0-9_-]{80,100}$' and web_auth ~ '^[A-Za-z0-9_-]{16,32}$')
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- PAINEL: guarda o aparelho (iPhone/navegador) que vai receber os avisos.
-- ---------------------------------------------------------------------
create or replace function public.registrar_dispositivo_web(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_modelo   text default null
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

  if p_endpoint is null or p_endpoint !~ '^https://[^[:space:]]+$' or char_length(p_endpoint) > 2048
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}$'
     or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,32}$' then
    return public.resposta_erro('DADOS_INCOMPLETOS');
  end if;

  insert into public.dispositivos_push (user_id, token, modelo, plataforma, ativo, web_p256dh, web_auth)
  values (auth.uid(), p_endpoint, left(p_modelo, 120), 'web', true, p_p256dh, p_auth)
  on conflict (token) do update
    set user_id    = excluded.user_id,
        modelo     = coalesce(excluded.modelo, public.dispositivos_push.modelo),
        plataforma = 'web',
        web_p256dh = excluded.web_p256dh,
        web_auth   = excluded.web_auth,
        ativo      = true,
        updated_at = now()
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------
-- EDGE FUNCTION: aparelhos web que recebem o aviso (só administradores ativos).
-- ---------------------------------------------------------------------
create or replace function public.destinos_web_push()
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.token, d.web_p256dh, d.web_auth
    from public.dispositivos_push d
    join public.administradores a on a.user_id = d.user_id and a.ativo
   where d.ativo and d.plataforma = 'web';
$$;

revoke all on function public.registrar_dispositivo_web(text, text, text, text) from public, anon;
revoke all on function public.destinos_web_push()                              from public, anon, authenticated;
grant execute on function public.registrar_dispositivo_web(text, text, text, text) to authenticated;
grant execute on function public.destinos_web_push()                              to service_role;
