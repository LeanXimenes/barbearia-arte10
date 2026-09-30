-- =====================================================================
-- BARBEARIA ARTE 10 — 04. Calculo de disponibilidade
-- =====================================================================
-- Toda a disponibilidade mostrada no site vem DAQUI, do servidor.
-- O navegador nunca decide o que esta livre (item 34).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mensagens padronizadas (site e aplicativo mostram o mesmo texto).
-- ---------------------------------------------------------------------
create or replace function public.mensagem_erro(p_codigo text)
returns text
language sql
immutable
as $$
  select case p_codigo
    when 'HORARIO_OCUPADO'      then 'Esse horário acabou de ser reservado. Por favor, escolha outro horário.'
    when 'HORARIO_BLOQUEADO'    then 'Esse horário não está mais disponível.'
    when 'HORARIO_PASSADO'      then 'Esse horário já passou. Escolha um horário futuro.'
    when 'HORARIO_INVALIDO'     then 'Horário inválido. Escolha um dos horários oferecidos.'
    when 'FORA_EXPEDIENTE'      then 'Esse horário está fora do expediente da barbearia.'
    when 'INTERVALO'            then 'Esse horário cai no intervalo da barbearia.'
    when 'DIA_FECHADO'          then 'Barbearia fechada neste dia.'
    when 'DATA_MUITO_DISTANTE'  then 'Ainda não é possível agendar para essa data.'
    when 'SERVICO_NAO_ENCONTRADO' then 'Serviço não encontrado.'
    when 'SERVICO_INDISPONIVEL' then 'Esse serviço não está disponível no momento.'
    when 'NOME_INVALIDO'        then 'Informe seu nome completo (mínimo 2 caracteres).'
    when 'TELEFONE_INVALIDO'    then 'Informe um telefone válido com DDD.'
    when 'DADOS_INCOMPLETOS'    then 'Preencha todos os campos para confirmar o agendamento.'
    when 'LIMITE_AGENDAMENTOS'  then 'Você já possui agendamentos em aberto. Conclua ou aguarde antes de marcar outro.'
    when 'EXISTE_AGENDAMENTO'   then 'Não é possível bloquear: já existe um cliente agendado nesse período.'
    when 'JA_BLOQUEADO'         then 'Esse período já está bloqueado.'
    when 'BLOQUEIO_NAO_ENCONTRADO' then 'Bloqueio não encontrado (talvez já tenha sido removido).'
    when 'NAO_AUTORIZADO'       then 'Você não tem permissão para executar esta ação.'
    when 'CONFIG_AUSENTE'       then 'A barbearia ainda não finalizou a configuração da agenda.'
    when 'PERIODO_INVALIDO'     then 'Período inválido.'
    when 'STATUS_INVALIDO'      then 'Status inválido.'
    when 'AGENDAMENTO_NAO_ENCONTRADO' then 'Agendamento não encontrado.'
    when 'ATENDIMENTO_NAO_COMECOU' then 'Só dá para registrar o atendimento depois do horário marcado.'
    when 'MUITAS_TENTATIVAS'    then 'Muitos agendamentos em pouco tempo. Tente novamente em alguns minutos.'
    when 'AGENDAMENTO_JA_CANCELADO' then 'Esse agendamento já foi cancelado.'
    when 'ATENDIMENTO_NAO_PASSOU' then 'Só dá para apagar depois que o horário passou.'
    when 'CLIENTE_NAO_ENCONTRADO' then 'Cliente não encontrado (talvez já tenha sido apagado).'
    when 'CLIENTE_TEM_HORARIO'  then 'Esse cliente tem horário marcado. Cancele o horário antes de apagar.'
    when 'CLIENTE_TEM_PLANO'    then 'Esse cliente tem plano ativo ou pedido. Cancele o plano antes de apagar.'
    when 'PLANO_NAO_ENCONTRADO' then 'Plano não encontrado.'
    when 'PLANO_EM_USO'         then 'Clientes já pegaram esse plano. Para tirar do site, desligue "Aparece no site".'
    when 'CANCELAMENTO_TARDE'   then 'Só dá para cancelar antes do horário marcado.'
    when 'PLANO_INDISPONIVEL'   then 'Esse plano não está disponível no momento.'
    when 'PLANO_JA_ATIVO'       then 'Você já tem um plano ativo. Use os cortes dele antes de pegar outro.'
    when 'PLANO_JA_SOLICITADO'  then 'Você já pediu um plano. A barbearia vai confirmar com você.'
    when 'ASSINATURA_NAO_ENCONTRADA' then 'Pedido de plano não encontrado.'
    when 'ASSINATURA_ESTADO'    then 'Esse plano não pode mais ser alterado.'
    when 'SERVICOS_INVALIDOS'   then 'Lista de serviços inválida. Atualize e tente de novo.'
    when 'DADOS_INVALIDOS'      then 'Não foi possível processar o pedido. Atualize a página e tente novamente.'
    else 'Não foi possível concluir a operação. Tente novamente.'
  end;
