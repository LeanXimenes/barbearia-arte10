package br.com.barbeariaarte10.admin.notificacoes

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import br.com.barbeariaarte10.admin.BuildConfig
import br.com.barbeariaarte10.admin.Grafo
import br.com.barbeariaarte10.admin.MainActivity
import br.com.barbeariaarte10.admin.R
import br.com.barbeariaarte10.admin.core.Resultado
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.concurrent.atomic.AtomicInteger

const val CANAL_AGENDAMENTOS = "agendamentos"

/** Extra usado quando o próprio app monta a notificação (app aberto). */
private const val EXTRA_DATA_AGENDA = "data_agenda"

/** Chave do campo "data" que a Edge Function envia no payload do FCM. */
private const val CHAVE_DATA_FCM = "data"

private val DATA_ISO = Regex("^\\d{4}-\\d{2}-\\d{2}$")

/**
 * Recebe as notificações push do Firebase (item 19).
 *
 * Com o app FECHADO ou em segundo plano, o próprio Android mostra a
 * notificação (payload "notification") e, ao tocar, abre a MainActivity
 * com os campos de "data" como extras. Com o app ABERTO, o Android entrega
 * a mensagem aqui em onMessageReceived e nós mesmos montamos a notificação.
 */
class ServicoMensagens : FirebaseMessagingService() {

    private val escopo = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** O Firebase gera/renova o token; guardamos no Supabase. */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        escopo.launch {
            runCatching { Grafo.catalogo.registrarDispositivo(token, modeloDoAparelho()) }
        }
    }

    override fun onMessageReceived(mensagem: RemoteMessage) {
        super.onMessageReceived(mensagem)

        val dados = mensagem.data
        val titulo = mensagem.notification?.title ?: dados["titulo"] ?: "Novo agendamento"
        val corpo = mensagem.notification?.body ?: dados["corpo"]
            ?: "Um cliente acabou de marcar um horário."

        exibirNotificacao(this, titulo, corpo, dados[CHAVE_DATA_FCM])
    }
}

private val proximoId = AtomicInteger(1)

/** Monta e dispara a notificação do Android. */
fun exibirNotificacao(
    contexto: Context,
    titulo: String,
    corpo: String,
    dataDoAgendamento: String? = null,
) {
    // POST_NOTIFICATIONS só existe a partir do Android 13. Antes disso
    // checkSelfPermission devolveria "negado" e nada seria mostrado.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(contexto, Manifest.permission.POST_NOTIFICATIONS) !=
        PackageManager.PERMISSION_GRANTED
    ) {
        return
    }

    val gerenciador = NotificationManagerCompat.from(contexto)
    if (!gerenciador.areNotificationsEnabled()) return

    val id = proximoId.getAndIncrement()

    val intencao = Intent(contexto, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        dataDoAgendamento?.let { putExtra(EXTRA_DATA_AGENDA, it) }
    }

    // requestCode único: cada notificação abre o SEU dia, sem uma
    // sobrescrever os extras da outra.
    val pendente = PendingIntent.getActivity(
        contexto,
        id,
        intencao,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val notificacao = NotificationCompat.Builder(contexto, CANAL_AGENDAMENTOS)
        .setSmallIcon(R.drawable.ic_notificacao)
        .setColor(ContextCompat.getColor(contexto, R.color.ouro))
        .setContentTitle(titulo)
        .setContentText(corpo)
        .setStyle(NotificationCompat.BigTextStyle().bigText(corpo))
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_EVENT)
        .setAutoCancel(true)
        .setContentIntent(pendente)
        .build()

    try {
        gerenciador.notify(id, notificacao)
    } catch (_: SecurityException) {
        // Permissão revogada entre a checagem e o envio: não há o que fazer.
    }
}

/**
 * Descobre o dia a abrir a partir da Intent que abriu o app — tanto a
 * montada por nós (app aberto) quanto a do sistema (app fechado).
 */
fun dataDaNotificacao(intent: Intent?): String? {
    val valor = intent?.getStringExtra(EXTRA_DATA_AGENDA) ?: intent?.getStringExtra(CHAVE_DATA_FCM)
    return valor?.trim()?.takeIf { DATA_ISO.matches(it) }
}

/**
 * Pega o token atual e registra no Supabase.
 * Chamado sempre que o app fica conectado. Sem Firebase configurado no
 * build (sem google-services.json), simplesmente não faz nada.
 */
suspend fun sincronizarTokenPush(): Boolean {
    if (!BuildConfig.PUSH_CONFIGURADO) return false
    if (FirebaseApp.getApps(Grafo.contexto).isEmpty()) return false

    return runCatching {
        val token = FirebaseMessaging.getInstance().token.await()
        Grafo.catalogo.registrarDispositivo(token, modeloDoAparelho()) is Resultado.Sucesso
    }.getOrDefault(false)
}

private fun modeloDoAparelho(): String =
    listOfNotNull(Build.MANUFACTURER, Build.MODEL).joinToString(" ").ifBlank { "Android" }
