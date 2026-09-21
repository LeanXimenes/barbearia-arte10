package br.com.barbeariaarte10.admin.dados.modelo

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// =====================================================================
// Modelos espelhando exatamente o que o Supabase devolve.
// =====================================================================

@Serializable
data class Servico(
    val id: String,
    val nome: String,
    val descricao: String? = null,
    val preco: Double,
    @SerialName("duracao_minutos") val duracaoMinutos: Int,
    val ativo: Boolean,
    val ordem: Int = 0,
)

@Serializable
data class ServicoEdicao(
    val nome: String,
    val descricao: String? = null,
    val preco: Double,
    @SerialName("duracao_minutos") val duracaoMinutos: Int,
    val ativo: Boolean,
    val ordem: Int = 0,
)

@Serializable
data class HorarioFuncionamento(
    @SerialName("dia_semana") val diaSemana: Int,
    val aberto: Boolean,
    val abre: String? = null,
    val fecha: String? = null,
    @SerialName("intervalo_inicio") val intervaloInicio: String? = null,
    @SerialName("intervalo_fim") val intervaloFim: String? = null,
)

@Serializable
data class ConfigBarbearia(
    val nome: String = "Barbearia Arte 10",
    val fuso: String = "America/Sao_Paulo",
    @SerialName("telefone_whatsapp") val telefoneWhatsapp: String? = null,
    val instagram: String? = null,
    val endereco: String? = null,
    val cidade: String? = null,
    val uf: String? = null,
    @SerialName("mapa_url") val mapaUrl: String? = null,
    @SerialName("granularidade_minutos") val granularidadeMinutos: Int = 15,
    @SerialName("antecedencia_minima_minutos") val antecedenciaMinimaMinutos: Int = 30,
    @SerialName("antecedencia_maxima_dias") val antecedenciaMaximaDias: Int = 60,
    @SerialName("max_agendamentos_futuros") val maxAgendamentosFuturos: Int = 3,
)

// ------------------------------------------------------- agenda do dia

@Serializable
data class Intervalo(
    val inicio: String,
    val fim: String,
)

@Serializable
data class ResumoDia(
    val agendamentos: Int = 0,
    val bloqueios: Int = 0,
    val livres: Int = 0,
)

@Serializable
data class ProximoCliente(
    val cliente: String? = null,
    val servico: String? = null,
    val horario: String? = null,
)

/** Um trecho da linha do tempo do dia. */
@Serializable
data class ItemAgenda(
    /** agendamento | bloqueio | intervalo | livre */
    val tipo: String,
    val id: String? = null,
    @SerialName("horario_inicio") val horarioInicio: String = "",
    @SerialName("horario_fim") val horarioFim: String = "",
    @SerialName("inicio_em") val inicioEm: String? = null,
    @SerialName("fim_em") val fimEm: String? = null,
    @SerialName("cliente_nome") val clienteNome: String? = null,
    @SerialName("cliente_telefone") val clienteTelefone: String? = null,
    @SerialName("servico_nome") val servicoNome: String? = null,
    @SerialName("servico_preco") val servicoPreco: Double? = null,
    @SerialName("duracao_minutos") val duracaoMinutos: Int? = null,
    val status: String? = null,
    val motivo: String? = null,
    @SerialName("criado_em") val criadoEm: String? = null,
    val passado: Boolean = false,
) {
    val ehAgendamento: Boolean get() = tipo == "agendamento"
    val ehBloqueio: Boolean get() = tipo == "bloqueio"
    val ehLivre: Boolean get() = tipo == "livre"
    val ehIntervalo: Boolean get() = tipo == "intervalo"
}

@Serializable
data class AgendaDoDia(
    val ok: Boolean = false,
    val erro: String? = null,
    val mensagem: String? = null,
    val data: String? = null,
    val aberto: Boolean = false,
    val abre: String? = null,
    val fecha: String? = null,
    val intervalo: Intervalo? = null,
    val itens: List<ItemAgenda> = emptyList(),
    val resumo: ResumoDia = ResumoDia(),
    val proximo: ProximoCliente? = null,
    @SerialName("proximos_livres") val proximosLivres: List<String> = emptyList(),
)

@Serializable
data class DiaCalendario(
    val data: String,
    val aberto: Boolean,
    val agendamentos: Int,
    val bloqueios: Int,
)

// ------------------------------------------------------------ respostas

@Serializable
data class RespostaSimples(
    val ok: Boolean = false,
    val erro: String? = null,
    val mensagem: String? = null,
    val id: String? = null,
)

// -------------------------------------------------------------- pessoas

@Serializable
data class ClienteResumo(
    val id: String,
    val nome: String,
    val telefone: String,
    @SerialName("created_at") val criadoEm: String? = null,
    @SerialName("total_agendamentos") val totalAgendamentos: Int = 0,
    @SerialName("ultima_visita") val ultimaVisita: String? = null,
    @SerialName("proximo_horario") val proximoHorario: String? = null,
)

@Serializable
data class ClienteEmbutido(
    val nome: String,
    val telefone: String,
)

@Serializable
data class AgendamentoHistorico(
    val id: String,
    val data: String,
    @SerialName("horario_inicio") val horarioInicio: String,
    @SerialName("horario_fim") val horarioFim: String,
    val status: String,
    @SerialName("servico_nome") val servicoNome: String,
    @SerialName("servico_preco") val servicoPreco: Double,
    @SerialName("servico_duracao") val servicoDuracao: Int,
    @SerialName("created_at") val criadoEm: String,
    @SerialName("clientes") val cliente: ClienteEmbutido? = null,
)

@Serializable
data class Administrador(
    @SerialName("user_id") val userId: String,
    val nome: String,
    val ativo: Boolean,
)
