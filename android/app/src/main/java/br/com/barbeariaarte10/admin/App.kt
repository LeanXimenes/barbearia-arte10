package br.com.barbeariaarte10.admin

import android.annotation.SuppressLint
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import br.com.barbeariaarte10.admin.core.Conectividade
import br.com.barbeariaarte10.admin.dados.repositorio.AgendaRepositorio
import br.com.barbeariaarte10.admin.dados.repositorio.AutenticacaoRepositorio
import br.com.barbeariaarte10.admin.dados.repositorio.CatalogoRepositorio
import br.com.barbeariaarte10.admin.notificacoes.CANAL_AGENDAMENTOS

class App : Application() {

    override fun onCreate() {
        super.onCreate()
        Grafo.iniciar(this)
        criarCanalDeNotificacao()
    }

    /**
     * O canal precisa existir antes da primeira notificação chegar,
     * por isso é criado já na abertura do aplicativo.
     */
    private fun criarCanalDeNotificacao() {
        val canal = NotificationChannel(
            CANAL_AGENDAMENTOS,
            getString(R.string.canal_agendamentos),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = getString(R.string.canal_agendamentos_descricao)
            enableVibration(true)
            setShowBadge(true)
        }

        getSystemService(NotificationManager::class.java)?.createNotificationChannel(canal)
    }
}

/**
 * Injeção de dependências simples e explícita.
 * O aplicativo é pequeno o bastante para não precisar de um framework.
 */
@SuppressLint("StaticFieldLeak")
object Grafo {

    // É o applicationContext (vive o processo inteiro), não uma Activity: não vaza.
    lateinit var contexto: Context
        private set

    /** Escopo que vive enquanto o processo do app vive (canais realtime compartilhados). */
    val escopoApp: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val autenticacao: AutenticacaoRepositorio by lazy { AutenticacaoRepositorio() }
    val agenda: AgendaRepositorio by lazy { AgendaRepositorio() }
    val catalogo: CatalogoRepositorio by lazy { CatalogoRepositorio() }
    val conectividade: Conectividade by lazy { Conectividade(contexto) }

    fun iniciar(app: Application) {
        contexto = app.applicationContext
    }
}
