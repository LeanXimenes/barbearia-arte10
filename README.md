# Barbearia Arte 10

Sistema completo de agendamento: **site** para os clientes, **aplicativo
Android** para o barbeiro e um único banco **Supabase** como fonte oficial dos
dados.

```
CLIENTE → SITE ─┐                     ┌─→ PUSH (FCM) → celular do barbeiro
                ├─→ SUPABASE (banco) ─┤
BARBEIRO → APP ─┘   regras + RLS      └─→ APP (tempo real)
```

> **Para colocar o site no ar:** siga `docs/Guia-colocar-o-site-no-ar.pdf`.

---

## O que tem aqui

| Pasta / arquivo | O que é |
|---|---|
| `web/` | Site público (React + TypeScript + Vite). |
| `android/` | App do barbeiro (Kotlin + Compose). **Sem login**: entra sozinho. |
| `supabase/instalar_tudo.sql` | O banco inteiro em **um arquivo** para colar no SQL Editor. |
| `supabase/ativar_push.sql` | Liga as notificações push (depois da Edge Function). |
| `supabase/limpar_testes.sql` | Apaga agendamentos de teste — só antes de abrir ao público. |
| `supabase/migrations/` | As migrações (fonte do instalador). |
| `supabase/functions/` | Edge Function que entrega o push pelo Firebase. |
| `supabase/tests/` | Testes do banco num PostgreSQL real (PGlite). |
| `logo/` | Logo oficial (de onde saem todos os ícones do site e do app). |
| `docs/` | Guias e o relatório da auditoria. |

---

## A regra que sustenta tudo

O horário só é livre quando **o banco** diz que é:

1. **Constraint de exclusão** (`EXCLUDE USING gist`) — o PostgreSQL recusa
   fisicamente dois agendamentos que se sobreponham, mesmo ao mesmo tempo.
2. **Trava** (`pg_advisory_xact_lock`) — serializa reserva e bloqueio.
3. **Revalidação no servidor** na confirmação: serviço, dia, expediente,
   intervalo, horário passado, bloqueios e sobreposição.

E a regra do item 14: **agendamento de cliente nunca é cancelado nem
apagado.** Gatilhos recusam `DELETE`, `TRUNCATE` e mudança de data, horário,
cliente ou serviço; o status só registra o desfecho depois do horário e nenhum
status libera o horário.

---

## Instalação (resumo)

1. **Banco** — cole `supabase/instalar_tudo.sql` no SQL Editor do Supabase e
   clique em Run. ([docs/SUPABASE.md](docs/SUPABASE.md))
2. **Site** — `npm run build` em `web/` e publique a pasta `dist` no Netlify.
   ([docs/SITE.md](docs/SITE.md))
3. **App** — crie a conta do app no Supabase, preencha
   `android/local.properties` e gere o APK. ([docs/APLICATIVO.md](docs/APLICATIVO.md))
4. **Push** — Firebase + Edge Function + `supabase/ativar_push.sql`.

---

## Testes

```powershell
cd supabase\tests; npm install; npm test     # banco, push e instalador
cd ..\..\web; npm test                        # site
cd ..\android; .\gradlew.bat assembleDebug lintDebug
```

Detalhes em [docs/TESTES.md](docs/TESTES.md). Resultado da revisão completa
em [docs/AUDITORIA.md](docs/AUDITORIA.md).

---

## Segurança

- Site e app usam **só a chave pública** (publishable/anon). A chave secreta
  existe apenas na Edge Function.
- **RLS em todas as tabelas.** O anônimo não lê clientes nem agendamentos e
  não grava em lugar nenhum — só chama `criar_agendamento`, que valida tudo.
- O tempo real do site usa `agenda_publica`: só períodos ocupados, sem nome
  ou telefone.
- O app não tem login por decisão do dono: a conta dele vai dentro do APK.
  Não compartilhe o APK; para cortar um celular perdido, desative a conta em
  `administradores` (veja [docs/SUPABASE.md](docs/SUPABASE.md)).
- Nenhuma credencial é versionada (`.env`, `local.properties`,
  `google-services.json` estão no `.gitignore`).
