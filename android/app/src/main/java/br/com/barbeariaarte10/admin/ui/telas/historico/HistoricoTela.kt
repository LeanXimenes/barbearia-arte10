package br.com.barbeariaarte10.admin.ui.telas.historico

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import br.com.barbeariaarte10.admin.ui.tema.AzulNoite
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.barbeariaarte10.admin.Grafo
import br.com.barbeariaarte10.admin.core.Formato
import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.dados.modelo.AgendamentoHistorico
import br.com.barbeariaarte10.admin.ui.componentes.CartaoArte10
import br.com.barbeariaarte10.admin.ui.componentes.EstadoVazio
import br.com.barbeariaarte10.admin.ui.componentes.Etiqueta
import br.com.barbeariaarte10.admin.ui.componentes.MensagemErro
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

private const val PAGINA = 50

data class EstadoHistorico(
    val carregando: Boolean = true,
    val carregandoMais: Boolean = false,
    val itens: List<AgendamentoHistorico> = emptyList(),
    val acabou: Boolean = false,
    val erro: String? = null,
    val processando: Boolean = false,
    val aviso: String? = null,
)

class HistoricoViewModel : ViewModel() {

    private val _estado = MutableStateFlow(EstadoHistorico())
    val estado: StateFlow<EstadoHistorico> = _estado.asStateFlow()

    init { carregar() }

    fun carregar() {
        _estado.update { it.copy(carregando = true, erro = null, acabou = false) }
        viewModelScope.launch {
            when (val r = Grafo.agenda.historico(ate = Formato.hoje(), limite = PAGINA)) {
                is Resultado.Sucesso -> _estado.update {
                    it.copy(
                        carregando = false,
                        itens = r.dado,
                        acabou = r.dado.size < PAGINA,
                        erro = null,
                    )
                }
                is Resultado.Falha -> _estado.update {
                    it.copy(carregando = false, erro = r.mensagem)
                }
            }
        }
    }

    fun carregarMais() {
        val atual = _estado.value
        if (atual.carregandoMais || atual.acabou || atual.carregando) return

        _estado.update { it.copy(carregandoMais = true) }
        viewModelScope.launch {
            val r = Grafo.agenda.historico(
                ate = Formato.hoje(),
                limite = PAGINA,
                deslocamento = atual.itens.size,
            )
            when (r) {
                is Resultado.Sucesso -> _estado.update {
                    it.copy(
                        carregandoMais = false,
                        // Se chegou reserva nova durante a paginação, a mesma linha
                        // pode vir em duas páginas: chave repetida derruba a LazyColumn.
                        itens = (it.itens + r.dado).distinctBy { item -> item.id },
                        acabou = r.dado.size < PAGINA,
                    )
                }
                is Resultado.Falha -> _estado.update {
                    it.copy(carregandoMais = false, erro = r.mensagem)
                }
            }
        }
    }

    fun limparAviso() = _estado.update { it.copy(aviso = null) }

    /** Apaga do app um atendimento que já passou. */
    fun apagar(item: AgendamentoHistorico) {
        if (_estado.value.processando) return
        _estado.update { it.copy(processando = true, aviso = null) }
        viewModelScope.launch {
            when (val r = Grafo.agenda.apagarAtendimento(item.id)) {
                is Resultado.Sucesso -> {
                    val ok = r.dado.ok
                    _estado.update {
                        it.copy(
                            processando = false,
                            itens = if (ok) it.itens.filterNot { x -> x.id == item.id } else it.itens,
                            aviso = if (ok) "Atendimento apagado." else r.dado.mensagem,
                        )
                    }
                }
                is Resultado.Falha -> _estado.update { it.copy(processando = false, aviso = r.mensagem) }
            }
        }
    }

    /** Apaga todos os que já passaram pela cadeira. Horários futuros ficam. */
    fun apagarPassados() {
        if (_estado.value.processando) return
        _estado.update { it.copy(processando = true, aviso = null) }
        viewModelScope.launch {
            when (val r = Grafo.agenda.apagarAtendimentosPassados()) {
                is Resultado.Sucesso -> {
                    _estado.update {
                        it.copy(
                            processando = false,
                            aviso = if (r.dado.ok) {
                                "${r.dado.apagados} atendimento(s) apagado(s)."
                            } else {
                                r.dado.mensagem
                            },
                        )
                    }
                    carregar()
                }
                is Resultado.Falha -> _estado.update { it.copy(processando = false, aviso = r.mensagem) }
            }
        }
    }
}


