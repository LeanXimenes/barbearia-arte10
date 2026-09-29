package br.com.barbeariaarte10.admin.core

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * Observa o estado da conexão para que as telas possam avisar
 * claramente quando o que está na tela pode estar velho (item 22).
 */
class Conectividade(context: Context) {

    private val gerenciador =
        context.applicationContext.getSystemService(ConnectivityManager::class.java)

    /**
     * "Tem uma rede com internet". Não exige a validação do Android
     * (NET_CAPABILITY_VALIDATED): em redes que bloqueiam o teste de
     * conectividade do Google o app mostraria "sem conexão" para sempre,
     * mesmo alcançando o Supabase. Se a rede não funcionar de verdade, a
     * própria requisição falha e é tratada como falta de conexão.
     */
    fun estaOnline(): Boolean {
        val rede = gerenciador?.activeNetwork ?: return false
        val capacidades = gerenciador.getNetworkCapabilities(rede) ?: return false
        return capacidades.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    fun observar(): Flow<Boolean> = callbackFlow {
        trySend(estaOnline())

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(estaOnline())
            }

            override fun onLost(network: Network) {
                trySend(estaOnline())
            }

            override fun onCapabilitiesChanged(
                network: Network,
                networkCapabilities: NetworkCapabilities,
            ) {
                trySend(estaOnline())
            }
        }

        val pedido = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        gerenciador?.registerNetworkCallback(pedido, callback)

        awaitClose {
            runCatching { gerenciador?.unregisterNetworkCallback(callback) }
        }
    }.distinctUntilChanged()
}
