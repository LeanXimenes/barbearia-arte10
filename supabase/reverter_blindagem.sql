-- =====================================================================
-- BARBEARIA ARTE 10 — Reverter a blindagem (migração 16), se precisar
-- =====================================================================
-- Use só se algo parar de funcionar depois da blindagem.
-- Supabase > SQL Editor > cole o NÍVEL desejado > Run.
-- Nenhum agendamento, conta ou plano é apagado por este arquivo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- NÍVEL 1 — desliga só a checagem antes de cada chamada (freio geral
-- por IP, /rpc só por POST e tamanho do pedido). Resolve na hora se
-- clientes de verdade estiverem recebendo "muitos pedidos".
-- Os freios por conta/IP dentro das funções continuam valendo.
-- ---------------------------------------------------------------------
alter role authenticator reset pgrst.db_pre_request;
notify pgrst, 'reload config';

-- ---------------------------------------------------------------------
-- NÍVEL 2 — volta tudo para antes da blindagem.
--   a) Rode o NÍVEL 1 acima.
--   b) Rode o instalador da versão anterior:
--      https://raw.githubusercontent.com/LeanXimenes/barbearia-arte10/antes-da-blindagem/supabase/instalar_tudo.sql
--      (ou: git show antes-da-blindagem:supabase/instalar_tudo.sql)
--   c) Rode as três linhas abaixo (o site antigo usa estas funções):
-- ---------------------------------------------------------------------
-- grant execute on function public.criar_agendamento(uuid, date, time, text, text, text) to anon, authenticated;
-- grant execute on function public.meu_plano(text)                                       to anon, authenticated;
-- grant execute on function public.solicitar_plano(uuid, text, text)                     to anon, authenticated;
--   d) No Netlify, nos dois sites: Deploys > o deploy anterior > "Publish deploy".
--
-- O que fica (não atrapalha a versão antiga): a tabela private.limites,
-- private.eventos_seguranca e as regras que recusam endereço de aviso
-- fora dos serviços de push e link do mapa com "javascript:".
-- =====================================================================
