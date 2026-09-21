-- =====================================================================
-- BARBEARIA ARTE 10 — 09. Visões usadas pelo aplicativo do proprietário
-- =====================================================================

-- ---------------------------------------------------------------------
-- clientes_resumo: lista de clientes com histórico consolidado.
-- security_invoker = true faz a view respeitar o RLS de quem chama,
-- então ela só devolve dados para um administrador autenticado.
-- ---------------------------------------------------------------------
create or replace view public.clientes_resumo
with (security_invoker = true) as
select
  c.id,
  c.nome,
  c.telefone,
  c.created_at,
  count(a.id)::integer                                       as total_agendamentos,
  max(a.inicio_em)                                           as ultima_visita,
  min(a.inicio_em) filter (where a.inicio_em > now())        as proximo_horario
from public.clientes c
left join public.agendamentos a on a.cliente_id = c.id
group by c.id, c.nome, c.telefone, c.created_at;

revoke all on public.clientes_resumo from public, anon, authenticated;
grant select on public.clientes_resumo to authenticated;

comment on view public.clientes_resumo is
  'Clientes com total de visitas, última visita e próximo horário. Respeita o RLS de clientes/agendamentos.';
