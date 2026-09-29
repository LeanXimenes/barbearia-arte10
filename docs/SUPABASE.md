# Banco de dados (Supabase)

O banco é a fonte oficial dos dados. O site e o aplicativo só leem e gravam
através dele, com as regras aplicadas no servidor.

> Guia rápido e ilustrado: **`docs/Guia-colocar-o-site-no-ar.pdf`**.
> Este arquivo é a referência completa.

---

## 1. Instalar o banco (um arquivo só)

1. Abra o **SQL Editor** do projeto:
   `https://supabase.com/dashboard/project/SEU-PROJETO/sql/new`
2. Abra `supabase/instalar_tudo.sql` no Bloco de Notas, copie **tudo** e cole
   no editor.
3. Clique em **Run**. O Supabase avisa que o script tem comandos `drop`
   ("destructive operation") — é esperado: são só `drop ... if exists` para o
   script poder ser rodado de novo. Confirme em **Run this query**.
4. A última linha do resultado deve dizer
   *"Barbearia Arte 10: banco instalado com sucesso."*

O instalador pode ser rodado de novo sem estragar nada. Ele é gerado a partir
de `supabase/migrations/` + `supabase/seed.sql`:

```bash
node supabase/gerar_instalador.mjs
```

(A suíte de testes falha se o `instalar_tudo.sql` estiver desatualizado.)

### Alternativa: Supabase CLI

```bash
npx supabase login
npx supabase link --project-ref SEU-PROJETO
npx supabase db push --include-seed
```

---

## 2. Chaves

Em **Project Settings → API Keys**:

| Chave | Pode ir no site / app? |
|---|---|
| **Publishable** (`sb_publishable_...`) ou a antiga **anon** | Sim — é pública por natureza. Vai em `VITE_SUPABASE_PUBLISHABLE_KEY` (site) e `SUPABASE_ANON_KEY` (app). |
| **Secret** (`sb_secret_...`) / antiga **service_role** | **Nunca.** Só existe dentro da Edge Function, no servidor. |
| Senha do banco | Nunca em código nem em chat. |

---

## 3. Dados da barbearia

O instalador já vem com os dados reais (arquivo `supabase/seed.sql`):

| | |
|---|---|
| Endereço | Rua Joaquim Iglesias, 889 — Santa Albertina/SP |
| WhatsApp | (17) 99731-3480 |
| Instagram | @aquiles.hiroshi |
| Segunda a sexta | 08:00 — 12:30 |
| Sábado e domingo | 09:00 — 23:00 |

Para mudar depois: pelo aplicativo (**Ajustes**) ou no SQL Editor:

```sql
update public.config_barbearia set
  telefone_whatsapp = '17997313480',   -- só números, com DDD
  instagram         = 'aquiles.hiroshi',
  endereco          = 'Rua Joaquim Iglesias, 889',
  cidade            = 'Santa Albertina',
  uf                = 'SP'
where id;
```

---

## 4. Conta do aplicativo do barbeiro (o app não tem login)

O app entra sozinho com uma **conta dedicada**. Crie uma vez:

1. **Authentication → Users → Add user → Create new user**
   - e-mail: por exemplo `app@barbeariaarte10.com.br`
   - senha: **longa e aleatória** (ninguém vai digitá-la; ela só vai no
     `local.properties` na hora de gerar o app)
   - marque **Auto Confirm User**
2. No SQL Editor, libere a conta como administradora:

```sql
insert into public.administradores (user_id, nome)
select id, 'App do barbeiro'
  from auth.users
 where email = 'app@barbeariaarte10.com.br'
on conflict (user_id) do update set ativo = true;
```

3. **Authentication → Sign In / Providers**: desligue **Allow new users to
   sign up**. O site não usa login e ninguém precisa criar conta.

### Celular perdido / cortar o acesso

```sql
update public.administradores set ativo = false
 where user_id = (select id from auth.users where email = 'app@barbeariaarte10.com.br');
```

Tem efeito imediato: o RLS nega tudo para essa conta e os aparelhos dela
param de receber push. Depois, troque a senha em **Authentication → Users**,
gere o app de novo com a senha nova e volte `ativo = true`.

---

## 5. Realtime

O instalador já publica as tabelas. Confira em **Database → Publications →
supabase_realtime**:

- `agenda_publica` — assinada pelo **site** (sem nenhum dado pessoal)
- `agendamentos` e `bloqueios` — assinadas pelo **aplicativo**
- `servicos` e `config_horarios` — o site reflete mudanças na hora

---

## 6. Notificações push