@Composable
fun HistoricoTela(
    aoVoltar: () -> Unit,
    modelo: HistoricoViewModel = viewModel(),
) {
    val estado by modelo.estado.collectAsStateWithLifecycle()
    var apagando by remember { mutableStateOf<AgendamentoHistorico?>(null) }
    var limpandoTudo by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 6.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = aoVoltar) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Voltar", tint = TextoSuave)
            }
            Column {
                Text(
                    "HISTÓRICO",
                    style = MaterialTheme.typography.labelSmall,
                    color = Ouro,
                )
                Text(
                    "Atendimentos anteriores",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                )
            }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = { limpandoTudo = true }, enabled = !estado.processando) {
                Icon(Icons.Outlined.DeleteSweep, contentDescription = null, tint = Erro)
                Spacer(Modifier.width(6.dp))
                Text("Limpar", color = Erro)
            }
        }

        estado.aviso?.let { aviso ->
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(aviso, style = MaterialTheme.typography.bodySmall, color = Ouro, modifier = Modifier.weight(1f))
                TextButton(onClick = modelo::limparAviso) { Text("OK", color = Ouro) }
            }
        }

        LazyColumn(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (estado.erro != null) {
                item { MensagemErro(mensagem = estado.erro!!, aoTentarNovamente = modelo::carregar) }
            }

            if (!estado.carregando && estado.itens.isEmpty() && estado.erro == null) {
                item {
                    CartaoArte10 {
                        EstadoVazio(
                            titulo = "Nada no histórico ainda",
                            descricao = "Os atendimentos já realizados aparecem aqui.",
                        )
                    }
                }
            }

            items(estado.itens, key = { it.id }) { item ->
                LinhaHistorico(
                    item = item,
                    aoApagar = if (item.podeApagar && !estado.processando) ({ apagando = item }) else null,
                )
            }

            if (!estado.acabou && estado.itens.isNotEmpty()) {
                item {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        TextButton(onClick = modelo::carregarMais, enabled = !estado.carregandoMais) {
                            Text(
                                if (estado.carregandoMais) "Carregando…" else "Carregar mais",
                                color = Ouro,
                            )
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(20.dp)) }
        }
    }

    apagando?.let { item ->
        Confirmar(
            titulo = "Apagar este atendimento?",
            texto = "${item.cliente?.nome ?: "Cliente"} · ${Formato.dataCurta(item.data)} às " +
                "${Formato.hora(item.horarioInicio)}. Some do app e não pode ser desfeito. " +
                "O cadastro do cliente continua.",
            aoConfirmar = {
                modelo.apagar(item)
                apagando = null
            },
            aoFechar = { apagando = null },
        )
    }

    if (limpandoTudo) {
        Confirmar(
            titulo = "Apagar quem já passou pela cadeira?",
            texto = "Apaga todos os atendimentos que já aconteceram e os cancelados. " +
                "Os horários marcados para frente continuam. Não pode ser desfeito.",
            aoConfirmar = {
                modelo.apagarPassados()
                limpandoTudo = false
            },
            aoFechar = { limpandoTudo = false },
        )
    }
}

@Composable
private fun Confirmar(titulo: String, texto: String, aoConfirmar: () -> Unit, aoFechar: () -> Unit) {
    AlertDialog(
        onDismissRequest = aoFechar,
        containerColor = AzulNoite,
        title = { Text(titulo) },
        text = { Text(texto, color = TextoSuave) },
        confirmButton = {
            Button(
                onClick = aoConfirmar,
                colors = ButtonDefaults.buttonColors(containerColor = Erro, contentColor = Color.White),
            ) { Text("Apagar") }
        },
        dismissButton = {
            TextButton(onClick = aoFechar) { Text("Voltar", color = TextoSuave) }
        },
    )
}

@Composable
private fun LinhaHistorico(item: AgendamentoHistorico, aoApagar: (() -> Unit)?) {
    CartaoArte10 {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(
                Modifier
                    .width(72.dp)
                    .padding(end = 10.dp),
            ) {
                Text(
                    Formato.dataCurta(item.data),
                    style = MaterialTheme.typography.bodySmall,
                    color = TextoFraco,
                )
                Text(
                    Formato.hora(item.horarioInicio),
                    style = MaterialTheme.typography.titleMedium,
                    color = Ouro,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            Column(Modifier.weight(1f)) {
                Text(
                    item.cliente?.nome ?: "Cliente",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    "${item.servicoNome} · ${Formato.duracao(item.servicoDuracao)} · ${Formato.moeda(item.servicoPreco)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextoSuave,
                )
                item.cliente?.telefone?.let { telefone ->
                    Text(
                        Formato.telefone(telefone),
                        style = MaterialTheme.typography.bodySmall,
                        color = TextoFraco,
                    )
                }
            }

            Etiqueta(
                texto = if (item.canceladoEm != null) "Cancelado" else Formato.rotuloStatus(item.status),
                cor = when {
                    item.canceladoEm != null -> Erro
                    else -> when (item.status) {
                        "concluido" -> Sucesso
                        "nao_compareceu" -> Erro
                        else -> Ouro
                    }
                },
            )

            if (aoApagar != null) {
                IconButton(onClick = aoApagar) {
                    Icon(Icons.Outlined.Delete, contentDescription = "Apagar atendimento", tint = TextoFraco)
                }
            }
        }
    }
}

