-- =====================================================================
-- BARBEARIA ARTE 10 — 10. Clube Arte 10 (planos e promoções),
--                         cancelamento pelo dono e ordem dos serviços
-- =====================================================================
-- Como funciona um plano:
--   1. O cliente escolhe o plano no site e informa nome + telefone
--      (solicitar_plano). O dono recebe um push na hora.
--   2. O cliente paga na barbearia (ou combina pelo WhatsApp) e o dono
--      ATIVA o plano pelo app (ativar_assinatura). A validade começa aí.
--   3. Cada agendamento de um serviço que "usa plano" (ex.: corte de
--      cabelo), feito com o telefone do plano, desconta 1 corte — e a tela
--      de confirmação mostra ao cliente quantos restam.
--   4. Se o dono cancelar esse agendamento, o corte volta para o plano.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.planos (
  id               uuid           primary key default gen_random_uuid(),
  nome             text           not null,
  chamada          text,                        -- ex.: "4 cortes no mês por apenas R$ 110!"
  preco            numeric(10, 2) not null,
  preco_referencia numeric(10, 2),              -- reserva: o site calcula pelo preço do corte
  cortes           integer        not null,
  validade_dias    integer        not null default 30,
  beneficios       text[]         not null default '{}',
  destaque         boolean        not null default false,
  ativo            boolean        not null default true,
  ordem            integer        not null default 0,
  created_at       timestamptz    not null default now(),
  updated_at       timestamptz    not null default now(),
  constraint planos_nome_valido     check (char_length(btrim(nome)) between 2 and 40),
  constraint planos_preco_valido    check (preco >= 0 and preco <= 100000),
  constraint planos_ref_valida      check (preco_referencia is null or preco_referencia >= 0),
  constraint planos_cortes_validos  check (cortes between 1 and 60),
  constraint planos_validade_valida check (validade_dias between 1 and 365)
);

create unique index if not exists planos_nome_key on public.planos (lower(btrim(nome)));

drop trigger if exists trg_planos_updated_at on public.planos;
create trigger trg_planos_updated_at
  before update on public.planos
  for each row execute function public.tg_set_updated_at();

create table if not exists public.promocoes (
  id          uuid        primary key default gen_random_uuid(),
  titulo      text        not null,
  chamada     text,                       -- a frase principal da promoção
  descricao   text,
  itens       text[]      not null default '{}',
  observacao  text,                       -- letra miúda ("Válido para...")
  ativo       boolean     not null default true,
  ordem       integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint promocoes_titulo_valido check (char_length(btrim(titulo)) between 2 and 40)
);

create unique index if not exists promocoes_titulo_key on public.promocoes (lower(btrim(titulo)));

drop trigger if exists trg_promocoes_updated_at on public.promocoes;
create trigger trg_promocoes_updated_at
  before update on public.promocoes
  for each row execute function public.tg_set_updated_at();

-- Plano de um cliente. Guarda uma "fotografia" do plano no momento do
-- pedido: mudar o preço do plano depois não muda o que o cliente pegou.
create table if not exists public.assinaturas (
  id            uuid           primary key default gen_random_uuid(),
  cliente_id    uuid           not null references public.clientes (id) on delete restrict,
  plano_id      uuid           not null references public.planos (id) on delete restrict,
  cliente_nome  text           not null,
  plano_nome    text           not null,
  preco         numeric(10, 2) not null,
  cortes_total  integer        not null,
  cortes_usados integer        not null default 0,
  validade_dias integer        not null,
  status        text           not null default 'solicitada',
  solicitada_em timestamptz    not null default now(),
  ativada_em    timestamptz,
  expira_em     timestamptz,
  encerrada_em  timestamptz,
  created_at    timestamptz    not null default now(),
  updated_at    timestamptz    not null default now(),
  constraint assinaturas_status_valido check (
    status in ('solicitada', 'ativa', 'encerrada', 'recusada', 'cancelada')
  ),
  constraint assinaturas_uso_valido check (cortes_usados between 0 and cortes_total),
  constraint assinaturas_ativa_tem_validade check (status <> 'ativa' or expira_em is not null)
);

