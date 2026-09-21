# Banco de dados (Supabase)

O banco é a fonte oficial dos dados. O site e o aplicativo só leem e escrevem
através dele, com as regras aplicadas no servidor.

---

## 1. Criar o projeto

1. Entre em <https://supabase.com> e crie um projeto novo.
2. Escolha a região mais próxima (para o Brasil: **South America (São Paulo)**).
3. Guarde a senha do banco — ela é pedida uma vez só.

Em **Project Settings → API** você encontra os dois valores usados pelo site e
pelo aplicativo:

| Valor | Onde usar |
|---|---|
| `Project URL` | `VITE_SUPABASE_URL` / `SUPABASE_URL` |
| `anon public` | `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` |
| `service_role` | **em lugar nenhum do site ou do app.** Só na Edge Function. |

---

## 2. Aplicar as migrações

### Opção A — pelo painel (mais simples)

Abra **SQL Editor** e cole o conteúdo de cada arquivo, **na ordem do nome**:

```
supabase/migrations/20260101000100_extensoes_e_enums.sql
supabase/migrations/20260101000200_tabelas.sql
supabase/migrations/20260101000300_regras_de_integridade.sql
supabase/migrations/20260101000400_funcoes_disponibilidade.sql
supabase/migrations/20260101000500_funcao_criar_agendamento.sql
supabase/migrations/20260101000600_funcoes_admin.sql
supabase/migrations/20260101000700_rls_e_permissoes.sql
supabase/migrations/20260101000800_notificacoes_e_realtime.sql
supabase/migrations/20260101000900_visoes_do_aplicativo.sql
```

Depois rode `supabase/seed.sql` uma vez.

### Opção B — pela CLI

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

---

## 3. Preencher os dados da barbearia

O `seed.sql` deixa os campos de contato em branco de propósito, para o site não
publicar um endereço inventado. Preencha de um destes jeitos:

- **Pelo aplicativo:** aba *Ajustes* → *Editar dados*. É o caminho normal do
  dia a dia.
- **Pelo SQL Editor**, se preferir fazer agora:

```sql
update public.config_barbearia set
  telefone_whatsapp = '17999999999',        -- só números, com DDD
  instagram         = 'barbeariaarte10',
  endereco          = 'Rua Exemplo, 123 - Centro',
  cidade            = 'Sua Cidade',
  uf                = 'SP'
where id;
```

Os horários de funcionamento vêm preenchidos assim (também editáveis no app):

| Dia | Expediente | Intervalo |
|---|---|---|
| Segunda a quinta | 09:00 — 19:00 | 12:00 — 13:30 |
| Sexta | 09:00 — 20:00 | 12:00 — 13:30 |
| Sábado | 08:00 — 18:00 | — |
| Domingo | fechado | — |

---

## 4. Criar o usuário do proprietário

Entrar no aplicativo exige duas coisas: uma conta no Supabase Auth **e** um
registro em `public.administradores`. Ter só a conta não dá acesso a nada.

1. **Authentication → Users → Add user**: informe e-mail e senha, e marque
   *Auto Confirm User*.
2. No **SQL Editor**:

```sql
insert into public.administradores (user_id, nome)
select id, 'Proprietário'
  from auth.users
 where email = 'proprietario@barbeariaarte10.com.br'
on conflict (user_id) do update set ativo = true;
```

3. Em **Authentication → Providers → Email**, **desligue** *Enable Sign Ups*.
   Ninguém precisa criar conta: só o proprietário entra, e a conta dele já
   existe.

---

## 5. Ligar o Realtime

Em **Database → Replication → `supabase_realtime`**, confirme que estas tabelas
estão publicadas (a migração `..._notificacoes_e_realtime.sql` já tenta fazer
isso automaticamente):

- `agenda_publica` — assinada pelo **site**, sem nenhum dado pessoal
- `agendamentos` e `bloqueios` — assinadas pelo **aplicativo** do proprietário
- `servicos` e `config_horarios` — para o site refletir mudanças na hora

---

## 6. Ligar as notificações push

