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

    init {
        viewModelScope.launch {
            Grafo.autenticacao.status.collect { status ->
                when (status) {
                    is SessionStatus.Initializing -> _estado.value = EstadoSessao.Iniciando
                    // RefreshFailure = sessão guardada mas sem conseguir renovar
                    // agora (normalmente falta de internet). O app segue aberto e a
                    // faixa de "sem conexão" avisa; o Supabase tenta renovar sozinho.
                    is SessionStatus.Authenticated,
                    is SessionStatus.RefreshFailure -> _estado.value = EstadoSessao.Conectado
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

    fun conectar() {
        viewModelScope.launch {
            if (!trava.tryLock()) return@launch
            try {
                _estado.value = EstadoSessao.Conectando
                when (val resultado = Grafo.autenticacao.conectar()) {
                    // O fluxo de status emite Authenticated e leva para Conectado.
                    is Resultado.Sucesso -> _estado.value = EstadoSessao.Conectado
                    is Resultado.Falha -> _estado.value =
                        EstadoSessao.Falhou(resultado.mensagem, resultado.semConexao)
                }
            } finally {
                trava.unlock()
            }
        }
    }
}

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
