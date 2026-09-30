package br.com.barbeariaarte10.admin.ui.telas.clientes

import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.TextButton
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import br.com.barbeariaarte10.admin.ui.tema.AzulNoite
import br.com.barbeariaarte10.admin.ui.tema.Erro
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.barbeariaarte10.admin.Grafo
import br.com.barbeariaarte10.admin.core.Formato
import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.dados.modelo.ClienteResumo
import br.com.barbeariaarte10.admin.ui.componentes.CartaoArte10
import br.com.barbeariaarte10.admin.ui.componentes.EstadoVazio
import br.com.barbeariaarte10.admin.ui.componentes.Etiqueta
import br.com.barbeariaarte10.admin.ui.componentes.MensagemErro
import br.com.barbeariaarte10.admin.ui.componentes.TituloSecao
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.Sucesso
import br.com.barbeariaarte10.admin.ui.tema.TextoFraco
import br.com.barbeariaarte10.admin.ui.tema.TextoSuave
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EstadoClientes(
    val carregando: Boolean = true,
    val busca: String = "",
    val clientes: List<ClienteResumo> = emptyList(),
    val erro: String? = null,
    val processando: Boolean = false,
    val aviso: String? = null,
)

@OptIn(FlowPreview::class)
class ClientesViewModel : ViewModel() {

    private val _estado = MutableStateFlow(EstadoClientes())
    val estado: StateFlow<EstadoClientes> = _estado.asStateFlow()

    private val termo = MutableStateFlow("")

    init {
        viewModelScope.launch {
            termo.debounce(300).distinctUntilChanged().collect { buscar(it) }
        }
    }

    fun mudarBusca(valor: String) {
        _estado.update { it.copy(busca = valor) }
        termo.value = valor
    }

    fun recarregar() = buscar(_estado.value.busca)

    fun limparAviso() = _estado.update { it.copy(aviso = null) }

    /** Apaga o cliente e o histórico dele (o banco recusa se tiver horário ou plano em aberto). */
    fun apagar(cliente: ClienteResumo) {
        if (_estado.value.processando) return
        _estado.update { it.copy(processando = true, aviso = null) }
        viewModelScope.launch {
            when (val r = Grafo.catalogo.apagarCliente(cliente.id)) {
                is Resultado.Sucesso -> {
                    val ok = r.dado.ok
                    _estado.update {
                        it.copy(
                            processando = false,
                            clientes = if (ok) it.clientes.filterNot { c -> c.id == cliente.id } else it.clientes,
                            aviso = if (ok) "${cliente.nome} foi apagado." else r.dado.mensagem,
                        )
                    }
                }
                is Resultado.Falha -> _estado.update { it.copy(processando = false, aviso = r.mensagem) }
            }
        }
    }

    private fun buscar(texto: String) {
        _estado.update { it.copy(carregando = true, erro = null) }

        viewModelScope.launch {
            when (val resultado = Grafo.catalogo.clientes(texto)) {
                is Resultado.Sucesso -> _estado.update {
                    it.copy(carregando = false, clientes = resultado.dado, erro = null)
                }
                is Resultado.Falha -> _estado.update {
                    it.copy(carregando = false, erro = resultado.mensagem)
                }
            }
        }
    }
}

@Composable
fun ClientesTela(
    online: Boolean,
    modelo: ClientesViewModel = viewModel(),
) {
    val estado by modelo.estado.collectAsStateWithLifecycle()
    var apagando by remember { mutableStateOf<ClienteResumo?>(null) }

    LaunchedEffect(online) { if (online) modelo.recarregar() }

    LazyColumn(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            TituloSecao(etiqueta = "Clientes", titulo = "Quem já passou pela cadeira")
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = estado.busca,
                onValueChange = modelo::mudarBusca,
                placeholder = { Text("Buscar por nome ou telefone") },
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null, tint = TextoFraco) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
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

        if (estado.erro != null) {
            item {
                MensagemErro(mensagem = estado.erro!!, aoTentarNovamente = modelo::recarregar)
            }
        }

        if (!estado.carregando && estado.clientes.isEmpty() && estado.erro == null) {
            item {
                CartaoArte10 {
                    EstadoVazio(
                        titulo = if (estado.busca.isBlank()) "Nenhum cliente ainda" else "Nada encontrado",
                        descricao = if (estado.busca.isBlank()) {
                            "Os clientes aparecem aqui assim que fizerem o primeiro agendamento pelo site."
                        } else {
                            "Tente outro nome ou telefone."
                        },
                    )
                }
            }
        }

        items(estado.clientes, key = { it.id }) { cliente ->
            CartaoCliente(
                cliente = cliente,
                // Com horário marcado não dá: primeiro cancela o horário.
                aoApagar = if (cliente.proximoHorario == null && !estado.processando) ({ apagando = cliente }) else null,
            )
        }
    }

    apagando?.let { cliente ->
        AlertDialog(
            onDismissRequest = { apagando = null },
            containerColor = AzulNoite,
            title = { Text("Apagar ${cliente.nome}?") },
            text = {
                Text(
                    "Some da lista de clientes junto com as visitas antigas. " +
                        "Se ele agendar de novo pelo site, volta como cliente novo. Não pode ser desfeito.",
                    color = TextoSuave,
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        modelo.apagar(cliente)
                        apagando = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Erro, contentColor = Color.White),
                ) { Text("Apagar") }
            },
            dismissButton = {
                TextButton(onClick = { apagando = null }) { Text("Voltar", color = TextoSuave) }
            },
        )
    }
}

@Composable
private fun CartaoCliente(cliente: ClienteResumo, aoApagar: (() -> Unit)?) {
    CartaoArte10 {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        cliente.nome,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    Text(
                        Formato.telefone(cliente.telefone),
                        style = MaterialTheme.typography.bodySmall,
                        color = TextoSuave,
                    )
                }
                Etiqueta(
                    texto = "${cliente.totalAgendamentos} visita" +
                        if (cliente.totalAgendamentos == 1) "" else "s",
                    cor = Ouro,
                )
                if (aoApagar != null) {
                    IconButton(onClick = aoApagar) {
                        Icon(Icons.Outlined.Delete, contentDescription = "Apagar ${cliente.nome}", tint = TextoFraco)
                    }
                }
            }

            if (cliente.proximoHorario != null) {
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Etiqueta(texto = "Próximo", cor = Sucesso)
                    Text(
                        " ${Formato.carimbo(cliente.proximoHorario)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextoSuave,
                    )
                }
            }

            if (cliente.faltas > 0) {
                Spacer(Modifier.height(6.dp))
                Text(
                    if (cliente.faltas == 1) "1 falta" else "${cliente.faltas} faltas",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextoFraco,
                )
            }

            if (cliente.proximoHorario == null && cliente.ultimaVisita != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Última visita: ${Formato.carimbo(cliente.ultimaVisita)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextoFraco,
                )
            }
        }
    }
}
