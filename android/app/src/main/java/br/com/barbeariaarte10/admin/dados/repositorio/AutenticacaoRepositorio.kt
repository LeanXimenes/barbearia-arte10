package br.com.barbeariaarte10.admin.dados.repositorio

import br.com.barbeariaarte10.admin.BuildConfig
import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.core.Supabase
import br.com.barbeariaarte10.admin.core.executar
import br.com.barbeariaarte10.admin.dados.modelo.Administrador
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.flow.StateFlow

/**
 * Conexão do aplicativo com o Supabase — SEM tela de login.
 *
 * O app entra sozinho com uma conta dedicada da barbearia, configurada no
 * momento da compilação (BARBEIRO_EMAIL / BARBEIRO_SENHA em
 * local.properties). A sessão fica salva no aparelho e é renovada
 * automaticamente, então o barbeiro só precisa abrir o app.
 *
 * Continua valendo no banco: essa conta só enxerga alguma coisa porque
 * está cadastrada em public.administradores. Para cortar o acesso de um
 * aparelho perdido basta desativá-la lá (efeito imediato pelo RLS).
 */
class AutenticacaoRepositorio {

    private val supabase = Supabase.cliente

    val status: StateFlow<SessionStatus> get() = supabase.auth.sessionStatus

    val contaConfigurada: Boolean =
        BuildConfig.BARBEIRO_EMAIL.isNotBlank() && BuildConfig.BARBEIRO_SENHA.isNotBlank()

    fun emailAtual(): String? = supabase.auth.currentUserOrNull()?.email

    suspend fun conectar(): Resultado<Administrador> {
        if (!Supabase.configurado) {
            return Resultado.Falha(
                "O app foi gerado sem o endereço do Supabase. " +
                    "Preencha SUPABASE_URL e SUPABASE_ANON_KEY no local.properties e gere o app de novo.",
            )
        }
        if (!contaConfigurada) {
            return Resultado.Falha(
                "O app foi gerado sem a conta da barbearia. " +
                    "Preencha BARBEIRO_EMAIL e BARBEIRO_SENHA no local.properties e gere o app de novo.",
            )
        }

        val login = executar(
            mensagemPadrao = "O Supabase recusou a conexão do app. Confira no local.properties " +
                "SUPABASE_URL, SUPABASE_ANON_KEY, BARBEIRO_EMAIL e BARBEIRO_SENHA, e se o usuário " +
                "existe em Authentication > Users.",
        ) {
            supabase.auth.signInWith(Email) {
                email = BuildConfig.BARBEIRO_EMAIL
                password = BuildConfig.BARBEIRO_SENHA
            }
        }
        if (login is Resultado.Falha) return login

        return when (val perfil = perfilAdministrador()) {
            is Resultado.Falha -> {
                runCatching { supabase.auth.signOut() }
                perfil
            }
            is Resultado.Sucesso -> {
                val administrador = perfil.dado
                if (administrador == null || !administrador.ativo) {
                    runCatching { supabase.auth.signOut() }
                    Resultado.Falha(
                        "A conta do app não está liberada como administradora da barbearia " +
                            "(tabela administradores no Supabase).",
                    )
                } else {
                    Resultado.Sucesso(administrador)
                }
            }
        }
    }

    /**
     * Confere no servidor se a conta ainda está liberada (ex.: o dono
     * desativou o acesso depois que o app já estava conectado).
     */
    suspend fun verificarAcesso(): Resultado<Boolean> = executar {
        supabase.postgrest.rpc("is_admin").decodeAs<Boolean>()
    }

    /**
     * Garante uma sessão para trabalhos em segundo plano (ex.: o Firebase
     * trocou o token com o app fechado). Espera a sessão salva carregar e,
     * se não houver, conecta com a conta do app.
     */
    suspend fun garantirSessao(): Boolean {
        runCatching { supabase.auth.awaitInitialization() }
        if (supabase.auth.currentSessionOrNull() != null) return true
        return conectar() is Resultado.Sucesso
    }

    /** A policy "administradores_proprio" só devolve a própria linha. */
    private suspend fun perfilAdministrador(): Resultado<Administrador?> = executar(
        mensagemPadrao = "Não foi possível confirmar as permissões da conta do app.",
    ) {
        val id = supabase.auth.currentUserOrNull()?.id ?: return@executar null
        supabase.from("administradores")
            .select {
                filter { eq("user_id", id) }
                limit(1)
            }
            .decodeSingleOrNull<Administrador>()
    }
}
