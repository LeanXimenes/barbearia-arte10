package br.com.barbeariaarte10.admin.ui.telas.servicos

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.barbeariaarte10.admin.Grafo
import br.com.barbeariaarte10.admin.core.Formato
import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.dados.modelo.Servico
import br.com.barbeariaarte10.admin.dados.modelo.ServicoEdicao
import br.com.barbeariaarte10.admin.ui.componentes.CartaoArte10
import br.com.barbeariaarte10.admin.ui.componentes.Etiqueta
import br.com.barbeariaarte10.admin.ui.componentes.MensagemErro
import br.com.barbeariaarte10.admin.ui.componentes.TituloSecao
import br.com.barbeariaarte10.admin.ui.tema.AzulNoite
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.TextoFraco
import br.com.barbeariaarte10.admin.ui.tema.TextoSuave
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EstadoServicos(
    val carregando: Boolean = true,
    val servicos: List<Servico> = emptyList(),
    val erro: String? = null,
    val salvando: Boolean = false,
    val aviso: String? = null,
)

class ServicosViewModel : ViewModel() {

    private val _estado = MutableStateFlow(EstadoServicos())
    val estado: StateFlow<EstadoServicos> = _estado.asStateFlow()

    init { carregar() }

    fun carregar() {
        _estado.update { it.copy(carregando = true, erro = null) }
        viewModelScope.launch {
            when (val r = Grafo.catalogo.servicos()) {
                is Resultado.Sucesso -> _estado.update {
                    it.copy(carregando = false, servicos = r.dado, erro = null)
                }
                is Resultado.Falha -> _estado.update {
                    it.copy(carregando = false, erro = r.mensagem)
                }
            }
        }
    }

    fun limparAviso() = _estado.update { it.copy(aviso = null) }

    /** Item 27: desativar em vez de excluir preserva o histórico. */
    fun alternarAtivo(servico: Servico) {
        if (_estado.value.salvando) return
        _estado.update { it.copy(salvando = true, aviso = null) }

        viewModelScope.launch {
            when (val r = Grafo.catalogo.definirAtivo(servico.id, !servico.ativo)) {
                is Resultado.Sucesso -> {
                    _estado.update {
                        it.copy(
                            salvando = false,
                            aviso = if (servico.ativo) {
                                "${servico.nome} não aparece mais para novos agendamentos."
                            } else {
                                "${servico.nome} voltou para o site."
                            },
                        )
                    }
                    carregar()
                }
                is Resultado.Falha -> _estado.update { it.copy(salvando = false, aviso = r.mensagem) }
            }
        }
    }

    /** Sobe (-1) ou desce (+1) o serviço na lista. A ordem aparece igual no site. */
    fun mover(servico: Servico, direcao: Int) {
        if (_estado.value.salvando) return
        val lista = _estado.value.servicos.toMutableList()
        val de = lista.indexOfFirst { it.id == servico.id }
        val para = de + direcao
        if (de < 0 || para !in lista.indices) return

        lista.add(para, lista.removeAt(de))
        // Mostra a nova ordem na hora; se o banco recusar, recarrega a real.
        _estado.update { it.copy(servicos = lista, salvando = true, aviso = null) }

        viewModelScope.launch {
            when (val r = Grafo.catalogo.reordenarServicos(lista.map { it.id })) {
                is Resultado.Sucesso -> {
                    _estado.update {
                        it.copy(salvando = false, aviso = if (r.dado.ok) null else r.dado.mensagem)
                    }
                    if (!r.dado.ok) carregar()
                }
                is Resultado.Falha -> {
                    _estado.update { it.copy(salvando = false, aviso = r.mensagem) }
                    carregar()
                }
            }
        }
    }

    fun salvar(id: String?, dados: ServicoEdicao, aoTerminar: () -> Unit) {
        if (_estado.value.salvando) return
        _estado.update { it.copy(salvando = true, aviso = null) }

        viewModelScope.launch {
            val resultado = if (id == null) {
                Grafo.catalogo.criarServico(dados)
            } else {
                Grafo.catalogo.atualizarServico(id, dados)
            }

            when (resultado) {
                is Resultado.Sucesso -> {
                    _estado.update { it.copy(salvando = false, aviso = "Serviço salvo.") }
                    carregar()
                    aoTerminar()
                }
                is Resultado.Falha -> _estado.update {
                    it.copy(salvando = false, aviso = resultado.mensagem)
                }
            }
        }
    }
}

