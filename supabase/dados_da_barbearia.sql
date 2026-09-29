-- =====================================================================
-- BARBEARIA ARTE 10 — ATUALIZAR DADOS E HORÁRIOS
-- =====================================================================
-- Grava o endereço, o contato e os horários de funcionamento no banco.
-- Use se o banco foi instalado com os dados de exemplo. Pode rodar mais
-- de uma vez. (No dia a dia, mude pelo app do barbeiro, tela Ajustes.)
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

-- Conferência (aparece como resultado no SQL Editor)
select case dia_semana
         when 1 then '1. Segunda' when 2 then '2. Terça'  when 3 then '3. Quarta'
         when 4 then '4. Quinta'  when 5 then '5. Sexta'  when 6 then '6. Sábado'
         else '7. Domingo'
       end                                        as dia,
       case when aberto then to_char(abre, 'HH24:MI') || ' às ' || to_char(fecha, 'HH24:MI')
            else 'Fechado' end                    as horario,
       (select endereco || ' — ' || cidade || '/' || uf from public.config_barbearia where id) as endereco
  from public.config_horarios
 order by 1;