-- Um cliente tem no máximo um plano em aberto (pedido ou ativo).
create unique index if not exists assinaturas_uma_aberta
  on public.assinaturas (cliente_id)
  where status in ('solicitada', 'ativa');
create index if not exists assinaturas_status_idx on public.assinaturas (status, solicitada_em desc);

drop trigger if exists trg_assinaturas_updated_at on public.assinaturas;
create trigger trg_assinaturas_updated_at
  before update on public.assinaturas
  for each row execute function public.tg_set_updated_at();

-- Cada agendamento que consumiu um corte do plano.
create table if not exists public.plano_usos (
  id             uuid        primary key default gen_random_uuid(),
  assinatura_id  uuid        not null references public.assinaturas (id) on delete restrict,
  agendamento_id uuid        not null references public.agendamentos (id) on delete restrict,
  numero         integer     not null,     -- 1º, 2º, 3º corte do plano...
  created_at     timestamptz not null default now()
);

create unique index if not exists plano_usos_agendamento_key on public.plano_usos (agendamento_id);
create index if not exists plano_usos_assinatura_idx on public.plano_usos (assinatura_id);

-- Fecha planos vencidos ou sem cortes (libera o cliente para pegar outro).
create or replace function public.encerrar_planos_vencidos(p_cliente_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.assinaturas
     set status = 'encerrada', encerrada_em = now()
   where cliente_id = p_cliente_id
     and status = 'ativa'
     and (expira_em <= now() or cortes_usados >= cortes_total);
$$;

create or replace function public.assinatura_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id',            s.id,
    'plano',         s.plano_nome,
    'status',        s.status,
    'preco',         s.preco,
    'cortes_total',  s.cortes_total,
    'cortes_usados', s.cortes_usados,
    'restantes',     s.cortes_total - s.cortes_usados,
    'solicitada_em', s.solicitada_em,
    'expira_em',     s.expira_em
  )
  from public.assinaturas s
  where s.id = p_id;
$$;

-- ---------------------------------------------------------------------
-- Desconto automático: agendou serviço que usa plano, com plano válido,
-- desconta 1 corte. Roda dentro da mesma transação do agendamento.
-- ---------------------------------------------------------------------
create or replace function public.tg_agendamento_usa_plano()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usa   boolean;
  v_plano public.assinaturas%rowtype;
begin
  select s.usa_plano into v_usa from public.servicos s where s.id = new.servico_id;
  if not coalesce(v_usa, false) then
    return new;
  end if;

  -- Trava a linha do plano: dois agendamentos juntos não usam o mesmo corte.
  select s.* into v_plano
    from public.assinaturas s
   where s.cliente_id = new.cliente_id
     and s.status = 'ativa'
     and s.expira_em > now()
     and s.cortes_usados < s.cortes_total
   for update;

  if not found then
    return new;
  end if;

  update public.assinaturas
     set cortes_usados = cortes_usados + 1,
         status        = case when cortes_usados + 1 >= cortes_total then 'encerrada' else status end,
         encerrada_em  = case when cortes_usados + 1 >= cortes_total then now() else encerrada_em end
   where id = v_plano.id;

  insert into public.plano_usos (assinatura_id, agendamento_id, numero)
  values (v_plano.id, new.id, v_plano.cortes_usados + 1);

  return new;
end;
$$;

drop trigger if exists trg_agendamentos_usa_plano on public.agendamentos;
create trigger trg_agendamentos_usa_plano
  after insert on public.agendamentos
  for each row execute function public.tg_agendamento_usa_plano();