$$;

create or replace function public.resposta_erro(p_codigo text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'ok', false,
    'erro', p_codigo,
    'mensagem', public.mensagem_erro(p_codigo)
  );
$$;

-- ---------------------------------------------------------------------
-- horarios_disponiveis(servico, data)
-- ---------------------------------------------------------------------
-- Regras aplicadas (item 9):
--   * dia precisa estar aberto;
--   * o servico inteiro precisa caber dentro do expediente;
--   * o servico nao pode invadir o intervalo (almoco);
--   * horarios ja passados nao sao devolvidos;
--   * datas alem da janela de agendamento nao sao devolvidas;
--   * horarios ocupados/bloqueados SAO devolvidos, marcados como
--     indisponiveis, para que o cliente enxergue "14:00 — INDISPONÍVEL"
--     (item 6) em vez de simplesmente nao ver o horario.
-- ---------------------------------------------------------------------
create or replace function public.horarios_disponiveis(
  p_servico_id uuid,
  p_data       date
)
returns table (
  horario     time,
  horario_fim time,
  inicio_em   timestamptz,
  fim_em      timestamptz,
  disponivel  boolean,
  motivo      text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg        public.config_barbearia%rowtype;
  v_h          public.config_horarios%rowtype;
  v_duracao    integer;
  v_ativo      boolean;
  v_hoje       date;
  v_limite     timestamptz;
  v_passo      interval;
  v_dur        interval;
  v_abre_ts    timestamp;
  v_fecha_ts   timestamp;
  v_int_ini    timestamp;
  v_int_fim    timestamp;
  v_cursor     timestamp;
  v_fim_ts     timestamp;
  v_ini_tz     timestamptz;
  v_fim_tz     timestamptz;
  v_range      tstzrange;
  v_janela     tstzrange;
  v_ocupados   tstzrange[];
  v_bloqueados tstzrange[];
begin
  if p_servico_id is null or p_data is null then
    return;
  end if;

  select * into v_cfg from public.config_barbearia where id;
  if not found then
    return;
  end if;

  select s.duracao_minutos, s.ativo
    into v_duracao, v_ativo
    from public.servicos s
   where s.id = p_servico_id;

  -- Servico inexistente ou desativado nao oferece horario nenhum (item 27).
  if not found or not v_ativo then
    return;
  end if;

  v_hoje := (now() at time zone v_cfg.fuso)::date;
  if p_data < v_hoje or p_data > v_hoje + v_cfg.antecedencia_maxima_dias then
    return;
  end if;

  select * into v_h
    from public.config_horarios
   where dia_semana = extract(dow from p_data)::smallint;

  if not found or not v_h.aberto then
    return; -- Barbearia fechada neste dia (item 25).
  end if;

  v_passo    := make_interval(mins => v_cfg.granularidade_minutos);
  v_dur      := make_interval(mins => v_duracao);
  v_limite   := now() + make_interval(mins => v_cfg.antecedencia_minima_minutos);
  v_abre_ts  := p_data + v_h.abre;
  v_fecha_ts := p_data + v_h.fecha;

  if v_h.intervalo_inicio is not null then
    v_int_ini := p_data + v_h.intervalo_inicio;
    v_int_fim := p_data + v_h.intervalo_fim;
  end if;

  -- Carrega uma unica vez tudo que ocupa o dia (com folga nas bordas).
  v_janela := tstzrange(
    (v_abre_ts - interval '12 hours') at time zone v_cfg.fuso,
    (v_fecha_ts + interval '12 hours') at time zone v_cfg.fuso,
    '[)'
  );

  select coalesce(array_agg(a.periodo), '{}')
    into v_ocupados
    from public.agendamentos a
   where a.periodo && v_janela
     and a.cancelado_em is null;

  select coalesce(array_agg(b.periodo), '{}')
    into v_bloqueados
    from public.bloqueios b
   where b.periodo && v_janela;

  v_cursor := v_abre_ts;

  while v_cursor < v_fecha_ts loop
    v_fim_ts := v_cursor + v_dur;

    -- O servico inteiro precisa caber antes do fechamento.
    exit when v_fim_ts > v_fecha_ts;

    -- Nao pode invadir o intervalo.
    if v_int_ini is null or not (v_cursor < v_int_fim and v_fim_ts > v_int_ini) then
      v_ini_tz := v_cursor at time zone v_cfg.fuso;
      v_fim_tz := v_fim_ts at time zone v_cfg.fuso;

      -- Horarios passados simplesmente nao aparecem (item 24).
      if v_ini_tz >= v_limite then
        v_range := tstzrange(v_ini_tz, v_fim_tz, '[)');

        horario     := v_cursor::time;
        horario_fim := v_fim_ts::time;
        inicio_em   := v_ini_tz;
        fim_em      := v_fim_tz;

        if exists (select 1 from unnest(v_ocupados) r where r && v_range) then
          disponivel := false;
          motivo     := 'ocupado';
        elsif exists (select 1 from unnest(v_bloqueados) r where r && v_range) then
          disponivel := false;
          motivo     := 'bloqueado';
        else
          disponivel := true;
          motivo     := null;
        end if;

        return next;
      end if;
    end if;

    v_cursor := v_cursor + v_passo;
  end loop;

  return;
end;
$$;

-- ---------------------------------------------------------------------
-- dias_disponiveis(servico, inicio, fim)
-- Alimenta o calendario do site: diz, para cada dia, se a barbearia
-- abre, se a data esta dentro da janela de agendamento e quantos
-- horarios ainda estao livres.
-- ---------------------------------------------------------------------
create or replace function public.dias_disponiveis(
  p_servico_id uuid,
  p_inicio     date,
  p_fim        date
)
returns table (
  data             date,
  aberto           boolean,
  dentro_da_janela boolean,
  disponiveis      integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg   public.config_barbearia%rowtype;
  v_hoje  date;
  v_dia   date;
  v_aberto boolean;
begin
  if p_servico_id is null or p_inicio is null or p_fim is null or p_fim < p_inicio then
    return;
  end if;

  -- Protege o banco contra varreduras gigantes vindas do cliente.
  if p_fim - p_inicio > 92 then
    p_fim := p_inicio + 92;
  end if;

  select * into v_cfg from public.config_barbearia where id;
  if not found then
    return;
  end if;

  v_hoje := (now() at time zone v_cfg.fuso)::date;

  for v_dia in select g::date from generate_series(p_inicio, p_fim, interval '1 day') g loop
    select h.aberto into v_aberto
      from public.config_horarios h
     where h.dia_semana = extract(dow from v_dia)::smallint;

    data             := v_dia;
    aberto           := coalesce(v_aberto, false);
    dentro_da_janela := v_dia >= v_hoje and v_dia <= v_hoje + v_cfg.antecedencia_maxima_dias;

    if aberto and dentro_da_janela then
      select count(*)::integer
        into disponiveis
        from public.horarios_disponiveis(p_servico_id, v_dia) hd
       where hd.disponivel;
    else
      disponiveis := 0;
    end if;

    return next;
  end loop;

  return;
end;
$$;
