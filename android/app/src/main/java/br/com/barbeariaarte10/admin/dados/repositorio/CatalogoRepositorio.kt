package br.com.barbeariaarte10.admin.dados.repositorio

import br.com.barbeariaarte10.admin.core.MSG_FALHA_SALVAR
import br.com.barbeariaarte10.admin.core.MSG_NAO_SALVO_SEM_CONEXAO
import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.core.Supabase
import br.com.barbeariaarte10.admin.core.executar
import br.com.barbeariaarte10.admin.dados.modelo.ClienteResumo
import br.com.barbeariaarte10.admin.dados.modelo.ConfigBarbearia
import br.com.barbeariaarte10.admin.dados.modelo.HorarioFuncionamento
import br.com.barbeariaarte10.admin.dados.modelo.RespostaSimples
import br.com.barbeariaarte10.admin.dados.modelo.Servico
import br.com.barbeariaarte10.admin.dados.modelo.ServicoEdicao
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Serviços, horários de funcionamento, dados da barbearia e clientes.
 * Tudo que o proprietário configura no aplicativo (itens 26 e 27).
 */
class CatalogoRepositorio {

    private val supabase = Supabase.cliente

    // ------------------------------------------------------- serviços

    /** Traz ativos e inativos: quem administra precisa ver os dois. */
    suspend fun servicos(): Resultado<List<Servico>> = executar {
        supabase.from("servicos")
            .select {
                order("ordem", Order.ASCENDING)
                order("nome", Order.ASCENDING)
            }
            .decodeList<Servico>()
    }

    suspend fun criarServico(servico: ServicoEdicao): Resultado<Unit> =
        executar(MSG_FALHA_SALVAR, MSG_NAO_SALVO_SEM_CONEXAO) {
            supabase.from("servicos").insert(servico)
        }

    suspend fun atualizarServico(id: String, servico: ServicoEdicao): Resultado<Unit> =
        executar(MSG_FALHA_SALVAR, MSG_NAO_SALVO_SEM_CONEXAO) {
            // Campo a campo (com null explícito) para que apagar a descrição
            // realmente limpe o valor no banco.
            supabase.from("servicos").update(
                {
                    set("nome", servico.nome)
                    set("descricao", servico.descricao)
                    set("preco", servico.preco)
                    set("duracao_minutos", servico.duracaoMinutos)
                    set("ativo", servico.ativo)
                    set("ordem", servico.ordem)
                },
            ) {
                filter { eq("id", id) }
            }
        }

    /**
     * Ativar/desativar em vez de excluir (item 27): o histórico de quem
     * já usou o serviço continua intacto.
     */
    suspend fun definirAtivo(id: String, ativo: Boolean): Resultado<Unit> =
        executar(MSG_FALHA_SALVAR, MSG_NAO_SALVO_SEM_CONEXAO) {
            supabase.from("servicos").update({ set("ativo", ativo) }) {
                filter { eq("id", id) }
            }
        }

    // ----------------------------------------------- funcionamento

    suspend fun funcionamento(): Resultado<List<HorarioFuncionamento>> = executar {
        supabase.from("config_horarios")
            .select { order("dia_semana", Order.ASCENDING) }
            .decodeList<HorarioFuncionamento>()
    }

    suspend fun salvarFuncionamento(dia: HorarioFuncionamento): Resultado<Unit> =
        executar(MSG_FALHA_SALVAR, MSG_NAO_SALVO_SEM_CONEXAO) {
            supabase.from("config_horarios").update(
                {
                    set("aberto", dia.aberto)
                    set("abre", dia.abre)
                    set("fecha", dia.fecha)
                    set("intervalo_inicio", dia.intervaloInicio)
                    set("intervalo_fim", dia.intervaloFim)
                },
            ) {
                filter { eq("dia_semana", dia.diaSemana) }
            }
        }

    // -------------------------------------------------- barbearia

    suspend fun config(): Resultado<ConfigBarbearia?> = executar {
        supabase.from("config_barbearia")
            .select { limit(1) }
            .decodeSingleOrNull<ConfigBarbearia>()
    }

    suspend fun salvarConfig(config: ConfigBarbearia): Resultado<Unit> =
        executar(MSG_FALHA_SALVAR, MSG_NAO_SALVO_SEM_CONEXAO) {
            supabase.from("config_barbearia").update(
                {
                    set("nome", config.nome)
                    set("telefone_whatsapp", config.telefoneWhatsapp)
                    set("instagram", config.instagram)
                    set("endereco", config.endereco)
                    set("cidade", config.cidade)
                    set("uf", config.uf)
                    set("mapa_url", config.mapaUrl)
                    set("granularidade_minutos", config.granularidadeMinutos)
                    set("antecedencia_minima_minutos", config.antecedenciaMinimaMinutos)
                    set("antecedencia_maxima_dias", config.antecedenciaMaximaDias)
                    set("max_agendamentos_futuros", config.maxAgendamentosFuturos)
                },
            ) {
                filter { eq("id", true) }
            }
        }

    // --------------------------------------------------- clientes

    suspend fun clientes(busca: String = ""): Resultado<List<ClienteResumo>> = executar {
        // Só letras, números e espaços: vírgulas, parênteses e curingas
        // quebrariam o filtro "or" do PostgREST.
        val texto = busca.filter { it.isLetterOrDigit() || it == ' ' }.trim()
        val digitos = texto.filter { it.isDigit() }

        supabase.from("clientes_resumo")
            .select {
                if (texto.isNotEmpty()) {
                    filter {
                        or {
                            ilike("nome", "%$texto%")
                            // Sem dígitos, "telefone ilike %%" casaria com todo mundo.
                            if (digitos.isNotEmpty()) ilike("telefone", "%$digitos%")
                        }
                    }
                }
                order("nome", Order.ASCENDING)
                limit(200)
            }
            .decodeList<ClienteResumo>()
    }

    // ------------------------------------------ dispositivo (push)

    /** Guarda o token FCM deste aparelho para receber os avisos (item 19). */
    suspend fun registrarDispositivo(token: String, modelo: String): Resultado<RespostaSimples> =
        executar(mensagemPadrao = "Não foi possível ativar as notificações.") {
            supabase.postgrest
                .rpc(
                    "registrar_dispositivo",
                    buildJsonObject {
                        put("p_token", token)
                        put("p_modelo", modelo)
                    },
                )
                .decodeAs<RespostaSimples>()
        }
}
