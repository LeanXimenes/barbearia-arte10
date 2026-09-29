-- =====================================================================
-- BARBEARIA ARTE 10 — 06. Funcoes do proprietario (aplicativo Android)
-- =====================================================================
-- Todas exigem um usuario autenticado que exista em public.administradores.
-- =====================================================================

-- ---------------------------------------------------------------------
-- criar_bloqueio: fecha um periodo LIVRE (item 15).
-- Nunca sobrepoe um agendamento de cliente.
-- ---------------------------------------------------------------------
create or replace function public.criar_bloqueio(
  p_data           date,
  p_horario_inicio time,
  p_horario_fim    time,
  p_motivo         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg     public.config_barbearia%rowtype;
  v_h       public.config_horarios%rowtype;
  v_ini_ts  timestamp;
  v_fim_ts  timestamp;
  v_ini     timestamptz;
  v_fim     timestamptz;
  v_range   tstzrange;
  v_motivo  text;
  v_id      uuid;
  v_falha   text;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  if p_data is null or p_horario_inicio is null or p_horario_fim is null
     or p_horario_fim <= p_horario_inicio then
    return public.resposta_erro('PERIODO_INVALIDO');
  end if;

  select * into v_cfg from public.config_barbearia where id;
  if not found then
    return public.resposta_erro('CONFIG_AUSENTE');
  end if;

  v_ini_ts := p_data + p_horario_inicio;
  v_fim_ts := p_data + p_horario_fim;
  v_ini    := v_ini_ts at time zone v_cfg.fuso;
  v_fim    := v_fim_ts at time zone v_cfg.fuso;
  v_range  := tstzrange(v_ini, v_fim, '[)');
  v_motivo := left(nullif(btrim(coalesce(p_motivo, '')), ''), 200);

  -- Bloquear o que já passou não tem efeito nenhum para o cliente.
  if v_fim <= now() then
    return public.resposta_erro('HORARIO_PASSADO');
  end if;

  -- Dia fechado já não recebe agendamentos: um bloqueio ali seria só ruído.
  select * into v_h
    from public.config_horarios
   where dia_semana = extract(dow from p_data)::smallint;

  if not found or not v_h.aberto then
    return public.resposta_erro('DIA_FECHADO');
  end if;

  -- Fora do expediente o site também não oferece nada.
  if v_ini_ts < p_data + v_h.abre or v_fim_ts > p_data + v_h.fecha then
    return public.resposta_erro('FORA_EXPEDIENTE');
  end if;

  -- Serializa com criar_agendamento: ou entra a reserva, ou entra o bloqueio.
  perform pg_advisory_xact_lock(hashtext('barbearia_arte10:agenda'));

  -- REGRA: bloquear nunca pode apagar/atropelar o agendamento de um cliente.
  if exists (select 1 from public.agendamentos a where a.periodo && v_range) then
    return public.resposta_erro('EXISTE_AGENDAMENTO');
  end if;

  begin
    insert into public.bloqueios (
      data, horario_inicio, horario_fim, inicio_em, fim_em, motivo, criado_por
    )
    values (
      p_data, p_horario_inicio, p_horario_fim, v_ini, v_fim, v_motivo, auth.uid()
    )
    returning id into v_id;
  exception
    when exclusion_violation then
      v_falha := 'JA_BLOQUEADO';
  end;

  if v_falha is not null then
    return public.resposta_erro(v_falha);
  end if;

  return jsonb_build_object(
    'ok', true,
    'bloqueio', jsonb_build_object(
      'id',             v_id,
      'data',           p_data,
      'horario_inicio', to_char(p_horario_inicio, 'HH24:MI'),
      'horario_fim',    to_char(p_horario_fim, 'HH24:MI'),
      'motivo',         v_motivo
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- remover_bloqueio: desbloqueia (item 16).
-- Opera EXCLUSIVAMENTE na tabela de bloqueios. Nao existe caminho, aqui
-- ou em qualquer outro lugar da API, que transforme um agendamento de
-- cliente em horario livre.
-- ---------------------------------------------------------------------
create or replace function public.remover_bloqueio(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_removidos integer;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  if p_id is null then
    return public.resposta_erro('BLOQUEIO_NAO_ENCONTRADO');
  end if;

  delete from public.bloqueios where id = p_id;
  get diagnostics v_removidos = row_count;

  if v_removidos = 0 then
    return public.resposta_erro('BLOQUEIO_NAO_ENCONTRADO');
  end if;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

-- ---------------------------------------------------------------------
-- agenda_do_dia: alimenta o painel e o calendario do aplicativo.
--
-- Devolve a linha do tempo do dia com os estados do item 12:
--   agendamento  (AGENDADO)
--   bloqueio     (BLOQUEADO)
--   livre        (DISPONÍVEL)
--   intervalo / fora_expediente (FORA DO EXPEDIENTE)
--
-- Regras:
--   * Agendamentos e bloqueios são buscados pela DATA, nunca pelo
--     expediente atual: se o dono encurtar o horário depois de haver
--     clientes marcados, eles continuam aparecendo (marcados com
--     "fora_expediente").
--   * Os horários livres usam a MESMA grade que o site oferece ao cliente
--     (a partir da abertura, de granularidade em granularidade), para o
--     dono e o cliente enxergarem os mesmos horários.
-- ---------------------------------------------------------------------
create or replace function public.agenda_do_dia(p_data date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg       public.config_barbearia%rowtype;
  v_h         public.config_horarios%rowtype;
  v_aberto    boolean := false;
  v_passo     interval;
  v_abre_ts   timestamp;
  v_fecha_ts  timestamp;
  v_int_ini   timestamp;
  v_int_fim   timestamp;
  v_agora     timestamptz := now();
  v_itens     jsonb;
  v_resumo    jsonb;
  v_proximo   jsonb;
  v_livres    jsonb;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  if p_data is null then
    return public.resposta_erro('PERIODO_INVALIDO');
  end if;

  select * into v_cfg from public.config_barbearia where id;
  if not found then
    return public.resposta_erro('CONFIG_AUSENTE');
  end if;

  select * into v_h
    from public.config_horarios
   where dia_semana = extract(dow from p_data)::smallint;

  v_aberto := found and v_h.aberto;
  v_passo  := make_interval(mins => v_cfg.granularidade_minutos);

  if v_aberto then
    v_abre_ts  := p_data + v_h.abre;
    v_fecha_ts := p_data + v_h.fecha;
    if v_h.intervalo_inicio is not null then
      v_int_ini := p_data + v_h.intervalo_inicio;
      v_int_fim := p_data + v_h.intervalo_fim;
    end if;
  end if;

  with ocupacoes as (
    select 'agendamento'::text                                as tipo,
           a.id,
           a.inicio_em,
           a.fim_em,
           (a.inicio_em at time zone v_cfg.fuso)::timestamp  as ini_ts,
           (a.fim_em at time zone v_cfg.fuso)::timestamp     as fim_ts,
           a.status::text                                     as status,
           a.servico_nome,
           a.servico_preco,
           a.servico_duracao,
           a.cliente_nome,
           c.telefone                                         as cliente_telefone,
           a.created_at,
           null::text                                         as motivo
      from public.agendamentos a
      join public.clientes c on c.id = a.cliente_id
     where a.data = p_data
    union all
    select 'bloqueio', b.id, b.inicio_em, b.fim_em,
           (b.inicio_em at time zone v_cfg.fuso)::timestamp,
           (b.fim_em at time zone v_cfg.fuso)::timestamp,
           null, null, null, null, null, null, b.created_at, b.motivo
      from public.bloqueios b
     where b.data = p_data
    union all
    select 'intervalo', null::uuid,
           v_int_ini at time zone v_cfg.fuso,
           v_int_fim at time zone v_cfg.fuso,
           v_int_ini, v_int_fim,
           null, null, null, null, null, null, null::timestamptz, 'Intervalo'
     where v_int_ini is not null
  ),
  grade as (
    -- Mesma grade do site: começa na abertura e anda de passo em passo.
    select t as ini_ts, t + v_passo as fim_ts
      from generate_series(v_abre_ts, v_fecha_ts - v_passo, v_passo) as t
     where v_aberto
  ),
  livres as (
    select g.ini_ts, g.fim_ts,
           g.ini_ts at time zone v_cfg.fuso as inicio_em,
           g.fim_ts at time zone v_cfg.fuso as fim_em
      from grade g
     where not exists (
       select 1 from ocupacoes o
        where o.ini_ts < g.fim_ts and o.fim_ts > g.ini_ts
     )
  ),
  itens as (
    select o.ini_ts,
           case o.tipo when 'intervalo' then 0 when 'agendamento' then 1 else 2 end as ordem,
           jsonb_build_object(
             'tipo',             o.tipo,
             'id',               o.id,
             'horario_inicio',   to_char(o.ini_ts, 'HH24:MI'),
             'horario_fim',      to_char(o.fim_ts, 'HH24:MI'),
             'inicio_em',        o.inicio_em,
             'fim_em',           o.fim_em,
             'cliente_nome',     o.cliente_nome,
             'cliente_telefone', o.cliente_telefone,
             'servico_nome',     o.servico_nome,
             'servico_preco',    o.servico_preco,
             'duracao_minutos',  o.servico_duracao,
             'status',           o.status,
             'motivo',           o.motivo,
             'criado_em',        o.created_at,
             'passado',          o.fim_em <= v_agora,
             'fora_expediente',  o.tipo <> 'intervalo' and (
                                   not v_aberto
                                   or o.ini_ts < v_abre_ts
                                   or o.fim_ts > v_fecha_ts
                                 )
           ) as item
      from ocupacoes o
    union all
    select l.ini_ts, 3,
           jsonb_build_object(
             'tipo',           'livre',
             'horario_inicio', to_char(l.ini_ts, 'HH24:MI'),
             'horario_fim',    to_char(l.fim_ts, 'HH24:MI'),
             'inicio_em',      l.inicio_em,
             'fim_em',         l.fim_em,
             'passado',        l.inicio_em < v_agora,
             'fora_expediente', false
           )
      from livres l
  )
  select
    coalesce((select jsonb_agg(i.item order by i.ini_ts, i.ordem) from itens i), '[]'::jsonb),
    jsonb_build_object(
      'agendamentos', (select count(*) from ocupacoes where tipo = 'agendamento'),
      'bloqueios',    (select count(*) from ocupacoes where tipo = 'bloqueio'),
      -- "Livres" = o que ainda dá para oferecer hoje (não conta o que passou).
      'livres',       (select count(*) from livres where inicio_em >= v_agora)
    ),
    (select jsonb_build_object(
              'cliente', o.cliente_nome,
              'servico', o.servico_nome,
              'horario', to_char(o.ini_ts, 'HH24:MI'))
       from ocupacoes o
      where o.tipo = 'agendamento'
        and o.status = 'agendado'
        and o.inicio_em >= v_agora
      order by o.inicio_em
      limit 1),
    coalesce((select jsonb_agg(to_char(x.ini_ts, 'HH24:MI') order by x.ini_ts)
                from (select ini_ts from livres
                       where inicio_em >= v_agora
                       order by ini_ts
                       limit 3) x), '[]'::jsonb)
  into v_itens, v_resumo, v_proximo, v_livres;

  return jsonb_build_object(
    'ok',     true,
    'data',   p_data,
    'aberto', v_aberto,
    'abre',   case when v_aberto then to_char(v_h.abre, 'HH24:MI') end,
    'fecha',  case when v_aberto then to_char(v_h.fecha, 'HH24:MI') end,
    'intervalo', case when v_int_ini is null then null else jsonb_build_object(
      'inicio', to_char(v_h.intervalo_inicio, 'HH24:MI'),
      'fim',    to_char(v_h.intervalo_fim, 'HH24:MI')
    ) end,
    'itens',           v_itens,
    'resumo',          v_resumo,
    'proximo',         v_proximo,
    'proximos_livres', v_livres
  );
end;
$$;

-- ---------------------------------------------------------------------
-- visao_geral_periodo: pinta o calendario do aplicativo.
-- Quem não é administrador recebe ERRO (e não uma lista vazia, que
-- pareceria "agenda sem clientes").
-- ---------------------------------------------------------------------
create or replace function public.visao_geral_periodo(p_inicio date, p_fim date)
returns table (
  data          date,
  aberto        boolean,
  agendamentos  integer,
  bloqueios     integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'NAO_AUTORIZADO' using errcode = '42501';
  end if;

  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    return;
  end if;

  if p_fim - p_inicio > 92 then
    p_fim := p_inicio + 92;
  end if;

  return query
    select g::date                                          as data,
           coalesce(h.aberto, false)                        as aberto,
           coalesce(ag.qtd, 0)::integer                     as agendamentos,
           coalesce(bl.qtd, 0)::integer                     as bloqueios
      from generate_series(p_inicio, p_fim, interval '1 day') g
      left join public.config_horarios h
        on h.dia_semana = extract(dow from g)::smallint
      left join lateral (
        select count(*) as qtd from public.agendamentos a where a.data = g::date
      ) ag on true
      left join lateral (
        select count(*) as qtd from public.bloqueios b where b.data = g::date
      ) bl on true
      order by g;
end;
$$;

-- ---------------------------------------------------------------------
-- registrar_dispositivo: guarda o token FCM do celular do proprietario.
-- ---------------------------------------------------------------------
create or replace function public.registrar_dispositivo(
  p_token   text,
  p_modelo  text default null
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

  if p_token is null or char_length(btrim(p_token)) not between 10 and 4096 then
    return public.resposta_erro('DADOS_INCOMPLETOS');
  end if;

  insert into public.dispositivos_push (user_id, token, modelo, plataforma, ativo)
  values (auth.uid(), btrim(p_token), left(p_modelo, 120), 'android', true)
  on conflict (token) do update
    set user_id    = excluded.user_id,
        modelo     = coalesce(excluded.modelo, public.dispositivos_push.modelo),
        ativo      = true,
        updated_at = now()
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------
-- atualizar_status_agendamento: única alteração permitida em um
-- agendamento. Registra o desfecho do atendimento — não libera o horário.
-- Só vale depois que o horário começou (o gatilho de imutabilidade
-- também garante isso, mesmo por acesso direto).
-- ---------------------------------------------------------------------
create or replace function public.atualizar_status_agendamento(
  p_id     uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inicio timestamptz;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  if p_status is null or p_status not in ('agendado', 'concluido', 'nao_compareceu') then
    return public.resposta_erro('STATUS_INVALIDO');
  end if;

  select a.inicio_em into v_inicio from public.agendamentos a where a.id = p_id;
  if not found then
    return public.resposta_erro('AGENDAMENTO_NAO_ENCONTRADO');
  end if;

  if v_inicio > now() then
    return public.resposta_erro('ATENDIMENTO_NAO_COMECOU');
  end if;

  update public.agendamentos
     set status = p_status::public.agendamento_status
   where id = p_id;

  return jsonb_build_object('ok', true, 'agendamento', public.agendamento_json(p_id));
end;
$$;