Precisa do Firebase (veja [APLICATIVO.md](APLICATIVO.md#2-notificações-push)).

1. **Database → Extensions**: habilite **pg_net** e **pg_cron**.
2. Publique a função (PowerShell, na pasta `C:\arte10`):

```powershell
npx supabase login
npx supabase functions deploy notificar-agendamento --no-verify-jwt --project-ref SEU-PROJETO
```

3. **Edge Functions → Secrets** (ou `npx supabase secrets set ...`):

| Secret | Valor |
|---|---|
| `FIREBASE_PROJECT_ID` | `project_id` da conta de serviço |
| `FIREBASE_CLIENT_EMAIL` | `client_email` da conta de serviço |
| `FIREBASE_PRIVATE_KEY` | `private_key` inteira (com `-----BEGIN...`) |
| `EDGE_TOKEN` | um texto longo e aleatório (24+ caracteres) |

4. Abra `supabase/ativar_push.sql`, troque a URL da função e o mesmo
   `EDGE_TOKEN`, e rode no SQL Editor. Ele grava a configuração e agenda o
   reenvio automático a cada 2 minutos.

Se o push falhar, **o agendamento continua valendo**. O motivo fica em
`public.notificacoes.erro` (ex.: `Edge Function respondeu HTTP 401`) e o envio
é tentado de novo. Para conferir:

```sql
select created_at, status, tentativas, disparos, erro
  from public.notificacoes order by created_at desc limit 10;
```

---

## 7. Antes de divulgar o site: apagar os testes

Agendamento de cliente é permanente (regra do sistema). Faça seus testes com
o nome começando por **TESTE** e, **antes de divulgar**, rode
`supabase/limpar_testes.sql`. Depois do lançamento, não use.

---

## Mapa do banco

### Tabelas

| Tabela | Para quê |
|---|---|
| `clientes` | Nome e telefone. O telefone é único e identifica o cliente. |
| `servicos` | Nome, descrição, preço, duração e ativo/inativo. |
| `agendamentos` | As reservas. **Imutáveis**. Guardam uma "fotografia" do nome do cliente e do serviço. |
| `bloqueios` | Períodos fechados manualmente pelo dono. |
| `agenda_publica` | Espelho dos períodos ocupados, sem dado pessoal. É o que o site anônimo enxerga. |
| `config_barbearia` | Registro único: contato, endereço, grade, janela de agendamento, limites. |
| `config_horarios` | Expediente e intervalo de cada dia da semana. |
| `administradores` | Liga um usuário do Auth ao papel de administrador. |
| `dispositivos_push` | Tokens FCM dos aparelhos. |
| `notificacoes` | Fila dos pushes, com status, tentativas e erro. |
| `private.segredos` | URL e token da Edge Function. Sem acesso para ninguém da API. |

### Funções

| Função | Quem chama | O que faz |
|---|---|---|
| `horarios_disponiveis(servico, data)` | site | Grade do dia, com `disponivel` e o motivo (`ocupado` / `bloqueado`). |
| `dias_disponiveis(servico, início, fim)` | site | Por dia: abre? dentro da janela? quantos horários livres? |
| `criar_agendamento(...)` | site | **Único** caminho de gravação. Revalida tudo, idempotente, com freio anti-robô. |
| `agenda_do_dia(data)` | app | Linha do tempo: agendado / bloqueado / livre (na mesma grade do site) / intervalo. |
| `visao_geral_periodo(início, fim)` | app | Contagens por dia para o calendário. |
| `criar_bloqueio(...)` / `remover_bloqueio(id)` | app | Fecha / libera um período. Nunca toca em agendamento de cliente. |
| `atualizar_status_agendamento(id, status)` | app | Desfecho (atendido / faltou), só depois do horário. Não libera o horário. |
| `registrar_dispositivo(token, modelo)` | app | Guarda o token de push do aparelho. |
| `reservar_notificacao` / `finalizar_notificacao` / `destinos_push` | Edge Function | Envio de push sem duplicar e só para administradores ativos. |

### Por que um agendamento não pode ser apagado

- gatilho `BEFORE DELETE` e `BEFORE UPDATE` que recusa apagar ou mudar data,
  horário, cliente, serviço ou valores;
- gatilho `BEFORE TRUNCATE` (inclusive em cascata a partir de `clientes` ou
  `servicos`);
- o app não tem `DELETE` nem `UPDATE` na tabela — só a função de status;
- o status só muda depois do horário e nenhum status libera o horário.

A única forma de apagar é o dono do banco desligar o gatilho de propósito,
como faz o `limpar_testes.sql` (só para antes do lançamento).
