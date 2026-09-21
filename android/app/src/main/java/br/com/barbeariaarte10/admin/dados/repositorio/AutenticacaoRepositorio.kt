package br.com.barbeariaarte10.admin.dados.repositorio

import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.core.Supabase
import br.com.barbeariaarte10.admin.core.executar
import br.com.barbeariaarte10.admin.dados.modelo.Administrador
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Login do proprietário.
 *
 * Entrar com e-mail e senha não basta: o usuário precisa existir em
 * public.administradores. Quem não estiver lá é desconectado na hora e
 * continua sem enxergar nada, porque o RLS do banco também recusa
 * (item 20).
 */
class AutenticacaoRepositorio {

    private val supabase = Supabase.cliente

    /** true quando existe sessão válida. */
    val autenticado: Flow<Boolean> =
        supabase.auth.sessionStatus.map { it is SessionStatus.Authenticated }

    val carregandoSessao: Flow<Boolean> =
        supabase.auth.sessionStatus.map { it is SessionStatus.Initializing }

    fun emailAtual(): String? = supabase.auth.currentUserOrNull()?.email

    suspend fun entrar(email: String, senha: String): Resultado<Administrador> {
        val login = executar(mensagemPadrao = "E-mail ou senha inválidos.") {
            supabase.auth.signInWith(Email) {
                this.email = email.trim()
                this.password = senha
            }
        }

        if (login is Resultado.Falha) return login

        val perfil = perfilAdministrador()
        if (perfil is Resultado.Falha) {
            runCatching { supabase.auth.signOut() }
            return perfil
        }

        val administrador = (perfil as Resultado.Sucesso).dado
        if (administrador == null || !administrador.ativo) {
            runCatching { supabase.auth.signOut() }
            return Resultado.Falha("Esta conta não tem acesso administrativo à Barbearia Arte 10.")
        }

        return Resultado.Sucesso(administrador)
    }

    /**
     * Lê o vínculo administrativo do usuário logado.
     * A policy "administradores_proprio" só devolve a própria linha.
     */
    suspend fun perfilAdministrador(): Resultado<Administrador?> = executar(
        mensagemPadrao = "Não foi possível confirmar suas permissões."
    ) {
        val id = supabase.auth.currentUserOrNull()?.id ?: return@executar null
        supabase.from("administradores")
            .select {
                filter { eq("user_id", id) }
                limit(1)
            }
            .decodeSingleOrNull<Administrador>()
    }

    suspend fun sair(): Resultado<Unit> = executar(mensagemPadrao = "Não foi possível sair.") {
        supabase.auth.signOut()
    }
}
