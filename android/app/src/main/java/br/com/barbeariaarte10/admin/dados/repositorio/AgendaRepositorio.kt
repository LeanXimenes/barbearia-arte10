package br.com.barbeariaarte10.admin.dados.repositorio

import br.com.barbeariaarte10.admin.core.MSG_FALHA_SALVAR
import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.core.Supabase
import br.com.barbeariaarte10.admin.core.executar
import br.com.barbeariaarte10.admin.dados.modelo.AgendaDoDia
import br.com.barbeariaarte10.admin.dados.modelo.AgendamentoHistorico
import br.com.barbeariaarte10.admin.dados.modelo.DiaCalendario
import br.com.barbeariaarte10.admin.dados.modelo.RespostaSimples
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Agenda do proprietário.
 *
 * Observação importante (item 14): não existe aqui — nem em nenhum
 * outro ponto do aplicativo — uma função para cancelar ou excluir o
 * agendamento de um cliente. O banco também recusaria.
 */
class AgendaRepositorio {

    private val supabase = Supabase.cliente

    /** Linha do tempo completa de um dia: agendado, bloqueado, livre, intervalo. */
    suspend fun agendaDoDia(data: LocalDate): Resultado<AgendaDoDia> = executar {
        supabase.postgrest
            .rpc("agenda_do_dia", buildJsonObject { put("p_data", data.toString()) })
            .decodeAs<AgendaDoDia>()
    }

    /** Resumo por dia para pintar o calendário. */
    suspend fun visaoGeral(inicio: LocalDate, fim: LocalDate): Resultado<List<DiaCalendario>> =
        executar {
            supabase.postgrest
                .rpc(
                    "visao_geral_periodo",
                    buildJsonObject {
                        put("p_inicio", inicio.toString())
                        put("p_fim", fim.toString())
                    },
                )
                .decodeList<DiaCalendario>()
        }

    /** Bloqueia um período livre (item 15). */
    suspend fun bloquear(
        data: LocalDate,
        inicio: String,
        fim: String,
        motivo: String?,
    ): Resultado<RespostaSimples> = executar(mensagemPadrao = MSG_FALHA_SALVAR) {
        supabase.postgrest
            .rpc(
                "criar_bloqueio",
                buildJsonObject {
                    put("p_data", data.toString())
                    put("p_horario_inicio", inicio)
                    put("p_horario_fim", fim)
                    val texto = motivo?.takeIf { it.isNotBlank() }
                    put("p_motivo", if (texto == null) JsonNull else JsonPrimitive(texto))
                },
            )
            .decodeAs<RespostaSimples>()
    }

    /** Desbloqueia (item 16). Só mexe na tabela de bloqueios. */
    suspend fun desbloquear(bloqueioId: String): Resultado<RespostaSimples> =
        executar(mensagemPadrao = MSG_FALHA_SALVAR) {
            supabase.postgrest
                .rpc("remover_bloqueio", buildJsonObject { put("p_id", bloqueioId) })
                .decodeAs<RespostaSimples>()
        }

    /** Registra o desfecho do atendimento — não libera o horário. */
    suspend fun atualizarStatus(agendamentoId: String, status: String): Resultado<RespostaSimples> =
        executar(mensagemPadrao = MSG_FALHA_SALVAR) {
            supabase.postgrest
                .rpc(
                    "atualizar_status_agendamento",
                    buildJsonObject {
                        put("p_id", agendamentoId)
                        put("p_status", status)
                    },
                )
                .decodeAs<RespostaSimples>()
        }

    /** Histórico completo, do mais recente para o mais antigo (item 28). */
    suspend fun historico(
        ate: LocalDate,
        limite: Int = 100,
        deslocamento: Int = 0,
    ): Resultado<List<AgendamentoHistorico>> = executar {
        supabase.from("agendamentos")
            .select(
                Columns.raw(
                    "id, data, horario_inicio, horario_fim, status, servico_nome, " +
                        "servico_preco, servico_duracao, created_at, clientes(nome, telefone)"
                )
            ) {
                filter { lte("data", ate.toString()) }
                order("data", Order.DESCENDING)
                order("horario_inicio", Order.DESCENDING)
                range(deslocamento.toLong(), (deslocamento + limite - 1).toLong())
            }
            .decodeList<AgendamentoHistorico>()
    }

    /** Agendamentos de um cliente específico. */
    suspend fun agendamentosDoCliente(clienteId: String): Resultado<List<AgendamentoHistorico>> =
        executar {
            supabase.from("agendamentos")
                .select(
                    Columns.raw(
                        "id, data, horario_inicio, horario_fim, status, servico_nome, " +
                            "servico_preco, servico_duracao, created_at, clientes(nome, telefone)"
                    )
                ) {
                    filter { eq("cliente_id", clienteId) }
                    order("data", Order.DESCENDING)
                    limit(50)
                }
                .decodeList<AgendamentoHistorico>()
        }

    /**
     * Realtime (item 18): emite sempre que um agendamento ou bloqueio
     * muda, para a tela recarregar sozinha sem o proprietário fazer nada.
     */
    fun mudancasNaAgenda(): Flow<Unit> = channelFlow {
        val canal = supabase.channel("arte10-admin-agenda")

        // Os fluxos precisam ser criados ANTES do subscribe().
        val agendamentos =
            canal.postgresChangeFlow<PostgresAction>(schema = "public") { table = "agendamentos" }
        val bloqueios =
            canal.postgresChangeFlow<PostgresAction>(schema = "public") { table = "bloqueios" }

        launch { agendamentos.collect { send(Unit) } }
        launch { bloqueios.collect { send(Unit) } }

        canal.subscribe()

        try {
            awaitCancellation()
        } finally {
            withContext(NonCancellable) {
                runCatching { supabase.realtime.removeChannel(canal) }
            }
        }
    }
}
