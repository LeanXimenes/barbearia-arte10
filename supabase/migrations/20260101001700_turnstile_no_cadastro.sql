-- =====================================================================
-- BARBEARIA ARTE 10 — 17. Anti-robô (Cloudflare Turnstile) no cadastro
-- =====================================================================
-- O site mostra o desafio do Turnstile ao criar a conta e manda o token.
-- O BANCO confere o token direto na Cloudflare (siteverify) antes de criar
-- a conta — conferir só no navegador não protege nada.
--
-- Liga sozinho quando as DUAS chaves existem:
--   * config_barbearia.turnstile_site_key — pública (o site lê para mostrar o desafio);
--   * private.segredos 'turnstile_secret'  — secreta (só o banco lê).
-- Sem as duas, o cadastro segue como antes (com os limites por IP).
--
-- Se a Cloudflare não responder, ou a chave secreta estiver errada, o
-- cadastro NÃO trava: fica registrado em private.eventos_seguranca e os
-- limites por IP continuam valendo. Token ausente ou recusado = recusa.
-- =====================================================================

-- Chamada HTTP síncrona do banco (extensão "http" do Supabase).
do $$
begin
  create extension if not exists http with schema extensions;
exception when others then
  raise notice 'Extensão http indisponível aqui (%): o Turnstile fica desligado.', sqlerrm;
end;
$$;

alter table public.config_barbearia add column if not exists turnstile_site_key text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'config_turnstile_site_key_valida') then
    alter table public.config_barbearia
      add constraint config_turnstile_site_key_valida
      check (turnstile_site_key is null or turnstile_site_key ~ '^[0-9A-Za-z_-]{10,100}$');
  end if;
end;
$$;

comment on column public.config_barbearia.turnstile_site_key is
  'Chave PÚBLICA do Cloudflare Turnstile (o site mostra o desafio no cadastro). A secreta fica em private.segredos.';

-- ---------------------------------------------------------------------
-- Pergunta à Cloudflare se o token vale. Isolada numa função para os
-- testes poderem trocar a chamada de rede por uma resposta fixa.
-- ---------------------------------------------------------------------
create or replace function private.turnstile_siteverify(p_secret text, p_token text)
returns jsonb
language plpgsql
volatile
set search_path = extensions, pg_catalog, pg_temp
as $$
declare
  v_status  integer;
  v_corpo   text;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '2500');
  select r.status, r.content into v_status, v_corpo
    from extensions.http_post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      'secret=' || extensions.urlencode(p_secret) || '&response=' || extensions.urlencode(p_token),
      'application/x-www-form-urlencoded'
    ) r;
  if v_status is distinct from 200 then
    return jsonb_build_object('indisponivel', true, 'status', v_status);
  end if;
  return v_corpo::jsonb;
exception when others then
  return jsonb_build_object('indisponivel', true, 'erro', left(sqlerrm, 200));
end;
$$;

-- 'desligado' | 'ok' | 'faltou' | 'recusado' | 'indisponivel'
create or replace function private.validar_turnstile(p_token text)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, public, pg_temp
as $$
declare
  v_secret text;
  v_site   text;
  v_r      jsonb;
  v_erros  jsonb;
begin
  select nullif(btrim(s.valor), '') into v_secret from private.segredos s where s.chave = 'turnstile_secret';
  select nullif(btrim(c.turnstile_site_key), '') into v_site from public.config_barbearia c where c.id;
  if v_secret is null or v_site is null then
    return 'desligado';
  end if;

  if p_token is null or btrim(p_token) = '' then
    return 'faltou';
  end if;
  if char_length(p_token) > 2048 then
    return 'recusado';
  end if;

  v_r := private.turnstile_siteverify(v_secret, p_token);
  v_erros := coalesce(v_r -> 'error-codes', '[]'::jsonb);

  -- Cloudflare fora do ar ou chave secreta errada: não trava os clientes.
  if coalesce((v_r ->> 'indisponivel')::boolean, false)
     or v_erros ?| array['missing-input-secret', 'invalid-input-secret', 'internal-error'] then
    insert into private.eventos_seguranca (tipo, ip, detalhe)
    values ('turnstile_indisponivel', private.ip_do_cliente(), v_r - 'cdata');
    return 'indisponivel';
  end if;

  if coalesce((v_r ->> 'success')::boolean, false)
     and coalesce(nullif(v_r ->> 'action', ''), 'criar_conta') = 'criar_conta' then
    return 'ok';
  end if;

  insert into private.eventos_seguranca (tipo, ip, detalhe)
  values ('turnstile_recusado', private.ip_do_cliente(),
          jsonb_build_object('erros', v_erros, 'hostname', v_r ->> 'hostname', 'action', v_r ->> 'action'));
  return 'recusado';
