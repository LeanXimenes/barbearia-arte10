-- =====================================================================
-- BARBEARIA ARTE 10 — 01. Extensoes, tipos e utilitarios
-- =====================================================================
-- Observacoes:
--  * gen_random_uuid() e nativo no PostgreSQL >= 13 (nao exige pgcrypto).
--  * O operador de exclusao usa GiST com range_ops, que e nativo.
-- =====================================================================

-- Status possiveis de um agendamento.
-- ATENCAO: nao existe status "cancelado" de proposito.
-- A regra de negocio (item 14 da especificacao) determina que um
-- agendamento feito por um cliente NUNCA pode ser cancelado/excluido
-- pelo proprietario. Todos os status abaixo continuam ocupando o horario.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'agendamento_status') then
    create type public.agendamento_status as enum ('agendado', 'concluido', 'nao_compareceu');
  end if;
end
$$;

-- Origem do agendamento (permite futuras integracoes).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'agendamento_origem') then
    create type public.agendamento_origem as enum ('site', 'balcao', 'telefone');
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Utilitario: mantem a coluna updated_at sempre coerente.
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Utilitario: normaliza telefone brasileiro para apenas digitos.
-- Aceita "(17) 99731-3480", "+55 17 99731 3480", "17997313480" ...
-- Retorna NULL quando o telefone nao tiver 10 ou 11 digitos uteis.
-- ---------------------------------------------------------------------
create or replace function public.normalizar_telefone(p_telefone text)
returns text
language plpgsql
immutable
as $$
declare
  v_digitos text;
begin
  if p_telefone is null then
    return null;
  end if;

  v_digitos := regexp_replace(p_telefone, '[^0-9]', '', 'g');

  -- Remove o codigo do pais (55) quando informado.
  if length(v_digitos) in (12, 13) and left(v_digitos, 2) = '55' then
    v_digitos := substring(v_digitos from 3);
  end if;

  if length(v_digitos) not in (10, 11) then
    return null;
  end if;

  return v_digitos;
end;
$$;

-- ---------------------------------------------------------------------
-- Utilitario: normaliza nome (espacos duplicados, espacos nas pontas).
-- ---------------------------------------------------------------------
create or replace function public.normalizar_nome(p_nome text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
$$;
