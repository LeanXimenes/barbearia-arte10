package br.com.barbeariaarte10.admin.ui.telas.inicio

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Schedule
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
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.barbeariaarte10.admin.Grafo
import br.com.barbeariaarte10.admin.R
import br.com.barbeariaarte10.admin.core.Formato
import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.dados.modelo.AgendaDoDia
import br.com.barbeariaarte10.admin.dados.modelo.ProximoAgendamento
import br.com.barbeariaarte10.admin.ui.componentes.AvisoNotificacoes
import br.com.barbeariaarte10.admin.ui.componentes.CartaoArte10
import br.com.barbeariaarte10.admin.ui.componentes.Etiqueta
import br.com.barbeariaarte10.admin.ui.componentes.EstadoVazio
import br.com.barbeariaarte10.admin.ui.componentes.MensagemErro
import br.com.barbeariaarte10.admin.ui.tema.AzulElevado
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.Sucesso
import br.com.barbeariaarte10.admin.ui.tema.TextoFraco
import br.com.barbeariaarte10.admin.ui.tema.TextoSuave
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate

/** Quantos dias à frente a tela inicial mostra. */
private const val DIAS_A_FRENTE = 7

private val VerdeWhats = Color(0xFF4ADE80)
private val AzulClaro = Color(0xFF8CB4FF)

