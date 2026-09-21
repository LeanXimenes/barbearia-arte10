package br.com.barbeariaarte10.admin.ui.componentes

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import br.com.barbeariaarte10.admin.ui.tema.Alerta
import br.com.barbeariaarte10.admin.ui.tema.AzulCartao
import br.com.barbeariaarte10.admin.ui.tema.Erro
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.TextoFraco
import br.com.barbeariaarte10.admin.ui.tema.TextoSuave

/** Cartão padrão do aplicativo. */
@Composable
fun CartaoArte10(
    modifier: Modifier = Modifier,
    corDeFundo: Color = AzulCartao,
    corDaBorda: Color = Color(0x1F9AA8C6),
    conteudo: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .border(1.dp, corDaBorda, RoundedCornerShape(16.dp)),
        color = corDeFundo,
        shape = RoundedCornerShape(16.dp),
        content = { conteudo() },
    )
}

/** Título de seção no estilo do site: etiqueta dourada + título. */
@Composable
fun TituloSecao(etiqueta: String, titulo: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(
            text = etiqueta.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = Ouro,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = titulo,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onBackground,
        )
    }
}

/** Faixa fixa avisando que o aparelho está sem internet (item 22). */
@Composable
fun FaixaOffline(visivel: Boolean, modifier: Modifier = Modifier) {
    AnimatedVisibility(visible = visivel, modifier = modifier) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Alerta.copy(alpha = 0.16f))
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Outlined.CloudOff, contentDescription = null, tint = Alerta, modifier = Modifier.size(18.dp))
            Text(
                text = "Sem conexão. Os dados na tela podem estar desatualizados.",
                style = MaterialTheme.typography.bodySmall,
                color = Alerta,
            )
        }
    }
}

/** Mensagem de erro com ação de tentar de novo. */
@Composable
fun MensagemErro(
    mensagem: String,
    modifier: Modifier = Modifier,
    aoTentarNovamente: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Erro.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
            .border(1.dp, Erro.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = Erro, modifier = Modifier.size(18.dp))
        Text(
            text = mensagem,
            style = MaterialTheme.typography.bodySmall,
            color = Color(0xFFFFD9DE),
            modifier = Modifier.weight(1f),
        )
        if (aoTentarNovamente != null) {
            TextButton(onClick = aoTentarNovamente) {
                Text("Tentar de novo", color = Ouro, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
fun CarregandoTela(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Ouro, strokeWidth = 2.5.dp)
    }
}

@Composable
fun EstadoVazio(
    titulo: String,
    descricao: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            text = titulo,
            style = MaterialTheme.typography.titleMedium,
            color = TextoSuave,
            textAlign = TextAlign.Center,
        )
        Text(
            text = descricao,
            style = MaterialTheme.typography.bodySmall,
            color = TextoFraco,
            textAlign = TextAlign.Center,
        )
    }
}

/** Etiqueta colorida de estado (AGENDADO / BLOQUEADO / LIVRE …). */
@Composable
fun Etiqueta(
    texto: String,
    cor: Color,
    modifier: Modifier = Modifier,
) {
    Text(
        text = texto.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = cor,
        modifier = modifier
            .background(cor.copy(alpha = 0.14f), RoundedCornerShape(999.dp))
            .border(1.dp, cor.copy(alpha = 0.32f), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}
