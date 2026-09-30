package br.com.barbeariaarte10.admin.ui.telas.clube

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.barbeariaarte10.admin.Grafo
import br.com.barbeariaarte10.admin.core.Formato
import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.dados.modelo.AssinaturaResumo
import br.com.barbeariaarte10.admin.ui.componentes.CartaoArte10
import br.com.barbeariaarte10.admin.ui.componentes.EstadoVazio
import br.com.barbeariaarte10.admin.ui.componentes.Etiqueta
import br.com.barbeariaarte10.admin.ui.componentes.MensagemErro
import br.com.barbeariaarte10.admin.ui.componentes.TituloSecao
import br.com.barbeariaarte10.admin.ui.tema.AzulNoite
import br.com.barbeariaarte10.admin.ui.tema.Erro
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.Sucesso
import br.com.barbeariaarte10.admin.ui.tema.TextoFraco
import br.com.barbeariaarte10.admin.ui.tema.TextoSuave
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EstadoClube(
    val carregando: Boolean = true,
    val assinaturas: List<AssinaturaResumo> = emptyList(),
    val erro: String? = null,
    val processando: Boolean = false,
    val aviso: String? = null,
) {
    val pedidos get() = assinaturas.filter { it.status == "solicitada" }
    val ativos get() = assinaturas.filter { it.status == "ativa" }
    val encerrados get() = assinaturas.filter { it.status !in setOf("solicitada", "ativa") }.take(30)
}

class ClubeViewModel : ViewModel() {

    private val _estado = MutableStateFlow(EstadoClube())
    val estado: StateFlow<EstadoClube> = _estado.asStateFlow()

    init { carregar() }

    fun carregar() {
        _estado.update { it.copy(carregando = true, erro = null) }
        viewModelScope.launch {
            when (val r = Grafo.catalogo.assinaturas()) {
                is Resultado.Sucesso -> _estado.update {
                    it.copy(carregando = false, assinaturas = r.dado, erro = null)
                }
                is Resultado.Falha -> _estado.update { it.copy(carregando = false, erro = r.mensagem) }
            }
        }
    }

    fun limparAviso() = _estado.update { it.copy(aviso = null) }

    fun ativar(a: AssinaturaResumo) = executar("Plano de ${a.clienteNome} ativado!") {
        Grafo.catalogo.ativarAssinatura(a.id)
    }

    fun encerrar(a: AssinaturaResumo) = executar(
        if (a.status == "solicitada") "Pedido recusado." else "Plano cancelado.",
    ) {
        Grafo.catalogo.encerrarAssinatura(a.id)
    }

    private fun executar(
        sucesso: String,
        chamada: suspend () -> Resultado<br.com.barbeariaarte10.admin.dados.modelo.RespostaSimples>,
    ) {
        if (_estado.value.processando) return
        _estado.update { it.copy(processando = true, aviso = null) }
        viewModelScope.launch {
            when (val r = chamada()) {
                is Resultado.Sucesso -> {
                    _estado.update {
                        it.copy(processando = false, aviso = if (r.dado.ok) sucesso else r.dado.mensagem)
                    }
                    carregar()
                }
                is Resultado.Falha -> _estado.update { it.copy(processando = false, aviso = r.mensagem) }
            }
        }
    }
}

/**
 * Clube Arte 10: pedidos de plano que chegam pelo site. O dono confirma
 * o pagamento aqui e, a partir daí, cada corte agendado com o telefone do
 * cliente desconta do plano sozinho.
 */
