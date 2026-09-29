package br.com.barbeariaarte10.admin.ui.telas.inicio

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.barbeariaarte10.admin.Grafo
import br.com.barbeariaarte10.admin.R
import br.com.barbeariaarte10.admin.core.Formato
import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.dados.modelo.AgendaDoDia
import br.com.barbeariaarte10.admin.dados.modelo.ItemAgenda
import br.com.barbeariaarte10.admin.ui.componentes.AvisoNotificacoes
import br.com.barbeariaarte10.admin.ui.componentes.CartaoArte10
import br.com.barbeariaarte10.admin.ui.componentes.Etiqueta
import br.com.barbeariaarte10.admin.ui.componentes.EstadoVazio
import br.com.barbeariaarte10.admin.ui.componentes.MensagemErro
import br.com.barbeariaarte10.admin.ui.tema.AzulElevado
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

data class EstadoInicio(
    val carregando: Boolean = true,
    val agenda: AgendaDoDia? = null,
    val erro: String? = null,
)

class InicioViewModel : ViewModel() {

    private val _estado = MutableStateFlow(EstadoInicio())
    val estado: StateFlow<EstadoInicio> = _estado.asStateFlow()

    init {
        carregar()
        observarMudancas()
    }

    fun carregar(silencioso: Boolean = false) {
        if (!silencioso) _estado.update { it.copy(carregando = true, erro = null) }

        viewModelScope.launch {
            when (val resultado = Grafo.agenda.agendaDoDia(Formato.hoje())) {
                is Resultado.Sucesso -> _estado.update {
                    it.copy(carregando = false, agenda = resultado.dado, erro = null)
                }
                is Resultado.Falha -> _estado.update {
                    it.copy(carregando = false, erro = resultado.mensagem)
                }
            }
        }
    }

    /** Item 18: um agendamento novo aparece sozinho, sem precisar reabrir. */
    private fun observarMudancas() {
        viewModelScope.launch {
            Grafo.agenda.mudancasNaAgenda().collect { carregar(silencioso = true) }
        }
    }
}

