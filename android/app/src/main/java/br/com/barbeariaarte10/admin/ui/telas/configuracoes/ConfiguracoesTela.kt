package br.com.barbeariaarte10.admin.ui.telas.configuracoes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.History
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import br.com.barbeariaarte10.admin.dados.modelo.ConfigBarbearia
import br.com.barbeariaarte10.admin.dados.modelo.HorarioFuncionamento
import br.com.barbeariaarte10.admin.ui.componentes.CartaoArte10
import br.com.barbeariaarte10.admin.ui.componentes.MensagemErro
import br.com.barbeariaarte10.admin.ui.componentes.TituloSecao
import br.com.barbeariaarte10.admin.ui.tema.Erro
import br.com.barbeariaarte10.admin.ui.tema.AzulNoite
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.TextoFraco
import br.com.barbeariaarte10.admin.ui.tema.TextoSuave
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EstadoConfig(
    val carregando: Boolean = true,
    val salvando: Boolean = false,
    val config: ConfigBarbearia? = null,
    val funcionamento: List<HorarioFuncionamento> = emptyList(),
    val erro: String? = null,
    val aviso: String? = null,
)

class ConfiguracoesViewModel : ViewModel() {

    private val _estado = MutableStateFlow(EstadoConfig())
    val estado: StateFlow<EstadoConfig> = _estado.asStateFlow()

    init { carregar() }

    fun carregar() {
        _estado.update { it.copy(carregando = true, erro = null) }
        viewModelScope.launch {
            val config = Grafo.catalogo.config()
            val horarios = Grafo.catalogo.funcionamento()

            if (config is Resultado.Falha) {
                _estado.update { it.copy(carregando = false, erro = config.mensagem) }
                return@launch
            }
            if (horarios is Resultado.Falha) {
                _estado.update { it.copy(carregando = false, erro = horarios.mensagem) }
                return@launch
            }

            _estado.update {
                it.copy(
                    carregando = false,
                    config = (config as Resultado.Sucesso).dado,
                    funcionamento = (horarios as Resultado.Sucesso).dado,
                    erro = null,
                )
            }
        }
    }

    fun limparAviso() = _estado.update { it.copy(aviso = null) }

    fun salvarConfig(novo: ConfigBarbearia) {
        if (_estado.value.salvando) return
        _estado.update { it.copy(salvando = true, aviso = null) }

        viewModelScope.launch {
            when (val r = Grafo.catalogo.salvarConfig(novo)) {
                is Resultado.Sucesso -> {
                    _estado.update { it.copy(salvando = false, aviso = "Dados salvos.") }
                    carregar()
                }
                is Resultado.Falha -> _estado.update { it.copy(salvando = false, aviso = r.mensagem) }
            }
        }
    }

    fun salvarDia(dia: HorarioFuncionamento) {
        if (_estado.value.salvando) return
        _estado.update { it.copy(salvando = true, aviso = null) }

        viewModelScope.launch {
            when (val r = Grafo.catalogo.salvarFuncionamento(dia)) {
                is Resultado.Sucesso -> {
                    _estado.update { it.copy(salvando = false, aviso = "Expediente atualizado.") }
                    carregar()
                }
                is Resultado.Falha -> _estado.update { it.copy(salvando = false, aviso = r.mensagem) }
            }
        }
    }

}

