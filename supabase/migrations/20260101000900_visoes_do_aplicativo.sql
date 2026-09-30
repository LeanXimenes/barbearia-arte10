-- =====================================================================
-- BARBEARIA ARTE 10 — 09. Visões usadas pelo aplicativo do proprietário
-- =====================================================================

-- ---------------------------------------------------------------------
-- clientes_resumo: lista de clientes com histórico consolidado.
-- security_invoker = true faz a view respeitar o RLS de quem chama,
-- então ela só devolve dados para um administrador autenticado.
--
--   ultima_visita   = último atendimento que já aconteceu (sem faltas)
--   proximo_horario = próxima reserva ainda em aberto
-- ---------------------------------------------------------------------
drop view if exists public.clientes_resumo;

create view public.clientes_resumo
with (security_invoker = true) as
select
  c.id,
  c.nome,
  c.telefone,
  c.created_at,
  count(a.id)::integer                                                    as total_agendamentos,
  count(a.id) filter (where a.status = 'nao_compareceu')::integer         as faltas,
  max(a.inicio_em) filter (where a.inicio_em <= now()
                             and a.status <> 'nao_compareceu')            as ultima_visita,
  min(a.inicio_em) filter (where a.inicio_em > now()
                             and a.status = 'agendado')                   as proximo_horario
from public.clientes c
left join public.agendamentos a on a.cliente_id = c.id and a.cancelado_em is null
group by c.id, c.nome, c.telefone, c.created_at;

revoke all on public.clientes_resumo from public, anon, authenticated;
grant select on public.clientes_resumo to authenticated;

comment on view public.clientes_resumo is
  'Clientes com total de visitas, faltas, última visita e próximo horário. Respeita o RLS de clientes/agendamentos.';