data class EstadoInicio(
    val carregando: Boolean = true,
    val agenda: AgendaDoDia? = null,
    val proximos: List<ProximoAgendamento> = emptyList(),
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
            val agenda = Grafo.agenda.agendaDoDia(Formato.hoje())
            val proximos = Grafo.agenda.proximosAgendamentos(DIAS_A_FRENTE)
            _estado.update { atual ->
                val erro = (proximos as? Resultado.Falha)?.mensagem
                    ?: (proximos as? Resultado.Sucesso)?.dado?.takeIf { !it.ok }?.mensagem
                    ?: (agenda as? Resultado.Falha)?.mensagem
                atual.copy(
                    carregando = false,
                    agenda = (agenda as? Resultado.Sucesso)?.dado ?: atual.agenda,
                    proximos = (proximos as? Resultado.Sucesso)?.dado?.takeIf { it.ok }?.agendamentos
                        ?: atual.proximos,
                    erro = erro,
                )
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

/**
 * Tela inicial do dono: o próximo cliente, os horários de hoje e os dos
 * próximos dias já marcados — cada um com o botão do WhatsApp do cliente.
 */
@Composable
fun InicioTela(
    online: Boolean,
    aoAbrirAgenda: (dia: String?) -> Unit,
    aoAbrirHistorico: () -> Unit,
    modelo: InicioViewModel = viewModel(),
) {
    val estado by modelo.estado.collectAsStateWithLifecycle()
    val contexto = LocalContext.current

    LaunchedEffect(online) {
        if (online) modelo.carregar(silencioso = true)
    }

    // "Daqui a 25 min" se atualiza sozinho.
    var agora by remember { mutableLongStateOf(Clock.System.now().toEpochMilliseconds()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            agora = Clock.System.now().toEpochMilliseconds()
        }
    }

    val hoje = Formato.hoje()
    val textoHoje = hoje.toString()
    val deHoje = estado.proximos.filter { it.data == textoHoje }
    val porDia = estado.proximos.filter { it.data != textoHoje }.groupBy { it.data }
    val proximo = estado.proximos.firstOrNull { it.status == "agendado" }

    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
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

        proximo?.let { p ->
            item { CartaoProximo(p, agora, textoHoje) { abrirWhatsapp(contexto, p, textoHoje) } }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                CartaoNumero(
                    titulo = "Hoje",
                    valor = "${estado.agenda?.resumo?.agendamentos ?: deHoje.size}",
                    descricao = "agendamentos",
                    cor = Ouro,
                    modifier = Modifier.weight(1f),
                )
                CartaoNumero(
                    titulo = "Livres",
                    valor = "${estado.agenda?.resumo?.livres ?: 0}",
                    descricao = "horários hoje",
                    cor = Sucesso,
                    modifier = Modifier.weight(1f),
                )
                CartaoNumero(
                    titulo = "Próx. 7 dias",
                    valor = "${estado.proximos.size - deHoje.size}",
                    descricao = "marcados",
                    cor = AzulClaro,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        // ------------------------------------------------------------ hoje
        item {
            CabecalhoSecao("HOJE", acao = "Ver agenda") { aoAbrirAgenda(textoHoje) }
        }

        if (estado.agenda?.aberto == false && deHoje.isEmpty()) {
            item {
                CartaoArte10 {
                    Row(
                        Modifier.padding(18.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Icon(Icons.Outlined.EventBusy, contentDescription = null, tint = TextoFraco)
                        Text("Barbearia fechada hoje.", style = MaterialTheme.typography.bodyMedium, color = TextoSuave)
                    }
                }
            }
        } else if (deHoje.isEmpty() && !estado.carregando) {
            item {
                CartaoArte10 {
                    EstadoVazio(
                        titulo = "Ninguém mais marcado para hoje",
                        descricao = "Assim que alguém agendar pelo site, aparece aqui na hora.",
                    )
                }
            }
        }

        items(deHoje, key = { "hoje-${it.id}" }) { a ->
            LinhaHorario(
                a = a,
                aoAbrir = { aoAbrirAgenda(a.data) },
                aoWhatsapp = { abrirWhatsapp(contexto, a, textoHoje) },
            )
        }

        val livres = estado.agenda?.proximosLivres.orEmpty()
        if (livres.isNotEmpty()) {
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("Livres hoje:", style = MaterialTheme.typography.bodySmall, color = TextoSuave)
                    livres.forEach { horario -> Etiqueta(texto = horario, cor = Sucesso) }
                }
            }
        }

        // -------------------------------------------------- próximos dias
        item {
            Spacer(Modifier.height(4.dp))
            CabecalhoSecao("PRÓXIMOS DIAS")
        }

        if (porDia.isEmpty() && !estado.carregando) {
            item {
                CartaoArte10 {
                    EstadoVazio(titulo = "Nada marcado nos próximos 7 dias ainda", descricao = "")
                }
            }
        }

        porDia.forEach { (data, lista) ->
            item(key = "dia-$data") {
                TituloDoDia(data, lista.size) { aoAbrirAgenda(data) }
            }
            items(lista, key = { "dia-${it.id}" }) { a ->
                LinhaHorario(
                    a = a,
                    aoAbrir = { aoAbrirAgenda(a.data) },
                    aoWhatsapp = { abrirWhatsapp(contexto, a, textoHoje) },
                )
            }
        }

        item {
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    onClick = { aoAbrirAgenda(null) },
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

// ---------------------------------------------------------------------

/** Mensagem pronta: "...sobre o seu horário de hoje às 15:00 (Corte de cabelo)." */
private fun mensagemWhatsapp(a: ProximoAgendamento, hoje: String): String {
    val amanha = runCatching { Formato.somarDias(LocalDate.parse(hoje), 1).toString() }.getOrNull()
    val quando = when (a.data) {
        hoje -> "hoje às ${a.horarioInicio}"
        amanha -> "amanhã às ${a.horarioInicio}"
        else -> "${Formato.dataCurta(a.data)} às ${a.horarioInicio}"
    }
    return "Olá, ${a.clienteNome}! Aqui é da Barbearia Arte 10 sobre o seu horário de $quando (${a.servicoNome})."
}

private fun abrirWhatsapp(contexto: Context, a: ProximoAgendamento, hoje: String) {
    val link = Formato.linkWhatsapp(a.clienteTelefone, mensagemWhatsapp(a, hoje)) ?: return
    runCatching {
        contexto.startActivity(Intent(Intent.ACTION_VIEW, link.toUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
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
            Text("BARBEARIA ARTE 10", style = MaterialTheme.typography.labelMedium, color = Ouro)
            Text(hoje, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
        }
    }
}

@Composable
private fun CabecalhoSecao(texto: String, acao: String? = null, aoAcao: () -> Unit = {}) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(texto, style = MaterialTheme.typography.labelSmall, color = Ouro, modifier = Modifier.weight(1f))
        if (acao != null) {
            TextButton(onClick = aoAcao) { Text(acao, color = Ouro) }
        }
    }
}

@Composable
private fun TituloDoDia(data: String, quantidade: Int, aoAbrir: () -> Unit) {
    val dia = runCatching { LocalDate.parse(data) }.getOrNull()
    val relativo = dia?.let { Formato.rotuloRelativo(it) }
    val extenso = dia?.let { Formato.dataPorExtenso(it) } ?: data
    val titulo = if (relativo != null && relativo != extenso) "$relativo · $extenso" else extenso
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = aoAbrir)
            .padding(top = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            titulo,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.weight(1f),
        )
        Text(
            "$quantidade ${if (quantidade == 1) "horário" else "horários"}",
            style = MaterialTheme.typography.bodySmall,
            color = TextoFraco,
        )
    }
}

@Composable
private fun CartaoProximo(a: ProximoAgendamento, agora: Long, hoje: String, aoWhatsapp: () -> Unit) {
    val inicio = runCatching { Instant.parse(a.inicioEm).toEpochMilliseconds() }.getOrNull()
    val minutos = inicio?.let { ((it - agora) / 60_000).toInt() }
    val quando = when {
        a.emAndamento -> "Na cadeira agora"
        a.data != hoje -> {
            val dia = runCatching { LocalDate.parse(a.data) }.getOrNull()
            "${dia?.let { Formato.rotuloRelativo(it) } ?: a.data} às ${a.horarioInicio}"
        }
        minutos != null && minutos <= 60 -> "Daqui a ${minutos.coerceAtLeast(1)} min · ${a.horarioInicio}"
        else -> "Hoje às ${a.horarioInicio}"
    }

    CartaoArte10(corDaBorda = Ouro.copy(alpha = 0.45f), corDeFundo = Ouro.copy(alpha = 0.08f)) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.Schedule, contentDescription = null, tint = Ouro, modifier = Modifier.size(18.dp))
                Text("PRÓXIMO CLIENTE", style = MaterialTheme.typography.labelSmall, color = Ouro)
            }
            Spacer(Modifier.height(6.dp))
            Text(a.clienteNome, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onBackground)
            Text(quando, style = MaterialTheme.typography.titleSmall, color = Ouro, fontWeight = FontWeight.Bold)
            Text(
                "${a.servicoNome} · ${Formato.duracao(a.duracaoMinutos)} · ${Formato.telefone(a.clienteTelefone)}",
                style = MaterialTheme.typography.bodySmall,
                color = TextoSuave,
            )
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = aoWhatsapp,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(999.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Ouro, contentColor = Color(0xFF1A1204)),
            ) {
                Icon(Icons.AutoMirrored.Outlined.Chat, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Mandar mensagem", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun LinhaHorario(a: ProximoAgendamento, aoAbrir: () -> Unit, aoWhatsapp: () -> Unit) {
    CartaoArte10(corDaBorda = Ouro.copy(alpha = 0.3f)) {
        Row(
            Modifier
                .clickable(onClick = aoAbrir)
                .padding(start = 14.dp, top = 12.dp, bottom = 12.dp, end = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .width(62.dp)
                    .background(AzulElevado, RoundedCornerShape(10.dp))
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(a.horarioInicio, style = MaterialTheme.typography.titleMedium, color = Ouro)
            }

            Spacer(Modifier.width(12.dp))

            Column(Modifier.weight(1f)) {
                Text(a.clienteNome, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
                Text(
                    "${a.servicoNome} · ${Formato.duracao(a.duracaoMinutos)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextoSuave,
                )
                if (a.emAndamento) {
                    Spacer(Modifier.height(4.dp))
                    Etiqueta(texto = "Agora", cor = Sucesso)
                }
            }

            IconButton(
                onClick = aoWhatsapp,
                modifier = Modifier
                    .size(44.dp)
                    .background(VerdeWhats.copy(alpha = 0.14f), RoundedCornerShape(999.dp)),
            ) {
                Icon(
                    Icons.AutoMirrored.Outlined.Chat,
                    contentDescription = "WhatsApp de ${a.clienteNome}",
                    tint = VerdeWhats,
                    modifier = Modifier.size(20.dp),
                )
            }
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
            Text(titulo.uppercase(), style = MaterialTheme.typography.labelSmall, color = TextoFraco, maxLines = 1)
            Spacer(Modifier.height(6.dp))
            Text(valor, style = MaterialTheme.typography.displaySmall, color = cor, fontWeight = FontWeight.Bold)
            Text(descricao, style = MaterialTheme.typography.bodySmall, color = TextoFraco, maxLines = 1)
        }
    }
}