@Composable
fun ClubeTela(
    online: Boolean,
    modelo: ClubeViewModel = viewModel(),
) {
    val estado by modelo.estado.collectAsStateWithLifecycle()
    var confirmando by remember { mutableStateOf<Pair<AssinaturaResumo, Boolean>?>(null) }

    LaunchedEffect(online) { if (online) modelo.carregar() }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            TituloSecao(etiqueta = "Clube Arte 10", titulo = "Planos dos clientes")
            Spacer(Modifier.height(6.dp))
            Text(
                "Quando o cliente pedir um plano pelo app, ele aparece aqui. Confirme depois de " +
                    "receber o pagamento: cada corte que ele agendar desconta sozinho.",
                style = MaterialTheme.typography.bodySmall,
                color = TextoSuave,
            )
        }

        estado.aviso?.let { aviso ->
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(aviso, style = MaterialTheme.typography.bodySmall, color = Ouro, modifier = Modifier.weight(1f))
                    TextButton(onClick = modelo::limparAviso) { Text("OK", color = Ouro) }
                }
            }
        }

        estado.erro?.let { erro ->
            item { MensagemErro(mensagem = erro, aoTentarNovamente = modelo::carregar) }
        }

        if (!estado.carregando && estado.erro == null && estado.assinaturas.isEmpty()) {
            item {
                EstadoVazio(
                    titulo = "Nenhum plano ainda",
                    descricao = "Os pedidos feitos na aba Clube do app dos clientes chegam aqui.",
                )
            }
        }

        if (estado.pedidos.isNotEmpty()) {
            item { Subtitulo("Esperando pagamento (${estado.pedidos.size})") }
            items(estado.pedidos, key = { it.id }) { a ->
                CartaoAssinatura(
                    a = a,
                    processando = estado.processando,
                    aoAtivar = { confirmando = a to true },
                    aoEncerrar = { confirmando = a to false },
                )
            }
        }

        if (estado.ativos.isNotEmpty()) {
            item { Subtitulo("Planos ativos (${estado.ativos.size})") }
            items(estado.ativos, key = { it.id }) { a ->
                CartaoAssinatura(
                    a = a,
                    processando = estado.processando,
                    aoAtivar = null,
                    aoEncerrar = { confirmando = a to false },
                )
            }
        }

        if (estado.encerrados.isNotEmpty()) {
            item { Subtitulo("Encerrados") }
            items(estado.encerrados, key = { it.id }) { a ->
                CartaoAssinatura(a = a, processando = estado.processando, aoAtivar = null, aoEncerrar = null)
            }
        }
    }

    confirmando?.let { (a, ativar) ->
        AlertDialog(
            onDismissRequest = { confirmando = null },
            containerColor = AzulNoite,
            title = {
                Text(
                    when {
                        ativar -> "Confirmar pagamento?"
                        a.status == "solicitada" -> "Recusar o pedido?"
                        else -> "Cancelar o plano?"
                    },
                )
            },
            text = {
                Text(
                    if (ativar) {
                        "${a.clienteNome} pagou ${Formato.moeda(a.preco)} pelo ${a.planoNome}? " +
                            "Os ${a.cortesTotal} cortes passam a valer por 30 dias a partir de agora."
                    } else {
                        "${a.clienteNome} deixa de ter o ${a.planoNome}. Isso não pode ser desfeito."
                    },
                    color = TextoSuave,
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (ativar) modelo.ativar(a) else modelo.encerrar(a)
                        confirmando = null
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (ativar) Sucesso else Erro,
                        contentColor = if (ativar) Color(0xFF04200F) else Color.White,
                    ),
                ) {
                    Text(if (ativar) "Sim, recebi" else "Sim")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmando = null }) { Text("Voltar", color = TextoSuave) }
            },
        )
    }
}

@Composable
private fun Subtitulo(texto: String) {
    Text(
        texto,
        style = MaterialTheme.typography.titleSmall,
        color = Ouro,
        modifier = Modifier.padding(top = 10.dp),
    )
}

@Composable
private fun CartaoAssinatura(
    a: AssinaturaResumo,
    processando: Boolean,
    aoAtivar: (() -> Unit)?,
    aoEncerrar: (() -> Unit)?,
) {
    val contexto = LocalContext.current
    val (rotulo, cor) = when (a.status) {
        "solicitada" -> "Esperando pagamento" to Ouro
        "ativa" -> "Ativo" to Sucesso
        "encerrada" -> "Cortes usados / vencido" to TextoFraco
        "recusada" -> "Recusado" to Erro
        else -> "Cancelado" to Erro
    }

    CartaoArte10(corDaBorda = if (a.status == "solicitada") Ouro.copy(alpha = 0.45f) else Color(0x1F9AA8C6)) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(a.clienteNome, style = MaterialTheme.typography.titleMedium)
                    Text(
                        "${a.planoNome} · ${Formato.moeda(a.preco)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextoSuave,
                    )
                }
                val link = Formato.linkWhatsapp(
                    a.clienteTelefone,
                    "Olá, ${a.clienteNome}! Aqui é da Barbearia Arte 10 sobre o seu ${a.planoNome}.",
                )
                if (link != null) {
                    IconButton(onClick = {
                        runCatching {
                            contexto.startActivity(
                                Intent(Intent.ACTION_VIEW, link.toUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                            )
                        }
                    }) {
                        Icon(Icons.Outlined.Call, contentDescription = "Falar com ${a.clienteNome}", tint = TextoSuave)
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
            Etiqueta(texto = rotulo, cor = cor)
            Spacer(Modifier.height(8.dp))

            Text(
                when (a.status) {
                    "solicitada" -> "Pedido em ${Formato.carimbo(a.solicitadaEm)} · ${Formato.telefone(a.clienteTelefone)}"
                    "ativa" -> "${a.restantes} de ${a.cortesTotal} cortes restantes · vale até ${Formato.diaMes(a.expiraEm)}"
                    else -> "Usou ${a.cortesUsados} de ${a.cortesTotal} cortes"
                },
                style = MaterialTheme.typography.bodySmall,
                color = TextoFraco,
            )

            if (aoAtivar != null || aoEncerrar != null) {
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (aoAtivar != null) {
                        Button(
                            onClick = aoAtivar,
                            enabled = !processando,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(999.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Sucesso, contentColor = Color(0xFF04200F)),
                        ) {
                            Text("Recebi o pagamento")
                        }
                    }
                    if (aoEncerrar != null) {
                        OutlinedButton(
                            onClick = aoEncerrar,
                            enabled = !processando,
                            modifier = if (aoAtivar != null) Modifier else Modifier.weight(1f),
                            shape = RoundedCornerShape(999.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Erro),
                        ) {
                            Text(if (a.status == "solicitada") "Recusar" else "Cancelar plano")
                        }
                    }
                }
            }
        }
    }
}
