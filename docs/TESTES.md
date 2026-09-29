# Testes

## Como rodar

```powershell
# Banco (97), push (9) e instalador (4)
cd C:\arte10\supabase\tests
npm install
npm test

# Site (18)
cd C:\arte10\web
npm test

# App Android: compila + Lint
cd C:\arte10\android
.\gradlew.bat assembleDebug lintDebug
```

A suíte do banco sobe um **PostgreSQL de verdade** dentro do Node (PGlite),
aplica as migrações de produção sem alteração e roda cada consulta com o papel
certo (`anon`, `authenticated` ou `service_role`), como o Supabase faz. O único
arquivo extra é `auth_shim.sql`, que recria o mínimo do Supabase (schema
`auth` e papéis) — ele não é aplicado no Supabase.

## O que está coberto

| Grupo | O que prova |
|---|---|
| Estrutura e blindagem | RLS em todas as tabelas, trava de sobreposição, índices, anônimo sem acesso a dados pessoais |
| Disponibilidade | Expediente, intervalo, dia fechado, passado, janela máxima, serviço inativo, durações diferentes |
| Agendamento | Gravação, duração, sobreposição (parcial e pela frente), consecutivos, idempotência, validações, limite por telefone |
| Bloqueios | Autorização, bloquear livre, nunca sobre cliente, desbloquear, recusa de passado / dia fechado / fora do expediente |
| **Regra absoluta** | Agendamento não é apagado nem alterado — nem por `DELETE`, nem por `TRUNCATE` em cascata, nem pelo dono do banco; status só depois do horário; nenhum status libera o horário |
| Correções da auditoria | Nome do cliente preservado no histórico, freio anti-robô, grade do dono igual à do site, cliente não some ao encurtar o expediente, resumo de clientes |
| Push no banco (pg_net simulado) | Chamada com token, reenvio sem duplicar, reserva atômica, erro HTTP registrado, limite de tentativas, só administradores ativos, falha do push não derruba a reserva |
| Edge Function (`fcm.test.mjs`) | Classificação dos erros do FCM (um erro de payload não desativa aparelhos), mensagem, token, UUID |
| Instalador (`instalador.test.mjs`) | `instalar_tudo.sql` em dia, roda duas vezes sem erro, `limpar_testes.sql`, `ativar_push.sql` protegido |

Os 27 casos do item 33 da especificação estão cobertos por esses grupos; o
detalhamento por caso está em [AUDITORIA.md](AUDITORIA.md).

## O que não dá para testar aqui

- **Duas conexões simultâneas de verdade**: o PGlite tem uma conexão só. A
  suíte prova o mecanismo (a constraint de exclusão e a trava), não o
  paralelismo do sistema operacional.
- **Entrega real do push**: exige Firebase e um celular reais.
- **Tempo real ponta a ponta**: depende da infraestrutura do Supabase. Teste
  abrindo o site em duas abas depois de publicado.
