# Segurança

Como o site, o painel e o banco se defendem, o que conferir no Supabase e no
Netlify, e como desfazer se precisar. A auditoria de novembro de 2026 entrou na
migração `20260101001600_blindagem_limites_e_acesso.sql`.

## Como está montado

Os dois sites (clientes e painel) são arquivos estáticos no Netlify. Eles falam
**direto com o Supabase**, com a chave pública. Não há servidor no meio, então
toda regra que importa mora no banco:

| Camada | O que faz |
|---|---|
| RLS + permissões | O visitante não lê nenhuma tabela com dado pessoal nem grava em tabela nenhuma. Só chama funções que conferem tudo. |
| Funções `SECURITY DEFINER` | Toda gravação passa por uma função com `search_path` fixo, que revalida os dados no servidor. |
| Checagem antes de cada chamada | `private.checar_requisicao()` (o `db_pre_request` do PostgREST): freio por IP e por rota, `/rpc` só por POST e pedido de no máximo 16 KB. |
| Freios dentro das funções | Por IP e por conta (login, conta nova, agendar, cancelar, plano, aparelho). Valem mesmo que a checagem acima seja desligada. |
| Travas de negócio | Sem sobreposição de horário (constraint de exclusão), idempotência, agendamento imutável, até 3 horários em aberto por número e freio geral de 20 reservas e 20 contas novas a cada 10 minutos. |
| CSP e cabeçalhos | O navegador só roda scripts do próprio site e só conversa com o Supabase deste projeto (`web/public/_headers`). |

### Limites (os contadores ficam em `private.limites`, no banco)

| Onde | Limite |
|---|---|
| Qualquer chamada do site (por IP) | 120 por minuto (painel do dono: 600) |
| `entrar` (por IP) | 10 por minuto e 30 a cada 15 minutos; 5 senhas erradas travam aquele número por 15 min |
| `criar_conta` (por IP) | 5 por minuto e 10 contas novas por hora |
| `criar_agendamento_conta` | 10 por minuto por IP, 30 por hora por IP, 15 por dia por conta |
| `cancelar_meu_agendamento` | 10 por minuto por IP, 5 por dia por conta |
| `solicitar_plano_conta` | 5 por minuto por IP, 10 por hora por IP, 3 por dia por conta |
| `registrar_aparelho_conta` | 10 por minuto por IP, 10 aparelhos novos por dia, no máximo 5 por conta |
| `dias_disponiveis` / `horarios_disponiveis` / `minha_conta` | 40 / 90 / 40 por minuto por IP |

Os limites são folgados para muitos clientes na mesma rede (as operadoras de
celular põem várias pessoas atrás do mesmo IP) e apertados para um robô. A
janela é **deslizante**: não dá para dobrar o limite na virada do minuto.

Ao passar do limite, a resposta é **HTTP 429** com `Retry-After`, e o site
mostra "Muitos pedidos seguidos deste aparelho. Espere alguns minutos e tente de
novo". Depois do tempo, volta sozinho.

**O IP vem do `cf-connecting-ip`**, que o Cloudflare do Supabase grava. No
`x-forwarded-for` só vale o último endereço, porque o visitante consegue
inventar o começo. IP interno ou inválido não é travado: na dúvida, ninguém é
barrado por engano.

## Monitoramento

No **SQL Editor** do Supabase:

```sql
-- Quem foi barrado e logins travados (últimos 30 dias)
select criado_em, tipo, chave, ip from private.eventos_seguranca order by id desc limit 50;

-- A checagem antes de cada chamada está ligada?
select r.rolname, s.setconfig from pg_db_role_setting s
  join pg_roles r on r.oid = s.setrole where r.rolname = 'authenticator';
-- deve mostrar: pgrst.db_pre_request=private.checar_requisicao
```

Os bloqueios da checagem geral (429 antes da função) não ficam na tabela, porque
o pedido é desfeito inteiro. Eles aparecem em **Logs → API** no Supabase (filtre
por status 429).

## Conferir no Supabase (uma vez)

1. **Rodar o instalador** `supabase/instalar_tudo.sql` (SQL Editor → Run). Ele
   já liga a checagem no PostgREST (`alter role authenticator set pgrst.db_pre_request`).
2. **Authentication → Sign In / Providers**: "Allow new users to sign up"
   **desligado** (hoje já está). Só o dono cria as contas do painel.
3. **Senha forte nas contas do painel** (dono e irmão): quem tem a senha do
   painel vê os dados de todos os clientes.
4. **Edge Function** `notificar-agendamento`: quando publicar, ela já recusa
   endereços de aviso fora do Google, Apple, Mozilla e Microsoft
   (veja [PAINEL_E_AVISOS.md](PAINEL_E_AVISOS.md)).

## Netlify

Nada para configurar no painel: os cabeçalhos vêm de `web/public/_headers`,
que vale para os dois sites. O HSTS o Netlify já manda sozinho.

Se um dia trocar de projeto no Supabase, troque o endereço em `connect-src`
dentro de `_headers` (https e wss). Sem isso, o site não conecta.

Para conferir a CSP no computador antes de publicar:

```powershell
cd C:\arte10\web
npm run build
node scripts\servir-dist.mjs dist 5181     # abre http://localhost:5181
```

## Desfazer

`supabase/reverter_blindagem.sql`:

- **Nível 1** (uma linha): desliga só a checagem geral por IP. É o que resolve
  na hora se clientes de verdade estiverem sendo barrados.
- **Nível 2**: volta o banco para a tag `antes-da-blindagem` do git. Depois
  publique o deploy anterior nos dois sites do Netlify.

## O que ainda depende de fora

- **Robôs com muitos IPs** (rede de computadores invadidos) conseguem passar
  pelos limites por IP. O freio geral de 20 reservas e 20 contas a cada 10
  minutos segura o estrago, mas um ataque assim também pode travar o cadastro
  de clientes de verdade por alguns minutos. Contra isso, só um desafio
  anti-robô no cadastro (por exemplo, o **Cloudflare Turnstile**, gratuito),
  conferido no servidor. Ele exige uma conta no Cloudflare e uma chave secreta
  no Supabase, então **não foi ativado** sem a sua autorização.
- **Leitura das tabelas públicas** (serviços, horários, planos e promoções)
  não tem freio por IP: o PostgREST faz essas leituras em modo só de leitura,
  e não há como gravar o contador ali. São tabelas pequenas, e o Supabase corta
  cada consulta do visitante em 3 segundos.
- **O número de celular não é verificado** (seria por SMS, que é pago). Alguém
  pode abrir conta com o número de outra pessoa que ainda não tem conta. Essa
  conta não vê os horários antigos daquele número, só os que ela mesma marcar.
