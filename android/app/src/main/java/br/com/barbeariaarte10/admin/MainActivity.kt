package br.com.barbeariaarte10.admin

import android.Manifest
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import br.com.barbeariaarte10.admin.notificacoes.dataDaNotificacao
import br.com.barbeariaarte10.admin.ui.navegacao.RaizApp
import br.com.barbeariaarte10.admin.ui.tema.TemaArte10

class MainActivity : ComponentActivity() {

    private val pedirPermissaoNotificacao =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* opcional */ }

    /** Dia pedido por uma notificação tocada. */
    private var dataPedida by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        // Desenha atrás das barras do sistema (obrigatório no Android 15+);
        // o Scaffold e as telas aplicam os espaçamentos corretos.
        // O app é sempre escuro: ícones claros nas barras, independente do tema do sistema.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)

        // A partir do Android 13 a permissão de notificação é explícita.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pedirPermissaoNotificacao.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        if (savedInstanceState == null) dataPedida = dataDaNotificacao(intent)

        setContent {
            TemaArte10 {
                RaizApp(
                    dataPedida = dataPedida,
                    aoConsumirData = { dataPedida = null },
                )
            }
        }
    }

    /**
     * Com launchMode="singleTask", tocar numa notificação com o app já
     * aberto não passa pelo onCreate — a Intent nova chega aqui.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        dataDaNotificacao(intent)?.let { dataPedida = it }
    }
}
