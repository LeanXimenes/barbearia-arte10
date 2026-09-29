-- =====================================================================
-- BARBEARIA ARTE 10 — 07. Row Level Security e permissoes (item 20)
-- =====================================================================
-- Principio: o site publico (role "anon") NAO enxerga nenhum dado
-- pessoal e NAO escreve em nenhuma tabela. Ele so consegue:
--   * ler servicos ativos e a configuracao da barbearia;
--   * ler a agenda publica (periodos ocupados, sem nome/telefone);
--   * chamar as funcoes de disponibilidade e criar_agendamento.
-- =====================================================================

alter table public.config_barbearia  enable row level security;
alter table public.config_horarios   enable row level security;
alter table public.administradores   enable row level security;
alter table public.clientes          enable row level security;
alter table public.servicos          enable row level security;
alter table public.agendamentos      enable row level security;
alter table public.bloqueios         enable row level security;
alter table public.agenda_publica    enable row level security;
alter table public.dispositivos_push enable row level security;
alter table public.notificacoes      enable row level security;

-- ---------------------------------------------------------------------
-- Zera privilegios herdados e concede apenas o necessario.
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Leitura publica (conteudo do site, sem dados pessoais).
grant select on public.servicos         to anon, authenticated;
grant select on public.config_barbearia to anon, authenticated;
grant select on public.config_horarios  to anon, authenticated;
grant select on public.agenda_publica   to anon, authenticated;

-- Area administrativa (o RLS ainda exige is_admin()).
grant select         on public.clientes          to authenticated;
grant select         on public.agendamentos      to authenticated;
grant select         on public.bloqueios         to authenticated;
grant select         on public.administradores   to authenticated;
grant select, delete on public.dispositivos_push to authenticated;
grant select         on public.notificacoes      to authenticated;
grant insert, update, delete on public.servicos  to authenticated;
grant insert, update on public.config_barbearia  to authenticated;
grant insert, update on public.config_horarios   to authenticated;

-- ---------------------------------------------------------------------
-- POLICIES
-- ---------------------------------------------------------------------

-- SERVICOS: todo mundo ve os ativos; o administrador ve e gerencia todos.
drop policy if exists servicos_leitura_publica on public.servicos;
create policy servicos_leitura_publica
  on public.servicos for select
  to anon, authenticated
  using (ativo);

drop policy if exists servicos_admin on public.servicos;
create policy servicos_admin
  on public.servicos for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- CONFIGURACAO: leitura livre (endereco, horarios de funcionamento).
drop policy if exists config_barbearia_leitura on public.config_barbearia;
create policy config_barbearia_leitura
  on public.config_barbearia for select
  to anon, authenticated
  using (true);

drop policy if exists config_barbearia_admin on public.config_barbearia;
create policy config_barbearia_admin
  on public.config_barbearia for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists config_horarios_leitura on public.config_horarios;
create policy config_horarios_leitura
  on public.config_horarios for select
  to anon, authenticated
  using (true);

drop policy if exists config_horarios_admin on public.config_horarios;
create policy config_horarios_admin
  on public.config_horarios for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- AGENDA PUBLICA: periodos ocupados, sem qualquer dado pessoal.
-- Serve para o Realtime do site saber que precisa recarregar (item 18).
drop policy if exists agenda_publica_leitura on public.agenda_publica;
create policy agenda_publica_leitura
  on public.agenda_publica for select
  to anon, authenticated
  using (true);
-- Sem policy de escrita: so os triggers SECURITY DEFINER gravam aqui.

-- CLIENTES: dado pessoal. Somente o administrador le. Ninguem escreve
-- pela API (o cadastro nasce dentro de criar_agendamento).
drop policy if exists clientes_admin_leitura on public.clientes;
create policy clientes_admin_leitura
  on public.clientes for select
  to authenticated
  using ((select public.is_admin()));

-- AGENDAMENTOS: somente o administrador le.
-- Nao existe policy de INSERT (so via criar_agendamento), de UPDATE (so via
-- atualizar_status_agendamento) nem de DELETE (item 14 — o agendamento do
-- cliente e permanente).
drop policy if exists agendamentos_admin_leitura on public.agendamentos;
create policy agendamentos_admin_leitura
  on public.agendamentos for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists agendamentos_admin_status on public.agendamentos;

-- BLOQUEIOS: o administrador le; criar/remover apenas pelas funcoes.
drop policy if exists bloqueios_admin_leitura on public.bloqueios;
create policy bloqueios_admin_leitura
  on public.bloqueios for select
  to authenticated
  using ((select public.is_admin()));

-- ADMINISTRADORES: cada usuario so enxerga o proprio vinculo.
drop policy if exists administradores_proprio on public.administradores;
create policy administradores_proprio
  on public.administradores for select
  to authenticated
  using (user_id = (select auth.uid()));

-- DISPOSITIVOS PUSH: cada administrador gerencia os proprios aparelhos.
drop policy if exists dispositivos_push_proprios on public.dispositivos_push;
create policy dispositivos_push_proprios
  on public.dispositivos_push for select
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()));

drop policy if exists dispositivos_push_remover on public.dispositivos_push;
create policy dispositivos_push_remover
  on public.dispositivos_push for delete
  to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()));

-- NOTIFICACOES: historico de envios, somente leitura administrativa.
drop policy if exists notificacoes_admin_leitura on public.notificacoes;
create policy notificacoes_admin_leitura
  on public.notificacoes for select
  to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- EXECUCAO DE FUNCOES
-- ---------------------------------------------------------------------

-- Funcoes do site publico.
grant execute on function public.horarios_disponiveis(uuid, date)            to anon, authenticated;
grant execute on function public.dias_disponiveis(uuid, date, date)          to anon, authenticated;
grant execute on function public.criar_agendamento(uuid, date, time, text, text, text)
                                                                             to anon, authenticated;
grant execute on function public.mensagem_erro(text)                         to anon, authenticated;

-- Funcoes do aplicativo do proprietario.
grant execute on function public.is_admin()                                  to authenticated;
grant execute on function public.criar_bloqueio(date, time, time, text)      to authenticated;
grant execute on function public.remover_bloqueio(uuid)                      to authenticated;
grant execute on function public.agenda_do_dia(date)                         to authenticated;
grant execute on function public.visao_geral_periodo(date, date)             to authenticated;
grant execute on function public.registrar_dispositivo(text, text)           to authenticated;
grant execute on function public.atualizar_status_agendamento(uuid, text)    to authenticated;

-- Funcoes de gatilho usadas por tabelas que o administrador altera.
grant execute on function public.tg_set_updated_at()                         to authenticated;
grant execute on function public.tg_servico_em_uso()                         to authenticated;
grant execute on function public.tg_agendamento_imutavel()                   to authenticated;
grant execute on function public.tg_sincronizar_agenda_publica()             to authenticated;

-- Novos objetos criados depois desta migracao nao nascem liberados.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
