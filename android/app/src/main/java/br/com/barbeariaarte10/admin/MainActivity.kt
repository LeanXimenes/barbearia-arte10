package br.com.barbeariaarte10.admin

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import br.com.barbeariaarte10.admin.notificacoes.EXTRA_DATA_AGENDA
import br.com.barbeariaarte10.admin.ui.navegacao.RaizApp
import br.com.barbeariaarte10.admin.ui.tema.TemaArte10

class MainActivity : ComponentActivity() {

    private val pedirPermissaoNotificacao =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* opcional */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)

        // A partir do Android 13 a permissão de notificação é explícita.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pedirPermissaoNotificacao.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        val dataInicial = intent?.getStringExtra(EXTRA_DATA_AGENDA)

        setContent {
            TemaArte10 {
                RaizApp(dataInicialDaAgenda = dataInicial)
            }
        }
    }
}
