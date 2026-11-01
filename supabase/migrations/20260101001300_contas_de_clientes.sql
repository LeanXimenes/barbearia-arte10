-- =====================================================================
-- BARBEARIA ARTE 10 — 13. Conta do cliente no site (login)
-- =====================================================================
-- O cliente cria a conta com nome, celular (obrigatório e válido) e, se
-- quiser, e-mail. Depois entra com o celular OU o e-mail e a senha.
-- Logado, ele agenda sem digitar nada e vê os horários que marcou.
--
-- Não usa o Supabase Auth de propósito: lá, quem entra vira o papel
-- "authenticated", que é o da equipe do app, e o Auth pediria SMS pago
-- ou confirmação de e-mail. Aqui tudo passa por funções SECURITY
-- DEFINER chamadas com a chave pública, como o agendamento:
--   * a senha fica guardada com bcrypt (pgcrypto), nunca em texto;
--   * a sessão é um código aleatório; o banco guarda só o hash dele;
--   * 5 senhas erradas em 15 minutos travam aquele login por 15 minutos;
--   * cada conta só enxerga os horários marcados por ela mesma.
-- As tabelas novas não dão acesso nenhum a anon nem a authenticated.
-- =====================================================================

-- No Supabase a pgcrypto já vem instalada no schema "extensions".
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Número brasileiro de verdade: DDD que existe e formato certo.
--   * celular: 11 dígitos, começa com 9 depois do DDD;
--   * fixo: 10 dígitos, começa com 2, 3, 4 ou 5 depois do DDD;
--   * nada de 99999-9999 ou 0000-0000.
-- Recebe só dígitos (passe antes por normalizar_telefone).
-- ---------------------------------------------------------------------
create or replace function public.telefone_brasileiro_valido(p_digitos text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    p_digitos ~ '^[0-9]{10,11}$'
    and left(p_digitos, 2) = any (array[
      '11','12','13','14','15','16','17','18','19',
      '21','22','24','27','28',
      '31','32','33','34','35','37','38',
      '41','42','43','44','45','46','47','48','49',
      '51','53','54','55',
      '61','62','63','64','65','66','67','68','69',
      '71','73','74','75','77','79',
      '81','82','83','84','85','86','87','88','89',
      '91','92','93','94','95','96','97','98','99'
    ])
    and (
      (char_length(p_digitos) = 11 and substr(p_digitos, 3, 1) = '9')
      or (char_length(p_digitos) = 10 and substr(p_digitos, 3, 1) between '2' and '5')
    )
    and substr(p_digitos, 4) !~ '^(.)\1*$',
    false
  );
$$;

-- E-mail em minúsculas e sem espaços; NULL quando vazio ou inválido.
create or replace function public.normalizar_email(p_email text)
returns text
language sql
immutable
as $$
  select case
           when v ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' and char_length(v) <= 254 then v
         end
    from (select lower(btrim(coalesce(p_email, ''))) as v) x;
$$;

-- ---------------------------------------------------------------------
-- TABELAS
-- ---------------------------------------------------------------------
create table if not exists public.contas (
  id         uuid        primary key default gen_random_uuid(),
  nome       text        not null,
  telefone   text        not null,
  email      text,
  senha_hash text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contas_nome_valido     check (char_length(btrim(nome)) between 2 and 80),
  constraint contas_telefone_valido check (public.telefone_brasileiro_valido(telefone)),
  constraint contas_email_valido    check (email is null or email = public.normalizar_email(email))
);

-- Um número = uma conta. O e-mail também não se repete.
create unique index if not exists contas_telefone_key on public.contas (telefone);
create unique index if not exists contas_email_key on public.contas (email) where email is not null;
create index if not exists contas_criacao_idx on public.contas (created_at);

drop trigger if exists trg_contas_updated_at on public.contas;
create trigger trg_contas_updated_at
  before update on public.contas
  for each row execute function public.tg_set_updated_at();

