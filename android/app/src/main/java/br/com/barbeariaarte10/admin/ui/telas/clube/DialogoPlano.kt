package br.com.barbeariaarte10.admin.ui.telas.clube

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import br.com.barbeariaarte10.admin.core.Formato
import br.com.barbeariaarte10.admin.dados.modelo.Plano
import br.com.barbeariaarte10.admin.dados.modelo.PlanoEdicao
import br.com.barbeariaarte10.admin.ui.tema.AzulNoite
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.TextoFraco
import br.com.barbeariaarte10.admin.ui.tema.TextoSuave

/** Criar ou editar um plano à venda. O site mostra exatamente o que for salvo aqui. */
@Composable
fun DialogoPlano(
    plano: Plano?,
    proximaOrdem: Int,
    /** Preço do serviço que desconta do plano (ex.: corte R$ 35): base do "avulso". */
    precoCorte: Double?,
    salvando: Boolean,
    aoFechar: () -> Unit,
    /** Só na edição. Se algum cliente já pegou o plano, o banco recusa e pede para esconder. */
    aoExcluir: (() -> Unit)? = null,
    aoSalvar: (PlanoEdicao) -> Unit,
) {
    var confirmarExclusao by remember { mutableStateOf(false) }
    var nome by remember { mutableStateOf(plano?.nome.orEmpty()) }
    var chamada by remember { mutableStateOf(plano?.chamada.orEmpty()) }
    var preco by remember { mutableStateOf(plano?.preco?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() }.orEmpty()) }
    var cortes by remember { mutableStateOf(plano?.cortes?.toString().orEmpty()) }
    var dias by remember { mutableStateOf((plano?.validadeDias ?: 30).toString()) }
    var beneficios by remember { mutableStateOf(plano?.beneficios.orEmpty().joinToString("\n")) }
    var destaque by remember { mutableStateOf(plano?.destaque ?: false) }
    var ativo by remember { mutableStateOf(plano?.ativo ?: true) }
    var erro by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = aoFechar,
        containerColor = AzulNoite,
        title = { Text(if (plano == null) "Novo plano" else "Editar plano") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Campo(nome, { nome = it.take(40) }, "Nome (ex.: Plano Elite)")
                Campo(chamada, { chamada = it.take(120) }, "Frase de destaque (opcional)")
                Campo(preco, { preco = it.replace(',', '.') }, "Preço do plano", KeyboardType.Decimal)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Campo(cortes, { cortes = it.filter(Char::isDigit) }, "Cortes", KeyboardType.Number, Modifier.weight(1f))
                    Campo(dias, { dias = it.filter(Char::isDigit) }, "Validade (dias)", KeyboardType.Number, Modifier.weight(1f))
                }
                // Como vai aparecer no site: o plano é pago UMA vez e vale pelo prazo.
                dias.toIntOrNull()?.takeIf { it in 1..365 }?.let { d ->
                    Text(
                        "No site: ${preco.toDoubleOrNull()?.let { Formato.moeda(it) } ?: "R$ —"} " +
                            (if (d == 30) "/mês" else "por ${Formato.prazo(d)}") +
                            ", pago uma vez. Confira se a frase de destaque combina com esse prazo.",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextoSuave,
                    )
                    Spacer(Modifier.height(8.dp))
                }
                OutlinedTextField(
                    value = beneficios,
                    onValueChange = { beneficios = it },
                    label = { Text("Vantagens (uma por linha)") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                )
                // Conta pronta: quanto os cortes custariam avulsos e quanto o cliente economiza.
                val qtdConta = cortes.toIntOrNull()
                val valorConta = preco.toDoubleOrNull()
                Text(
                    when {
                        precoCorte == null ->
                            "Marque em Serviços qual serviço \"desconta do plano\" para o app calcular a economia."
                        qtdConta == null || valorConta == null ->
                            "Preencha preço e cortes para ver a economia."
                        else -> {
                            val avulso = precoCorte * qtdConta
                            val economia = avulso - valorConta
                            "Avulso: $qtdConta × ${Formato.moeda(precoCorte)} = ${Formato.moeda(avulso)}. " +
                                if (economia > 0) {
                                    "O cliente economiza ${Formato.moeda(economia)}."
                                } else {
                                    "Atenção: o plano não sai mais barato que o avulso."
                                }
                        }
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = Ouro,
                )
                Spacer(Modifier.height(8.dp))
                Chave("Selo \"Mais escolhido\"", destaque) { destaque = it }
                Chave("Aparece no site", ativo) { ativo = it }

                if (aoExcluir != null) {
                    Spacer(Modifier.height(4.dp))
                    TextButton(
                        onClick = { if (confirmarExclusao) aoExcluir() else confirmarExclusao = true },
                        enabled = !salvando,
                    ) {
                        Text(
                            if (confirmarExclusao) "Toque de novo para excluir de vez" else "Excluir este plano",
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
                    val valor = preco.toDoubleOrNull()
                    val qtd = cortes.toIntOrNull()
                    val referencia = if (precoCorte != null && qtd != null) precoCorte * qtd else plano?.precoReferencia
                    val validade = dias.toIntOrNull()
                    erro = when {
                        nome.trim().length < 2 -> "Informe o nome do plano."
                        valor == null || valor < 0 -> "Informe um preço válido."
                        qtd == null || qtd !in 1..60 -> "Os cortes precisam ficar entre 1 e 60."
                        validade == null || validade !in 1..365 -> "A validade precisa ficar entre 1 e 365 dias."
                        else -> null
                    }
                    if (erro == null) {
                        aoSalvar(
                            PlanoEdicao(
                                nome = nome.trim(),
                                chamada = chamada.trim().ifBlank { null },
                                preco = valor!!,
                                precoReferencia = referencia,
                                cortes = qtd!!,
                                validadeDias = validade!!,
                                beneficios = beneficios.lines().map { it.trim() }.filter { it.isNotEmpty() },
                                destaque = destaque,
                                ativo = ativo,
                                ordem = plano?.ordem ?: proximaOrdem,
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
private fun Campo(
    valor: String,
    aoMudar: (String) -> Unit,
    rotulo: String,
    teclado: KeyboardType = KeyboardType.Text,
    modifier: Modifier = Modifier.fillMaxWidth(),
) {
    OutlinedTextField(
        value = valor,
        onValueChange = aoMudar,
        label = { Text(rotulo) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = teclado),
        modifier = modifier.padding(bottom = 8.dp),
    )
}

@Composable
private fun Chave(texto: String, marcado: Boolean, aoMudar: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(texto, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Switch(
            checked = marcado,
            onCheckedChange = aoMudar,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color(0xFF1A1204),
                checkedTrackColor = Ouro,
                uncheckedTrackColor = AzulNoite,
            ),
        )
    }
}
