package br.com.barbeariaarte10.admin.ui.telas.agenda

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.LockOpen
import androidx.compose.material.icons.outlined.PersonOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import br.com.barbeariaarte10.admin.core.Formato
import br.com.barbeariaarte10.admin.dados.modelo.ItemAgenda
import br.com.barbeariaarte10.admin.ui.componentes.Etiqueta
import br.com.barbeariaarte10.admin.ui.tema.AzulNoite
import br.com.barbeariaarte10.admin.ui.tema.Erro
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.Sucesso
import br.com.barbeariaarte10.admin.ui.tema.TextoFraco
import br.com.barbeariaarte10.admin.ui.tema.TextoSuave
import kotlinx.datetime.LocalDate

/**
 * Folha de detalhes de um item da agenda.
 *
 * REGRA ABSOLUTA (item 14): quando o item é um agendamento de cliente,
 * esta tela é somente leitura no que diz respeito ao horário. Não existe
 * botão de cancelar nem de excluir — só dá para registrar o desfecho do
 * atendimento, e nenhum desses estados libera o horário.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetalheItem(
    item: ItemAgenda,
    data: LocalDate,
    processando: Boolean,
    aoFechar: () -> Unit,
    aoBloquear: (String?) -> Unit,
    aoDesbloquear: () -> Unit,
    aoMarcarStatus: (String) -> Unit,
) {
    val estadoFolha = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val contexto = LocalContext.current
    var motivo by remember { mutableStateOf("") }

    ModalBottomSheet(
        onDismissRequest = aoFechar,
        sheetState = estadoFolha,
        containerColor = AzulNoite,
        dragHandle = null,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 22.dp),
        ) {
            when {
                item.ehAgendamento -> DetalheAgendamento(item, data, contexto, processando, aoMarcarStatus)

                item.ehBloqueio -> DetalheBloqueio(item, data, processando, aoDesbloquear)

                else -> DetalheHorarioLivre(
                    item = item,
                    data = data,
                    motivo = motivo,
                    aoMudarMotivo = { motivo = it },
                    processando = processando,
                    aoBloquear = { aoBloquear(motivo) },
                )
            }

            Spacer(Modifier.height(10.dp))

            OutlinedButton(
                onClick = aoFechar,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(999.dp),
            ) {
                Text("Fechar")
            }
        }
    }
}

// ---------------------------------------------------------------------

@Composable
private fun DetalheAgendamento(
    item: ItemAgenda,
    data: LocalDate,
    contexto: android.content.Context,
    processando: Boolean,
    aoMarcarStatus: (String) -> Unit,
) {
    Column {
        Etiqueta(texto = "Agendamento do cliente", cor = Ouro)
        Spacer(Modifier.height(14.dp))

        Text(
            item.clienteNome.orEmpty(),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onBackground,
        )

        Spacer(Modifier.height(18.dp))

        Linha("Telefone", Formato.telefone(item.clienteTelefone))
        Linha("Serviço", item.servicoNome.orEmpty())
        Linha("Data", Formato.dataCurta(data))
        Linha("Horário", "${item.horarioInicio} — ${item.horarioFim}")
        Linha("Duração", Formato.duracao(item.duracaoMinutos))
        Linha("Valor", Formato.moeda(item.servicoPreco))
        Linha("Status", Formato.rotuloStatus(item.status))
        Linha("Marcado em", Formato.carimbo(item.criadoEm))

        Spacer(Modifier.height(18.dp))

        val link = Formato.linkWhatsapp(
            item.clienteTelefone,
            "Olá, ${item.clienteNome.orEmpty()}! Aqui é da Barbearia Arte 10 " +
                "sobre o seu horário de ${item.horarioInicio}.",
        )

        if (link != null) {
            OutlinedButton(
                onClick = {
                    runCatching {
                        contexto.startActivity(
                            Intent(Intent.ACTION_VIEW, Uri.parse(link))
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(999.dp),
            ) {
                Icon(Icons.Outlined.Call, contentDescription = null, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(8.dp))
                Text("Falar com o cliente")
            }
            Spacer(Modifier.height(10.dp))
        }

        if (item.status == "agendado") {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    onClick = { aoMarcarStatus("concluido") },
                    enabled = !processando,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(999.dp),
                ) {
                    Icon(Icons.Outlined.CheckCircle, contentDescription = null, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Atendido")
                }
                OutlinedButton(
                    onClick = { aoMarcarStatus("nao_compareceu") },
                    enabled = !processando,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(999.dp),
                ) {
                    Icon(Icons.Outlined.PersonOff, contentDescription = null, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Faltou")
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        Text(
            "Este horário pertence ao cliente e permanece registrado. " +
                "Marcar o desfecho não libera o horário na agenda.",
            style = MaterialTheme.typography.bodySmall,
            color = TextoFraco,
        )
    }
}

@Composable
private fun DetalheBloqueio(
    item: ItemAgenda,
    data: LocalDate,
    processando: Boolean,
    aoDesbloquear: () -> Unit,
) {
    Column {
        Etiqueta(texto = "Horário bloqueado", cor = Erro)
        Spacer(Modifier.height(14.dp))

        Text(
            item.motivo?.takeIf { it.isNotBlank() } ?: "Sem motivo informado",
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onBackground,
        )

        Spacer(Modifier.height(18.dp))

        Linha("Data", Formato.dataCurta(data))
        Linha("Período", "${item.horarioInicio} — ${item.horarioFim}")
        Linha("Bloqueado em", Formato.carimbo(item.criadoEm))

        Spacer(Modifier.height(18.dp))

        Button(
            onClick = aoDesbloquear,
            enabled = !processando,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(999.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Sucesso,
                contentColor = Color(0xFF04200F),
            ),
        ) {
            if (processando) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = Color(0xFF04200F),
                )
            } else {
                Icon(Icons.Outlined.LockOpen, contentDescription = null, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(8.dp))
                Text("Desbloquear horário", fontWeight = FontWeight.SemiBold)
            }
        }

        Spacer(Modifier.height(10.dp))

        Text(
            "Ao desbloquear, o horário volta a aparecer como disponível no site.",
            style = MaterialTheme.typography.bodySmall,
            color = TextoFraco,
        )
    }
}

@Composable
private fun DetalheHorarioLivre(
    item: ItemAgenda,
    data: LocalDate,
    motivo: String,
    aoMudarMotivo: (String) -> Unit,
    processando: Boolean,
    aoBloquear: () -> Unit,
) {
    Column {
        Etiqueta(texto = "Horário disponível", cor = Sucesso)
        Spacer(Modifier.height(14.dp))

        Text(
            "${item.horarioInicio} — ${item.horarioFim}",
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onBackground,
        )
        Text(
            Formato.dataPorExtenso(data),
            style = MaterialTheme.typography.bodyMedium,
            color = TextoSuave,
        )

        Spacer(Modifier.height(18.dp))

        OutlinedTextField(
            value = motivo,
            onValueChange = aoMudarMotivo,
            label = { Text("Motivo (opcional)") },
            placeholder = { Text("Ex.: compromisso pessoal") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
        )

        Spacer(Modifier.height(16.dp))

        Button(
            onClick = aoBloquear,
            enabled = !processando,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(999.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Ouro,
                contentColor = Color(0xFF1A1204),
            ),
        ) {
            if (processando) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = Color(0xFF1A1204),
                )
            } else {
                Icon(Icons.Outlined.Lock, contentDescription = null, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(8.dp))
                Text("Bloquear horário", fontWeight = FontWeight.SemiBold)
            }
        }

        Spacer(Modifier.height(10.dp))

        Text(
            "O site deixa de oferecer este horário assim que o bloqueio for salvo.",
            style = MaterialTheme.typography.bodySmall,
            color = TextoFraco,
        )
    }
}

@Composable
private fun Linha(rotulo: String, valor: String) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 7.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            rotulo,
            style = MaterialTheme.typography.bodyMedium,
            color = TextoSuave,
            modifier = Modifier.width(120.dp),
        )
        Text(
            valor.ifBlank { "—" },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
        )
    }
}