-- Cancelou um agendamento que usou o plano: o corte volta.
create or replace function public.tg_agendamento_devolve_plano()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uso public.plano_usos%rowtype;
begin
  if old.cancelado_em is not null or new.cancelado_em is null then
    return new;
  end if;

  select u.* into v_uso from public.plano_usos u where u.agendamento_id = new.id;
  if not found then
    return new;
  end if;

  delete from public.plano_usos where id = v_uso.id;

  update public.assinaturas s
     set cortes_usados = s.cortes_usados - 1,
         -- Tinha fechado só por ter usado tudo e ainda está no prazo: reabre,
         -- desde que o cliente não tenha pedido outro plano nesse meio tempo.
         status = case
                    when s.status = 'encerrada'
                     and s.expira_em > now()
                     and not exists (
                       select 1 from public.assinaturas o
                        where o.cliente_id = s.cliente_id
                          and o.id <> s.id
                          and o.status in ('solicitada', 'ativa')
                     )
                    then 'ativa'
                    else s.status
                  end,
         encerrada_em = case
                          when s.status = 'encerrada'
                           and s.expira_em > now()
                           and not exists (
                             select 1 from public.assinaturas o
                              where o.cliente_id = s.cliente_id
                                and o.id <> s.id
                                and o.status in ('solicitada', 'ativa')
                           )
                          then null
                          else s.encerrada_em
                        end
   where s.id = v_uso.assinatura_id;

  return new;
end;
$$;

drop trigger if exists trg_agendamentos_devolve_plano on public.agendamentos;
create trigger trg_agendamentos_devolve_plano
  after update of cancelado_em on public.agendamentos
  for each row execute function public.tg_agendamento_devolve_plano();

-- ---------------------------------------------------------------------
-- O JSON do agendamento passa a contar ao cliente o uso do plano.
-- ---------------------------------------------------------------------
create or replace function public.agendamento_json(p_agendamento_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id',              a.id,
    'codigo',          upper(substring(replace(a.id::text, '-', '') from 1 for 6)),
    'cliente',         a.cliente_nome,
    'telefone',        c.telefone,
    'servico',         a.servico_nome,
    'preco',           a.servico_preco,
    'duracao_minutos', a.servico_duracao,
    'data',            a.data,
    'horario_inicio',  to_char(a.horario_inicio, 'HH24:MI'),
    'horario_fim',     to_char(a.horario_fim, 'HH24:MI'),
    'inicio_em',       a.inicio_em,
    'fim_em',          a.fim_em,
    'status',          a.status,
    'cancelado',       a.cancelado_em is not null,
    'created_at',      a.created_at,
    'plano', (
      select jsonb_build_object(
               'nome',       s.plano_nome,
               'numero',     u.numero,
               'total',      s.cortes_total,
               'restantes',  s.cortes_total - u.numero,
               'expira_em',  s.expira_em
             )
        from public.plano_usos u
        join public.assinaturas s on s.id = u.assinatura_id
       where u.agendamento_id = a.id
    )
  )
  from public.agendamentos a
  join public.clientes c on c.id = a.cliente_id
  where a.id = p_agendamento_id;
$$;

-- O push do dono avisa quando o corte foi pelo plano.
create or replace function public.tg_notificacao_com_plano()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_txt text;
begin
  if new.tipo = 'novo_agendamento' and new.agendamento_id is not null then
    select ' · ' || s.plano_nome || ' (' || u.numero || '/' || s.cortes_total || ')'
      into v_txt
      from public.plano_usos u
      join public.assinaturas s on s.id = u.assinatura_id
     where u.agendamento_id = new.agendamento_id;

    if v_txt is not null then
      new.corpo := new.corpo || v_txt;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificacoes_com_plano on public.notificacoes;
create trigger trg_notificacoes_com_plano
  before insert on public.notificacoes
  for each row execute function public.tg_notificacao_com_plano();

