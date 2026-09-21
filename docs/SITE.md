# Site público

React 18 + TypeScript + Vite, sem framework de CSS: a identidade visual é
escrita à mão sobre variáveis de tema, para bater exatamente com a logo.

---

## Rodar localmente

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

O `.env` precisa de:

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key-publica
```

Se faltar alguma das duas, o site abre normalmente mas mostra um aviso no topo
e o agendamento fica desligado — em vez de quebrar em branco.

### Sem projeto Supabase

```bash
# terminal 1 — sobe o banco real em memória e expõe a API
node supabase/tests/servidor-local.mjs

# terminal 2
cd web
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=local npm run dev
```

---

## Publicar no Netlify

O `netlify.toml` na raiz já traz tudo configurado (`base = "web"`,
`publish = "dist"`, redirect de SPA e cabeçalhos de segurança).

1. **Add new site → Import an existing project** e escolha o repositório.
2. O Netlify lê o `netlify.toml`; não é preciso mexer em build command.
3. Em **Site configuration → Environment variables**, cadastre:

   | Chave | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | a URL do projeto |
   | `VITE_SUPABASE_ANON_KEY` | a chave `anon` |

4. **Deploy**.

> As variáveis `VITE_*` entram no bundle do navegador — isso é esperado e
> seguro **somente** para a chave `anon`. Nunca cadastre a `service_role` aqui.

Depois de publicar, adicione o domínio do Netlify em
**Supabase → Authentication → URL Configuration → Redirect URLs** (mesmo o
site não fazendo login, isso mantém a configuração coerente).

---

## Como o agendamento funciona

```
AGENDAR → SERVIÇO → DATA → HORÁRIO → NOME E TELEFONE → CONFIRMAR
```

O que acontece por baixo:

1. **Serviço** — `servicos` filtrado por `ativo = true` via RLS.
2. **Data** — `dias_disponiveis()` devolve, para cada dia do mês visível, se a
   barbearia abre, se está dentro da janela de agendamento e quantos horários
   sobraram. Dias fechados e lotados aparecem riscados.
3. **Horário** — `horarios_disponiveis()` devolve a grade já considerando a
   **duração do serviço**. Horários ocupados aparecem marcados
   **"JÁ AGENDADO"** e desabilitados; horários passados e fora do expediente
   simplesmente não são oferecidos.
4. **Confirmar** — `criar_agendamento()` revalida tudo no servidor e grava.

### Proteções da tela

| Situação | O que o site faz |
|---|---|
| Vários cliques em *Confirmar* | Botão desabilita enquanto envia **e** manda sempre a mesma chave de idempotência — o banco devolve a mesma reserva em vez de criar outra. |
| Alguém marcou o horário antes | Mostra *"Esse horário acabou de ser reservado…"*, recarrega a grade e volta para a escolha de horário. |
| Internet cai no meio | Mostra *"Não foi possível concluir o agendamento…"*. **Nunca** mostra sucesso sem resposta do servidor. Tentar de novo reaproveita a mesma chave. |
| Aparelho offline | Faixa no topo e botão de confirmar bloqueado. |
| Agenda muda com a página aberta | Realtime em `agenda_publica` recarrega a grade e avisa discretamente. |

### Idempotência

Uma chave (UUID) é gerada para cada combinação de *serviço + data + horário*.
Mudou a escolha, nasce uma chave nova; repetiu o mesmo pedido, o banco devolve
a reserva original com `duplicado: true`.

---

## Estrutura

```
web/src/
├── lib/            supabase, tipos, formatação, relógio, erros
├── servicos/api.ts toda a conversa com o Supabase mora aqui
├── hooks/          dados da barbearia (com Realtime), estado da conexão
├── estilos/        base (tokens), site (seções), agendamento (fluxo)
└── componentes/
    ├── Cabecalho, Hero, SecaoServicos, SecaoFuncionamento,
    │   SecaoLocalizacao, Rodape, Icones
    └── agendamento/
        ├── ModalAgendamento   máquina de estados do fluxo
        ├── EscolhaServico · EscolhaData · EscolhaHorario
        ├── FormularioDados
        └── Confirmacao
```

Nenhum componente calcula disponibilidade. Quem decide é o banco.

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Checagem de tipos + build de produção |
| `npm run preview` | Serve o `dist/` local |
| `npm run typecheck` | Só o TypeScript |
| `npm test` | Testes unitários (Vitest) |
