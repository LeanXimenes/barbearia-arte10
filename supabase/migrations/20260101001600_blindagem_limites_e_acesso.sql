-- =====================================================================
-- BARBEARIA ARTE 10 — 16. Blindagem: limites por IP e por conta,
-- funções antigas fechadas e avisos só para serviços de push de verdade.
-- =====================================================================
-- O site fala direto com o banco (não há servidor no meio). Então os
-- freios moram aqui, numa tabela do próprio banco — vale para todas as
-- instâncias do Supabase ao mesmo tempo e sobrevive a reinícios.
--
--   1. private.limites       — contadores por chave (IP, conta, rota) e janela.
--   2. private.checar_requisicao() — roda ANTES de toda chamada à API
--      (db_pre_request do PostgREST): freio geral por IP, freio por rota,
--      tamanho do pedido e /rpc só por POST.
--   3. Freios dentro das próprias funções (por IP e por conta) — valem
--      mesmo se o passo 2 for desligado.
--   4. criar_agendamento / meu_plano / solicitar_plano por telefone
--      deixam de ser públicos: tudo passa pela conta logada.
--   5. Aparelhos de aviso: só endereços dos serviços de push (Google,
--      Apple, Mozilla, Microsoft) e no máximo 5 por conta.
--   6. Sessão do cliente: 1 ano, renovada no uso (antes: 10 anos).
--   7. Senhas óbvias recusadas; link do mapa só http(s).
--
-- Reverter: supabase/reverter_blindagem.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Schema privado (fora da API). O visitante só pode CHAMAR a checagem.
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;

-- Nada novo aqui nasce liberado.
alter default privileges in schema private revoke all on functions from public, anon, authenticated;
alter default privileges in schema private revoke all on tables    from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Contadores e registro de bloqueios
-- ---------------------------------------------------------------------
create table if not exists private.limites (
  chave    text        not null,
  janela   timestamptz not null,
  contagem integer     not null default 0,
  primary key (chave, janela)
);
create index if not exists limites_janela_idx on private.limites (janela);
alter table private.limites enable row level security;
revoke all on private.limites from public, anon, authenticated;

-- Quem foi barrado e onde (o dono consulta no Supabase). Guarda 30 dias.
create table if not exists private.eventos_seguranca (
  id        bigint      generated always as identity primary key,
  criado_em timestamptz not null default now(),
  tipo      text        not null,
  chave     text,
  ip        text,
  detalhe   jsonb       not null default '{}'::jsonb
);
create index if not exists eventos_seguranca_criado_idx on private.eventos_seguranca (criado_em);
create index if not exists eventos_seguranca_chave_idx  on private.eventos_seguranca (chave, criado_em);
alter table private.eventos_seguranca enable row level security;
revoke all on private.eventos_seguranca from public, anon, authenticated;

comment on table private.eventos_seguranca is
  'Bloqueios por excesso de pedidos e travas de login. Apagado depois de 30 dias.';

-- ---------------------------------------------------------------------
-- 2. IP de quem chamou
-- ---------------------------------------------------------------------
-- O Supabase passa os cabeçalhos do pedido em request.headers.
--   * cf-connecting-ip: gravado pelo Cloudflare do Supabase — o visitante
--     não consegue trocar.
--   * x-forwarded-for: o visitante pode inventar o COMEÇO; o proxy
--     acrescenta o IP real no FIM. Por isso vale só o último endereço.
-- IP interno/privado = não dá para confiar: devolve NULL (ninguém é
-- travado por engano). IPv6 conta pelo bloco /64 (o mesmo aparelho/casa).
create or replace function private.ip_do_cliente()
returns text
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_cab jsonb;
  v_txt text;
  v_ip  inet;
