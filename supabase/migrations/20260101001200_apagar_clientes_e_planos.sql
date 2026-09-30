-- =====================================================================
-- BARBEARIA ARTE 10 — 12. Apagar clientes, planos encerrados e planos
-- =====================================================================
-- Tudo só pelo dono (app) e sempre protegendo o que ainda está valendo:
--   * cliente com horário marcado ou plano em aberto NÃO é apagado;
--   * plano de cliente só é excluído depois de encerrado/cancelado/recusado;
--   * plano à venda só é excluído se nenhum cliente pegou (senão, esconder).
-- =====================================================================

-- Apaga o cliente e tudo o que é só histórico dele.
create or replace function public.apagar_cliente(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_agendamentos uuid[];
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  perform 1 from public.clientes where id = p_id for update;
  if not found then
    return public.resposta_erro('CLIENTE_NAO_ENCONTRADO');
  end if;

  if exists (select 1 from public.agendamentos a
              where a.cliente_id = p_id and a.fim_em > now() and a.cancelado_em is null) then
    return public.resposta_erro('CLIENTE_TEM_HORARIO');
  end if;

  if exists (select 1 from public.assinaturas s
              where s.cliente_id = p_id and s.status in ('solicitada', 'ativa')) then
    return public.resposta_erro('CLIENTE_TEM_PLANO');
  end if;

  select coalesce(array_agg(a.id), '{}') into v_agendamentos
    from public.agendamentos a where a.cliente_id = p_id;

  perform public.apagar_agendamentos_internos(v_agendamentos);
  delete from public.plano_usos u using public.assinaturas s
   where u.assinatura_id = s.id and s.cliente_id = p_id;
  delete from public.assinaturas where cliente_id = p_id;
  delete from public.clientes where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Exclui do app um plano de cliente que já acabou.
create or replace function public.excluir_assinatura(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  select status into v_status from public.assinaturas where id = p_id for update;
  if not found then
    return public.resposta_erro('ASSINATURA_NAO_ENCONTRADA');
  end if;
  if v_status in ('solicitada', 'ativa') then
    return public.resposta_erro('ASSINATURA_ESTADO');
  end if;

  delete from public.plano_usos where assinatura_id = p_id;
  delete from public.assinaturas where id = p_id;
  return jsonb_build_object('ok', true, 'apagados', 1);
end;
$$;

-- Exclui de uma vez todos os planos de clientes que já acabaram.
create or replace function public.excluir_assinaturas_encerradas()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qtd integer;
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  delete from public.plano_usos u using public.assinaturas s
   where u.assinatura_id = s.id and s.status not in ('solicitada', 'ativa');
  delete from public.assinaturas where status not in ('solicitada', 'ativa');
  get diagnostics v_qtd = row_count;

  return jsonb_build_object('ok', true, 'apagados', v_qtd);
end;
$$;

-- Exclui um plano à venda que nenhum cliente pegou.
create or replace function public.excluir_plano(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    return public.resposta_erro('NAO_AUTORIZADO');
  end if;

  perform 1 from public.planos where id = p_id for update;
  if not found then
    return public.resposta_erro('PLANO_NAO_ENCONTRADO');
  end if;
  if exists (select 1 from public.assinaturas where plano_id = p_id) then
    return public.resposta_erro('PLANO_EM_USO');
  end if;

  delete from public.planos where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.apagar_cliente(uuid)              from public, anon;
revoke all on function public.excluir_assinatura(uuid)          from public, anon;
revoke all on function public.excluir_assinaturas_encerradas()  from public, anon;
revoke all on function public.excluir_plano(uuid)               from public, anon;
grant execute on function public.apagar_cliente(uuid)             to authenticated;
grant execute on function public.excluir_assinatura(uuid)         to authenticated;
grant execute on function public.excluir_assinaturas_encerradas() to authenticated;
grant execute on function public.excluir_plano(uuid)              to authenticated;
