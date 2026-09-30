-- =====================================================================
-- BARBEARIA ARTE 10 — LIMPAR AGENDAMENTOS DE TESTE (ANTES DE ABRIR)
-- =====================================================================
-- Use SOMENTE antes de divulgar o site, para apagar os agendamentos que
-- você fez para testar. Depois que os clientes começarem a agendar, NÃO
-- use: a regra do sistema é que agendamento de cliente nunca é apagado.
--
-- Apaga apenas os agendamentos cujo nome do cliente começa com "TESTE"
-- (maiúsculas ou minúsculas). Faça seus testes usando esse nome.
-- =====================================================================

begin;

alter table public.agendamentos disable trigger trg_agendamentos_sem_exclusao;

delete from public.notificacoes
 where agendamento_id in (
   select id from public.agendamentos where cliente_nome ilike 'teste%'
 );

-- Corte de teste que usou plano: devolve o corte antes de apagar.
with usos as (
  delete from public.plano_usos u
   using public.agendamentos a
   where u.agendamento_id = a.id
     and a.cliente_nome ilike 'teste%'
  returning u.assinatura_id
)
update public.assinaturas s
   set cortes_usados = s.cortes_usados - c.n
  from (select assinatura_id, count(*)::int as n from usos group by assinatura_id) c
 where s.id = c.assinatura_id;

delete from public.agendamentos
 where cliente_nome ilike 'teste%';

alter table public.agendamentos enable trigger trg_agendamentos_sem_exclusao;

-- Clientes que ficaram sem nenhum agendamento (eram só de teste).
-- Quem tem plano (mesmo só pedido) continua cadastrado.
delete from public.clientes c
 where not exists (select 1 from public.agendamentos a where a.cliente_id = c.id)
   and not exists (select 1 from public.assinaturas s where s.cliente_id = c.id);

commit;

select count(*) as agendamentos_restantes from public.agendamentos;
