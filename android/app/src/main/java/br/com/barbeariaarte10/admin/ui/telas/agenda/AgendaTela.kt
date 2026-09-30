package br.com.barbeariaarte10.admin.ui.telas.agenda

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.net.toUri
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.barbeariaarte10.admin.core.Formato
import br.com.barbeariaarte10.admin.dados.modelo.DiaCalendario
import br.com.barbeariaarte10.admin.dados.modelo.ItemAgenda
import br.com.barbeariaarte10.admin.ui.componentes.CartaoArte10
import br.com.barbeariaarte10.admin.ui.componentes.Etiqueta
import br.com.barbeariaarte10.admin.ui.componentes.MensagemErro
import br.com.barbeariaarte10.admin.ui.tema.AzulCartao
import br.com.barbeariaarte10.admin.ui.tema.AzulElevado
import br.com.barbeariaarte10.admin.ui.tema.Erro
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.Sucesso
import br.com.barbeariaarte10.admin.ui.tema.TextoFraco
import br.com.barbeariaarte10.admin.ui.tema.TextoSuave
import kotlinx.datetime.LocalDate

@Composable
fun AgendaTela(
    online: Boolean,
    dataInicial: String? = null,
    aoUsarDataInicial: () -> Unit = {},
    modelo: AgendaViewModel = viewModel(),
) {
    val estado by modelo.estado.collectAsStateWithLifecycle()

    // Dia vindo de uma notificação tocada: aplica uma vez e avisa que usou.
    LaunchedEffect(dataInicial) {
        if (dataInicial != null) {
            modelo.irParaTexto(dataInicial)
            aoUsarDataInicial()
        }
    }
    LaunchedEffect(online) { if (online) modelo.carregar(silencioso = true) }

    // Cancelou com "avisar no WhatsApp": abre a conversa já com a mensagem.
    val contexto = LocalContext.current
    LaunchedEffect(estado.linkAviso) {
        val link = estado.linkAviso ?: return@LaunchedEffect
        runCatching {
            contexto.startActivity(
                Intent(Intent.ACTION_VIEW, link.toUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
        modelo.limparLinkAviso()
    }

    Column(Modifier.fillMaxWidth()) {
        BarraDeDatas(
            data = estado.data,
            calendario = estado.calendario,
            aoTrocar = modelo::irPara,
            aoAvancar = modelo::avancarDias,
        )

        estado.aviso?.let { aviso ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(Ouro.copy(alpha = 0.12f))
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(aviso, style = MaterialTheme.typography.bodySmall, color = Ouro, modifier = Modifier.weight(1f))
                TextButton(onClick = modelo::limparAviso) { Text("OK", color = Ouro) }
            }
        }

        LazyColumn(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (estado.erro != null) {
                item {
                    MensagemErro(
                        mensagem = estado.erro!!,
                        aoTentarNovamente = { modelo.carregar() },
                    )
                }
            }

            item { Legenda() }

            val agenda = estado.agenda

            if (agenda != null && !agenda.aberto) {
                item {
                    CartaoArte10 {
                        Row(
                            Modifier.padding(18.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Icon(Icons.Outlined.EventBusy, contentDescription = null, tint = TextoFraco)
                            Column {
                                Text(
                                    "Fora do expediente",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = TextoSuave,
                                )
                                Text(
                                    "A barbearia não abre neste dia.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = TextoFraco,
                                )
                            }
                        }
                    }
                }
            }

            if (agenda != null && agenda.aberto) {
                item {
                    Text(
                        "EXPEDIENTE ${agenda.abre.orEmpty()} — ${agenda.fecha.orEmpty()}",
                        style = MaterialTheme.typography.labelSmall,
                        color = TextoFraco,
                        modifier = Modifier.padding(vertical = 4.dp),
                    )
                }
            }

            itemsIndexed(
                items = agenda?.itens.orEmpty(),
                key = { indice, item -> "${item.tipo}-${item.horarioInicio}-${item.id ?: indice}" },
            ) { _, item ->
                LinhaDaAgenda(item = item, aoTocar = { modelo.selecionar(item) })
            }

            if (agenda != null && agenda.aberto && agenda.itens.isEmpty() && !estado.carregando) {
                item {
                    Text(
                        "Nenhum horário para mostrar neste dia.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextoFraco,
                        modifier = Modifier.padding(24.dp),
                    )
                }
            }

            item { Spacer(Modifier.height(20.dp)) }
        }
    }

    estado.itemSelecionado?.let { item ->
        DetalheItem(
            item = item,
            data = estado.data,
            processando = estado.processando,
            aoFechar = { modelo.selecionar(null) },
            aoBloquear = { motivo -> modelo.bloquear(item, motivo) },
            aoDesbloquear = { modelo.desbloquear(item) },
            aoMarcarStatus = { status -> modelo.marcarStatus(item, status) },
            aoCancelar = { motivo, avisar -> modelo.cancelar(item, motivo, avisar) },
        )
    }
}

// ---------------------------------------------------------------------
// Barra de datas
// ---------------------------------------------------------------------

@Composable
private fun BarraDeDatas(
    data: LocalDate,
    calendario: List<DiaCalendario>,
    aoTrocar: (LocalDate) -> Unit,
    aoAvancar: (Int) -> Unit,
) {
    val porData = calendario.associateBy { it.data }

    Column(
        Modifier
            .fillMaxWidth()
            .background(AzulCartao.copy(alpha = 0.6f))
            .padding(bottom = 10.dp),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { aoAvancar(-1) }) {
                Icon(Icons.Outlined.ChevronLeft, contentDescription = "Dia anterior", tint = TextoSuave)
            }

            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    Formato.rotuloRelativo(data),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    Formato.dataCurta(data),
                    style = MaterialTheme.typography.bodySmall,
                    color = TextoFraco,
                )
            }

            IconButton(onClick = { aoAvancar(1) }) {
                Icon(Icons.Outlined.ChevronRight, contentDescription = "Próximo dia", tint = TextoSuave)
            }
        }

        // Faixa de dias: 7 dias para trás e 45 para frente.
        val dias = (-7..45).map { Formato.somarDias(Formato.hoje(), it) }

        LazyRow(
            contentPadding = PaddingValues(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(dias, key = { it.toString() }) { dia ->
                val info = porData[dia.toString()]
                val selecionado = dia == data
                val fechado = info?.aberto == false
                val temAgendamento = (info?.agendamentos ?: 0) > 0

                Column(
                    modifier = Modifier
                        .width(54.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(
                            if (selecionado) Ouro else AzulElevado.copy(alpha = if (fechado) 0.3f else 0.8f),
                        )
                        .clickable { aoTrocar(dia) }
                        .padding(vertical = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        Formato.nomeCurtoDoDia(Formato.diaDaSemanaPostgres(dia)),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (selecionado) Color(0xFF1A1204) else TextoFraco,
                    )
                    Text(
                        "${dia.dayOfMonth}",
                        style = MaterialTheme.typography.titleMedium,
                        color = when {
                            selecionado -> Color(0xFF1A1204)
                            fechado -> TextoFraco
                            else -> MaterialTheme.colorScheme.onBackground
                        },
                    )
                    Box(
                        Modifier
                            .size(5.dp)
                            .background(
                                when {
                                    selecionado && temAgendamento -> Color(0x881A1204)
                                    temAgendamento -> Ouro
                                    else -> Color.Transparent
                                },
                                RoundedCornerShape(999.dp),
                            ),
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------
// Linha da agenda — os 4 estados do item 12
// ---------------------------------------------------------------------

@Composable
private fun LinhaDaAgenda(item: ItemAgenda, aoTocar: () -> Unit) {
    val (cor, rotulo) = when {
        item.ehAgendamento -> Ouro to "Agendado"
        item.ehBloqueio -> Erro to "Bloqueado"
        item.ehIntervalo -> TextoFraco to "Intervalo"
        else -> Sucesso to "Disponível"
    }

    val clicavel = item.ehAgendamento || item.ehBloqueio || (item.ehLivre && !item.passado)

    CartaoArte10(
        corDeFundo = if (item.ehLivre) AzulCartao.copy(alpha = 0.45f) else AzulCartao,
        corDaBorda = cor.copy(alpha = if (item.ehLivre) 0.18f else 0.34f),
        modifier = Modifier.then(
            if (clicavel) Modifier.clickable(onClick = aoTocar) else Modifier,
        ),
    ) {
        Row(
            Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .width(4.dp)
                    .height(38.dp)
                    .background(cor.copy(alpha = if (item.ehLivre) 0.35f else 1f), RoundedCornerShape(999.dp)),
            )

            Spacer(Modifier.width(12.dp))

            Column(Modifier.width(74.dp)) {
                Text(
                    item.horarioInicio,
                    style = MaterialTheme.typography.titleMedium,
                    color = if (item.ehLivre) TextoSuave else MaterialTheme.colorScheme.onBackground,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "até ${item.horarioFim}",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextoFraco,
                )
            }

            Spacer(Modifier.width(8.dp))

            Column(Modifier.weight(1f)) {
                when {
                    item.ehAgendamento -> {
                        Text(
                            item.clienteNome.orEmpty(),
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onBackground,
                        )
                        Text(
                            "${item.servicoNome.orEmpty()} · ${Formato.duracao(item.duracaoMinutos)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextoSuave,
                        )
                        if (item.foraExpediente) {
                            Text(
                                "Fora do expediente atual",
                                style = MaterialTheme.typography.bodySmall,
                                color = Erro,
                            )
                        }
                    }
                    item.ehBloqueio -> {
                        Text(
                            item.motivo?.takeIf { it.isNotBlank() } ?: "Horário bloqueado",
                            style = MaterialTheme.typography.titleSmall,
                            color = TextoSuave,
                        )
                        Text(
                            "Toque para desbloquear",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextoFraco,
                        )
                    }
                    item.ehIntervalo -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Outlined.Restaurant,
                                contentDescription = null,
                                tint = TextoFraco,
                                modifier = Modifier.size(15.dp),
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "Intervalo",
                                style = MaterialTheme.typography.bodyMedium,
                                color = TextoFraco,
                            )
                        }
                    }
                    else -> {
                        Text(
                            if (item.passado) "Horário já passou" else "Livre",
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (item.passado) TextoFraco else TextoSuave,
                        )
                        if (!item.passado) {
                            Text(
                                "Toque para bloquear",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextoFraco,
                            )
                        }
                    }
                }
            }

            if (!item.ehLivre || !item.passado) {
                Etiqueta(texto = rotulo, cor = cor)
            }
        }
    }
}

@Composable
private fun Legenda() {
    Row(
        Modifier.padding(bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ItemLegenda("Agendado", Ouro)
        ItemLegenda("Bloqueado", Erro)
        ItemLegenda("Disponível", Sucesso)
    }
}

@Composable
private fun ItemLegenda(texto: String, cor: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(9.dp)
                .background(cor, RoundedCornerShape(999.dp))
                .border(1.dp, cor.copy(alpha = 0.4f), RoundedCornerShape(999.dp)),
        )
        Spacer(Modifier.width(5.dp))
        Text(texto, style = MaterialTheme.typography.bodySmall, color = TextoFraco)
    }
}

