# Aplicativo Android do proprietário

Kotlin + Jetpack Compose (Material 3), arquitetura MVVM com `StateFlow`.
O cliente não instala nada — ele usa o site. Este app é só do dono.

---

## O que você precisa

- **Android Studio** Ladybug (2024.2) ou mais novo
- **JDK 17** (vem com o Android Studio)
- **Android SDK 35**
- O projeto Supabase já configurado ([guia](SUPABASE.md))

---

## 1. Credenciais

```bash
cd android
cp local.properties.exemplo local.properties
```

Edite `local.properties`:

```properties
sdk.dir=C:\\Users\\SEU_USUARIO\\AppData\\Local\\Android\\Sdk

SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-anon-key-publica
```

O Gradle injeta esses valores em `BuildConfig` na hora de compilar. O arquivo
não vai para o git.

> É a mesma chave `anon` do site — e isso está certo. O que libera a área
> administrativa é o login do proprietário somado ao RLS do banco, não uma
> chave secreta dentro do APK (que qualquer um poderia extrair).

---

## 2. Notificações push

1. Crie um projeto em <https://console.firebase.google.com>.
2. **Adicionar app → Android**, com o pacote exatamente
   **`br.com.barbeariaarte10.admin`**.
3. Baixe o `google-services.json` e salve em **`android/app/google-services.json`**.
4. Em **Configurações do projeto → Contas de serviço → Gerar nova chave
   privada**, baixe o JSON da conta de serviço. Dele saem três valores para a
   Edge Function:

   | Campo do JSON | Secret do Supabase |
   |---|---|
   | `project_id` | `FIREBASE_PROJECT_ID` |
   | `client_email` | `FIREBASE_CLIENT_EMAIL` |
   | `private_key` | `FIREBASE_PRIVATE_KEY` |

5. Volte ao [guia do Supabase](SUPABASE.md#6-ligar-as-notificações-push) para
   publicar a função e ligar o gatilho.

Sem o `google-services.json` o projeto **não compila** (o plugin do Google
exige o arquivo). Se você quiser rodar sem push por enquanto, remova
`alias(libs.plugins.google.services)` de `app/build.gradle.kts` e a dependência
`firebase-messaging`.

---

## 3. Compilar

```bash
cd android
./gradlew assembleDebug          # APK em app/build/outputs/apk/debug/
./gradlew installDebug           # instala no aparelho conectado
```

Para gerar a versão de publicação, crie uma keystore e configure
`signingConfigs` em `app/build.gradle.kts`, depois:

```bash
./gradlew assembleRelease
```

---

## 4. Primeiro acesso

Entre com o e-mail e a senha criados em
[Supabase → criar o usuário do proprietário](SUPABASE.md#4-criar-o-usuário-do-proprietário).

Se a conta existir no Auth mas **não** estiver em `public.administradores`, o
app desconecta na hora e avisa que a conta não tem acesso. O banco recusaria
igual, mesmo que alguém tentasse falar direto com a API.

---

## As telas

### Início
Visão do dia: quantos agendamentos, quantos horários livres, quantos
bloqueios, quem é o próximo cliente, a lista de quem marcou e os próximos
horários livres. Atualiza sozinho quando um cliente agenda pelo site.

### Agenda
Faixa de dias (7 para trás, 45 para frente) com marcador nos dias que têm
cliente, e a linha do tempo completa do dia com os quatro estados:

| Estado | Cor | Toque |
|---|---|---|
| **Agendado** | dourado | abre os detalhes do cliente |
| **Bloqueado** | vermelho | oferece desbloquear |
| **Disponível** | verde | oferece bloquear |
| **Intervalo / fora do expediente** | cinza | informativo |

### Detalhes do agendamento
Nome, telefone, serviço, data, horário, duração, valor, status e quando foi
marcado. Botão para falar com o cliente no WhatsApp e para registrar o
desfecho (*Atendido* / *Faltou*).

**Não existe botão de cancelar nem de excluir** — e não é só a interface: o
banco recusa (veja [a regra](SUPABASE.md#por-que-um-agendamento-não-pode-ser-apagado)).
Registrar o desfecho **não** libera o horário.

### Clientes
Lista com busca por nome ou telefone, total de visitas, última visita e
próximo horário marcado.

### Serviços
Criar, editar, e ativar/desativar. Um serviço desativado some do site na hora,
mas **continua no histórico** de quem já o usou — por isso o app desativa em
vez de excluir (o banco também bloqueia a exclusão de serviço com histórico).

### Ajustes
Expediente de cada dia da semana (abrir/fechar, horários, intervalo), dados da
barbearia (endereço, WhatsApp, Instagram), atalho para o histórico e sair da
conta.

### Histórico
Atendimentos anteriores, do mais recente para o mais antigo, com paginação.
Nada é apagado automaticamente.

---

## Estrutura

```
android/app/src/main/java/br/com/barbeariaarte10/admin/
├── App.kt                  Application + canal de notificação + Grafo (DI simples)
├── MainActivity.kt         Splash, permissão de notificação, raiz do Compose
├── core/                   Supabase, Resultado, Conectividade, Formato
├── dados/
│   ├── modelo/             data classes serializáveis
│   └── repositorio/        Autenticacao · Agenda · Catalogo
├── notificacoes/           FirebaseMessagingService + registro do token
└── ui/
    ├── tema/               paleta e tipografia da Arte 10
    ├── componentes/        cartão, etiqueta, faixa offline, erro, vazio
    ├── navegacao/          bottom bar e rotas
    └── telas/              login · inicio · agenda · clientes · servicos ·
                            configuracoes · historico
```

Toda conversa com o Supabase passa pelos repositórios — nenhuma tela chama a
API diretamente.

---

## Comportamento offline

O app **não finge** que salvou (item 22 da especificação):

- Uma faixa no topo avisa quando o aparelho está sem conexão, dizendo que os
  dados podem estar desatualizados.
- Bloquear ou desbloquear sem rede devolve *"Não foi possível salvar…"* e a
  tela não muda de estado.
- `Resultado.Falha` separa "sem internet" de "o servidor recusou", para a
  mensagem ser a certa em cada caso.
