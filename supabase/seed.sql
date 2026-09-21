-- =====================================================================
-- BARBEARIA ARTE 10 — Dados iniciais
-- =====================================================================
-- Rode UMA vez depois das migracoes (SQL Editor do Supabase ou
-- `supabase db reset`). Pode rodar de novo sem duplicar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- >>> EDITE AQUI OS DADOS DA BARBEARIA <<<
-- (tambem editavel depois pela tela Configuracoes do aplicativo)
-- ---------------------------------------------------------------------
insert into public.config_barbearia (
  id, nome, fuso,
  telefone_whatsapp,   -- ex.: '5517997313480' (somente digitos, com DDI)
  instagram,           -- ex.: 'barbeariaarte10'
  endereco,            -- ex.: 'Rua Exemplo, 123 - Centro'
  cidade, uf,
  mapa_url,
  granularidade_minutos, antecedencia_minima_minutos,
  antecedencia_maxima_dias, max_agendamentos_futuros
)
values (
  true, 'Barbearia Arte 10', 'America/Sao_Paulo',
  null,
  null,
  null,
  null, null,
  null,
  15, 30, 60, 3
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- HORARIO DE FUNCIONAMENTO
-- dia_semana: 0 = domingo, 1 = segunda ... 6 = sabado
-- ---------------------------------------------------------------------
insert into public.config_horarios (dia_semana, aberto, abre, fecha, intervalo_inicio, intervalo_fim)
values
  (0, false, null,     null,     null,     null),      -- domingo: fechado
  (1, true,  '09:00',  '19:00',  '12:00',  '13:30'),   -- segunda
  (2, true,  '09:00',  '19:00',  '12:00',  '13:30'),   -- terca
  (3, true,  '09:00',  '19:00',  '12:00',  '13:30'),   -- quarta
  (4, true,  '09:00',  '19:00',  '12:00',  '13:30'),   -- quinta
  (5, true,  '09:00',  '20:00',  '12:00',  '13:30'),   -- sexta
  (6, true,  '08:00',  '18:00',  null,     null)       -- sabado
on conflict (dia_semana) do nothing;

-- ---------------------------------------------------------------------
-- SERVICOS
-- ---------------------------------------------------------------------
insert into public.servicos (nome, descricao, preco, duracao_minutos, ativo, ordem)
values
  ('Corte de cabelo', 'Corte personalizado com acabamento completo na máquina, tesoura e navalha.', 35.00, 35, true, 1),
  ('Barba completa',  'Toalha quente, modelagem e acabamento para deixar a barba alinhada.',        30.00, 30, true, 2),
  ('Corte + Barba',   'O combo completo: corte finalizado e barba modelada na mesma visita.',       60.00, 60, true, 3),
  ('Pezinho',         'Acabamento limpo e preciso para manter o visual entre um corte e outro.',    15.00, 20, true, 4),
  ('Sobrancelha',     'Limpeza e alinhamento das sobrancelhas na navalha.',                          5.00, 10, true, 5)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- ADMINISTRADOR (proprietario)
-- ---------------------------------------------------------------------
-- 1. Crie o usuario em Authentication > Users no painel do Supabase
--    (e-mail + senha). NAO habilite cadastro publico.
-- 2. Rode o comando abaixo trocando o e-mail:
--
--    insert into public.administradores (user_id, nome)
--    select id, 'Proprietário'
--      from auth.users
--     where email = 'proprietario@barbeariaarte10.com.br'
--    on conflict (user_id) do update set ativo = true;
--
-- ---------------------------------------------------------------------
-- NOTIFICACOES PUSH (preencha depois de publicar a Edge Function)
-- ---------------------------------------------------------------------
--    insert into private.segredos (chave, valor) values
--      ('edge_notificacoes_url',   'https://SEU-PROJETO.supabase.co/functions/v1/notificar-agendamento'),
--      ('edge_notificacoes_token', 'UM_SEGREDO_LONGO_E_ALEATORIO')  -- o mesmo valor de EDGE_TOKEN
--    on conflict (chave) do update set valor = excluded.valor, updated_at = now();
