package br.com.barbeariaarte10.admin.ui.telas.conexao

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.barbeariaarte10.admin.Grafo
import br.com.barbeariaarte10.admin.R
import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.ui.componentes.MensagemErro
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.TextoFraco
import br.com.barbeariaarte10.admin.ui.tema.TextoSuave
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex

sealed interface EstadoSessao {
    /** Lendo a sessão salva no aparelho. */
    data object Iniciando : EstadoSessao
    data object Conectando : EstadoSessao
    data object Conectado : EstadoSessao
    data class Falhou(val mensagem: String, val semConexao: Boolean) : EstadoSessao
}

/**
 * Mantém o app conectado sem pedir login ao barbeiro.
 *
 * - Sessão salva e válida  -> entra direto.
 * - Sem sessão             -> entra sozinho com a conta dedicada do app.
 * - Sem internet           -> tenta de novo assim que a conexão voltar.
 */
class SessaoViewModel : ViewModel() {

    private val _estado = MutableStateFlow<EstadoSessao>(EstadoSessao.Iniciando)
    val estado: StateFlow<EstadoSessao> = _estado.asStateFlow()

    private val trava = Mutex()

    /** Nova tentativa automática enquanto estiver sem conexão (espera dobra até 1 min). */
    private var tentativaAutomatica: Job? = null
    private var espera = ESPERA_INICIAL

    /** O servidor já confirmou (nesta abertura do app) que a conta tem acesso. */
    private var acessoConferido = false

    /** O servidor disse que a conta NÃO tem mais acesso. */
    private var acessoNegado = false

    init {
        viewModelScope.launch {
            Grafo.autenticacao.status.collect { status ->
                when (status) {
                    is SessionStatus.Initializing -> _estado.value = EstadoSessao.Iniciando
                    // RefreshFailure = sessão guardada mas sem conseguir renovar
                    // agora (normalmente falta de internet). O app segue aberto e a
                    // faixa de "sem conexão" avisa; o Supabase tenta renovar sozinho.
                    is SessionStatus.Authenticated,
                    is SessionStatus.RefreshFailure -> {
                        if (!acessoNegado) _estado.value = EstadoSessao.Conectado
                        if (!acessoConferido) conferirAcesso()
                    }
                    is SessionStatus.NotAuthenticated ->
                        if (_estado.value !is EstadoSessao.Falhou) conectar()
                }
            }
        }

        viewModelScope.launch {
            Grafo.conectividade.observar().collect { online ->
                val atual = _estado.value
                if (online && atual is EstadoSessao.Falhou && atual.semConexao) conectar()
            }
        }
    }

    /**
     * Sessão restaurada do aparelho: confere uma vez se a conta continua
     * liberada. Sem isso, uma conta desativada veria uma agenda vazia e
     * acharia que não há clientes marcados.
     */
    private fun conferirAcesso() {
        viewModelScope.launch {
            val resultado = Grafo.autenticacao.verificarAcesso()
            if (resultado !is Resultado.Sucesso) return@launch // offline: confere depois
            acessoConferido = true
            if (!resultado.dado) {
                acessoNegado = true
                _estado.value = EstadoSessao.Falhou(
                    "Este aparelho não tem mais acesso à agenda da barbearia. " +
                        "Libere a conta do app na tabela administradores do Supabase.",
                    semConexao = false,
                )
            }
        }
    }

    private fun agendarNovaTentativa() {
        tentativaAutomatica?.cancel()
        tentativaAutomatica = viewModelScope.launch {
            delay(espera)
            espera = (espera * 2).coerceAtMost(ESPERA_MAXIMA)
            val atual = _estado.value
            if (atual is EstadoSessao.Falhou && atual.semConexao) conectar()
        }
    }

    fun conectar() {
        tentativaAutomatica?.cancel()
        viewModelScope.launch {
            if (!trava.tryLock()) return@launch
            try {
                _estado.value = EstadoSessao.Conectando
                acessoNegado = false
                when (val resultado = Grafo.autenticacao.conectar()) {
                    // conectar() já confere a tabela administradores.
                    is Resultado.Sucesso -> {
                        acessoConferido = true
                        espera = ESPERA_INICIAL
                        _estado.value = EstadoSessao.Conectado
                    }
                    is Resultado.Falha -> {
                        _estado.value = EstadoSessao.Falhou(resultado.mensagem, resultado.semConexao)
                        // A rede pode ter voltado DURANTE a tentativa: sem isto o app
                        // ficaria parado em "sem conexão" até alguém tocar no botão.
                        if (resultado.semConexao) agendarNovaTentativa()
                    }
                }
            } finally {
                trava.unlock()
            }
        }
    }
}

private const val ESPERA_INICIAL = 3_000L
private const val ESPERA_MAXIMA = 60_000L

@Composable
fun ConexaoTela(estado: EstadoSessao, aoTentarNovamente: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Image(
                painter = painterResource(R.drawable.logo_arte10),
                contentDescription = "Barbearia Arte 10",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(168.dp)
                    .clip(RoundedCornerShape(28.dp)),
            )

            Spacer(Modifier.height(32.dp))

            when (estado) {
                is EstadoSessao.Falhou -> {
                    Text(
                        text = if (estado.semConexao) "Sem conexão com a internet" else "Não foi possível abrir a agenda",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(14.dp))
                    MensagemErro(
                        mensagem = if (estado.semConexao) {
                            "Assim que a internet voltar o app conecta sozinho."
                        } else {
                            estado.mensagem
                        },
                    )
                    Spacer(Modifier.height(20.dp))
                    Button(
                        onClick = aoTentarNovamente,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(999.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Ouro,
                            contentColor = Color(0xFF1A1204),
                        ),
                    ) {
                        Text("Tentar novamente", fontWeight = FontWeight.Bold)
                    }
                }

                else -> {
                    CircularProgressIndicator(color = Ouro, strokeWidth = 2.5.dp)
                    Spacer(Modifier.height(18.dp))
                    Text(
                        text = "Abrindo a agenda…",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextoSuave,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = "Barbearia Arte 10",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextoFraco,
                    )
                }
            }
        }
    }
}
