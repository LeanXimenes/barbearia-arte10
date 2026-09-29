package br.com.barbeariaarte10.admin.ui.navegacao

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.ContentCut
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import br.com.barbeariaarte10.admin.Grafo
import br.com.barbeariaarte10.admin.notificacoes.sincronizarTokenPush
import br.com.barbeariaarte10.admin.ui.componentes.FaixaOffline
import br.com.barbeariaarte10.admin.ui.telas.agenda.AgendaTela
import br.com.barbeariaarte10.admin.ui.telas.clientes.ClientesTela
import br.com.barbeariaarte10.admin.ui.telas.configuracoes.ConfiguracoesTela
import br.com.barbeariaarte10.admin.ui.telas.historico.HistoricoTela
import br.com.barbeariaarte10.admin.ui.telas.inicio.InicioTela
import br.com.barbeariaarte10.admin.ui.telas.conexao.ConexaoTela
import br.com.barbeariaarte10.admin.ui.telas.conexao.EstadoSessao
import br.com.barbeariaarte10.admin.ui.telas.conexao.SessaoViewModel
import br.com.barbeariaarte10.admin.ui.telas.servicos.ServicosTela
import br.com.barbeariaarte10.admin.ui.tema.AzulNoite
import br.com.barbeariaarte10.admin.ui.tema.Ouro
import br.com.barbeariaarte10.admin.ui.tema.TextoFraco

sealed class Rota(val caminho: String) {
    data object Inicio : Rota("inicio")
    data object Agenda : Rota("agenda")
    data object Clientes : Rota("clientes")
    data object Servicos : Rota("servicos")
    data object Configuracoes : Rota("configuracoes")
    data object Historico : Rota("historico")
}

private data class Aba(
    val rota: Rota,
    val titulo: String,
    val iconeAtivo: ImageVector,
    val icone: ImageVector,
)

private val ABAS = listOf(
    Aba(Rota.Inicio, "Início", Icons.Filled.Home, Icons.Outlined.Home),
    Aba(Rota.Agenda, "Agenda", Icons.Filled.CalendarMonth, Icons.Outlined.CalendarMonth),
    Aba(Rota.Clientes, "Clientes", Icons.Filled.People, Icons.Outlined.People),
    Aba(Rota.Servicos, "Serviços", Icons.Filled.ContentCut, Icons.Outlined.ContentCut),
    Aba(Rota.Configuracoes, "Ajustes", Icons.Filled.Settings, Icons.Outlined.Settings),
)

/**
 * Raiz do aplicativo. Não existe tela de login: enquanto conecta mostra a
 * logo; conectado, abre direto na agenda do dia.
 *
 * [dataPedida] chega de uma notificação tocada ("2026-09-21") e faz o app
 * abrir a Agenda naquele dia; [aoConsumirData] avisa que já foi usada.
 */
@Composable
fun RaizApp(
    dataPedida: String?,
    aoConsumirData: () -> Unit,
    sessao: SessaoViewModel = viewModel(),
) {
    val estado by sessao.estado.collectAsStateWithLifecycle()
    val conectado = estado is EstadoSessao.Conectado

    // Uma vez conectado, garante que este aparelho receba os pushes.
    LaunchedEffect(conectado) {
        if (conectado) sincronizarTokenPush()
    }

    if (conectado) {
        AppConectado(dataPedida, aoConsumirData)
    } else {
        ConexaoTela(estado = estado, aoTentarNovamente = sessao::conectar)
    }
}

@Composable
private fun AppConectado(dataPedida: String?, aoConsumirData: () -> Unit) {
    val navegador = rememberNavController()
    val entradaAtual by navegador.currentBackStackEntryAsState()
    val rotaAtual = entradaAtual?.destination

    // O fluxo é lembrado: recriá-lo a cada recomposição registraria e
    // removeria o callback de rede o tempo todo.
    val fluxoConexao = remember { Grafo.conectividade.observar() }
    val online by fluxoConexao.collectAsStateWithLifecycle(initialValue = Grafo.conectividade.estaOnline())

    LaunchedEffect(dataPedida) {
        if (dataPedida != null && rotaAtual?.route != Rota.Agenda.caminho) {
            navegador.navigate(Rota.Agenda.caminho) {
                popUpTo(navegador.graph.findStartDestination().id) { saveState = true }
                launchSingleTop = true
            }
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(containerColor = AzulNoite, tonalElevation = 0.dp) {
                ABAS.forEach { aba ->
                    val selecionada = rotaAtual?.hierarchy?.any { it.route == aba.rota.caminho } == true
                    NavigationBarItem(
                        selected = selecionada,
                        onClick = {
                            navegador.navigate(aba.rota.caminho) {
                                popUpTo(navegador.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = {
                            Icon(
                                imageVector = if (selecionada) aba.iconeAtivo else aba.icone,
                                contentDescription = aba.titulo,
                            )
                        },
                        label = { Text(aba.titulo, style = MaterialTheme.typography.bodySmall) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Ouro,
                            selectedTextColor = Ouro,
                            unselectedIconColor = TextoFraco,
                            unselectedTextColor = TextoFraco,
                            indicatorColor = Ouro.copy(alpha = 0.14f),
                        ),
                    )
                }
            }
        },
    ) { espacamento ->
        Column(Modifier.fillMaxSize().padding(espacamento)) {
            FaixaOffline(visivel = !online)

            NavHost(
                navController = navegador,
                startDestination = Rota.Inicio.caminho,
                modifier = Modifier.fillMaxSize(),
            ) {
                composable(Rota.Inicio.caminho) {
                    InicioTela(
                        online = online,
                        aoAbrirAgenda = { navegador.navigate(Rota.Agenda.caminho) },
                        aoAbrirHistorico = { navegador.navigate(Rota.Historico.caminho) },
                    )
                }
                composable(Rota.Agenda.caminho) {
                    AgendaTela(
                        online = online,
                        dataInicial = dataPedida,
                        aoUsarDataInicial = aoConsumirData,
                    )
                }
                composable(Rota.Clientes.caminho) {
                    ClientesTela(online = online)
                }
                composable(Rota.Servicos.caminho) {
                    ServicosTela(online = online)
                }
                composable(Rota.Configuracoes.caminho) {
                    ConfiguracoesTela(
                        online = online,
                        aoAbrirHistorico = { navegador.navigate(Rota.Historico.caminho) },
                    )
                }
                composable(Rota.Historico.caminho) {
                    HistoricoTela(aoVoltar = { navegador.popBackStack() })
                }
            }
        }
    }
}