-- ---------------------------------------------------------------------
-- SITE: pedir um plano
-- ---------------------------------------------------------------------
create or replace function public.solicitar_plano(
  p_plano_id uuid,
  p_nome     text,
  p_telefone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plano      public.planos%rowtype;
  v_nome       text;
  v_tel        text;
  v_cliente_id uuid;
  v_aberta     public.assinaturas%rowtype;
  v_id         uuid;
begin
  v_nome := public.normalizar_nome(p_nome);
  if v_nome is null or char_length(v_nome) < 2 then
    return public.resposta_erro('NOME_INVALIDO');
  end if;
  v_nome := left(v_nome, 80);

  v_tel := public.normalizar_telefone(p_telefone);
  if v_tel is null then
    return public.resposta_erro('TELEFONE_INVALIDO');
  end if;

  select * into v_plano from public.planos p where p.id = p_plano_id and p.ativo;
  if not found then
    return public.resposta_erro('PLANO_INDISPONIVEL');
  end if;

  perform pg_advisory_xact_lock(hashtext('barbearia_arte10:planos'));

  -- Freio contra robôs: poucos pedidos por janela de 10 minutos.
  if (select count(*) from public.assinaturas s
       where s.solicitada_em > now() - interval '10 minutes') >= 10 then
    return public.resposta_erro('MUITAS_TENTATIVAS');
  end if;

  insert into public.clientes (nome, telefone)
  values (v_nome, v_tel)
  on conflict (telefone) do update set nome = excluded.nome
  returning id into v_cliente_id;

  perform public.encerrar_planos_vencidos(v_cliente_id);

  select s.* into v_aberta
    from public.assinaturas s
   where s.cliente_id = v_cliente_id
     and s.status in ('solicitada', 'ativa');

  if found then
    return public.resposta_erro(
      case when v_aberta.status = 'ativa' then 'PLANO_JA_ATIVO' else 'PLANO_JA_SOLICITADO' end
    ) || jsonb_build_object('assinatura', public.assinatura_json(v_aberta.id));
  end if;

  insert into public.assinaturas (
    cliente_id, plano_id, cliente_nome, plano_nome, preco, cortes_total, validade_dias
  )
  values (
    v_cliente_id, v_plano.id, v_nome, v_plano.nome, v_plano.preco, v_plano.cortes,
    v_plano.validade_dias
  )
  returning id into v_id;

  insert into public.notificacoes (tipo, titulo, corpo, dados)
  values (
    'plano_solicitado',
    'Pedido de plano',
    v_nome || ' quer o ' || v_plano.nome || ' (R$ ' ||
      replace(to_char(v_plano.preco, 'FM999990.00'), '.', ',') ||
      '). Confirme o pagamento no app.',
    jsonb_build_object('assinatura_id', v_id, 'cliente', v_nome, 'plano', v_plano.nome)
  );

  return jsonb_build_object(
    'ok',         true,
    'assinatura', public.assinatura_json(v_id),
    'barbearia',  public.barbearia_json()
  );
end;
$$;

-- SITE: "Meu plano" (pelo telefone salvo no aparelho do cliente).
-- Devolve só o essencial do plano — nada de nome, nada de histórico.
create or replace function public.meu_plano(p_telefone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tel text;
  v_id  uuid;
begin
  v_tel := public.normalizar_telefone(p_telefone);
  if v_tel is null then
    return public.resposta_erro('TELEFONE_INVALIDO');
  end if;

  select s.id into v_id
    from public.assinaturas s
    join public.clientes c on c.id = s.cliente_id
   where c.telefone = v_tel
     and (
       s.status = 'solicitada'
       or (s.status = 'ativa' and s.expira_em > now())
       -- Plano que acabou há pouco ainda aparece ("seus cortes acabaram").
       or (s.status = 'encerrada' and s.encerrada_em > now() - interval '15 days')
     )
   order by case s.status when 'ativa' then 0 when 'solicitada' then 1 else 2 end,
            s.solicitada_em desc
   limit 1;

  return jsonb_build_object(
    'ok',    true,
    'plano', case when v_id is null then null else public.assinatura_json(v_id) end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- APP DO DONO
-- ---------------------------------------------------------------------
create or replace function public.ativar_assinatura(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s public.assinaturas%rowtype;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  select * into v_s from public.assinaturas where id = p_id for update;
  if not found then
    return public.resposta_erro('ASSINATURA_NAO_ENCONTRADA');
  end if;
  if v_s.status <> 'solicitada' then
    return public.resposta_erro('ASSINATURA_ESTADO');
  end if;

  update public.assinaturas
     set status     = 'ativa',
         ativada_em = now(),
         expira_em  = now() + make_interval(days => v_s.validade_dias)
   where id = p_id;

  return jsonb_build_object('ok', true, 'assinatura', public.assinatura_json(p_id));
end;
$$;

-- Recusa um pedido ou cancela um plano ativo.
create or replace function public.encerrar_assinatura(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s public.assinaturas%rowtype;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  select * into v_s from public.assinaturas where id = p_id for update;
  if not found then
    return public.resposta_erro('ASSINATURA_NAO_ENCONTRADA');
  end if;
  if v_s.status not in ('solicitada', 'ativa') then
    return public.resposta_erro('ASSINATURA_ESTADO');
  end if;

  update public.assinaturas
     set status       = case when v_s.status = 'solicitada' then 'recusada' else 'cancelada' end,
         encerrada_em = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'assinatura', public.assinatura_json(p_id));
end;
$$;

-- Cancela o horário de um cliente (antes de ele acontecer). O horário
-- volta a ficar livre no site e, se usou plano, o corte é devolvido.
create or replace function public.cancelar_agendamento(p_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_a public.agendamentos%rowtype;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  select * into v_a from public.agendamentos where id = p_id for update;
  if not found then
    return public.resposta_erro('AGENDAMENTO_NAO_ENCONTRADO');
  end if;
  if v_a.cancelado_em is not null then
    return public.resposta_erro('AGENDAMENTO_JA_CANCELADO');
  end if;
  if v_a.inicio_em <= now() or v_a.status <> 'agendado' then
    return public.resposta_erro('CANCELAMENTO_TARDE');
  end if;

  update public.agendamentos
     set cancelado_em     = now(),
         cancelado_motivo = nullif(left(btrim(coalesce(p_motivo, '')), 300), '')
   where id = p_id;

  return jsonb_build_object('ok', true, 'agendamento', public.agendamento_json(p_id));
end;
$$;

-- Muda a ordem dos serviços (a ordem da lista é a ordem no site).
create or replace function public.reordenar_servicos(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  if p_ids is null
     or cardinality(p_ids) = 0
     or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x)
     or exists (select 1 from unnest(p_ids) x
                 where not exists (select 1 from public.servicos s where s.id = x)) then
    return public.resposta_erro('SERVICOS_INVALIDOS');
  end if;

  update public.servicos s
     set ordem = o.pos
    from unnest(p_ids) with ordinality as o(id, pos)
   where s.id = o.id
     and s.ordem is distinct from o.pos::integer;

  return jsonb_build_object('ok', true);
end;
$$;

-- Planos dos clientes, para a tela "Clube" do app.
drop view if exists public.assinaturas_resumo;

create view public.assinaturas_resumo
with (security_invoker = true) as
select
  s.id,
  s.cliente_nome,
  c.telefone      as cliente_telefone,
  s.plano_nome,
  s.preco,
  s.cortes_total,
  s.cortes_usados,
  s.status,
  s.solicitada_em,
  s.ativada_em,
  s.expira_em,
  s.encerrada_em
from public.assinaturas s
join public.clientes c on c.id = s.cliente_id;

-- ---------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------
alter table public.planos      enable row level security;
alter table public.promocoes   enable row level security;
alter table public.assinaturas enable row level security;
alter table public.plano_usos  enable row level security;

revoke all on public.planos, public.promocoes, public.assinaturas, public.plano_usos
  from public, anon, authenticated;
revoke all on public.assinaturas_resumo from public, anon, authenticated;

-- Planos e promoções: o site lê os ativos; o dono lê e edita tudo.
grant select on public.planos, public.promocoes to anon, authenticated;
grant insert, update, delete on public.planos, public.promocoes to authenticated;
grant select on public.assinaturas, public.plano_usos to authenticated;
grant select on public.assinaturas_resumo to authenticated;

drop policy if exists planos_publico on public.planos;
create policy planos_publico
  on public.planos for select
  to anon
  using (ativo);

drop policy if exists planos_leitura_app on public.planos;
create policy planos_leitura_app
  on public.planos for select
  to authenticated
  using (ativo or (select public.is_admin()));

drop policy if exists planos_admin_escrita on public.planos;
create policy planos_admin_escrita
  on public.planos for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists promocoes_publico on public.promocoes;
create policy promocoes_publico
  on public.promocoes for select
  to anon
  using (ativo);

drop policy if exists promocoes_leitura_app on public.promocoes;
create policy promocoes_leitura_app
  on public.promocoes for select
  to authenticated
  using (ativo or (select public.is_admin()));

drop policy if exists promocoes_admin_escrita on public.promocoes;
create policy promocoes_admin_escrita
  on public.promocoes for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Pedidos e planos dos clientes: dado pessoal, só o dono lê. Ninguém
-- escreve direto (só pelas funções acima).
drop policy if exists assinaturas_admin_leitura on public.assinaturas;
create policy assinaturas_admin_leitura
  on public.assinaturas for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists plano_usos_admin_leitura on public.plano_usos;
create policy plano_usos_admin_leitura
  on public.plano_usos for select
  to authenticated
  using ((select public.is_admin()));

revoke all on function public.encerrar_planos_vencidos(uuid)   from public, anon, authenticated;
revoke all on function public.assinatura_json(uuid)            from public, anon, authenticated;

revoke all on function public.ativar_assinatura(uuid)          from public, anon;
revoke all on function public.encerrar_assinatura(uuid)        from public, anon;
revoke all on function public.cancelar_agendamento(uuid, text) from public, anon;
revoke all on function public.reordenar_servicos(uuid[])       from public, anon;
revoke all on function public.tg_agendamento_usa_plano()       from public, anon;
revoke all on function public.tg_agendamento_devolve_plano()   from public, anon;
revoke all on function public.tg_notificacao_com_plano()       from public, anon;

grant execute on function public.solicitar_plano(uuid, text, text)      to anon, authenticated;
grant execute on function public.meu_plano(text)                        to anon, authenticated;
grant execute on function public.ativar_assinatura(uuid)                to authenticated;
grant execute on function public.encerrar_assinatura(uuid)              to authenticated;
grant execute on function public.cancelar_agendamento(uuid, text)       to authenticated;
grant execute on function public.reordenar_servicos(uuid[])             to authenticated;
grant execute on function public.tg_agendamento_devolve_plano()         to authenticated;

-- ---------------------------------------------------------------------
-- Conteúdo inicial do Clube (o dono muda depois pelo Supabase).
-- Só entra se ainda não existir nada — rodar de novo não duplica.
-- ---------------------------------------------------------------------
insert into public.planos (nome, chamada, preco, preco_referencia, cortes, validade_dias, beneficios, destaque, ordem)
select * from (values
  ('Plano Classic', null::text, 65.00, 70.00, 2, 30,
   array['2 cortes de cabelo', 'Válido por 30 dias'], false, 1),
  ('Plano Elite', '4 cortes no mês por apenas R$ 110!', 110.00, 140.00, 4, 30,
   array['4 cortes de cabelo', 'Válido por 30 dias'], true, 2)
) v(nome, chamada, preco, preco_referencia, cortes, validade_dias, beneficios, destaque, ordem)
where not exists (select 1 from public.planos);

insert into public.promocoes (titulo, chamada, descricao, itens, observacao, ordem)
select * from (values
  ('Cliente Fiel',
   'A cada 10 cortes realizados, o 11º corte é por nossa conta!',
   'Quanto mais você vem, mais você ganha.',
   array[]::text[],
   'Válido para cortes de cabelo.', 1),
  ('Corrente',
   'A cada amigo novo que você trouxer, ganha R$ 5 de desconto no seu corte na hora!',
   'Seu amigo paga R$ 35 pelo corte e ganha uma sobrancelha de mimo!',
   array['1 amigo → corte por R$ 30', '2 amigos → corte por R$ 25', '3 amigos → corte por R$ 20'],
   'Válido para novos clientes que fizerem o corte.', 2)
) v(titulo, chamada, descricao, itens, observacao, ordem)
where not exists (select 1 from public.promocoes);

-- O corte de cabelo é o serviço que o plano cobre (só se nenhum foi marcado ainda).
update public.servicos
   set usa_plano = true
 where lower(btrim(nome)) in ('corte de cabelo', 'corte')
   and not exists (select 1 from public.servicos where usa_plano);