@Composable
fun ConfiguracoesTela(
    online: Boolean,
    aoAbrirHistorico: () -> Unit,
    modelo: ConfiguracoesViewModel = viewModel(),
) {
    val estado by modelo.estado.collectAsStateWithLifecycle()
    var diaEmEdicao by remember { mutableStateOf<HorarioFuncionamento?>(null) }
    var editandoDados by remember { mutableStateOf(false) }

    LaunchedEffect(online) { if (online) modelo.carregar() }

    LazyColumn(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { TituloSecao(etiqueta = "Configurações", titulo = "Como a barbearia funciona") }

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

        // ---------------------------------------------- funcionamento
        item {
            Text("EXPEDIENTE", style = MaterialTheme.typography.labelSmall, color = Ouro)
        }

        items(
            estado.funcionamento.sortedBy { if (it.diaSemana == 0) 7 else it.diaSemana },
            key = { it.diaSemana },
        ) { dia ->
            CartaoArte10 {
                Row(
                    Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            Formato.nomeDoDia(dia.diaSemana),
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                        Text(
                            if (dia.aberto) {
                                buildString {
                                    append("${Formato.hora(dia.abre)} — ${Formato.hora(dia.fecha)}")
                                    if (dia.intervaloInicio != null) {
                                        append(" · intervalo ${Formato.hora(dia.intervaloInicio)}")
                                        append("—${Formato.hora(dia.intervaloFim)}")
                                    }
                                }
                            } else {
                                "Fechado"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = if (dia.aberto) TextoSuave else TextoFraco,
                        )
                    }

                    TextButton(onClick = { diaEmEdicao = dia }) {
                        Text("Editar", color = Ouro)
                    }
                }
            }
        }

        // ------------------------------------------- dados da barbearia
        item {
            Spacer(Modifier.height(6.dp))
            Text("DADOS DA BARBEARIA", style = MaterialTheme.typography.labelSmall, color = Ouro)
        }

        item {
            val config = estado.config
            CartaoArte10 {
                Column(Modifier.padding(16.dp)) {
                    LinhaInfo("Nome", config?.nome.orEmpty())
                    LinhaInfo("Endereço", config?.endereco.orEmpty())
                    LinhaInfo("Cidade", listOfNotNull(config?.cidade, config?.uf).joinToString(" — "))
                    LinhaInfo("WhatsApp", Formato.telefone(config?.telefoneWhatsapp))
                    LinhaInfo("Instagram", config?.instagram.orEmpty())
                    LinhaInfo("Grade de horários", "${config?.granularidadeMinutos ?: 15} min")
                    LinhaInfo("Antecedência mínima", "${config?.antecedenciaMinimaMinutos ?: 30} min")
                    LinhaInfo("Agendar até", "${config?.antecedenciaMaximaDias ?: 60} dias")

                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(
                        onClick = { editandoDados = true },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(999.dp),
                        enabled = config != null,
                    ) { Text("Editar dados") }
                }
            }
        }

        // -------------------------------------------------- histórico
        item {
            Spacer(Modifier.height(6.dp))
            OutlinedButton(
                onClick = aoAbrirHistorico,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(999.dp),
            ) {
                Icon(Icons.Outlined.History, contentDescription = null, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(8.dp))
                Text("Histórico de atendimentos")
            }
        }

        // -------------------------------------------------- conexão
        item {
            Spacer(Modifier.height(10.dp))
            Text(
                "O app entra sozinho com a conta da barbearia" +
                    (Grafo.autenticacao.emailAtual()?.let { " ($it)" } ?: "") +
                    ". Não é preciso fazer login.",
                style = MaterialTheme.typography.bodySmall,
                color = TextoFraco,
            )
        }
    }

    diaEmEdicao?.let { dia ->
        DialogoExpediente(
            dia = dia,
            salvando = estado.salvando,
            aoFechar = { diaEmEdicao = null },
            aoSalvar = {
                modelo.salvarDia(it)
                diaEmEdicao = null
            },
        )
    }

    if (editandoDados && estado.config != null) {
        DialogoDadosBarbearia(
            config = estado.config!!,
            salvando = estado.salvando,
            aoFechar = { editandoDados = false },
            aoSalvar = {
                modelo.salvarConfig(it)
                editandoDados = false
            },
        )
    }
}

@Composable
private fun LinhaInfo(rotulo: String, valor: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
        Text(rotulo, style = MaterialTheme.typography.bodySmall, color = TextoSuave, modifier = Modifier.width(140.dp))
        Text(
            valor.ifBlank { "—" },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun DialogoExpediente(
    dia: HorarioFuncionamento,
    salvando: Boolean,
    aoFechar: () -> Unit,
    aoSalvar: (HorarioFuncionamento) -> Unit,
) {
    var aberto by remember { mutableStateOf(dia.aberto) }
    var abre by remember { mutableStateOf(Formato.hora(dia.abre)) }
    var fecha by remember { mutableStateOf(Formato.hora(dia.fecha)) }
    var intervaloInicio by remember { mutableStateOf(Formato.hora(dia.intervaloInicio)) }
    var intervaloFim by remember { mutableStateOf(Formato.hora(dia.intervaloFim)) }
    var erro by remember { mutableStateOf<String?>(null) }

    androidx.compose.material3.AlertDialog(
        onDismissRequest = aoFechar,
        containerColor = AzulNoite,
        title = { Text(Formato.nomeDoDia(dia.diaSemana)) },
        text = {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Aberto neste dia", Modifier.weight(1f), color = TextoSuave)
                    Switch(
                        checked = aberto,
                        onCheckedChange = { aberto = it },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color(0xFF1A1204),
                            checkedTrackColor = Ouro,
                        ),
                    )
                }

                if (aberto) {
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CampoHora("Abre", abre) { abre = it }
                        CampoHora("Fecha", fecha) { fecha = it }
                    }
                    Spacer(Modifier.height(10.dp))
                    Text("Intervalo (deixe vazio se não houver)", style = MaterialTheme.typography.bodySmall, color = TextoFraco)
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CampoHora("Início", intervaloInicio) { intervaloInicio = it }
                        CampoHora("Fim", intervaloFim) { intervaloFim = it }
                    }
                }

                erro?.let {
                    Spacer(Modifier.height(10.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall, color = Erro)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    erro = validarExpediente(aberto, abre, fecha, intervaloInicio, intervaloFim)
                    if (erro == null) {
                        aoSalvar(
                            dia.copy(
                                aberto = aberto,
                                abre = if (aberto) "$abre:00" else null,
                                fecha = if (aberto) "$fecha:00" else null,
                                intervaloInicio = if (aberto && intervaloInicio.isNotBlank()) "$intervaloInicio:00" else null,
                                intervaloFim = if (aberto && intervaloFim.isNotBlank()) "$intervaloFim:00" else null,
                            ),
                        )
                    }
                },
                enabled = !salvando,
                colors = ButtonDefaults.buttonColors(containerColor = Ouro, contentColor = Color(0xFF1A1204)),
            ) { Text(if (salvando) "Salvando…" else "Salvar") }
        },
        dismissButton = { TextButton(onClick = aoFechar) { Text("Cancelar", color = TextoSuave) } },
    )
}

