package br.com.barbeariaarte10.admin.ui.tema

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

// =====================================================================
// Paleta da Barbearia Arte 10 — tirada da logo: azul profundo + dourado.
// O aplicativo é sempre escuro, igual ao site, para manter a mesma
// identidade nas duas pontas (item 29).
// =====================================================================

val AzulProfundo = Color(0xFF040A18)
val AzulNoite = Color(0xFF070F22)
val AzulCartao = Color(0xFF0C1730)
val AzulElevado = Color(0xFF122345)
val AzulLogo = Color(0xFF013681)
val AzulClaro = Color(0xFF2352C4)

val Ouro = Color(0xFFFADF68)
val OuroClaro = Color(0xFFFCEA9F)
val OuroEscuro = Color(0xFFC9A437)

val Texto = Color(0xFFE9EEFB)
val TextoSuave = Color(0xFF9AA8C6)
val TextoFraco = Color(0xFF6C7A99)

val Sucesso = Color(0xFF4ADE80)
val Alerta = Color(0xFFFBBF24)
val Erro = Color(0xFFFB7185)

private val EsquemaEscuro = darkColorScheme(
    primary = Ouro,
    onPrimary = Color(0xFF1A1204),
    primaryContainer = OuroEscuro,
    onPrimaryContainer = Color(0xFF1A1204),

    secondary = AzulClaro,
    onSecondary = Texto,
    secondaryContainer = AzulElevado,
    onSecondaryContainer = Texto,

    tertiary = OuroClaro,
    onTertiary = Color(0xFF1A1204),

    background = AzulProfundo,
    onBackground = Texto,

    surface = AzulNoite,
    onSurface = Texto,
    surfaceVariant = AzulCartao,
    onSurfaceVariant = TextoSuave,
    surfaceContainer = AzulCartao,
    surfaceContainerHigh = AzulElevado,
    surfaceContainerHighest = AzulElevado,

    outline = Color(0x33FADF68),
    outlineVariant = Color(0x1F9AA8C6),

    error = Erro,
    onError = Color(0xFF2A0710),
    errorContainer = Color(0x33FB7185),
    onErrorContainer = Color(0xFFFFD9DE),
)

private val TipografiaArte10 = Typography(
    displaySmall = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.sp),
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold),
    headlineSmall = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    bodySmall = TextStyle(fontSize = 12.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 1.2.sp),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 1.4.sp),
)

@Composable
fun TemaArte10(
    @Suppress("UNUSED_PARAMETER") escuro: Boolean = isSystemInDarkTheme(),
    conteudo: @Composable () -> Unit,
) {
    val vista = LocalView.current
    if (!vista.isInEditMode) {
        SideEffect {
            val janela = (vista.context as Activity).window
            WindowCompat.getInsetsController(janela, vista).isAppearanceLightStatusBars = false
            WindowCompat.getInsetsController(janela, vista).isAppearanceLightNavigationBars = false
        }
    }

    MaterialTheme(
        colorScheme = EsquemaEscuro,
        typography = TipografiaArte10,
        content = conteudo,
    )
}
