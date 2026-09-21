package br.com.barbeariaarte10.admin.ui.telas.login

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.barbeariaarte10.admin.Grafo
import br.com.barbeariaarte10.admin.R
import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.core.Supabase
import br.com.barbeariaarte10.admin.ui.componentes.MensagemErro
import br.com.barbeariaarte10.admin.ui.tema.AzulCartao
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.TextoFraco
import br.com.barbeariaarte10.admin.ui.tema.TextoSuave
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EstadoLogin(
    val entrando: Boolean = false,
    val erro: String? = null,
)

class LoginViewModel : ViewModel() {

    private val _estado = MutableStateFlow(EstadoLogin())
    val estado: StateFlow<EstadoLogin> = _estado.asStateFlow()

    fun entrar(email: String, senha: String) {
        if (_estado.value.entrando) return

        if (email.isBlank() || senha.isBlank()) {
            _estado.update { it.copy(erro = "Preencha e-mail e senha.") }
            return
        }

        _estado.update { it.copy(entrando = true, erro = null) }

        viewModelScope.launch {
            when (val resultado = Grafo.autenticacao.entrar(email, senha)) {
                is Resultado.Sucesso -> _estado.update { it.copy(entrando = false, erro = null) }
                is Resultado.Falha -> _estado.update {
                    it.copy(entrando = false, erro = resultado.mensagem)
                }
            }
        }
    }
}

@Composable
fun LoginTela(modelo: LoginViewModel = viewModel()) {
    val estado by modelo.estado.collectAsStateWithLifecycle()

    var email by remember { mutableStateOf("") }
    var senha by remember { mutableStateOf("") }
    var mostrarSenha by remember { mutableStateOf(false) }
    val teclado = LocalSoftwareKeyboardController.current

    Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 24.dp, vertical = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Image(
                painter = painterResource(R.drawable.logo_arte10),
                contentDescription = "Barbearia Arte 10",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(148.dp)
                    .clip(RoundedCornerShape(24.dp)),
            )

            Spacer(Modifier.height(28.dp))

            Text(
                text = "Painel do proprietário",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Entre para acompanhar a agenda da Barbearia Arte 10.",
                style = MaterialTheme.typography.bodyMedium,
                color = TextoSuave,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(32.dp))

            if (!Supabase.configurado) {
                MensagemErro(
                    mensagem = "As credenciais do Supabase não foram definidas em local.properties. " +
                        "Preencha SUPABASE_URL e SUPABASE_ANON_KEY e recompile.",
                )
                Spacer(Modifier.height(16.dp))
            }

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("E-mail") },
                singleLine = true,
                enabled = !estado.entrando,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                ),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = coresDoCampo(),
            )

            Spacer(Modifier.height(14.dp))

            OutlinedTextField(
                value = senha,
                onValueChange = { senha = it },
                label = { Text("Senha") },
                singleLine = true,
                enabled = !estado.entrando,
                visualTransformation = if (mostrarSenha) {
                    VisualTransformation.None
                } else {
                    PasswordVisualTransformation()
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(
                    onDone = {
                        teclado?.hide()
                        modelo.entrar(email, senha)
                    },
                ),
                trailingIcon = {
                    IconButton(onClick = { mostrarSenha = !mostrarSenha }) {
                        Icon(
                            imageVector = if (mostrarSenha) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                            contentDescription = if (mostrarSenha) "Ocultar senha" else "Mostrar senha",
                            tint = TextoFraco,
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = coresDoCampo(),
            )

            if (estado.erro != null) {
                Spacer(Modifier.height(16.dp))
                MensagemErro(mensagem = estado.erro!!)
            }

            Spacer(Modifier.height(24.dp))

            Button(
                onClick = {
                    teclado?.hide()
                    modelo.entrar(email, senha)
                },
                enabled = !estado.entrando,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(999.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Ouro,
                    contentColor = androidx.compose.ui.graphics.Color(0xFF1A1204),
                ),
            ) {
                if (estado.entrando) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = androidx.compose.ui.graphics.Color(0xFF1A1204),
                    )
                } else {
                    Text("Entrar", fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(20.dp))

            Text(
                text = "O acesso é liberado apenas para contas cadastradas como " +
                    "administradoras da barbearia.",
                style = MaterialTheme.typography.bodySmall,
                color = TextoFraco,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun coresDoCampo() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Ouro,
    unfocusedBorderColor = AzulCartao,
    focusedLabelColor = Ouro,
    unfocusedLabelColor = TextoFraco,
    cursorColor = Ouro,
    focusedContainerColor = AzulCartao.copy(alpha = 0.5f),
    unfocusedContainerColor = AzulCartao.copy(alpha = 0.5f),
    disabledContainerColor = AzulCartao.copy(alpha = 0.3f),
)

