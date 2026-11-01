# Painel do dono (iPhone), avisos e lembretes

Este guia cobre o que entrou depois do app Android:

- **Painel do dono** num site próprio (outro endereço do Netlify): faz tudo o que
  o app Android faz e se instala na Tela de Início do iPhone.
- **Avisos** de novo agendamento e de cancelamento pelo cliente, no Android e no iPhone.
- **Lembrete 30 minutos antes** do corte: para o dono e para o cliente que ligar o
  lembrete no site.
- **Cliente cancela pelo site** até 40 minutos antes; depois disso, só falando com a barbearia.

---

## 1. Banco (uma vez)

No Supabase, em **SQL Editor**, cole o `supabase/instalar_tudo.sql` inteiro e clique
em **Run**. Ele só acrescenta o que falta.

## 2. Painel num site próprio do Netlify

```powershell
cd C:\arte10\web
npm run build:painel      # gera a pasta web\dist-painel
```

No Netlify: **Add new project → Deploy manually** e arraste a pasta
`web\dist-painel`. Depois, em **Project configuration → General → Change project
name**, use algo como `arte10-painel` (o endereço fica
`https://arte10-painel.netlify.app`). A raiz já abre o painel.

Para atualizar depois: `npm run build:painel` e arraste de novo em **Deploys**
desse projeto. O site dos clientes continua com `npm run build` (pasta `web\dist`).

Desligue o balão "Powered by Netlify" também nesse projeto
(**Project configuration → General → Powered by Netlify badge**).

## 3. Conta de administrador do irmão

1. Supabase → **Authentication → Users → Add user → Create new user**: e-mail e
   senha dele, marque **Auto Confirm User**.
2. No **SQL Editor** (troque o e-mail):

   ```sql
   insert into public.administradores (user_id, nome)
   select id, 'Irmão' from auth.users where email = 'email-do-irmao@exemplo.com'
   on conflict (user_id) do update set ativo = true;
   ```

Para tirar o acesso: `update public.administradores set ativo = false where nome = 'Irmão';`

## 4. Instalar no iPhone

1. No **Safari**, abra o endereço do painel.
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**.
3. Abra pelo ícone novo, entre com o e-mail e a senha.
4. Toque em **Ativar avisos** e permita as notificações (iOS 16.4 ou mais novo).

## 5. Avisos e lembretes (push)

Os avisos saem pela Edge Function `notificar-agendamento` (a mesma do Android):

1. **Extensões:** Supabase → Database → Extensions: ligue **pg_net** e **pg_cron**.
2. **Função:** publique `supabase/functions/notificar-agendamento` (pasta inteira).
3. **Segredos** (Edge Functions → Secrets):
   - `EDGE_TOKEN`: um texto longo qualquer (24+ caracteres);
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: estão em
     `supabase/chaves-iphone.local.txt` (gerado por `node supabase/gerar_chaves_iphone.mjs`;
     a chave privada nunca vai para o git);
   - Firebase (`FIREBASE_*`): só para o app Android.
4. **Ligar:** edite e rode `supabase/ativar_push.sql` (URL da função e o mesmo
   `EDGE_TOKEN`). Ele agenda o reenvio dos avisos e o **lembrete de 30 minutos**
   (roda a cada minuto).

### Lembrete do cliente

O cliente liga em **Minha conta → Ligar lembrete**. No Android funciona direto no
Chrome; no iPhone, o site precisa estar instalado na Tela de Início (a aba **App**
do site ensina). Ao sair da conta, o celular para de receber os lembretes dela.

### O que chega para o dono

| Aviso | Quando |
|---|---|
| Novo agendamento | Na hora em que o cliente marca. |
| Horário cancelado pelo cliente | Na hora em que ele cancela pelo site. |
| Daqui a 30 minutos | 30 minutos antes de cada horário marcado (uma vez só). |

## 6. Cancelamento pelo cliente

Em **Minha conta**, cada próximo horário tem **Cancelar horário** até 40 minutos
antes. Faltando menos, aparece "fale com a barbearia" com o link do WhatsApp. O
banco confere a regra de novo (`cancelar_meu_agendamento`), libera o horário no
site e avisa o dono.