@Composable
fun InicioTela(
    online: Boolean,
    aoAbrirAgenda: () -> Unit,
    aoAbrirHistorico: () -> Unit,
    modelo: InicioViewModel = viewModel(),
) {
    val estado by modelo.estado.collectAsStateWithLifecycle()

    LaunchedEffect(online) {
        if (online) modelo.carregar(silencioso = true)
    }

    val agendamentos = estado.agenda?.itens.orEmpty().filter { it.ehAgendamento }
    val hoje = Formato.hoje()

    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { Cabecalho(hoje = Formato.dataPorExtenso(hoje)) }

        item { AvisoNotificacoes() }

        if (estado.erro != null) {
            item {
                MensagemErro(
                    mensagem = estado.erro!!,
                    aoTentarNovamente = { modelo.carregar() },
                )
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CartaoNumero(
                    titulo = "Hoje",
                    valor = "${estado.agenda?.resumo?.agendamentos ?: 0}",
                    descricao = "agendamentos",
                    cor = Ouro,
                    modifier = Modifier.weight(1f),
                )
                CartaoNumero(
                    titulo = "Livres",
                    valor = "${estado.agenda?.resumo?.livres ?: 0}",
                    descricao = "horários",
                    cor = Sucesso,
                    modifier = Modifier.weight(1f),
                )
                CartaoNumero(
                    titulo = "Bloqueios",
                    valor = "${estado.agenda?.resumo?.bloqueios ?: 0}",
                    descricao = "períodos",
                    cor = Erro,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        estado.agenda?.proximo?.let { proximo ->
            item {
                CartaoArte10(corDaBorda = Ouro.copy(alpha = 0.4f)) {
                    Row(
                        Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Icon(Icons.Outlined.Schedule, contentDescription = null, tint = Ouro)
                        Column(Modifier.weight(1f)) {
                            Text(
                                "PRÓXIMO CLIENTE",
                                style = MaterialTheme.typography.labelSmall,
                                color = Ouro,
                            )
                            Spacer(Modifier.height(3.dp))
                            Text(
                                "${proximo.horario} · ${proximo.cliente.orEmpty()}",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onBackground,
                            )
                            Text(
                                proximo.servico.orEmpty(),
                                style = MaterialTheme.typography.bodySmall,
                                color = TextoSuave,
                            )
                        }
                    }
                }
            }
        }

        item {
            Spacer(Modifier.height(4.dp))
            Text(
                "AGENDA DE HOJE",
                style = MaterialTheme.typography.labelSmall,
                color = Ouro,
            )
        }

        if (estado.agenda?.aberto == false) {
            item {
                CartaoArte10 {
                    Row(
                        Modifier.padding(18.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Icon(Icons.Outlined.EventBusy, contentDescription = null, tint = TextoFraco)
                        Text(
                            "Barbearia fechada hoje.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextoSuave,
                        )
                    }
                }
            }
        }

        if (agendamentos.isEmpty() && estado.agenda?.aberto == true && !estado.carregando) {
            item {
                CartaoArte10 {
                    EstadoVazio(
                        titulo = "Nenhum cliente marcado ainda",
                        descricao = "Assim que alguém agendar pelo site, aparece aqui na hora.",
                    )
                }
            }
        }

        items(agendamentos, key = { it.id ?: it.horarioInicio }) { item ->
            LinhaAgendamento(item)
        }

        val livres = estado.agenda?.proximosLivres.orEmpty()
        if (livres.isNotEmpty()) {
            item {
                CartaoArte10 {
                    Column(Modifier.padding(16.dp)) {
                        Text(
                            "PRÓXIMOS HORÁRIOS LIVRES",
                            style = MaterialTheme.typography.labelSmall,
                            color = TextoFraco,
                        )
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            livres.forEach { horario ->
                                Etiqueta(texto = horario, cor = Sucesso)
                            }
                        }
                    }
                }
            }
        }

        item {
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    onClick = aoAbrirAgenda,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(999.dp),
                ) {
                    Icon(Icons.Outlined.CalendarMonth, contentDescription = null, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Agenda")
                }
                OutlinedButton(
                    onClick = aoAbrirHistorico,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(999.dp),
                ) {
                    Icon(Icons.Outlined.History, contentDescription = null, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Histórico")
                }
            }
        }
    }
}

@Composable
private fun Cabecalho(hoje: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Image(
            painter = painterResource(R.drawable.logo_arte10),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.size(46.dp).clip(RoundedCornerShape(12.dp)),
        )
        Column {
            Text(
                "BARBEARIA ARTE 10",
                style = MaterialTheme.typography.labelMedium,
                color = Ouro,
            )
            Text(
                hoje,
                style = MaterialTheme.typography.bodySmall,
                color = TextoSuave,
            )
        }
    }
}

@Composable
private fun CartaoNumero(
    titulo: String,
    valor: String,
    descricao: String,
    cor: Color,
    modifier: Modifier = Modifier,
) {
    CartaoArte10(modifier = modifier) {
        Column(Modifier.padding(14.dp)) {
            Text(titulo.uppercase(), style = MaterialTheme.typography.labelSmall, color = TextoFraco)
            Spacer(Modifier.height(6.dp))
            Text(
                valor,
                style = MaterialTheme.typography.displaySmall,
                color = cor,
                fontWeight = FontWeight.Bold,
            )
            Text(descricao, style = MaterialTheme.typography.bodySmall, color = TextoFraco)
        }
    }
}

@Composable
private fun LinhaAgendamento(item: ItemAgenda) {
    CartaoArte10 {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .width(62.dp)
                    .background(AzulElevado, RoundedCornerShape(10.dp))
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    item.horarioInicio,
                    style = MaterialTheme.typography.titleMedium,
                    color = Ouro,
                )
            }

            Spacer(Modifier.width(14.dp))

            Column(Modifier.weight(1f)) {
                Text(
                    item.clienteNome.orEmpty(),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    "${item.servicoNome.orEmpty()} · ${Formato.duracao(item.duracaoMinutos)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextoSuave,
                )
            }

            if (item.status != null && item.status != "agendado") {
                Etiqueta(
                    texto = Formato.rotuloStatus(item.status),
                    cor = if (item.status == "concluido") Sucesso else Erro,
                )
            }
        }
    }
}
