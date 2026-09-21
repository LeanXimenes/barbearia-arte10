package br.com.barbeariaarte10.admin.notificacoes

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import br.com.barbeariaarte10.admin.Grafo
import br.com.barbeariaarte10.admin.MainActivity
import br.com.barbeariaarte10.admin.R
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlin.random.Random

const val CANAL_AGENDAMENTOS = "agendamentos"

/**
 * Recebe as notificações push do Firebase (item 19).
 *
 * Funciona com o aplicativo fechado: o Android acorda este serviço,
 * que monta e exibe uma notificação de sistema de verdade.
 */
class ServicoMensagens : FirebaseMessagingService() {

    private val escopo = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** O Firebase gera/renova o token; guardamos no Supabase. */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        escopo.launch {
            runCatching {
                Grafo.catalogo.registrarDispositivo(token, android.os.Build.MODEL ?: "Android")
            }
        }
    }

    override fun onMessageReceived(mensagem: RemoteMessage) {
        super.onMessageReceived(mensagem)

        val dados = mensagem.data
        val titulo = mensagem.notification?.title
            ?: dados["titulo"]
            ?: "Novo agendamento"
        val corpo = mensagem.notification?.body
            ?: dados["corpo"]
            ?: "Um cliente acabou de marcar um horário."

        exibirNotificacao(this, titulo, corpo, dados["data"])
    }
}

/** Monta e dispara a notificação do Android. */
fun exibirNotificacao(
    contexto: Context,
    titulo: String,
    corpo: String,
    dataDoAgendamento: String? = null,
) {
    val intencao = Intent(contexto, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        dataDoAgendamento?.let { putExtra(EXTRA_DATA_AGENDA, it) }
    }

    val pendente = PendingIntent.getActivity(
        contexto,
        0,
        intencao,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val notificacao = NotificationCompat.Builder(contexto, CANAL_AGENDAMENTOS)
        .setSmallIcon(R.drawable.ic_notificacao)
        .setColor(contexto.getColor(R.color.ouro))
        .setContentTitle(titulo)
        .setContentText(corpo)
        .setStyle(NotificationCompat.BigTextStyle().bigText(corpo))
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_EVENT)
        .setAutoCancel(true)
        .setContentIntent(pendente)
        .build()

    val permitido = ActivityCompat.checkSelfPermission(
        contexto,
        Manifest.permission.POST_NOTIFICATIONS,
    ) == PackageManager.PERMISSION_GRANTED

    if (permitido) {
        contexto.getSystemService(NotificationManager::class.java)
            ?.notify(Random.nextInt(100_000), notificacao)
    }
}

const val EXTRA_DATA_AGENDA = "data_agenda"

/**
 * Pega o token atual e registra no Supabase.
 * Chamado depois do login e sempre que o aplicativo abre autenticado.
 */
suspend fun sincronizarTokenPush(): Boolean = runCatching {
    val token = FirebaseMessaging.getInstance().token.await()
    val resultado = Grafo.catalogo.registrarDispositivo(token, android.os.Build.MODEL ?: "Android")
    resultado is br.com.barbeariaarte10.admin.core.Resultado.Sucesso
}.getOrDefault(false)
