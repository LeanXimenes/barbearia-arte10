# Aplicativo Android do barbeiro

Kotlin + Jetpack Compose (Material 3), MVVM com `StateFlow`, supabase-kt 3.0.3.
O cliente não instala nada — ele usa o site. Este app é só do barbeiro.

**O app não tem tela de login.** Ele entra sozinho com uma conta dedicada da
barbearia e fica conectado. O barbeiro só precisa abrir o app.

---

## O que você precisa

- **Android Studio** (qualquer versão recente)
- **JDK 17** — o projeto pede o JDK 17 automaticamente
  (`gradle/gradle-daemon-jvm.properties`); o Android Studio costuma já ter
- **Android SDK 36**
- O banco instalado e a **conta do app** criada ([SUPABASE.md, seção 4](SUPABASE.md#4-conta-do-aplicativo-do-barbeiro-o-app-não-tem-login))

---

## 1. Configuração

Copie `android/local.properties.exemplo` para `android/local.properties` e
preencha:

```properties
sdk.dir=C\:\\Users\\SEU_USUARIO\\AppData\\Local\\Android\\Sdk

SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...        # a chave PÚBLICA (a mesma do site)

BARBEIRO_EMAIL=app@barbeariaarte10.com.br   # a conta dedicada do app
BARBEIRO_SENHA=a-senha-longa-e-aleatoria
```

Esse arquivo não vai para o git. Os valores entram no app na hora da
compilação.

> **Sobre segurança:** como o app não tem login, quem tiver o arquivo APK
> consegue extrair essa conta. Por isso: não compartilhe o APK e, se um
> celular for perdido, desative a conta na tabela `administradores` (efeito
> imediato) e troque a senha dela. Nenhuma chave secreta (`service_role`) vai
> dentro do app.

---

## 2. Notificações push

1. Crie um projeto em <https://console.firebase.google.com>.
2. **Adicionar app → Android**, pacote exatamente
   **`br.com.barbeariaarte10.admin`**.
3. Baixe o `google-services.json` e salve em **`android/app/google-services.json`**.
4. Em **Configurações do projeto → Contas de serviço → Gerar nova chave
   privada** baixe o JSON da conta de serviço. `project_id`, `client_email` e
   `private_key` viram os secrets da Edge Function
   ([SUPABASE.md, seção 6](SUPABASE.md#6-notificações-push)).

Sem o `google-services.json`:

- a versão de **teste** (debug) compila e funciona, mas mostra no Início um
  aviso de que os avisos de novo agendamento estão desligados;
- a versão **final** (release) **não é gerada** — é quase sempre um engano
  entregar o app ao barbeiro sem push.

---

## 3. Gerar o app

No Android Studio: **File → Open** → pasta `android` → aguarde o Gradle →
**Run** (com o celular ligado no USB e a depuração USB ativa).

Ou no PowerShell:

```powershell
cd C:\arte10\android
.\gradlew.bat assembleDebug
# APK em app\build\outputs\apk\debug\app-debug.apk
```

Versão final (menor, otimizada): configure uma keystore em
`app/build.gradle.kts` (`signingConfigs`) e rode `.\gradlew.bat assembleRelease`.

---

## 4. O que o barbeiro vê

**Abrindo o app** — a logo e "Abrindo a agenda…". Sem internet aparece
"Sem conexão com a internet" e o app **tenta de novo sozinho** (na hora que a
rede volta e, por segurança, a cada poucos segundos). Se a conta do app não
for aceita, aparece o motivo em português.

**Início** — agendamentos de hoje, horários livres, bloqueios, próximo cliente
e próximos horários livres. Atualiza sozinho quando alguém agenda pelo site.
Se as notificações estiverem desligadas no celular, aparece um aviso com o
botão **Ativar**.

**Agenda** — faixa de dias e a linha do tempo do dia:

| Estado | Cor | Toque |
|---|---|---|
| Agendado | dourado | detalhes do cliente |
| Bloqueado | vermelho | desbloquear |
| Disponível | verde | bloquear |
| Intervalo / fora do expediente | cinza | informativo |

Os horários livres são exatamente os mesmos que o site oferece. Se o dono
encurtar o expediente depois de alguém já ter marcado, o cliente continua
aparecendo, com a marca "Fora do expediente atual".

**Detalhes do agendamento** — nome, telefone, serviço, data, horário,
duração, valor, status e quando foi marcado; botão para falar no WhatsApp.
Depois do horário aparecem **Atendido** / **Faltou**. **Não existe cancelar
nem excluir** — e o banco também não permite.

**Clientes** — busca por nome ou telefone, visitas, faltas, última visita e
próximo horário.

**Serviços** — criar, editar, ativar/desativar (desativar tira do site, mas
mantém o histórico).

**Ajustes** — expediente de cada dia, dados da barbearia e histórico.

---

## Estrutura

```
android/app/src/main/java/br/com/barbeariaarte10/admin/
├── App.kt                 Application + canal de notificação + Grafo (DI simples)
├── MainActivity.kt        Splash, edge-to-edge, notificação tocada -> dia certo
├── core/                  Supabase, Resultado (erros), Conectividade, Formato
├── dados/modelo/          modelos serializáveis
├── dados/repositorio/     Autenticacao (conexão automática), Agenda, Catalogo
├── notificacoes/          FirebaseMessagingService + registro do token
└── ui/                    tema, componentes, navegação e telas
    └── telas/             conexao · inicio · agenda · clientes · servicos ·
                           configuracoes · historico
```

## Sem internet

O app **não finge** que salvou: bloquear, desbloquear ou editar sem conexão
mostra *"Sem conexão com a internet: a alteração NÃO foi salva."* e a tela não
muda. Uma faixa no topo avisa quando os dados podem estar desatualizados.