@Composable
fun ServicosTela(
    online: Boolean,
    modelo: ServicosViewModel = viewModel(),
) {
    val estado by modelo.estado.collectAsStateWithLifecycle()
    var editando by remember { mutableStateOf<Servico?>(null) }
    var criando by remember { mutableStateOf(false) }

    LaunchedEffect(online) { if (online) modelo.carregar() }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                TituloSecao(etiqueta = "Serviços", titulo = "O que a barbearia oferece")
                Spacer(Modifier.height(6.dp))
                Text(
                    "Preço e duração daqui alimentam o site e o cálculo dos horários.",
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

            if (estado.erro != null) {
                item { MensagemErro(mensagem = estado.erro!!, aoTentarNovamente = modelo::carregar) }
            }

            if (estado.servicos.size > 1) {
                item {
                    Text(
                        "Use as setas para mudar a ordem. O site mostra na mesma ordem.",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextoFraco,
                    )
                }
            }

            itemsIndexed(estado.servicos, key = { _, s -> s.id }) { indice, servico ->
                CartaoServico(
                    servico = servico,
                    salvando = estado.salvando,
                    podeSubir = indice > 0,
                    podeDescer = indice < estado.servicos.lastIndex,
                    aoSubir = { modelo.mover(servico, -1) },
                    aoDescer = { modelo.mover(servico, +1) },
                    aoEditar = { editando = servico },
                    aoAlternar = { modelo.alternarAtivo(servico) },
                )
            }
        }

        ExtendedFloatingActionButton(
            onClick = { criando = true },
            containerColor = Ouro,
            contentColor = Color(0xFF1A1204),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(20.dp),
        ) {
            Icon(Icons.Outlined.Add, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Novo serviço")
        }
    }

    if (criando || editando != null) {
        DialogoServico(
            servico = editando,
            salvando = estado.salvando,
            aoFechar = {
                criando = false
                editando = null
            },
            aoSalvar = { dados ->
                modelo.salvar(editando?.id, dados) {
                    criando = false
                    editando = null
                }
            },
        )
    }
}

@Composable
private fun CartaoServico(
    servico: Servico,
    salvando: Boolean,
    podeSubir: Boolean,
    podeDescer: Boolean,
    aoSubir: () -> Unit,
    aoDescer: () -> Unit,
    aoEditar: () -> Unit,
    aoAlternar: () -> Unit,
) {
    CartaoArte10(corDaBorda = if (servico.ativo) Ouro.copy(alpha = 0.22f) else Color(0x1F9AA8C6)) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column {
                    IconButton(onClick = aoSubir, enabled = podeSubir && !salvando, modifier = Modifier.size(32.dp)) {
                        Icon(
                            Icons.Outlined.KeyboardArrowUp,
                            contentDescription = "Subir ${servico.nome}",
                            tint = if (podeSubir) Ouro else TextoFraco.copy(alpha = 0.3f),
                        )
                    }
                    IconButton(onClick = aoDescer, enabled = podeDescer && !salvando, modifier = Modifier.size(32.dp)) {
                        Icon(
                            Icons.Outlined.KeyboardArrowDown,
                            contentDescription = "Descer ${servico.nome}",
                            tint = if (podeDescer) Ouro else TextoFraco.copy(alpha = 0.3f),
                        )
                    }
                }
                Spacer(Modifier.width(6.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        servico.nome,
                        style = MaterialTheme.typography.titleMedium,
                        color = if (servico.ativo) {
                            MaterialTheme.colorScheme.onBackground
                        } else {
                            TextoFraco
                        },
                    )
                    Text(
                        "${Formato.moeda(servico.preco)} · ${Formato.duracao(servico.duracaoMinutos)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextoSuave,
                    )
                }

                IconButton(onClick = aoEditar) {
                    Icon(Icons.Outlined.Edit, contentDescription = "Editar", tint = TextoSuave)
                }

                Switch(
                    checked = servico.ativo,
                    onCheckedChange = { aoAlternar() },
                    enabled = !salvando,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color(0xFF1A1204),
                        checkedTrackColor = Ouro,
                        uncheckedTrackColor = AzulNoite,
                    ),
                )
            }

            if (!servico.descricao.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    servico.descricao,
                    style = MaterialTheme.typography.bodySmall,
                    color = TextoFraco,
                )
            }

            if (servico.usaPlano) {
                Spacer(Modifier.height(10.dp))
                Etiqueta(texto = "Desconta do plano do Clube", cor = Ouro)
            }

            if (!servico.ativo) {
                Spacer(Modifier.height(10.dp))
                Etiqueta(texto = "Inativo — não aparece no site", cor = TextoFraco)
            }
        }
    }
}

