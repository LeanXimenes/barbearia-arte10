-- =====================================================================
-- BARBEARIA ARTE 10 — 05. Criacao de agendamento (fluxo do cliente)
-- =====================================================================
-- Este e o unico caminho pelo qual o site consegue gravar um
-- agendamento. O cliente anonimo NAO tem INSERT direto em nenhuma
-- tabela: ele so pode chamar esta funcao, que revalida tudo do zero
-- no servidor (itens 7, 23 e 34).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Monta o JSON de retorno de um agendamento (usado no sucesso e na
-- resposta idempotente).
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
    'cliente',         c.nome,
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
    'created_at',      a.created_at
  )
  from public.agendamentos a
  join public.clientes c on c.id = a.cliente_id
  where a.id = p_agendamento_id;
$$;

create or replace function public.barbearia_json()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'nome',              cfg.nome,
    'endereco',          cfg.endereco,
    'cidade',            cfg.cidade,
    'uf',                cfg.uf,
    'telefone_whatsapp', cfg.telefone_whatsapp,
    'instagram',         cfg.instagram,
    'mapa_url',          cfg.mapa_url
  )
  from public.config_barbearia cfg
  where cfg.id;
$$;

-- ---------------------------------------------------------------------
-- criar_agendamento
-- ---------------------------------------------------------------------
create or replace function public.criar_agendamento(
  p_servico_id      uuid,
  p_data            date,
  p_horario_inicio  time,
  p_nome            text,
  p_telefone        text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg       public.config_barbearia%rowtype;
  v_h         public.config_horarios%rowtype;
  v_srv       public.servicos%rowtype;
  v_nome      text;
  v_tel       text;
  v_chave     text;
  v_ini_ts    timestamp;
  v_fim_ts    timestamp;
  v_ini       timestamptz;
  v_fim       timestamptz;
  v_range     tstzrange;
  v_cliente_id uuid;
  v_agendamento_id uuid;
  v_existente uuid;
  v_futuros   integer;
  v_falha     text;
  v_passo_seg bigint;
begin
  v_chave := nullif(btrim(coalesce(p_idempotency_key, '')), '');

  -- 0) IDEMPOTENCIA (item 21): a mesma chave sempre devolve a mesma reserva.
  if v_chave is not null then
    select a.id into v_existente
      from public.agendamentos a
     where a.idempotency_key = v_chave;

    if found then
      return jsonb_build_object(
        'ok',          true,
        'duplicado',   true,
        'agendamento', public.agendamento_json(v_existente),
        'barbearia',   public.barbearia_json()
      );
    end if;
  end if;

  select * into v_cfg from public.config_barbearia where id;
  if not found then
    return public.resposta_erro('CONFIG_AUSENTE');
  end if;

  -- 1) Dados obrigatorios.
  if p_servico_id is null or p_data is null or p_horario_inicio is null then
    return public.resposta_erro('DADOS_INCOMPLETOS');
  end if;

  v_nome := public.normalizar_nome(p_nome);
  if v_nome is null or char_length(v_nome) < 2 then
    return public.resposta_erro('NOME_INVALIDO');
  end if;
  v_nome := left(v_nome, 80);

  v_tel := public.normalizar_telefone(p_telefone);
  if v_tel is null then
    return public.resposta_erro('TELEFONE_INVALIDO');
  end if;

  -- 2) Servico precisa existir e estar ativo (item 27).
  select * into v_srv from public.servicos s where s.id = p_servico_id;
  if not found then
    return public.resposta_erro('SERVICO_NAO_ENCONTRADO');
  end if;
  if not v_srv.ativo then
    return public.resposta_erro('SERVICO_INDISPONIVEL');
  end if;

  -- 3) Periodo real ocupado = horario escolhido + duracao do servico (item 8).
  v_ini_ts := p_data + p_horario_inicio;
  v_fim_ts := v_ini_ts + make_interval(mins => v_srv.duracao_minutos);
  v_ini    := v_ini_ts at time zone v_cfg.fuso;
  v_fim    := v_fim_ts at time zone v_cfg.fuso;
  v_range  := tstzrange(v_ini, v_fim, '[)');

  -- 4) Nunca aceitar horario passado, mesmo vindo de uma pagina antiga (item 24).
  if v_ini < now() + make_interval(mins => v_cfg.antecedencia_minima_minutos) then
    return public.resposta_erro('HORARIO_PASSADO');
  end if;

  -- 5) Janela maxima de agendamento.
  if p_data > (now() at time zone v_cfg.fuso)::date + v_cfg.antecedencia_maxima_dias then
    return public.resposta_erro('DATA_MUITO_DISTANTE');
  end if;

  -- 6) Dia precisa estar aberto (item 25).
  select * into v_h
    from public.config_horarios
   where dia_semana = extract(dow from p_data)::smallint;

  if not found or not v_h.aberto then
    return public.resposta_erro('DIA_FECHADO');
  end if;

  -- 7) O servico inteiro precisa caber no expediente.
  if v_ini_ts < p_data + v_h.abre or v_fim_ts > p_data + v_h.fecha then
    return public.resposta_erro('FORA_EXPEDIENTE');
  end if;

  -- 8) E nao pode invadir o intervalo.
  if v_h.intervalo_inicio is not null
     and v_ini_ts < p_data + v_h.intervalo_fim
     and v_fim_ts > p_data + v_h.intervalo_inicio then
    return public.resposta_erro('INTERVALO');
  end if;

  -- 9) O horario precisa pertencer a grade oferecida.
  v_passo_seg := v_cfg.granularidade_minutos * 60;
  if mod(extract(epoch from (v_ini_ts - (p_data + v_h.abre)))::bigint, v_passo_seg) <> 0 then
    return public.resposta_erro('HORARIO_INVALIDO');
  end if;

  -- 10) A partir daqui a operacao e serializada com os bloqueios do
  --     proprietario. Duas reservas concorrentes entram uma de cada vez.
  perform pg_advisory_xact_lock(hashtext('barbearia_arte10:agenda'));

  -- 11) Bloqueio administrativo (itens 15 e 23).
  if exists (select 1 from public.bloqueios b where b.periodo && v_range) then
    return public.resposta_erro('HORARIO_BLOQUEADO');
  end if;

  -- 12) Conferencia explicita de sobreposicao (item 32).
  if exists (select 1 from public.agendamentos a where a.periodo && v_range) then
    return public.resposta_erro('HORARIO_OCUPADO');
  end if;

  -- 13) Limite de reservas futuras em aberto por telefone (anti-abuso).
  select c.id into v_cliente_id from public.clientes c where c.telefone = v_tel;
  if v_cliente_id is not null then
    select count(*) into v_futuros
      from public.agendamentos a
     where a.cliente_id = v_cliente_id
       and a.inicio_em > now()
       and a.status = 'agendado';

    if v_futuros >= v_cfg.max_agendamentos_futuros then
      return public.resposta_erro('LIMITE_AGENDAMENTOS');
    end if;
  end if;

  -- 14) Gravacao. Cliente e agendamento entram no mesmo bloco: se o
  --     agendamento falhar, nada fica gravado pela metade (item 22).
  begin
    insert into public.clientes (nome, telefone)
    values (v_nome, v_tel)
    on conflict (telefone) do update set nome = excluded.nome
    returning id into v_cliente_id;

    insert into public.agendamentos (
      cliente_id, servico_id, data, horario_inicio, horario_fim,
      inicio_em, fim_em, origem, idempotency_key,
      servico_nome, servico_preco, servico_duracao
    )
    values (
      v_cliente_id, v_srv.id, p_data, v_ini_ts::time, v_fim_ts::time,
      v_ini, v_fim, 'site', v_chave,
      v_srv.nome, v_srv.preco, v_srv.duracao_minutos
    )
    returning id into v_agendamento_id;

  exception
    -- A constraint de exclusao venceu a corrida: outra pessoa reservou
    -- este exato periodo em paralelo (item 7).
    when exclusion_violation then
      v_falha := 'HORARIO_OCUPADO';
    -- Duas requisicoes identicas chegaram juntas com a mesma chave.
    when unique_violation then
      v_falha := 'IDEMPOTENCIA';
  end;

  if v_falha = 'HORARIO_OCUPADO' then
    return public.resposta_erro('HORARIO_OCUPADO');
  end if;

  if v_falha = 'IDEMPOTENCIA' then
    select a.id into v_existente
      from public.agendamentos a
     where a.idempotency_key = v_chave;

    if found then
      return jsonb_build_object(
        'ok',          true,
        'duplicado',   true,
        'agendamento', public.agendamento_json(v_existente),
        'barbearia',   public.barbearia_json()
      );
    end if;

    return public.resposta_erro('HORARIO_OCUPADO');
  end if;

  -- 15) Enfileira a notificacao push do proprietario (item 19).
  insert into public.notificacoes (agendamento_id, tipo, titulo, corpo, dados)
  select
    v_agendamento_id,
    'novo_agendamento',
    'Novo agendamento',
    c.nome || ' marcou ' || v_srv.nome || ' — ' ||
      to_char(p_data, 'DD/MM') || ' às ' || to_char(v_ini_ts::time, 'HH24:MI'),
    jsonb_build_object(
      'agendamento_id', v_agendamento_id,
      'data',           p_data,
      'horario',        to_char(v_ini_ts::time, 'HH24:MI'),
      'servico',        v_srv.nome,
      'cliente',        c.nome
    )
  from public.clientes c
  where c.id = v_cliente_id;

  return jsonb_build_object(
    'ok',          true,
    'duplicado',   false,
    'agendamento', public.agendamento_json(v_agendamento_id),
    'barbearia',   public.barbearia_json()
  );
end;
$$;

comment on function public.criar_agendamento(uuid, date, time, text, text, text) is
  'Unico caminho de gravacao de agendamento pelo site. Revalida servico, expediente, intervalo, passado, bloqueios e sobreposicao no servidor antes de gravar.';