-- Sessões abertas (um aparelho = uma sessão). Só o hash do código fica aqui:
-- quem ler esta tabela não consegue entrar na conta de ninguém.
create table if not exists public.sessoes_conta (
  token_hash text        primary key,
  conta_id   uuid        not null references public.contas (id) on delete cascade,
  expira_em  timestamptz not null,
  usada_em   timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sessoes_conta_conta_idx on public.sessoes_conta (conta_id, usada_em desc);

-- Senhas erradas recentes, para travar quem fica chutando.
create table if not exists public.tentativas_login (
  id         bigint      generated always as identity primary key,
  login      text        not null,
  created_at timestamptz not null default now()
);

create index if not exists tentativas_login_idx on public.tentativas_login (login, created_at);
create index if not exists tentativas_login_criacao_idx on public.tentativas_login (created_at);

-- Agendamento marcado por uma conta. Sem conta (como antes) fica NULL.
alter table public.agendamentos
  add column if not exists conta_id uuid references public.contas (id) on delete set null;

create index if not exists agendamentos_conta_idx
  on public.agendamentos (conta_id, inicio_em desc)
  where conta_id is not null;

-- Depois de ligado a uma conta, o agendamento não passa para outra.
-- (Voltar a NULL só acontece se a conta for apagada.)
create or replace function public.tg_agendamento_conta_fixa()
returns trigger
language plpgsql
as $$
begin
  if old.conta_id is not null and new.conta_id is not null
     and new.conta_id <> old.conta_id then
    raise exception 'AGENDAMENTO_IMUTAVEL'
      using detail  = 'A conta de um agendamento nao muda.',
            errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agendamentos_conta_fixa on public.agendamentos;
create trigger trg_agendamentos_conta_fixa
  before update of conta_id on public.agendamentos
  for each row execute function public.tg_agendamento_conta_fixa();

alter table public.contas           enable row level security;
alter table public.sessoes_conta    enable row level security;
alter table public.tentativas_login enable row level security;

-- Sem policy e sem permissão: só as funções abaixo mexem nestas tabelas.
revoke all on public.contas, public.sessoes_conta, public.tentativas_login
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- UTILITÁRIOS INTERNOS (não ficam disponíveis para o site)
-- ---------------------------------------------------------------------
create or replace function public.hash_sessao(p_token text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

create or replace function public.conta_json(p_conta_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'nome',     c.nome,
    'telefone', c.telefone,
    'email',    c.email,
    'desde',    c.created_at
  )
  from public.contas c
  where c.id = p_conta_id;
$$;

-- Abre uma sessão nova e devolve o código (a única vez em que ele aparece).
create or replace function public.resposta_sessao(p_conta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token  text        := encode(gen_random_bytes(32), 'hex');
  v_expira timestamptz := now() + interval '180 days';
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

-- Conta dona do código de sessão (NULL se não existe ou venceu).
-- Sessão em uso continua valendo: renova o prazo no máximo 1 vez por dia.
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
       set usada_em = now(), expira_em = now() + interval '180 days'
     where token_hash = v_hash;
  end if;

  return v_conta;
end;
$$;

-- ---------------------------------------------------------------------
-- SITE: criar conta
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
  v_nome  text;
  v_tel   text;
  v_email text;
  v_id    uuid;
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

  -- Uma criação de cada vez: o freio e as checagens abaixo não correm.
  perform pg_advisory_xact_lock(hashtext('barbearia_arte10:contas'));

  -- Freio contra robôs (a chave do site é pública).
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

-- ---------------------------------------------------------------------
-- SITE: entrar (com o celular ou o e-mail)
-- ---------------------------------------------------------------------
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
  v_email boolean := position('@' in coalesce(p_login, '')) > 0;
  v_login text;
  v_id    uuid;
  v_hash  text;
begin
  v_login := case when v_email then public.normalizar_email(p_login)
                  else public.normalizar_telefone(p_login) end;
  if v_login is null or coalesce(p_senha, '') = '' then
    return public.resposta_erro('LOGIN_INVALIDO');
  end if;

  delete from public.tentativas_login where created_at < now() - interval '1 day';

  if (select count(*) from public.tentativas_login
       where login = v_login and created_at > now() - interval '15 minutes') >= 5 then
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
-- SITE: sair (encerra só a sessão deste aparelho)
-- ---------------------------------------------------------------------
create or replace function public.sair(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.sessoes_conta where token_hash = public.hash_sessao(p_token);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- SITE: "Minha conta" — os dados e os horários marcados pela conta.
-- ---------------------------------------------------------------------
create or replace function public.minha_conta(p_token text)
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

  return jsonb_build_object(
    'ok',    true,
    'conta', public.conta_json(v_conta),
    -- Os que ainda não terminaram (inclusive os que o dono cancelou).
    'proximos', coalesce((
      select jsonb_agg(public.agendamento_json(a.id) order by a.inicio_em)
        from public.agendamentos a
       where a.conta_id = v_conta and a.fim_em > now()
    ), '[]'::jsonb),
    -- Os 10 últimos que já passaram.
    'anteriores', coalesce((
      select jsonb_agg(public.agendamento_json(x.id) order by x.inicio_em desc)
        from (select a.id, a.inicio_em
                from public.agendamentos a
               where a.conta_id = v_conta and a.fim_em <= now()
               order by a.inicio_em desc
               limit 10) x
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- SITE: agendar logado. Nome e telefone vêm da conta (não do navegador)
-- e todas as regras são as mesmas de criar_agendamento.
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
begin
  v_conta := public.conta_da_sessao(p_token);
  if v_conta is null then
    return public.resposta_erro('SESSAO_EXPIRADA');
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

-- ---------------------------------------------------------------------
-- PERMISSÕES: o site só chama estas cinco.
-- ---------------------------------------------------------------------
revoke all on function public.telefone_brasileiro_valido(text) from public, anon, authenticated;
revoke all on function public.normalizar_email(text)           from public, anon, authenticated;
revoke all on function public.hash_sessao(text)                from public, anon, authenticated;
revoke all on function public.conta_json(uuid)                 from public, anon, authenticated;
revoke all on function public.resposta_sessao(uuid)            from public, anon, authenticated;
revoke all on function public.conta_da_sessao(text)            from public, anon, authenticated;
revoke all on function public.tg_agendamento_conta_fixa()      from public, anon, authenticated;
revoke all on function public.criar_conta(text, text, text, text)                     from public;
revoke all on function public.entrar(text, text)                                     from public;
revoke all on function public.sair(text)                                             from public;
revoke all on function public.minha_conta(text)                                      from public;
revoke all on function public.criar_agendamento_conta(text, uuid, date, time, text)  from public;

grant execute on function public.criar_conta(text, text, text, text)                    to anon, authenticated;
grant execute on function public.entrar(text, text)                                    to anon, authenticated;
grant execute on function public.sair(text)                                            to anon, authenticated;
grant execute on function public.minha_conta(text)                                     to anon, authenticated;
grant execute on function public.criar_agendamento_conta(text, uuid, date, time, text) to anon, authenticated;
