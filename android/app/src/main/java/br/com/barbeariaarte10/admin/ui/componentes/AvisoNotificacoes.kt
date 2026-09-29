package br.com.barbeariaarte10.admin.ui.componentes

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import br.com.barbeariaarte10.admin.BuildConfig
import br.com.barbeariaarte10.admin.notificacoes.CANAL_AGENDAMENTOS
import br.com.barbeariaarte10.admin.ui.tema.Alerta

/**
 * Avisa o barbeiro quando ele NÃO vai receber os avisos de novo
 * agendamento — em vez de ele descobrir só quando perder um cliente.
 * Reavalia toda vez que o app volta para a frente (ex.: depois de ativar
 * nas configurações do Android).
 */
@Composable
fun AvisoNotificacoes(modifier: Modifier = Modifier) {
    val contexto = LocalContext.current
    var ativas by remember { mutableStateOf(notificacoesAtivas(contexto)) }

    LifecycleResumeEffect(Unit) {
        ativas = notificacoesAtivas(contexto)
        onPauseOrDispose { }
    }

    val mensagem = when {
        !BuildConfig.PUSH_CONFIGURADO ->
            "Este app foi gerado sem o Firebase: você NÃO recebe aviso de novo agendamento. " +
                "Gere o app de novo com o google-services.json."
        !ativas ->
            "As notificações estão desligadas neste celular. Ative para ser avisado de cada novo agendamento."
        else -> return
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Alerta.copy(alpha = 0.12f), RoundedCornerShape(14.dp))
            .border(1.dp, Alerta.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
            .padding(start = 14.dp, top = 12.dp, bottom = 12.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Outlined.NotificationsOff, contentDescription = null, tint = Alerta, modifier = Modifier.size(20.dp))
        Column(Modifier.weight(1f)) {
            Text(mensagem, style = MaterialTheme.typography.bodySmall, color = Alerta)
        }
        if (BuildConfig.PUSH_CONFIGURADO) {
            TextButton(onClick = { abrirConfiguracoes(contexto) }) {
                Text("Ativar", color = Alerta, fontWeight = FontWeight.Bold)
            }
        }
    }
}

private fun notificacoesAtivas(contexto: Context): Boolean {
    val compat = NotificationManagerCompat.from(contexto)
    if (!compat.areNotificationsEnabled()) return false
    val canal = contexto.getSystemService(NotificationManager::class.java)
        ?.getNotificationChannel(CANAL_AGENDAMENTOS)
    return canal == null || canal.importance != NotificationManager.IMPORTANCE_NONE
}

private fun abrirConfiguracoes(contexto: Context) {
    val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, contexto.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { contexto.startActivity(intent) }
}