@Composable
private fun DialogoServico(
    servico: Servico?,
    salvando: Boolean,
    aoFechar: () -> Unit,
    aoSalvar: (ServicoEdicao) -> Unit,
) {
    var nome by remember { mutableStateOf(servico?.nome.orEmpty()) }
    var descricao by remember { mutableStateOf(servico?.descricao.orEmpty()) }
    var preco by remember { mutableStateOf(servico?.preco?.toString().orEmpty()) }
    var duracao by remember { mutableStateOf(servico?.duracaoMinutos?.toString().orEmpty()) }
    var usaPlano by remember { mutableStateOf(servico?.usaPlano ?: false) }
    var erro by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = aoFechar,
        containerColor = AzulNoite,
        title = { Text(if (servico == null) "Novo serviço" else "Editar serviço") },
        text = {
            Column {
                OutlinedTextField(
                    value = nome,
                    onValueChange = { nome = it },
                    label = { Text("Nome") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = descricao,
                    onValueChange = { descricao = it },
                    label = { Text("Descrição") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = preco,
                        onValueChange = { preco = it.replace(',', '.') },
                        label = { Text("Preço") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Decimal,
                            imeAction = ImeAction.Next,
                        ),
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = duracao,
                        onValueChange = { duracao = it.filter { c -> c.isDigit() } },
                        label = { Text("Minutos") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Done,
                        ),
                        modifier = Modifier.weight(1f),
                    )
                }

                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Desconta do plano", style = MaterialTheme.typography.bodyMedium)
                        Text(
                            "Quem tem plano do Clube usa 1 corte ao agendar este serviço.",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextoFraco,
                        )
                    }
                    Switch(
                        checked = usaPlano,
                        onCheckedChange = { usaPlano = it },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color(0xFF1A1204),
                            checkedTrackColor = Ouro,
                            uncheckedTrackColor = AzulNoite,
                        ),
                    )
                }

                erro?.let {
                    Spacer(Modifier.height(10.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val valor = preco.toDoubleOrNull()
                    val minutos = duracao.toIntOrNull()
                    erro = when {
                        nome.trim().length < 2 -> "Informe o nome do serviço."
                        valor == null || valor < 0 -> "Informe um preço válido."
                        minutos == null || minutos < 5 || minutos > 480 ->
                            "A duração precisa ficar entre 5 e 480 minutos."
                        else -> null
                    }
                    if (erro == null) {
                        aoSalvar(
                            ServicoEdicao(
                                nome = nome.trim(),
                                descricao = descricao.trim().ifBlank { null },
                                preco = valor!!,
                                duracaoMinutos = minutos!!,
                                ativo = servico?.ativo ?: true,
                                ordem = servico?.ordem ?: 99,
                                usaPlano = usaPlano,
                            ),
                        )
                    }
                },
                enabled = !salvando,
                colors = ButtonDefaults.buttonColors(containerColor = Ouro, contentColor = Color(0xFF1A1204)),
            ) {
                Text(if (salvando) "Salvando…" else "Salvar")
            }
        },
        dismissButton = {
            TextButton(onClick = aoFechar) { Text("Cancelar", color = TextoSuave) }
        },
    )
}

