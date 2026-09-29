-- =====================================================================
-- BARBEARIA ARTE 10 — Dados iniciais
-- =====================================================================
-- Rode UMA vez depois das migracoes (SQL Editor do Supabase ou
-- `supabase db reset`). Pode rodar de novo sem duplicar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DADOS DA BARBEARIA
-- (depois, edite pela tela Ajustes do aplicativo)
-- ---------------------------------------------------------------------
insert into public.config_barbearia (
  id, nome, fuso,
  telefone_whatsapp,   -- somente digitos, com DDD
  instagram,           -- sem o @
  endereco,
  cidade, uf,
  mapa_url,
  granularidade_minutos, antecedencia_minima_minutos,
  antecedencia_maxima_dias, max_agendamentos_futuros
)
values (
  true, 'Barbearia Arte 10', 'America/Sao_Paulo',
  '17997313480',
  'aquiles.hiroshi',
  'Rua Joaquim Iglesias, 889',
  'Santa Albertina', 'SP',
  null,                -- vazio = o site monta o link do Google Maps pelo endereco
  15, 30, 60, 3
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- HORARIO DE FUNCIONAMENTO
-- dia_semana: 0 = domingo, 1 = segunda ... 6 = sabado
-- ---------------------------------------------------------------------
insert into public.config_horarios (dia_semana, aberto, abre, fecha, intervalo_inicio, intervalo_fim)
values
  (0, true,  '09:00',  '23:00',  null,     null),      -- domingo
  (1, true,  '08:00',  '12:30',  null,     null),      -- segunda
  (2, true,  '08:00',  '12:30',  null,     null),      -- terca
  (3, true,  '08:00',  '12:30',  null,     null),      -- quarta
  (4, true,  '08:00',  '12:30',  null,     null),      -- quinta
  (5, true,  '08:00',  '12:30',  null,     null),      -- sexta
  (6, true,  '09:00',  '23:00',  null,     null)       -- sabado
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
