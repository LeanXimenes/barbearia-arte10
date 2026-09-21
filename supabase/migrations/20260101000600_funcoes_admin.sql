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
  v_ini_ts  timestamp;
  v_fim_ts  timestamp;
  v_ini     timestamptz;
  v_fim     timestamptz;
  v_range   tstzrange;
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
      p_data, p_horario_inicio, p_horario_fim, v_ini, v_fim,
      nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid()
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
      'motivo',         nullif(btrim(coalesce(p_motivo, '')), '')
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
-- Devolve a linha do tempo completa do dia, com os quatro estados
-- exigidos no item 12: AGENDADO, BLOQUEADO, DISPONIVEL e
-- FORA DO EXPEDIENTE (representado por "aberto: false" / intervalo).
-- ---------------------------------------------------------------------
create or replace function public.agenda_do_dia(p_data date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg      public.config_barbearia%rowtype;
  v_h        public.config_horarios%rowtype;
  v_passo    interval;
  v_abre_ts  timestamp;
  v_fecha_ts timestamp;
  v_cursor   timestamp;
  v_itens    jsonb := '[]'::jsonb;
  v_oc       record;
  v_ate      timestamp;
  v_agora    timestamptz := now();
  v_qtd_ag   integer := 0;
  v_qtd_bl   integer := 0;
  v_qtd_liv  integer := 0;
  v_proximo  jsonb := null;
  v_proximos_livres jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  select * into v_cfg from public.config_barbearia where id;
  if not found then
    return public.resposta_erro('CONFIG_AUSENTE');
  end if;

  select * into v_h
    from public.config_horarios
   where dia_semana = extract(dow from p_data)::smallint;

  if not found or not v_h.aberto then
    -- Dia fechado: ainda assim mostramos bloqueios/agendamentos
    -- eventualmente existentes, para nunca esconder um compromisso.
    for v_oc in
      select 'agendamento' as tipo, a.inicio_em, a.fim_em, a.horario_inicio, a.horario_fim,
             a.id, a.status::text as status, a.servico_nome, a.servico_preco, a.servico_duracao,
             c.nome as cliente_nome, c.telefone as cliente_telefone, a.created_at, null::text as motivo
        from public.agendamentos a
        join public.clientes c on c.id = a.cliente_id
       where a.data = p_data
      union all
      select 'bloqueio', b.inicio_em, b.fim_em, b.horario_inicio, b.horario_fim,
             b.id, null, null, null, null, null, null, b.created_at, b.motivo
        from public.bloqueios b
       where b.data = p_data
      order by inicio_em
    loop
      if v_oc.tipo = 'agendamento' then v_qtd_ag := v_qtd_ag + 1; else v_qtd_bl := v_qtd_bl + 1; end if;
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'tipo',             v_oc.tipo,
        'id',               v_oc.id,
        'horario_inicio',   to_char(v_oc.horario_inicio, 'HH24:MI'),
        'horario_fim',      to_char(v_oc.horario_fim, 'HH24:MI'),
        'inicio_em',        v_oc.inicio_em,
        'fim_em',           v_oc.fim_em,
        'cliente_nome',     v_oc.cliente_nome,
        'cliente_telefone', v_oc.cliente_telefone,
        'servico_nome',     v_oc.servico_nome,
        'servico_preco',    v_oc.servico_preco,
        'duracao_minutos',  v_oc.servico_duracao,
        'status',           v_oc.status,
        'motivo',           v_oc.motivo,
        'criado_em',        v_oc.created_at
      ));
    end loop;

    return jsonb_build_object(
      'ok', true, 'data', p_data, 'aberto', false,
      'abre', null, 'fecha', null, 'intervalo', null,
      'itens', v_itens,
      'resumo', jsonb_build_object(
        'agendamentos', v_qtd_ag, 'bloqueios', v_qtd_bl, 'livres', 0
      ),
      'proximo', null,
      'proximos_livres', '[]'::jsonb
    );
  end if;

  v_passo    := make_interval(mins => v_cfg.granularidade_minutos);
  v_abre_ts  := p_data + v_h.abre;
  v_fecha_ts := p_data + v_h.fecha;
  v_cursor   := v_abre_ts;

  for v_oc in
    -- Agendamentos, bloqueios e o intervalo tratados como "ocupacoes".
    select 'agendamento' as tipo, a.inicio_em, a.fim_em,
           (a.inicio_em at time zone v_cfg.fuso)::timestamp as ini_ts,
           (a.fim_em at time zone v_cfg.fuso)::timestamp    as fim_ts,
           a.id, a.status::text as status, a.servico_nome, a.servico_preco,
           a.servico_duracao, c.nome as cliente_nome, c.telefone as cliente_telefone,
           a.created_at, null::text as motivo
      from public.agendamentos a
      join public.clientes c on c.id = a.cliente_id
     where a.periodo && tstzrange(v_abre_ts at time zone v_cfg.fuso, v_fecha_ts at time zone v_cfg.fuso, '[)')
    union all
    select 'bloqueio', b.inicio_em, b.fim_em,
           (b.inicio_em at time zone v_cfg.fuso)::timestamp,
           (b.fim_em at time zone v_cfg.fuso)::timestamp,
           b.id, null, null, null, null, null, null, b.created_at, b.motivo
      from public.bloqueios b
     where b.periodo && tstzrange(v_abre_ts at time zone v_cfg.fuso, v_fecha_ts at time zone v_cfg.fuso, '[)')
    union all
    select 'intervalo', null::timestamptz, null::timestamptz,
           p_data + v_h.intervalo_inicio, p_data + v_h.intervalo_fim,
           null::uuid, null, null, null, null, null, null, null::timestamptz, 'Intervalo'
     where v_h.intervalo_inicio is not null
    order by ini_ts
  loop
    -- Preenche os espacos livres ate o inicio da proxima ocupacao.
    while v_cursor + v_passo <= v_oc.ini_ts loop
      v_qtd_liv := v_qtd_liv + 1;
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'tipo',           'livre',
        'horario_inicio', to_char(v_cursor::time, 'HH24:MI'),
        'horario_fim',    to_char((v_cursor + v_passo)::time, 'HH24:MI'),
        'inicio_em',      v_cursor at time zone v_cfg.fuso,
        'fim_em',         (v_cursor + v_passo) at time zone v_cfg.fuso,
        'passado',        (v_cursor at time zone v_cfg.fuso) < v_agora
      ));
      if (v_cursor at time zone v_cfg.fuso) >= v_agora and jsonb_array_length(v_proximos_livres) < 3 then
        v_proximos_livres := v_proximos_livres || jsonb_build_array(to_char(v_cursor::time, 'HH24:MI'));
      end if;
      v_cursor := v_cursor + v_passo;
    end loop;

    if v_oc.tipo = 'agendamento' then
      v_qtd_ag := v_qtd_ag + 1;
      if v_proximo is null and v_oc.inicio_em >= v_agora then
        v_proximo := jsonb_build_object(
          'cliente', v_oc.cliente_nome,
          'servico', v_oc.servico_nome,
          'horario', to_char(v_oc.ini_ts::time, 'HH24:MI')
        );
      end if;
    elsif v_oc.tipo = 'bloqueio' then
      v_qtd_bl := v_qtd_bl + 1;
    end if;

    v_itens := v_itens || jsonb_build_array(jsonb_build_object(
      'tipo',             v_oc.tipo,
      'id',               v_oc.id,
      'horario_inicio',   to_char(v_oc.ini_ts::time, 'HH24:MI'),
      'horario_fim',      to_char(v_oc.fim_ts::time, 'HH24:MI'),
      'inicio_em',        v_oc.inicio_em,
      'fim_em',           v_oc.fim_em,
      'cliente_nome',     v_oc.cliente_nome,
      'cliente_telefone', v_oc.cliente_telefone,
      'servico_nome',     v_oc.servico_nome,
      'servico_preco',    v_oc.servico_preco,
      'duracao_minutos',  v_oc.servico_duracao,
      'status',           v_oc.status,
      'motivo',           v_oc.motivo,
      'criado_em',        v_oc.created_at
    ));

    if v_oc.fim_ts > v_cursor then
      v_cursor := v_oc.fim_ts;
    end if;
  end loop;

  -- Sobra final do expediente.
  while v_cursor + v_passo <= v_fecha_ts loop
    v_qtd_liv := v_qtd_liv + 1;
    v_itens := v_itens || jsonb_build_array(jsonb_build_object(
      'tipo',           'livre',
      'horario_inicio', to_char(v_cursor::time, 'HH24:MI'),
      'horario_fim',    to_char((v_cursor + v_passo)::time, 'HH24:MI'),
      'inicio_em',      v_cursor at time zone v_cfg.fuso,
      'fim_em',         (v_cursor + v_passo) at time zone v_cfg.fuso,
      'passado',        (v_cursor at time zone v_cfg.fuso) < v_agora
    ));
    if (v_cursor at time zone v_cfg.fuso) >= v_agora and jsonb_array_length(v_proximos_livres) < 3 then
      v_proximos_livres := v_proximos_livres || jsonb_build_array(to_char(v_cursor::time, 'HH24:MI'));
    end if;
    v_cursor := v_cursor + v_passo;
  end loop;

  return jsonb_build_object(
    'ok',     true,
    'data',   p_data,
    'aberto', true,
    'abre',   to_char(v_h.abre, 'HH24:MI'),
    'fecha',  to_char(v_h.fecha, 'HH24:MI'),
    'intervalo', case when v_h.intervalo_inicio is null then null else jsonb_build_object(
      'inicio', to_char(v_h.intervalo_inicio, 'HH24:MI'),
      'fim',    to_char(v_h.intervalo_fim, 'HH24:MI')
    ) end,
    'itens',  v_itens,
    'resumo', jsonb_build_object(
      'agendamentos', v_qtd_ag,
      'bloqueios',    v_qtd_bl,
      'livres',       v_qtd_liv
    ),
    'proximo',         v_proximo,
    'proximos_livres', v_proximos_livres
  );
end;
$$;

-- ---------------------------------------------------------------------
-- visao_geral_periodo: pinta o calendario mensal do aplicativo.
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
    return;
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

  if p_token is null or char_length(btrim(p_token)) < 10 then
    return public.resposta_erro('DADOS_INCOMPLETOS');
  end if;

  insert into public.dispositivos_push (user_id, token, modelo, plataforma, ativo)
  values (auth.uid(), btrim(p_token), p_modelo, 'android', true)
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
-- concluir_atendimento: unica alteracao permitida em um agendamento.
-- Nao libera o horario, apenas registra o desfecho.
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
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  if p_status not in ('agendado', 'concluido', 'nao_compareceu') then
    return public.resposta_erro('PERIODO_INVALIDO');
  end if;

  update public.agendamentos
     set status = p_status::public.agendamento_status
   where id = p_id;

  if not found then
    return public.resposta_erro('DADOS_INCOMPLETOS');
  end if;

  return jsonb_build_object('ok', true, 'agendamento', public.agendamento_json(p_id));
end;
$$;
