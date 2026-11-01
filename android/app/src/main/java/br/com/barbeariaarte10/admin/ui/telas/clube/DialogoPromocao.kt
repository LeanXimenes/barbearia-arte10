package br.com.barbeariaarte10.admin.ui.telas.clube

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import br.com.barbeariaarte10.admin.dados.modelo.Promocao
import br.com.barbeariaarte10.admin.dados.modelo.PromocaoEdicao
import br.com.barbeariaarte10.admin.ui.tema.AzulNoite
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.TextoSuave

/** Criar ou editar uma promoção. O site mostra exatamente o que for salvo aqui. */
@Composable
fun DialogoPromocao(
    promocao: Promocao?,
    proximaOrdem: Int,
    salvando: Boolean,
    aoFechar: () -> Unit,
    /** Só na edição: apaga a promoção de vez. */
    aoExcluir: (() -> Unit)? = null,
    aoSalvar: (PromocaoEdicao) -> Unit,
) {
    var titulo by remember { mutableStateOf(promocao?.titulo.orEmpty()) }
    var chamada by remember { mutableStateOf(promocao?.chamada.orEmpty()) }
    var descricao by remember { mutableStateOf(promocao?.descricao.orEmpty()) }
    var itens by remember { mutableStateOf(promocao?.itens.orEmpty().joinToString("\n")) }
    var observacao by remember { mutableStateOf(promocao?.observacao.orEmpty()) }
    var ativo by remember { mutableStateOf(promocao?.ativo ?: true) }
    var confirmarExclusao by remember { mutableStateOf(false) }
    var erro by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = aoFechar,
        containerColor = AzulNoite,
        title = { Text(if (promocao == null) "Nova promoção" else "Editar promoção") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                CampoPromo(titulo, { titulo = it.take(40) }, "Título (ex.: Terça do corte)")
                CampoPromo(chamada, { chamada = it.take(120) }, "Frase de destaque (opcional)")
                OutlinedTextField(
                    value = descricao,
                    onValueChange = { descricao = it.take(500) },
                    label = { Text("Descrição (opcional)") },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                )
                OutlinedTextField(
                    value = itens,
                    onValueChange = { itens = it },
                    label = { Text("O que está incluído (um por linha)") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                )
                CampoPromo(observacao, { observacao = it.take(200) }, "Letra miúda (opcional)")
                Text(
                    "Ex.: \"válido de segunda a quinta\".",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextoSuave,
                )
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Aparece no site", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Switch(
                        checked = ativo,
                        onCheckedChange = { ativo = it },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color(0xFF1A1204),
                            checkedTrackColor = Ouro,
                            uncheckedTrackColor = AzulNoite,
                        ),
                    )
                }

                if (aoExcluir != null) {
                    Spacer(Modifier.height(4.dp))
                    TextButton(
                        onClick = { if (confirmarExclusao) aoExcluir() else confirmarExclusao = true },
                        enabled = !salvando,
                    ) {
                        Text(
                            if (confirmarExclusao) "Toque de novo para excluir de vez" else "Excluir esta promoção",
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }

                erro?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val nome = titulo.trim()
                    erro = if (nome.length !in 2..40) "O título precisa ter entre 2 e 40 letras." else null
                    if (erro == null) {
                        aoSalvar(
                            PromocaoEdicao(
                                titulo = nome,
                                chamada = chamada.trim().ifBlank { null },
                                descricao = descricao.trim().ifBlank { null },
                                itens = itens.lines().map { it.trim() }.filter { it.isNotEmpty() },
                                observacao = observacao.trim().ifBlank { null },
                                ativo = ativo,
                                ordem = promocao?.ordem ?: proximaOrdem,
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

@Composable
private fun CampoPromo(valor: String, aoMudar: (String) -> Unit, rotulo: String) {
    OutlinedTextField(
        value = valor,
        onValueChange = aoMudar,
        label = { Text(rotulo) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
    )
}
