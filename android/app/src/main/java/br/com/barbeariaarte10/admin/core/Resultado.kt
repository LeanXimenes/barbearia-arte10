package br.com.barbeariaarte10.admin.core

import br.com.barbeariaarte10.admin.Grafo
import io.github.jan.supabase.exceptions.HttpRequestException
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
    "Não foi possível salvar. Tente novamente."

/** Para ações que gravam: deixa claro que NADA foi salvo. */
const val MSG_NAO_SALVO_SEM_CONEXAO =
    "Sem conexão com a internet: a alteração NÃO foi salva. Tente de novo quando a conexão voltar."

const val MSG_FALHA_CARREGAR =
    "Não foi possível carregar os dados. Verifique sua conexão e tente novamente."

/** Executa uma chamada de rede convertendo exceções em [Resultado.Falha]. */
suspend fun <T> executar(
    mensagemPadrao: String = MSG_FALHA_CARREGAR,
    mensagemSemConexao: String = MSG_SEM_CONEXAO,
    bloco: suspend () -> T,
): Resultado<T> = try {
    Resultado.Sucesso(bloco())
} catch (e: CancellationException) {
    throw e
} catch (e: Throwable) {
    if (ehFalhaDeRede(e)) {
        Resultado.Falha(mensagemSemConexao, semConexao = true)
    } else {
        Resultado.Falha(mensagemPadrao)
    }
}

/**
 * O supabase-kt transforma qualquer falha de transporte em
 * [HttpRequestException] — sem guardar a causa original — e deixa passar
 * o timeout do Ktor. Por isso a checagem é pelo tipo, e não só pela causa.
 */
internal fun ehFalhaDeRede(e: Throwable): Boolean {
    var atual: Throwable? = e
    var profundidade = 0
    while (atual != null && profundidade < 6) {
        if (atual is HttpRequestException || atual is IOException) return true
        val nome = atual::class.simpleName.orEmpty()
        if (nome.contains("Timeout", ignoreCase = true) || nome.contains("UnknownHost", ignoreCase = true)) {
            return true
        }
        atual = atual.cause
        profundidade++
    }
    // Último recurso: se o aparelho está sem internet, o erro é de conexão.
    return runCatching { !Grafo.conectividade.estaOnline() }.getOrDefault(false)
}

fun <T> Resultado<T>.dadoOuNulo(): T? = (this as? Resultado.Sucesso)?.dado

fun <T> Resultado<T>.mensagemDeErro(): String? = (this as? Resultado.Falha)?.mensagem
