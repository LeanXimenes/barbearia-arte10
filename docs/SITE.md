# Site público

React 18 + TypeScript + Vite. A identidade visual (azul `#013681` e dourado
`#FADF68`) é tirada da logo em `logo/logoart10.jpeg`.

> Guia rápido para publicar: **`docs/Guia-colocar-o-site-no-ar.pdf`**.

---

## Configuração

O site precisa de duas variáveis, ambas **públicas**:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

- Em desenvolvimento ficam em `web/.env` (fora do git; modelo em
  `web/.env.example`). A variável antiga `VITE_SUPABASE_ANON_KEY` também é
  aceita.
- No Netlify ficam em **Site configuration → Environment variables**.
- Nunca coloque a chave **secret** / **service_role** aqui.

Sem as variáveis, o site abre mas mostra um aviso no topo e o agendamento
fica desligado.

---

## Rodar no computador (PowerShell)

```powershell
cd C:\arte10\web
npm install
npm run dev          # usa o Supabase do web\.env
```

### Modo demonstração (sem Supabase)

Sobe o banco real em memória, com as mesmas migrações de produção:

```powershell
# janela 1
cd C:\arte10\web
npm run api:demo

# janela 2
cd C:\arte10\web
npm run dev:demo
```

(O tempo real não funciona nesse modo; o resto funciona.)

---

## Publicar no Netlify

### Opção A — arrastar e soltar (mais simples)

```powershell
cd C:\arte10\web
npm install
npm run build        # gera a pasta web\dist usando o web\.env
```

Abra <https://app.netlify.com/drop> e arraste a pasta `web\dist`. Para
atualizar depois: `npm run build` e arraste de novo em **Deploys**.

Os cabeçalhos de segurança vão junto (`web/public/_headers`).

### Opção B — pelo GitHub (atualiza sozinho)

1. Suba o projeto para um repositório no GitHub.
2. Netlify → **Add new project → Import an existing project** → escolha o
   repositório. O `netlify.toml` já diz tudo (`base = "web"`, `publish = "dist"`).
3. **Environment variables**: `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. **Deploy**.

### Imagem ao compartilhar no WhatsApp

A imagem de compartilhamento (`og-image.jpg`) precisa de endereço completo.
Na opção B o Netlify preenche sozinho. Na opção A, acrescente ao `web\.env`
`VITE_SITE_URL=https://seu-site.netlify.app`, gere de novo e publique.

---

## Como o agendamento funciona

```
AGENDAR → SERVIÇO → DIA → HORÁRIO → NOME E TELEFONE → CONFIRMAR
```

1. **Serviço** — só os ativos (RLS).
2. **Dia** — `dias_disponiveis()`: dias fechados e lotados aparecem riscados.
3. **Horário** — `horarios_disponiveis()` já considera a duração do serviço.
   Ocupados aparecem **"JÁ AGENDADO"**; passados e fora do expediente nem
   aparecem.
4. **Confirmar** — `criar_agendamento()` revalida tudo no servidor e grava.

| Situação | O que o site faz |
|---|---|
| Vários cliques em Confirmar | Botão trava durante o envio e a mesma chave de idempotência vai em todas as tentativas: o banco devolve a mesma reserva. |
| Alguém marcou antes | *"Esse horário acabou de ser reservado…"*, recarrega e volta para a escolha. |
| Internet cai | *"Não foi possível concluir o agendamento…"* — nunca um falso sucesso. |
| Agenda muda com a página aberta | Tempo real em `agenda_publica` recarrega a grade. |
| Robô tentando lotar a agenda | Limite de reservas por 10 minutos (configurável) e por telefone. |

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Desenvolvimento com o Supabase do `.env` |
| `npm run api:demo` + `npm run dev:demo` | Demonstração com banco local |
| `npm run build` | Checagem de tipos + versão de produção em `dist/` |
| `npm test` | Testes (Vitest) |
