package br.com.barbeariaarte10.admin.core

import kotlinx.coroutines.CancellationException
import java.io.IOException

/**
 * Resultado explícito de qualquer operação de rede.
 *
 * Regra do projeto (item 22): o aplicativo nunca finge que salvou algo.
 * Toda falha vira uma [Falha] com mensagem clara, e o estado offline é
 * sinalizado separadamente para a tela poder avisar que os dados podem
 * estar desatualizados.
 */
sealed interface Resultado<out T> {
    data class Sucesso<T>(val dado: T) : Resultado<T>
    data class Falha(val mensagem: String, val semConexao: Boolean = false) : Resultado<Nothing>
}

const val MSG_SEM_CONEXAO =
    "Sem conexão com a internet. Os dados podem estar desatualizados."

const val MSG_FALHA_SALVAR =
    "Não foi possível salvar. Verifique sua conexão e tente novamente."

const val MSG_FALHA_CARREGAR =
    "Não foi possível carregar os dados. Verifique sua conexão e tente novamente."

/** Executa uma chamada de rede convertendo exceções em [Resultado.Falha]. */
suspend fun <T> executar(
    mensagemPadrao: String = MSG_FALHA_CARREGAR,
    bloco: suspend () -> T,
): Resultado<T> = try {
    Resultado.Sucesso(bloco())
} catch (e: CancellationException) {
    throw e
} catch (e: Throwable) {
    if (ehFalhaDeRede(e)) {
        Resultado.Falha(MSG_SEM_CONEXAO, semConexao = true)
    } else {
        Resultado.Falha(mensagemPadrao)
    }
}

private fun ehFalhaDeRede(e: Throwable): Boolean {
    var atual: Throwable? = e
    var profundidade = 0
    while (atual != null && profundidade < 6) {
        if (atual is IOException) return true
        val nome = atual::class.simpleName.orEmpty()
        if (
            nome.contains("UnknownHost", ignoreCase = true) ||
            nome.contains("SocketTimeout", ignoreCase = true) ||
            nome.contains("ConnectTimeout", ignoreCase = true) ||
            nome.contains("HttpRequestTimeout", ignoreCase = true) ||
            nome.contains("Connect", ignoreCase = true)
        ) {
            return true
        }
        atual = atual.cause
        profundidade++
    }
    return false
}

fun <T> Resultado<T>.dadoOuNulo(): T? = (this as? Resultado.Sucesso)?.dado

fun <T> Resultado<T>.mensagemDeErro(): String? = (this as? Resultado.Falha)?.mensagem