end;
$$;

revoke all on function private.turnstile_siteverify(text, text) from public, anon, authenticated;
revoke all on function private.validar_turnstile(text)          from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- criar_conta ganha o token do Turnstile (as outras regras não mudam).
-- ---------------------------------------------------------------------
drop function if exists public.criar_conta(text, text, text, text);

create or replace function public.criar_conta(
  p_nome      text,
  p_telefone  text,
  p_senha     text,
  p_email     text default null,
  p_turnstile text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_nome   text;
  v_tel    text;
  v_email  text;
  v_id     uuid;
  v_ip     text := private.ip_do_cliente();
  v_espera integer;
begin
  v_nome := left(public.normalizar_nome(p_nome), 80);
  if v_nome is null or char_length(v_nome) < 2 then
    return public.resposta_erro('NOME_INVALIDO');
  end if;

  v_tel := public.normalizar_telefone(p_telefone);
  if v_tel is null or not public.telefone_brasileiro_valido(v_tel) then
    return public.resposta_erro('TELEFONE_INVALIDO');
  end if;

  v_email := public.normalizar_email(p_email);
  if v_email is null and btrim(coalesce(p_email, '')) <> '' then
    return public.resposta_erro('EMAIL_INVALIDO');
  end if;

  if p_senha is null or char_length(p_senha) < 6 then
    return public.resposta_erro('SENHA_CURTA');
  end if;
  -- O bcrypt só usa os primeiros 72 bytes: recusa em vez de cortar calado.
  if octet_length(p_senha) > 72 then
    return public.resposta_erro('SENHA_LONGA');
  end if;
  if public.senha_fraca(p_senha, v_tel) then
    return public.resposta_erro('SENHA_FRACA');
  end if;

  -- Antes do bcrypt (que é caro): no máximo 10 contas novas por hora por IP.
  if v_ip is not null then
    v_espera := private.consumir_limite('criar_conta:ip:' || v_ip, 10, 3600);
    if v_espera > 0 then
      return private.resposta_limite(v_espera);
    end if;
  end if;

  -- Anti-robô: o token do desafio é conferido na Cloudflare.
  if private.validar_turnstile(p_turnstile) in ('faltou', 'recusado') then
    return public.resposta_erro('VERIFICACAO_HUMANA');
  end if;

  -- Uma criação de cada vez: o freio e as checagens abaixo não correm.
  perform pg_advisory_xact_lock(hashtext('barbearia_arte10:contas'));

  -- Freio geral contra robôs (a chave do site é pública).
  if (select count(*) from public.contas
       where created_at > now() - interval '10 minutes') >= 20 then
    return public.resposta_erro('MUITAS_CONTAS');
  end if;

  if exists (select 1 from public.contas where telefone = v_tel) then
    return public.resposta_erro('TELEFONE_JA_CADASTRADO');
  end if;
  if v_email is not null and exists (select 1 from public.contas where email = v_email) then
    return public.resposta_erro('EMAIL_JA_CADASTRADO');
  end if;

  insert into public.contas (nome, telefone, email, senha_hash)
  values (v_nome, v_tel, v_email, crypt(p_senha, gen_salt('bf', 10)))
  returning id into v_id;

  return public.resposta_sessao(v_id);
end;
$$;

revoke all on function public.criar_conta(text, text, text, text, text) from public;
grant execute on function public.criar_conta(text, text, text, text, text) to anon, authenticated;