private fun validarExpediente(
    aberto: Boolean,
    abre: String,
    fecha: String,
    intervaloInicio: String,
    intervaloFim: String,
): String? {
    if (!aberto) return null

    val formato = Regex("^([01]\\d|2[0-3]):([0-5]\\d)$")
    if (!formato.matches(abre) || !formato.matches(fecha)) return "Use o formato HH:MM."
    if (fecha <= abre) return "O fechamento precisa ser depois da abertura."

    val temInicio = intervaloInicio.isNotBlank()
    val temFim = intervaloFim.isNotBlank()
    if (temInicio != temFim) return "Preencha o intervalo inteiro ou deixe os dois vazios."

    if (temInicio) {
        if (!formato.matches(intervaloInicio) || !formato.matches(intervaloFim)) return "Use o formato HH:MM."
        if (intervaloFim <= intervaloInicio) return "O fim do intervalo precisa ser depois do início."
        if (intervaloInicio < abre || intervaloFim > fecha) return "O intervalo precisa ficar dentro do expediente."
    }
    return null
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.CampoHora(
    rotulo: String,
    valor: String,
    aoMudar: (String) -> Unit,
) {
    OutlinedTextField(
        value = valor,
        onValueChange = { texto ->
            val digitos = texto.filter { it.isDigit() }.take(4)
            aoMudar(
                when {
                    digitos.length <= 2 -> digitos
                    else -> "${digitos.take(2)}:${digitos.drop(2)}"
                },
            )
        },
        label = { Text(rotulo) },
        placeholder = { Text("00:00") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next),
        modifier = Modifier.weight(1f),
    )
}

@Composable
private fun DialogoDadosBarbearia(
    config: ConfigBarbearia,
    salvando: Boolean,
    aoFechar: () -> Unit,
    aoSalvar: (ConfigBarbearia) -> Unit,
) {
    var nome by remember { mutableStateOf(config.nome) }
    var endereco by remember { mutableStateOf(config.endereco.orEmpty()) }
    var cidade by remember { mutableStateOf(config.cidade.orEmpty()) }
    var uf by remember { mutableStateOf(config.uf.orEmpty()) }
    var whatsapp by remember { mutableStateOf(config.telefoneWhatsapp.orEmpty()) }
    var instagram by remember { mutableStateOf(config.instagram.orEmpty()) }

    androidx.compose.material3.AlertDialog(
        onDismissRequest = aoFechar,
        containerColor = AzulNoite,
        title = { Text("Dados da barbearia") },
        text = {
            Column {
                CampoTexto("Nome", nome) { nome = it }
                CampoTexto("Endereço", endereco) { endereco = it }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = cidade,
                        onValueChange = { cidade = it },
                        label = { Text("Cidade") },
                        singleLine = true,
                        modifier = Modifier.weight(2f),
                    )
                    OutlinedTextField(
                        value = uf,
                        onValueChange = { uf = it.uppercase().take(2) },
                        label = { Text("UF") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(10.dp))
                CampoTexto("WhatsApp (só números)", whatsapp) { texto ->
                    whatsapp = texto.filter { it.isDigit() }.take(13)
                }
                CampoTexto("Instagram (sem @)", instagram) { instagram = it.removePrefix("@") }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    aoSalvar(
                        config.copy(
                            nome = nome.trim().ifBlank { "Barbearia Arte 10" },
                            endereco = endereco.trim().ifBlank { null },
                            cidade = cidade.trim().ifBlank { null },
                            uf = uf.trim().ifBlank { null },
                            telefoneWhatsapp = whatsapp.ifBlank { null },
                            instagram = instagram.trim().ifBlank { null },
                        ),
                    )
                },
                enabled = !salvando,
                colors = ButtonDefaults.buttonColors(containerColor = Ouro, contentColor = Color(0xFF1A1204)),
            ) { Text(if (salvando) "Salvando…" else "Salvar") }
        },
        dismissButton = { TextButton(onClick = aoFechar) { Text("Cancelar", color = TextoSuave) } },
    )
}

@Composable
private fun CampoTexto(rotulo: String, valor: String, aoMudar: (String) -> Unit) {
    OutlinedTextField(
        value = valor,
        onValueChange = aoMudar,
        label = { Text(rotulo) },
        singleLine = true,
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 10.dp),
    )
}
