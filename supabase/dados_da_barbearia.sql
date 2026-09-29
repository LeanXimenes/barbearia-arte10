-- =====================================================================
-- BARBEARIA ARTE 10 — DADOS, HORÁRIOS E SERVIÇOS
-- =====================================================================
-- Grava no banco o endereço, o contato, os horários de funcionamento e
-- os serviços da barbearia. Pode rodar mais de uma vez: sempre volta
-- tudo para os valores abaixo. (No dia a dia, mude pelo app do barbeiro.)
-- =====================================================================

update public.config_barbearia set
  telefone_whatsapp = '17997313480',
  instagram         = 'aquiles.hiroshi',
  endereco          = 'Rua Joaquim Iglesias, 889',
  cidade            = 'Santa Albertina',
  uf                = 'SP'
where id;

-- Segunda a sexta: 08:00 às 12:30
update public.config_horarios
   set aberto = true, abre = '08:00', fecha = '12:30',
       intervalo_inicio = null, intervalo_fim = null
 where dia_semana between 1 and 5;

-- Sábado e domingo: 09:00 às 23:00
update public.config_horarios
   set aberto = true, abre = '09:00', fecha = '23:00',
       intervalo_inicio = null, intervalo_fim = null
 where dia_semana in (0, 6);

-- Serviços: ficam EXATAMENTE estes, nesta ordem. Os que já existem são
-- atualizados. Os que saíram da lista (ex.: "Corte + Barba") somem do
-- site: são apagados ou, se já tiverem agendamento, apenas desativados
-- (o histórico dos clientes não se perde).
with lista (nome, descricao, preco, duracao_minutos, ordem) as (
  values
    ('Corte de cabelo', 'Corte personalizado com acabamento completo.',         35.00, 35, 1),
    ('Barba completa',  'Modelagem e acabamento para deixar a barba alinhada.', 30.00, 30, 2),
    ('Pezinho',         'Acabamento limpo e preciso para completar o visual.',  15.00, 20, 3),
    ('Só raspar',       'Apenas raspagem.',                                     10.00, 20, 4),
    ('Sobrancelha',     'Acabamento simples para deixar o olhar alinhado.',      5.00, 10, 5)
),
gravados as (
  insert into public.servicos (nome, descricao, preco, duracao_minutos, ativo, ordem)
  select nome, descricao, preco, duracao_minutos, true, ordem from lista
  on conflict ((lower(btrim(nome)))) do update set
    nome            = excluded.nome,
    descricao       = excluded.descricao,
    preco           = excluded.preco,
    duracao_minutos = excluded.duracao_minutos,
    ativo           = true,
    ordem           = excluded.ordem
  returning id
),
apagados as (
  delete from public.servicos s
   where s.id not in (select id from gravados)
     and not exists (select 1 from public.agendamentos a where a.servico_id = s.id)
  returning id
)
update public.servicos s
   set ativo = false
 where s.id not in (select id from gravados)
   and exists (select 1 from public.agendamentos a where a.servico_id = s.id);

-- Conferência (aparece como resultado no SQL Editor)
select "O quê", "Como ficou" from (
  select 0 as grupo, 1 as ordem, 'Endereço' as "O quê",
         endereco || ' — ' || cidade || '/' || uf as "Como ficou"
    from public.config_barbearia where id
  union all
  select 0, 2, 'WhatsApp', telefone_whatsapp from public.config_barbearia where id
  union all
  select 0, 3, 'Instagram', '@' || instagram from public.config_barbearia where id
  union all
  select 1, case when dia_semana = 0 then 7 else dia_semana end,
         case dia_semana when 1 then 'Segunda' when 2 then 'Terça' when 3 then 'Quarta'
                         when 4 then 'Quinta'  when 5 then 'Sexta' when 6 then 'Sábado'
                         else 'Domingo' end,
         case when aberto then to_char(abre, 'HH24:MI') || ' às ' || to_char(fecha, 'HH24:MI')
              else 'Fechado' end
    from public.config_horarios
  union all
  select 2, ordem, 'Serviço: ' || nome,
         'R$ ' || replace(to_char(preco, 'FM999990.00'), '.', ',') || ' · ' || duracao_minutos || ' min'
    from public.servicos
   where ativo
) conferencia
order by grupo, ordem;
