# Testes

## Como rodar

```bash
# Banco — 73 testes contra um PostgreSQL real
cd supabase/tests
npm install
npm test

# Site — 18 testes de formatação, datas, telefone e falhas
cd web
npm test
```

A suíte do banco sobe um **PostgreSQL de verdade** dentro do Node
([PGlite](https://pglite.dev), Postgres compilado para WASM), aplica as
migrações de produção **sem nenhuma alteração** e roda cada consulta com o
papel correto (`anon` ou `authenticated` + claims do JWT), exatamente como o
PostgREST faz em produção. Não precisa de Docker nem de um projeto Supabase.

O único arquivo extra é `auth_shim.sql`, que recria o mínimo do ambiente
Supabase (schema `auth`, `auth.uid()` e os papéis). Ele **não** é aplicado no
Supabase.

---

## Mapa dos 27 casos do item 33

| # | Caso exigido | Onde é testado |
|---|---|---|
| 1 | Dois clientes tentando o mesmo horário | `segundo cliente NAO consegue o mesmo horario` + `a constraint de exclusao recusa sobreposicao mesmo por dentro do banco` |
| 2 | Cliente clicando várias vezes em confirmar | `cliques repetidos no confirmar nao criam dois agendamentos` |
| 3 | Internet caindo durante a reserva | Site: `reconhece falha de rede`; a chave de idempotência é testada no caso 2 |
| 4 | Internet caindo durante bloqueio | App: `Resultado.Falha` com `semConexao`; UI não muda de estado |
| 5 | Horário ocupado com o site aberto | `o horario agendado passa a aparecer como INDISPONIVEL` + `sabe quando precisa recarregar a lista de horários` |
| 6 | Horário passado | `horario passado e recusado pelo servidor` + `datas passadas nao oferecem horarios` |
| 7 | Dia fechado | `dia fechado e recusado` + `dia fechado (domingo) nao oferece horarios` |
| 8 | Serviço desativado | `servico desativado e recusado` + `servico desativado nao oferece horario nenhum` |
| 9 | Serviço com duração diferente | `servicos de duracoes diferentes geram grades diferentes` |
| 10 | Dois serviços sobrepostos | `sobreposicao parcial e recusada` + `sobreposicao pela frente e recusada` |
| 11 | Horário bloqueado | `cliente nao consegue reservar horario bloqueado` |
| 12 | Desbloqueio de horário | `proprietario desbloqueia e o horario volta a ficar disponivel` |
| 13 | Reservar horário bloqueado | `o site passa a mostrar o horario bloqueado como INDISPONIVEL` |
| 14 | Reservar horário já agendado | `segundo cliente NAO consegue o mesmo horario` |
| 15 | Aplicativo sem conexão | `Conectividade` + faixa offline; `executar()` converte `IOException` em `semConexao` |
| 16 | Site sem conexão | `pareceFalhaDeRede` + `useOnline` + botão bloqueado offline |
| 17 | Atualização da página | Nada é guardado no navegador; a disponibilidade é sempre relida do servidor |
| 18 | Fechar o navegador no meio | Nada é gravado até `criar_agendamento` responder — não existe estado parcial |
| 19 | Repetição de requisições | `cliques repetidos…` (índice único em `idempotency_key`) |
| 20 | Falha do Supabase | `mensagemDeFalha()` no site, `Resultado.Falha` no app; nenhum sucesso falso |
| 21 | Falha na notificação | `push indisponivel nao derruba o agendamento` |
| 22 | Usuário sem permissão | `usuario nao autorizado nao consegue bloquear`, `agenda_do_dia exige administrador`, `anonimo nao consegue nem executar a funcao de bloqueio`, `nao-admin nao registra dispositivo` |
| 23 | Acesso indevido a dados de clientes | `anon NAO consegue ler agendamentos`, `anon NAO consegue ler clientes`, `usuario autenticado que nao e admin nao le dados de clientes`, `a agenda publica nao expoe nenhum dado pessoal`, `clientes_resumo nao vaza para anon nem para nao-admin` |
| 24 | Alterações simultâneas | Lock consultivo + constraint de exclusão: `a constraint de exclusao recusa sobreposicao…`, `NAO e possivel bloquear em cima de um cliente agendado` |
| 25 | Horários consecutivos | `horarios consecutivos sao aceitos (14:45 depois de 14:00-14:35)` |
| 26 | Serviços com durações diferentes | `servicos de duracoes diferentes geram grades diferentes` |
| 27 | Horários fora do expediente | `horario fora do expediente e recusado`, `servico que nao cabe antes do fechamento e recusado`, `todo horario oferecido cabe dentro do expediente` |

---

## Grupos da suíte do banco

| Grupo | O que prova |
|---|---|
| Estrutura e blindagem | RLS em todas as tabelas, constraint de exclusão presente, índices essenciais, e que `anon` não lê nem escreve o que não deve |
| Disponibilidade | Expediente, intervalo, dia fechado, data passada, janela máxima, serviço inativo |
| Agendamento do cliente | Gravação, duração respeitada, sobreposição, consecutivos, idempotência, validação de nome/telefone, limite por telefone |
| Bloqueios | Autorização, bloquear livre, recusar bloqueio sobre cliente, desbloquear, bloqueio duplicado |
| **Regra absoluta** | Que o agendamento não pode ser apagado nem alterado — nem pelo dono do banco — e que nenhum status libera o horário |
| Sincronização | O espelho `agenda_publica` entra e sai junto, e não carrega dado pessoal |
| Aplicativo | `agenda_do_dia` com os 4 estados e sem sobreposição, calendário, dispositivos, clientes |
| Notificações | Fila criada com os dados certos e push quebrado não derruba o agendamento |

---

## O que **não** dá para testar aqui

Sendo honesto sobre os limites:

- **Concorrência real de duas conexões.** O PGlite expõe uma conexão só, então
  não dá para abrir duas transações ao mesmo tempo. O que a suíte faz é
  provocar diretamente a violação da constraint `agendamentos_sem_sobreposicao`
  — que é exatamente o erro que a segunda transação receberia em produção — e
  verificar que `criar_agendamento` traduz isso em `HORARIO_OCUPADO`. O
  mecanismo está testado; o paralelismo do sistema operacional, não.
- **Entrega do push pelo FCM.** Exige credenciais reais do Firebase e um
  aparelho. O que é testado aqui é a parte que roda no banco: a notificação é
  enfileirada com os dados corretos e uma falha no envio não afeta a reserva.
- **Compilação do aplicativo Android.** Precisa de JDK e do Android SDK. O
  código está completo e pronto para `./gradlew assembleDebug`, mas não foi
  compilado no ambiente onde este projeto foi escrito.
- **Realtime.** Depende da infraestrutura do Supabase. As tabelas estão
  publicadas e o `REPLICA IDENTITY FULL` está configurado; o teste de ponta a
  ponta é abrir o site em duas abas.
