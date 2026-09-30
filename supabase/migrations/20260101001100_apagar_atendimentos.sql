-- =====================================================================
-- BARBEARIA ARTE 10 — 11. Apagar quem já passou pela cadeira
-- =====================================================================
-- O dono pode limpar do app os atendimentos que JÁ ACONTECERAM (ou que
-- foram cancelados). Horário futuro de cliente continua intocável: para
-- esse, só existe o cancelamento.
--
-- Se o atendimento usou plano, o corte continua contado como usado.
-- O cadastro do cliente (nome e telefone) não é apagado.
-- =====================================================================

create or replace function public.apagar_agendamentos_internos(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qtd integer;
begin
  -- Libera o gatilho de imutabilidade só nesta transação.
  perform set_config('arte10.apagar_atendimento', 'sim', true);

  delete from public.notificacoes where agendamento_id = any (p_ids);
  delete from public.plano_usos   where agendamento_id = any (p_ids);
  delete from public.agendamentos where id = any (p_ids);
  get diagnostics v_qtd = row_count;

  perform set_config('arte10.apagar_atendimento', '', true);
  return v_qtd;
end;
$$;

-- Apaga um atendimento que já passou (ou foi cancelado).
create or replace function public.apagar_atendimento(p_id uuid)
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
  if v_a.fim_em > now() and v_a.cancelado_em is null then
    return public.resposta_erro('ATENDIMENTO_NAO_PASSOU');
  end if;

  perform public.apagar_agendamentos_internos(array[p_id]);
  return jsonb_build_object('ok', true, 'apagados', 1);
end;
$$;

-- Apaga de uma vez todos os atendimentos que já passaram (e os cancelados).
create or replace function public.apagar_atendimentos_passados()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  select coalesce(array_agg(a.id), '{}')
    into v_ids
    from public.agendamentos a
   where a.fim_em <= now() or a.cancelado_em is not null;

  return jsonb_build_object(
    'ok', true,
    'apagados', public.apagar_agendamentos_internos(v_ids)
  );
end;
$$;

revoke all on function public.apagar_agendamentos_internos(uuid[]) from public, anon, authenticated;
revoke all on function public.apagar_atendimento(uuid)             from public, anon;
revoke all on function public.apagar_atendimentos_passados()       from public, anon;
grant execute on function public.apagar_atendimento(uuid)       to authenticated;
grant execute on function public.apagar_atendimentos_passados() to authenticated;
