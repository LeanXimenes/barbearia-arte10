# Barbearia Arte 10

Sistema completo de agendamento: site público para os clientes, aplicativo
Android para o proprietário e um único banco Supabase como fonte oficial dos
dados.

```
CLIENTE → SITE ─┐                     ┌─→ PUSH (FCM) → celular do dono
                ├─→ SUPABASE (banco) ─┤
PROPRIETÁRIO ───┘   regras + RLS      └─→ APLICATIVO ANDROID
     ↑                                          │
     └──────────── Realtime nos dois lados ─────┘
```

---

## O que tem aqui

| Pasta | O que é |
|---|---|
| `web/` | Site público (React + TypeScript + Vite). É onde o cliente agenda. |
| `android/` | Aplicativo do proprietário (Kotlin + Jetpack Compose). |
| `supabase/migrations/` | Todo o banco: tabelas, índices, constraints, funções e RLS. |
| `supabase/functions/` | Edge Function que entrega as notificações push via FCM. |
| `supabase/tests/` | Suíte de testes do banco rodando num PostgreSQL real. |
| `docs/` | Guias passo a passo de instalação e publicação. |

---

## A regra que sustenta tudo

O horário só é considerado livre quando **o banco** diz que está livre.

Nada no navegador e nada no aplicativo decide disponibilidade. As três camadas
de proteção contra dois clientes pegarem o mesmo horário são:

1. **`EXCLUDE USING gist (periodo WITH &&)`** na tabela `agendamentos` — o
   PostgreSQL recusa fisicamente dois agendamentos que se sobreponham, mesmo
   que as duas transações cheguem no mesmo milissegundo.
2. **`pg_advisory_xact_lock`** dentro de `criar_agendamento` e `criar_bloqueio`
   — serializa reserva e bloqueio, que vivem em tabelas diferentes.
3. **Revalidação completa no servidor** na hora de confirmar: serviço ativo,
   dia aberto, expediente, intervalo, horário passado, bloqueios e sobreposição
   são conferidos de novo, ignorando o que a tela mostrava.

E a regra do item 14 da especificação:

> **Um agendamento de cliente nunca pode ser cancelado ou excluído pelo
> proprietário.**

Isso não é só a ausência de um botão. O banco tem um trigger que recusa
`DELETE` e qualquer `UPDATE` que mexa em data, horário, cliente ou serviço —
vale até para quem entrar com acesso administrativo direto. O enum de status
nem sequer tem um valor "cancelado", justamente para não existir caminho que
libere o horário.

---

## Instalação em 4 passos

Os guias detalhados estão em [`docs/`](docs/). O resumo:

### 1. Banco (Supabase)

```bash
# Crie um projeto em https://supabase.com e rode, no SQL Editor,
# cada arquivo de supabase/migrations/ na ordem do nome, depois o seed.sql.
# Ou, com a CLI:
npx supabase link --project-ref SEU_REF
npx supabase db push
```

Detalhes, incluindo como criar o usuário do proprietário:
[`docs/SUPABASE.md`](docs/SUPABASE.md)

### 2. Site

```bash
cd web
cp .env.example .env     # preencha com a URL e a anon key do seu projeto
npm install
npm run dev
```

Publicação no Netlify: [`docs/SITE.md`](docs/SITE.md)

### 3. Aplicativo Android

```bash
cd android
cp local.properties.exemplo local.properties   # preencha SDK + Supabase
# coloque o google-services.json do Firebase em android/app/
./gradlew assembleDebug
```

Detalhes e configuração do Firebase: [`docs/APLICATIVO.md`](docs/APLICATIVO.md)

### 4. Notificações push

```bash
npx supabase functions deploy notificar-agendamento
npx supabase secrets set FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... \
  FIREBASE_PRIVATE_KEY="..." EDGE_TOKEN=...
```

E aponte o banco para a função (SQL no fim de `supabase/seed.sql`).

---

## Rodando os testes

```bash
# Banco: 73 testes num PostgreSQL de verdade (PGlite), sem precisar de Docker
cd supabase/tests && npm install && npm test

# Site: formatação, datas, telefone e tratamento de falhas
cd web && npm test
```

O que cada teste cobre, e o mapa dos 27 casos exigidos na especificação:
[`docs/TESTES.md`](docs/TESTES.md)

### Rodar o site inteiro sem um projeto Supabase

Dá para subir o banco real em memória e apontar o site para ele:

```bash
# terminal 1
node supabase/tests/servidor-local.mjs

# terminal 2
cd web
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=local npm run dev
```

É o mesmo SQL de produção — serve para testar o fluxo de agendamento
completo antes de publicar. (O Realtime não sobe nesse modo; tudo o mais
funciona.)

---

## Segurança

- O site e o aplicativo usam **apenas a chave `anon`**, que é pública por
  natureza. A `service_role` key existe só dentro da Edge Function, no
  servidor.
- **RLS ligado em todas as tabelas.** O visitante anônimo não lê `clientes`,
  não lê `agendamentos` e não escreve em lugar nenhum — ele só pode chamar
  `criar_agendamento`, que é `SECURITY DEFINER` e valida tudo.
- Para o Realtime funcionar no site sem vazar dados, existe a tabela
  `agenda_publica`: um espelho dos períodos ocupados **sem nome, telefone ou
  serviço**. É a única coisa de agenda que o anônimo enxerga.
- Segredos do backend ficam em `private.segredos`, um schema sem nenhum grant
  para `anon` ou `authenticated`.
- Nenhuma credencial está versionada. `.env`, `local.properties` e
  `google-services.json` estão no `.gitignore`.

---

## Identidade visual

Azul profundo + dourado, tirados da logo (`logoart10.jpeg`). O site e o
aplicativo compartilham a mesma paleta:

| | |
|---|---|
| Azul de fundo | `#040A18` |
| Azul da logo | `#16368C` |
| Dourado | `#E2B85C` |
| Dourado claro | `#F6DFA8` |
