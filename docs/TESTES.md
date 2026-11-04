# Testes

## Como rodar

```powershell
# Banco (136), push do Android (9), avisos do iPhone (7), instalador (5) e blindagem (26)
cd C:\arte10\supabase\tests
npm install
npm test

# Site (60)
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
| Conta do cliente (login) | Número brasileiro válido, senha com bcrypt e sessão só em hash, número/e-mail sem repetir, entrar por número ou e-mail, trava depois de 5 senhas erradas, sessão vencida, agendar logado, cada conta só vê os próprios horários, freio de contas novas |
| Edge Function (`fcm.test.mjs`) | Classificação dos erros do FCM (um erro de payload não desativa aparelhos), mensagem, token, UUID |
| Instalador (`instalador.test.mjs`) | `instalar_tudo.sql` em dia, roda duas vezes sem erro, `limpar_testes.sql`, `ativar_push.sql` protegido |
| Blindagem (`seguranca.test.mjs`) | IP certo (cf-connecting-ip; x-forwarded-for forjado não engana), contador com janela deslizante, 429 + Retry-After, freio por rota e por IP, /rpc só por POST, pedido grande (413), freios de login/conta/agendamento/cancelamento, funções por telefone fechadas, plano só da própria conta, aviso só para serviços de push (sem SSRF) e até 5 aparelhos, sessão de 1 ano, link do mapa sem `javascript:`, agenda pública sem histórico, Turnstile (desligado sem as chaves; sem token/token recusado não cria conta; Cloudflare fora do ar não trava; chave secreta fechada) |

Os 27 casos do item 33 da especificação estão cobertos por esses grupos; o
detalhamento por caso está em [AUDITORIA.md](AUDITORIA.md).

## O que não dá para testar aqui

- **Duas conexões simultâneas de verdade**: o PGlite tem uma conexão só. A
  suíte prova o mecanismo (a constraint de exclusão e a trava), não o
  paralelismo do sistema operacional.
- **Entrega real do push**: exige Firebase e um celular reais.
- **Tempo real ponta a ponta**: depende da infraestrutura do Supabase. Teste
  abrindo o site em duas abas depois de publicado.
