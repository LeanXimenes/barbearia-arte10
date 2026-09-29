# Auditoria — Barbearia Arte 10

Data: 29/09/2026 · Escopo: banco (Supabase), site, aplicativo Android,
notificações push, testes e documentação.

## Resumo

| | |
|---|---|
| Problemas encontrados | **49** |
| Corrigidos | **47** |
| Mitigados / risco aceito | **2** (nº 11 e nº 26, detalhados no fim) |
| Testes automatizados | **128** passando (banco 97 · push 9 · instalador 4 · site 18) |
| App Android | compila, Android Lint sem erros, versão final (R8) roda no emulador |

A revisão foi interrompida a pedido antes de cobrir alguns pontos do site —
eles estão listados em [O que não foi revisado](#o-que-não-foi-revisado).

## Como foi feita

- **Auditores automáticos** por área, com reprodução dos defeitos num
  PostgreSQL real (PGlite). Dois deles terminaram (banco/admin e push); os
  demais pararam por limite de uso, e a verificação de cada achado foi feita
  manualmente, a maioria com teste que reproduz o problema.
- **Compilação real do app Android** (pela primeira vez) com o JDK e o SDK do
  Android Studio desta máquina, **Android Lint**, e execução do APK de teste e
  do APK final (minificado com R8) num **emulador**.
- **Checagem de tipos da Edge Function** com Deno, contra o `supabase-js` real.
- **Site** testado no navegador (computador e celular) contra o banco real em
  modo demonstração.
- Leitura do projeto Supabase do dono com a chave pública: o projeto responde,
  a chave é válida e o banco ainda não foi instalado.

---

## Achados e correções

### Gravidade alta

| # | Onde | Problema | Situação |
|---|---|---|---|
| 1 | Android | O projeto **não abria no Android Studio**: `settings.gradle.kts` tinha um escape inválido. | Corrigido |
| 2 | Android | Faltava o **Gradle wrapper** (`gradlew`) que a documentação mandava usar; e o JDK 25 do Android Studio não roda Gradle 8. | Corrigido: wrapper 8.14.3 + JDK 17 automático |
| 3 | Android | **Erro de compilação** (anotação em bloco `init`). O app nunca tinha sido compilado. | Corrigido |
| 4 | Android | Logo de 1254 px em `drawable/` era ampliada para ~5000 px em celulares de tela densa (consumo enorme de memória). | Corrigido: `drawable-nodpi`, 512 px |
| 5 | Android | **Sem internet, o app dizia "conta não aceita"**: o supabase-kt esconde a causa de rede. Achado no emulador. | Corrigido |
| 6 | Android | O app podia **ficar preso em "sem conexão"** mesmo com a internet de volta. Achado no emulador. | Corrigido: nova tentativa automática |
| 7 | Banco | A agenda do dono **escondia clientes marcados** fora do expediente atual (ex.: depois de encurtar o horário). | Corrigido |
| 8 | Push | Aparelho de administrador **desativado continuava recebendo** push com nome de cliente. | Corrigido |
| 9 | Site | Dois canais de tempo real com o mesmo nome: **fechar o diálogo de agendamento derrubava o tempo real da página**. | Corrigido |
| 10 | Testes | A suíte do banco **falhava dependendo do dia da semana** (falhava hoje). | Corrigido |
| 11 | Segurança | App sem login: a conta vai dentro do APK. | Risco aceito — ver fim |

### Gravidade média

| # | Onde | Problema | Situação |
|---|---|---|---|
| 12 | Push | Gatilho e reenvio podiam mandar o **mesmo push duas vezes**. | Corrigido: reserva atômica |
| 13 | Push | Instabilidade do Google marcava o push como **"falhou" para sempre**. | Corrigido |
| 14 | Push | Erro inesperado não contava tentativa: **reenvio sem fim**. | Corrigido |
| 15 | Push | Um erro no conteúdo da mensagem **desligava todos os aparelhos**. | Corrigido |
| 16 | Push | A Edge Function **aceitava chamadas sem token** se o `EDGE_TOKEN` não fosse configurado. | Corrigido: falha fechada |
| 17 | Push | Falhas da chamada HTTP ficavam **sem registro**; o reenvio era "opcional". | Corrigido: erro gravado + `ativar_push.sql` agenda o reenvio |
| 18 | Push | Token novo do Firebase com o **app fechado se perdia**. | Corrigido |
| 19 | Push | Notificação **não aparecia no Android 8 a 12** (checagem de permissão errada). | Corrigido |
| 20 | Push | Tocar na notificação **não abria o dia certo** (app aberto ou fechado). | Corrigido |
| 21 | Push | APK sem Firebase funcionava **sem push e sem aviso**. | Corrigido: aviso no app + versão final recusada |
| 22 | Banco | `TRUNCATE ... CASCADE` **apagava todo o histórico** sem passar pela proteção. | Corrigido |
| 23 | Banco | Status podia mudar **antes do horário** (marcar falta em reserva futura burlava o limite por telefone) e por acesso direto. | Corrigido |
| 24 | Banco | Outra reserva com o mesmo telefone **reescrevia o nome** do cliente em todo o histórico. | Corrigido: nome guardado na reserva |
| 25 | Banco | A linha do tempo do dono usava **outra grade** e oferecia horários que o site não aceita. | Corrigido |
| 26 | Banco | **Robô poderia lotar a agenda** (chave pública + reserva não apagável). | Mitigado: limite por 10 min e por telefone |
| 27 | Banco | Chave de idempotência sem limite de tamanho (**erro 500**). | Corrigido |
| 28 | Android | Canal de tempo real **duplicado** entre Início e Agenda (um derrubava o outro). | Corrigido |
| 29 | Android | **Busca de clientes por nome trazia todos**. | Corrigido |
| 30 | Android | Histórico podia **fechar a tela** com item repetido entre páginas. | Corrigido |
| 31 | Android | Salvar sem internet dizia só "dados desatualizados", sem deixar claro que **não salvou**. | Corrigido |
| 32 | Android | Lint: `registerForActivityResult` com `fragment` 1.0 trazido pelo Firebase. | Corrigido |

### Gravidade baixa

| # | Onde | Problema | Situação |
|---|---|---|---|
| 33 | Banco | Bloqueio aceitava passado, dia fechado e fora do expediente. | Corrigido |
| 34 | Banco | "Última visita" contava reservas futuras e faltas. | Corrigido |
| 35 | Banco | Painel contava horários que já passaram; "próximo cliente" ignorava o status. | Corrigido |
| 36 | Banco | Códigos de erro errados na mudança de status; status vazio dava erro 500. | Corrigido |
| 37 | Banco | Calendário de quem não é administrador vinha vazio (parecia "sem clientes"). | Corrigido: erro + checagem no app |
| 38 | Banco | Permissões avaliadas linha a linha (≈11× mais lento com anos de dados). | Corrigido |
| 39 | Banco | Espelho público gerava evento a cada mudança de status e podia dessincronizar. | Corrigido |
| 40 | Android | Id da notificação reiniciava e substituía avisos não lidos. | Corrigido |
| 41 | Android | Notificações desligadas no celular sem nenhum aviso ao barbeiro. | Corrigido: aviso com botão "Ativar" |
| 42 | Android | Editar serviço não conseguia apagar a descrição. | Corrigido |
| 43 | Android | Monitor de rede recriado a cada redesenho da tela. | Corrigido |
| 44 | Site | Imagem de compartilhamento com endereço relativo (WhatsApp não mostra). | Corrigido |
| 45 | Site | Cabeçalhos de segurança não valiam no deploy de arrastar e soltar. | Corrigido: `_headers` |
| 46 | Docs | Comandos de Linux que não funcionam no Windows. | Corrigido |
| 47 | Docs | Instalação exigia colar 9 arquivos na ordem certa. | Corrigido: `instalar_tudo.sql` |
| 48 | Docs | Documentação do app ainda falava de login. | Corrigido |
| 49 | Logo | Logo antiga em site e app. | Trocada pela de `logo/` |

---

## O que não foi revisado

A revisão foi encerrada a pedido. Pontos conhecidos, sem correção:

- **Site — troca rápida de dia:** se a resposta de um dia chegar depois da do
  dia seguinte, a lista pode mostrar por um instante os horários do dia
  anterior. O servidor recusa qualquer horário inválido na confirmação, então
  não gera agendamento errado.
- **Site — "Aberto agora"** não se atualiza sozinho com a página parada aberta.
- **Site — Content-Security-Policy** não configurada (os demais cabeçalhos de
  segurança estão).
- **Site — foco do teclado** no diálogo de agendamento (acessibilidade).
- **App com dados reais:** as telas de agenda, detalhes e bloqueio foram
  compiladas e revisadas no código, mas só serão vistas com dados depois que o
  banco estiver instalado.
- **Push real:** depende do Firebase do dono.

## Riscos que continuam (e como lidar)

1. **App sem login (decisão do dono).** Quem tiver o arquivo APK consegue
   extrair a conta do app e agir como administrador. Não compartilhe o APK. Se
   um celular for perdido: desative a conta em `administradores` (efeito
   imediato, inclusive para o push), troque a senha e gere o app de novo.
2. **Agendamento não pode ser apagado (regra do sistema).** Um ataque de robô
   com muitos telefones ainda poderia ocupar alguns horários antes do freio de
   10 minutos agir. Se acontecer, o dono do banco pode apagar pelo SQL Editor
   desligando o gatilho, como faz o `limpar_testes.sql`.
3. **Versões de bibliotecas.** O Lint aponta versões mais novas (supabase-kt,
   Compose, Firebase). Estão compatíveis entre si; atualize com calma e rode os
   testes depois.

---

## Os 27 casos do item 33

| # | Caso | Coberto por |
|---|---|---|
| 1 | Dois clientes no mesmo horário | constraint de exclusão + teste de concorrência |
| 2 | Vários cliques em confirmar | chave de idempotência + botão travado |
| 3 | Internet cai na reserva | mensagem de erro, sem falso sucesso; reenvio com a mesma chave |
| 4 | Internet cai no bloqueio | "a alteração NÃO foi salva" |
| 5 | Horário ocupado com o site aberto | tempo real + revalidação no servidor |
| 6 | Horário passado | recusado no servidor e escondido no site |
| 7 | Dia fechado | "Barbearia fechada neste dia." |
| 8 | Serviço desativado | some do site e é recusado |
| 9 | Durações diferentes | grade por serviço |
| 10 | Serviços sobrepostos | recusado (parcial e pela frente) |
| 11 | Horário bloqueado | aparece indisponível |
| 12 | Desbloqueio | volta a ficar disponível |
| 13 | Reservar bloqueado | recusado |
| 14 | Reservar já agendado | recusado |
| 15 | App sem conexão | faixa de aviso, tentativa automática |
| 16 | Site sem conexão | aviso e botão travado |
| 17 | Atualizar a página | tudo é relido do servidor |
| 18 | Fechar o navegador | nada gravado pela metade |
| 19 | Repetição de requisições | idempotência |
| 20 | Falha do Supabase | mensagem clara, sem falso sucesso |
| 21 | Falha da notificação | reserva continua; push tentado de novo |
| 22 | Sem permissão | recusado pelo RLS e pelas funções |
| 23 | Dados de outros clientes | anônimo não lê clientes nem agendamentos |
| 24 | Alterações simultâneas | trava + constraint |
| 25 | Horários consecutivos | aceitos |
| 26 | Durações diferentes | grade por serviço |
| 27 | Fora do expediente | recusado e não oferecido |