begin
  begin
    v_cab := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if v_cab is null or jsonb_typeof(v_cab) <> 'object' then
    return null;
  end if;

  v_txt := nullif(btrim(v_cab ->> 'cf-connecting-ip'), '');
  if v_txt is null then
    v_txt := nullif(btrim(regexp_replace(coalesce(v_cab ->> 'x-forwarded-for', ''), '^.*,', '')), '');
  end if;
  if v_txt is null or char_length(v_txt) > 64 then
    return null;
  end if;

  begin
    v_ip := v_txt::inet;
  exception when others then
    return null;
  end;

  if v_ip << inet '10.0.0.0/8' or v_ip << inet '172.16.0.0/12' or v_ip << inet '192.168.0.0/16'
     or v_ip << inet '127.0.0.0/8' or v_ip << inet '100.64.0.0/10' or v_ip << inet '169.254.0.0/16'
     or v_ip = inet '::1' or v_ip << inet 'fc00::/7' or v_ip << inet 'fe80::/10' then
    return null;
  end if;

  if family(v_ip) = 6 then
    return host(network(set_masklen(v_ip, 64))) || '/64';
  end if;
  return host(v_ip);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Contador com janela deslizante
-- ---------------------------------------------------------------------
-- Soma 1 na chave e diz se passou do limite. Devolve 0 (pode seguir) ou
-- quantos segundos esperar. A janela anterior pesa o quanto ainda cobre o
-- "agora" — assim não dá para dobrar o limite na virada da janela.
-- Na primeira vez que alguém estoura, fica registrado em eventos_seguranca.
create or replace function private.consumir_limite(
  p_chave      text,
  p_limite     integer,
  p_janela_seg integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_chave    text;
  v_agora    double precision := extract(epoch from clock_timestamp());
  v_inicio   double precision;
  v_atual    integer;
  v_anterior integer;
  v_estimado double precision;
begin
  if p_chave is null or coalesce(p_limite, 0) < 1 or coalesce(p_janela_seg, 0) < 1 then
    return 0;
  end if;

  v_chave  := left(p_chave, 200) || '|' || p_janela_seg;
  v_inicio := floor(v_agora / p_janela_seg) * p_janela_seg;

  insert into private.limites as l (chave, janela, contagem)
  values (v_chave, to_timestamp(v_inicio), 1)
  on conflict (chave, janela) do update set contagem = l.contagem + 1
  returning l.contagem into v_atual;

  select l.contagem into v_anterior
    from private.limites l
   where l.chave = v_chave and l.janela = to_timestamp(v_inicio - p_janela_seg);

  v_estimado := coalesce(v_anterior, 0) * (1 - (v_agora - v_inicio) / p_janela_seg) + v_atual;

  -- Faxina de vez em quando: contadores de ontem e eventos de 30 dias.
  if random() < 0.01 then
    delete from private.limites where janela < now() - interval '2 days';
    delete from private.eventos_seguranca where criado_em < now() - interval '30 days';
  end if;

  if v_estimado > p_limite then
    -- Registra só a primeira vez na janela (não enche a tabela num ataque).
    if not exists (select 1 from private.eventos_seguranca e
                    where e.chave = v_chave and e.criado_em >= to_timestamp(v_inicio)) then
      insert into private.eventos_seguranca (tipo, chave, ip, detalhe)
      values ('limite', v_chave, private.ip_do_cliente(),
              jsonb_build_object('limite', p_limite, 'janela_seg', p_janela_seg));
    end if;
    return greatest(1, ceil(v_inicio + p_janela_seg - v_agora)::integer);
  end if;

  return 0;
end;
$$;

-- Resposta padrão de "espere um pouco" dentro das funções do site:
-- HTTP 429 + Retry-After, e o mesmo formato de erro que o site já mostra.
create or replace function private.resposta_limite(p_espera integer)
returns jsonb
language plpgsql
volatile
set search_path = pg_catalog, public, pg_temp
as $$
begin
  perform set_config('response.status', '429', true);
  perform set_config(
    'response.headers',
    jsonb_build_array(jsonb_build_object('Retry-After', greatest(1, p_espera)::text))::text,
    true
  );
  return public.resposta_erro('MUITOS_PEDIDOS')
         || jsonb_build_object('tentar_em_segundos', greatest(1, p_espera));
end;
$$;

-- Recusa o pedido inteiro (usado pela checagem antes de cada chamada).
-- O PostgREST transforma SQLSTATE 'PGRST' na resposta HTTP indicada.
create or replace function private.recusar(
  p_status   integer,
  p_codigo   text,
  p_mensagem text,
  p_espera   integer default null
)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise sqlstate 'PGRST' using
    message = json_build_object(
      'code', p_codigo, 'message', p_mensagem, 'details', null, 'hint', null
    )::text,
    detail = json_build_object(
      'status', p_status,
      'headers', case when p_espera is null then '{}'::json
                      else json_build_object('Retry-After', greatest(1, p_espera)::text) end
    )::text;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Checagem antes de cada chamada à API (db_pre_request)
-- ---------------------------------------------------------------------
-- Limites por minuto, por IP. Folgados para muitos clientes atrás do mesmo
-- IP da operadora (CGNAT), apertados para um robô.
create or replace function private.checar_requisicao()
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, private, pg_temp
as $$
declare
  v_claims  jsonb;
  v_cab     jsonb;
  v_papel   text;
  v_metodo  text := upper(coalesce(current_setting('request.method', true), ''));
  v_caminho text := lower(coalesce(current_setting('request.path', true), ''));
  v_tamanho bigint;
  v_ip      text;
  v_rota    text;
  v_limite  integer;
  v_espera  integer;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  v_papel := coalesce(v_claims ->> 'role', nullif(current_setting('role', true), 'none'), '');

  -- Edge Function (service_role) e chamadas internas: sem freio.
  if v_papel not in ('anon', 'authenticated') then
    return;
  end if;

  -- Pedido grande demais: o site manda poucos KB; o painel, um pouco mais.
  begin
    v_cab := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_cab := null;
  end;
  if coalesce(v_cab ->> 'content-length', '') ~ '^[0-9]{1,15}$' then
    v_tamanho := (v_cab ->> 'content-length')::bigint;
    if v_tamanho > (case when v_papel = 'anon' then 16384 else 262144 end) then
      perform private.recusar(413, 'PEDIDO_GRANDE', 'Pedido grande demais.');
    end if;
  end if;

  -- Funções do site só por POST: assim toda chamada passa pelo contador.
  if v_papel = 'anon' and v_caminho ~ '/rpc/' and v_metodo in ('GET', 'HEAD') then
    perform private.recusar(405, 'USE_POST', 'Use POST para chamar esta função.');
  end if;

  -- Leitura de tabela (GET) roda em transação só de leitura: não há como
  -- gravar o contador. São tabelas pequenas e públicas (serviços, horários).
  if current_setting('transaction_read_only') = 'on' then
    return;
  end if;

  v_ip := private.ip_do_cliente();
  if v_ip is null then
    return;
  end if;

  -- Freio geral por IP.
  v_espera := private.consumir_limite(
    'ip:' || v_ip, case when v_papel = 'anon' then 120 else 600 end, 60
  );
  if v_espera > 0 then
    perform private.recusar(429, 'MUITOS_PEDIDOS',
      'Muitos pedidos seguidos. Espere um pouco e tente de novo.', v_espera);
  end if;

  -- Freio por rota (por IP, por minuto).
  v_rota := substring(v_caminho from '/rpc/([a-z0-9_]+)/?$');
  if v_rota is not null then
    v_limite := case v_rota
      when 'entrar'                   then 10
      when 'criar_conta'              then 5
      when 'criar_agendamento_conta'  then 10
      when 'cancelar_meu_agendamento' then 10
      when 'solicitar_plano_conta'    then 5
      when 'registrar_aparelho_conta' then 10
      when 'remover_aparelho_conta'   then 10
      when 'sair'                     then 10
      when 'minha_conta'              then 40
      when 'meu_plano_conta'          then 40
      when 'dias_disponiveis'         then 40
      when 'horarios_disponiveis'     then 90
      else null
    end;
    if v_limite is not null then
      v_espera := private.consumir_limite('rota:' || v_rota || ':' || v_ip, v_limite, 60);
      if v_espera > 0 then
        perform private.recusar(429, 'MUITOS_PEDIDOS',
          'Muitos pedidos seguidos. Espere um pouco e tente de novo.', v_espera);
      end if;
    end if;
  end if;
end;
$$;

revoke all on function private.ip_do_cliente()                          from public, anon, authenticated;
revoke all on function private.consumir_limite(text, integer, integer)  from public, anon, authenticated;
revoke all on function private.resposta_limite(integer)                 from public, anon, authenticated;
revoke all on function private.recusar(integer, text, text, integer)    from public, anon, authenticated;
revoke all on function private.checar_requisicao()                      from public;
grant execute on function private.checar_requisicao() to anon, authenticated, service_role;

-- As duas consultas de horários passam a gravar o contador: precisam rodar
-- em transação de escrita (o PostgREST usa só leitura para funções STABLE).
alter function public.horarios_disponiveis(uuid, date)    volatile;
alter function public.dias_disponiveis(uuid, date, date)  volatile;

-- ---------------------------------------------------------------------
-- 5. Senha óbvia
-- ---------------------------------------------------------------------
create or replace function public.senha_fraca(p_senha text, p_telefone text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select p_senha is null
      or p_senha ~ '^(.)\1*$'                                  -- 111111, aaaaaa
      or (p_senha ~ '^[0-9]+$'                                  -- o próprio número
          and (p_senha = p_telefone
               or (char_length(p_senha) >= 8 and right(p_telefone, char_length(p_senha)) = p_senha)))
      or lower(p_senha) = any (array[
           '123456', '1234567', '12345678', '123456789', '1234567890', '654321', '123123',
           '123321', '112233', '121212', '102030', '147258', '159753', '987654', 'abc123',
           'abcdef', 'qwerty', 'senha', 'senha1', 'senha12', 'senha123', 'mudar123',
           'password', 'arte10', 'arte1010', 'barbearia', 'iloveyou', 'brasil', 'flamengo',
           'corinthians', 'palmeiras', 'santos', 'saopaulo'
         ]);
$$;
revoke all on function public.senha_fraca(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Sessão do cliente: 1 ano, renovada quando ele usa o site
-- ---------------------------------------------------------------------
create or replace function public.resposta_sessao(p_conta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token  text        := encode(gen_random_bytes(32), 'hex');
  -- Fica logado enquanto usar o site: o prazo renova a cada dia de uso.
  v_expira timestamptz := now() + interval '365 days';
begin
  -- Faxina: sessões vencidas saem e cada conta fica com no máximo 10.
  delete from public.sessoes_conta
   where conta_id = p_conta_id
     and (expira_em <= now()
          or token_hash in (select s.token_hash from public.sessoes_conta s
                             where s.conta_id = p_conta_id
                             order by s.usada_em desc
                             offset 9));

  insert into public.sessoes_conta (token_hash, conta_id, expira_em)
  values (public.hash_sessao(v_token), p_conta_id, v_expira);

  return jsonb_build_object(
    'ok',     true,
    'sessao', jsonb_build_object('token', v_token, 'expira_em', v_expira),
    'conta',  public.conta_json(p_conta_id)
  );
end;
$$;

create or replace function public.conta_da_sessao(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash  text;
  v_conta uuid;
  v_usada timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  v_hash := public.hash_sessao(p_token);
  select s.conta_id, s.usada_em into v_conta, v_usada
    from public.sessoes_conta s
   where s.token_hash = v_hash and s.expira_em > now();

  if v_conta is not null and v_usada < now() - interval '1 day' then
    update public.sessoes_conta
       set usada_em = now(), expira_em = now() + interval '365 days'
     where token_hash = v_hash;
  end if;

  return v_conta;
end;
$$;

-- Sessões antigas (de 10 anos) passam a valer 1 ano a partir do último uso.
update public.sessoes_conta
   set expira_em = least(expira_em, greatest(usada_em, now() - interval '30 days') + interval '365 days')
 where expira_em > now() + interval '365 days';

-- ---------------------------------------------------------------------
-- 7. Criar conta e entrar: freio por IP + senha óbvia
-- ---------------------------------------------------------------------
create or replace function public.criar_conta(
  p_nome     text,
  p_telefone text,
  p_senha    text,
  p_email    text default null
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

create or replace function public.entrar(p_login text, p_senha text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  -- Hash de mentira: sem conta, a senha é conferida do mesmo jeito,
  -- para a resposta não denunciar quais números têm conta.
  c_hash_falso constant text := '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5BWcCbQ8m2.XgI4XjPuMZ6S8ZbHCa';
  v_email  boolean := position('@' in coalesce(p_login, '')) > 0;
  v_login  text;
  v_id     uuid;
  v_hash   text;
  v_ip     text := private.ip_do_cliente();
  v_espera integer;
begin
  -- Antes do bcrypt: no máximo 30 tentativas a cada 15 minutos por IP
  -- (trava quem testa a mesma senha em muitos números).
  if v_ip is not null then
    v_espera := private.consumir_limite('entrar:ip:' || v_ip, 30, 900);
    if v_espera > 0 then
      return private.resposta_limite(v_espera);
    end if;
  end if;

  v_login := case when v_email then public.normalizar_email(p_login)
                  else public.normalizar_telefone(p_login) end;
  if v_login is null or coalesce(p_senha, '') = '' or octet_length(p_senha) > 72 then
    return public.resposta_erro('LOGIN_INVALIDO');
  end if;

  delete from public.tentativas_login where created_at < now() - interval '1 day';

  if (select count(*) from public.tentativas_login
       where login = v_login and created_at > now() - interval '15 minutes') >= 5 then
    insert into private.eventos_seguranca (tipo, chave, ip)
    values ('login_travado', left(v_login, 4) || '***', v_ip);
    return public.resposta_erro('LOGIN_TRAVADO');
  end if;

  if v_email then
    select c.id, c.senha_hash into v_id, v_hash from public.contas c where c.email = v_login;
  else
    select c.id, c.senha_hash into v_id, v_hash from public.contas c where c.telefone = v_login;
  end if;

  if crypt(p_senha, coalesce(v_hash, c_hash_falso)) is distinct from v_hash then
    insert into public.tentativas_login (login) values (v_login);
    return public.resposta_erro('LOGIN_INVALIDO');
  end if;

  delete from public.tentativas_login where login = v_login;
  return public.resposta_sessao(v_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Agendar logado: freio por conta e por IP
-- ---------------------------------------------------------------------
create or replace function public.criar_agendamento_conta(
  p_token           text,
  p_servico_id      uuid,
  p_data            date,
  p_horario_inicio  time,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conta    uuid;
  v_nome     text;
  v_tel      text;
  v_resposta jsonb;
  v_ag       uuid;
  v_dono     uuid;
  v_ip       text := private.ip_do_cliente();
  v_espera   integer;
begin
  v_conta := public.conta_da_sessao(p_token);
  if v_conta is null then
    return public.resposta_erro('SESSAO_EXPIRADA');
  end if;

  -- Uma conta tenta marcar no máximo 15 vezes por dia; um IP, 30 por hora.
  -- O limite de horários em aberto por número continua valendo.
  v_espera := private.consumir_limite('agendar:conta:' || v_conta, 15, 86400);
  if v_espera = 0 and v_ip is not null then
    v_espera := private.consumir_limite('agendar:ip:' || v_ip, 30, 3600);
  end if;
  if v_espera > 0 then
    return private.resposta_limite(v_espera);
  end if;

  select c.nome, c.telefone into v_nome, v_tel from public.contas c where c.id = v_conta;

  v_resposta := public.criar_agendamento(
    p_servico_id, p_data, p_horario_inicio, v_nome, v_tel, p_idempotency_key
  );
  if not coalesce((v_resposta ->> 'ok')::boolean, false) then
    return v_resposta;
  end if;

  v_ag := (v_resposta -> 'agendamento' ->> 'id')::uuid;
  select a.conta_id into v_dono from public.agendamentos a where a.id = v_ag for update;

  if not (v_resposta ->> 'duplicado')::boolean and v_dono is null then
    update public.agendamentos set conta_id = v_conta where id = v_ag;
  elsif v_dono is distinct from v_conta then
    -- A chave repetida é de outra reserva: não devolve os dados dela.
    return public.resposta_erro('DADOS_INVALIDOS');
  end if;

  return v_resposta;
end;
$$;

-- Cancelar pelo site: no máximo 5 por dia por conta (cada um avisa o dono).
create or replace function public.cancelar_meu_agendamento(p_token text, p_agendamento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conta  uuid;
  v_a      public.agendamentos%rowtype;
  v_espera integer;
begin
  v_conta := public.conta_da_sessao(p_token);
  if v_conta is null then
    return public.resposta_erro('SESSAO_EXPIRADA');
  end if;

  v_espera := private.consumir_limite('cancelar:conta:' || v_conta, 5, 86400);
  if v_espera > 0 then
    return private.resposta_limite(v_espera);
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
-- 9. Plano pela conta (não mais por um telefone qualquer)
-- ---------------------------------------------------------------------
-- "Meu plano": só o plano do número da própria conta.
create or replace function public.meu_plano_conta(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conta uuid;
  v_tel   text;
begin
  v_conta := public.conta_da_sessao(p_token);
  if v_conta is null then
    return public.resposta_erro('SESSAO_EXPIRADA');
  end if;
  select c.telefone into v_tel from public.contas c where c.id = v_conta;
  return public.meu_plano(v_tel);
end;
$$;

-- Pedir plano logado. Por padrão sai no nome e no número da conta; dá para
-- pedir para outra pessoa, mas aí o nome já cadastrado daquele número não
-- é trocado (ninguém renomeia o cadastro alheio).
create or replace function public.solicitar_plano_conta(
  p_token    text,
  p_plano_id uuid,
  p_nome     text default null,
  p_telefone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conta    uuid;
  v_nome     text;
  v_tel      text;
  v_outro    text;
  v_cadastro text;
  v_ip       text := private.ip_do_cliente();
  v_espera   integer;
begin
  v_conta := public.conta_da_sessao(p_token);
  if v_conta is null then
    return public.resposta_erro('SESSAO_EXPIRADA');
  end if;

  v_espera := private.consumir_limite('plano:conta:' || v_conta, 3, 86400);
  if v_espera = 0 and v_ip is not null then
    v_espera := private.consumir_limite('plano:ip:' || v_ip, 10, 3600);
  end if;
  if v_espera > 0 then
    return private.resposta_limite(v_espera);
  end if;

  select c.nome, c.telefone into v_nome, v_tel from public.contas c where c.id = v_conta;

  v_outro := public.normalizar_telefone(p_telefone);
  if btrim(coalesce(p_telefone, '')) <> '' and v_outro is null then
    return public.resposta_erro('TELEFONE_INVALIDO');
  end if;

  if v_outro is not null and v_outro <> v_tel then
    v_nome := p_nome;
    select cl.nome into v_cadastro from public.clientes cl where cl.telefone = v_outro;
    if v_cadastro is not null then
      v_nome := v_cadastro;
    end if;
    v_tel := v_outro;
  end if;

  return public.solicitar_plano(p_plano_id, v_nome, v_tel);
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Aparelhos de aviso: só serviços de push de verdade, até 5 por conta
-- ---------------------------------------------------------------------
-- Sem isso, um endereço qualquer faria a Edge Function mandar pedidos
-- para fora (SSRF) a cada lembrete.
create or replace function public.endpoint_push_valido(p_endpoint text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select p_endpoint is not null
     and char_length(p_endpoint) <= 2048
     and p_endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]]+$';
$$;
revoke all on function public.endpoint_push_valido(text) from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'aparelhos_conta_servico_push') then
    alter table public.aparelhos_conta
      add constraint aparelhos_conta_servico_push check (public.endpoint_push_valido(endpoint)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dispositivos_push_web_servico_push') then
    alter table public.dispositivos_push
      add constraint dispositivos_push_web_servico_push
      check (plataforma <> 'web' or public.endpoint_push_valido(token)) not valid;
  end if;
end;
$$;

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
  v_conta  uuid;
  v_espera integer;
begin
  v_conta := public.conta_da_sessao(p_token);
  if v_conta is null then
    return public.resposta_erro('SESSAO_EXPIRADA');
  end if;

  -- O site confere o aparelho a cada visita: se já está igual, nada muda.
  if exists (select 1 from public.aparelhos_conta a
              where a.endpoint = p_endpoint and a.conta_id = v_conta and a.ativo
                and a.p256dh = p_p256dh and a.auth = p_auth) then
    return jsonb_build_object('ok', true);
  end if;

  v_espera := private.consumir_limite('aparelho:conta:' || v_conta, 10, 86400);
  if v_espera > 0 then
    return private.resposta_limite(v_espera);
  end if;

  if not public.endpoint_push_valido(p_endpoint)
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

  -- No máximo 5 aparelhos por conta: os mais antigos saem.
  delete from public.aparelhos_conta
   where conta_id = v_conta
     and id not in (select a.id from public.aparelhos_conta a
                     where a.conta_id = v_conta
                     order by a.updated_at desc, a.created_at desc
                     limit 5);

  return jsonb_build_object('ok', true);
end;
$$;

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

  if not public.endpoint_push_valido(p_endpoint)
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
-- 11. Link do mapa: só http(s) — um "javascript:" viraria ataque no site
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'config_mapa_url_segura') then
    alter table public.config_barbearia
      add constraint config_mapa_url_segura
      check (mapa_url is null or mapa_url ~* '^https?://[^[:space:]]+$') not valid;
    begin
      alter table public.config_barbearia validate constraint config_mapa_url_segura;
    exception when check_violation then
      raise notice 'mapa_url atual não começa com http(s): corrija no app do dono.';
    end;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 12. Agenda pública: só o que ainda interessa (sem o histórico inteiro)
-- ---------------------------------------------------------------------
drop policy if exists agenda_publica_leitura on public.agenda_publica;
create policy agenda_publica_leitura
  on public.agenda_publica for select
  to anon, authenticated
  using (fim_em > now() - interval '1 day');

-- ---------------------------------------------------------------------
-- 13. Permissões: o site só usa as funções da conta
-- ---------------------------------------------------------------------
-- Continuam funcionando por dentro (as funções da conta chamam estas),
-- mas ninguém de fora as chama direto.
revoke all on function public.criar_agendamento(uuid, date, time, text, text, text) from public, anon, authenticated;
revoke all on function public.meu_plano(text)                                       from public, anon, authenticated;
revoke all on function public.solicitar_plano(uuid, text, text)                     from public, anon, authenticated;

revoke all on function public.meu_plano_conta(text)                                 from public;
revoke all on function public.solicitar_plano_conta(text, uuid, text, text)         from public;
grant execute on function public.meu_plano_conta(text)                              to anon, authenticated;
grant execute on function public.solicitar_plano_conta(text, uuid, text, text)      to anon, authenticated;

-- ---------------------------------------------------------------------
-- 14. Liga a checagem no PostgREST do Supabase
-- ---------------------------------------------------------------------
-- (Fora do Supabase o papel "authenticator" não existe e nada acontece.)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''private.checar_requisicao''';
    perform pg_notify('pgrst', 'reload config');
  end if;
end;
$$;

-- Faxina diária pelo pg_cron, quando estiver ligado (além da faxina automática).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'arte10-faxina-limites',
      '17 4 * * *',
      $cron$delete from private.limites where janela < now() - interval '2 days';
            delete from private.eventos_seguranca where criado_em < now() - interval '30 days'$cron$
    );
  end if;
end;
$$;