Faça primeiro o [guia do aplicativo](APLICATIVO.md#notificações-push), que
gera as credenciais do Firebase. Depois:

```bash
npx supabase functions deploy notificar-agendamento

npx supabase secrets set \
  FIREBASE_PROJECT_ID="seu-projeto-firebase" \
  FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@seu-projeto.iam.gserviceaccount.com" \
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n" \
  EDGE_TOKEN="um-segredo-longo-e-aleatorio"
```

Habilite a extensão **`pg_net`** em *Database → Extensions* e diga ao banco
onde a função mora:

```sql
insert into private.segredos (chave, valor) values
  ('edge_notificacoes_url',   'https://SEU-PROJETO.supabase.co/functions/v1/notificar-agendamento'),
  ('edge_notificacoes_token', 'um-segredo-longo-e-aleatorio')   -- igual ao EDGE_TOKEN
on conflict (chave) do update set valor = excluded.valor, updated_at = now();
```

Opcional, mas recomendado — reenviar o que falhou, de 2 em 2 minutos
(extensão `pg_cron`):

```sql
select cron.schedule(
  'reenviar-notificacoes',
  '*/2 * * * *',
  $$ select public.reenviar_notificacoes_pendentes(20) $$
);
```

Se o push falhar, **o agendamento continua válido**. A notificação fica
`pendente` e é reenviada; nada do fluxo do cliente depende disso.

---

## Mapa do banco

### Tabelas

| Tabela | Para quê |
|---|---|
| `clientes` | Nome e telefone. O telefone é único e identifica o cliente. |
| `servicos` | Nome, descrição, preço, duração e ativo/inativo. |
| `agendamentos` | As reservas. **Imutáveis** (ver abaixo). |
| `bloqueios` | Períodos fechados manualmente pelo proprietário. |
| `agenda_publica` | Espelho dos períodos ocupados, sem dado pessoal. É o que o site anônimo enxerga. |
| `config_barbearia` | Registro único: contato, endereço, grade de horários, janela de agendamento. |
| `config_horarios` | Expediente e intervalo de cada dia da semana. |
| `administradores` | Liga um usuário do Auth ao papel de administrador. |
| `dispositivos_push` | Tokens FCM dos aparelhos do proprietário. |
| `notificacoes` | Caixa de saída dos pushes, com status e tentativas. |
| `private.segredos` | URL e token da Edge Function. Sem grant para ninguém. |

### Funções

| Função | Quem chama | O que faz |
|---|---|---|
| `horarios_disponiveis(servico, data)` | site | Grade do dia com `disponivel` e o motivo (`ocupado` / `bloqueado`). |
| `dias_disponiveis(servico, início, fim)` | site | Para cada dia: aberto? dentro da janela? quantos horários livres? |
| `criar_agendamento(...)` | site | **Único** caminho de gravação. Revalida tudo e devolve JSON. |
| `agenda_do_dia(data)` | app | Linha do tempo completa: agendado / bloqueado / livre / intervalo. |
| `visao_geral_periodo(início, fim)` | app | Contagens por dia, para pintar o calendário. |
| `criar_bloqueio(...)` | app | Fecha um período livre. Recusa se houver cliente agendado. |
| `remover_bloqueio(id)` | app | Libera um bloqueio. **Só mexe em `bloqueios`.** |
| `atualizar_status_agendamento(id, status)` | app | Registra o desfecho. Não libera o horário. |
| `registrar_dispositivo(token, modelo)` | app | Guarda o token FCM do aparelho. |

### Por que um agendamento não pode ser apagado

```sql
-- Trigger em public.agendamentos
create trigger trg_agendamentos_sem_exclusao
  before delete on public.agendamentos
  for each row execute function public.tg_agendamento_imutavel();
```

Além do trigger:

- `authenticated` não tem `GRANT DELETE` na tabela;
- não existe policy de `DELETE`;
- o `UPDATE` permitido só alcança `status` e `observacoes`;
- o enum `agendamento_status` tem apenas `agendado`, `concluido` e
  `nao_compareceu` — **nenhum deles libera o horário**.

Para apagar um registro seria preciso um DBA desabilitando o trigger
explicitamente no banco. É de propósito.
