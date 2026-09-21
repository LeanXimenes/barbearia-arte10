package br.com.barbeariaarte10.admin.core

import kotlinx.datetime.Clock
import kotlinx.datetime.DatePeriod
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import java.text.NumberFormat
import java.util.Locale

/** Formatação e contas de calendário no fuso da barbearia. */
object Formato {

    val FUSO: TimeZone = TimeZone.of("America/Sao_Paulo")

    private val MOEDA: NumberFormat =
        NumberFormat.getCurrencyInstance(Locale.forLanguageTag("pt-BR"))

    private val DIAS = listOf(
        "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
        "Quinta-feira", "Sexta-feira", "Sábado",
    )

    private val DIAS_CURTOS = listOf("Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb")

    private val MESES = listOf(
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    )

    fun hoje(): LocalDate = Clock.System.now().toLocalDateTime(FUSO).date

    fun agoraHora(): String {
        val agora = Clock.System.now().toLocalDateTime(FUSO)
        return "%02d:%02d".format(agora.hour, agora.minute)
    }

    fun somarDias(data: LocalDate, dias: Int): LocalDate = data.plus(DatePeriod(days = dias))

    /** 0 = domingo … 6 = sábado, igual ao extract(dow) do Postgres. */
    fun diaDaSemanaPostgres(data: LocalDate): Int = when (data.dayOfWeek) {
        DayOfWeek.SUNDAY -> 0
        DayOfWeek.MONDAY -> 1
        DayOfWeek.TUESDAY -> 2
        DayOfWeek.WEDNESDAY -> 3
        DayOfWeek.THURSDAY -> 4
        DayOfWeek.FRIDAY -> 5
        DayOfWeek.SATURDAY -> 6
    }

    fun nomeDoDia(indice: Int): String = DIAS.getOrElse(indice) { "" }

    fun nomeCurtoDoDia(indice: Int): String = DIAS_CURTOS.getOrElse(indice) { "" }

    fun nomeDoMes(mes: Int): String = MESES.getOrElse(mes - 1) { "" }

    /** LocalDate -> "21/09/2026" */
    fun dataCurta(data: LocalDate): String =
        "%02d/%02d/%d".format(data.dayOfMonth, data.monthNumber, data.year)

    /** "2026-09-21" -> "21/09/2026" */
    fun dataCurta(iso: String): String = runCatching { dataCurta(LocalDate.parse(iso)) }
        .getOrDefault(iso)

    /** LocalDate -> "Segunda-feira, 21 de setembro" */
    fun dataPorExtenso(data: LocalDate): String =
        "${nomeDoDia(diaDaSemanaPostgres(data))}, ${data.dayOfMonth} de ${nomeDoMes(data.monthNumber)}"

    /** Rótulo amigável para o topo da agenda. */
    fun rotuloRelativo(data: LocalDate): String = when (data) {
        hoje() -> "Hoje"
        somarDias(hoje(), 1) -> "Amanhã"
        somarDias(hoje(), -1) -> "Ontem"
        else -> dataPorExtenso(data)
    }

    fun moeda(valor: Double?): String = MOEDA.format(valor ?: 0.0)

    fun duracao(minutos: Int?): String {
        val m = minutos ?: return ""
        if (m < 60) return "$m min"
        val horas = m / 60
        val resto = m % 60
        return if (resto == 0) "${horas}h" else "${horas}h%02d".format(resto)
    }

    /** "14:00:00" -> "14:00" */
    fun hora(valor: String?): String = valor?.take(5).orEmpty()

    /** "17999990001" -> "(17) 99999-0001" */
    fun telefone(valor: String?): String {
        val d = valor?.filter { it.isDigit() }.orEmpty()
        return when (d.length) {
            11 -> "(${d.take(2)}) ${d.substring(2, 7)}-${d.substring(7)}"
            10 -> "(${d.take(2)}) ${d.substring(2, 6)}-${d.substring(6)}"
            else -> valor.orEmpty()
        }
    }

    /** Timestamp ISO do banco -> "21/09/2026 às 14:32" */
    fun carimbo(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        return runCatching {
            val momento = Instant.parse(iso).toLocalDateTime(FUSO)
            "%02d/%02d/%d às %02d:%02d".format(
                momento.dayOfMonth, momento.monthNumber, momento.year,
                momento.hour, momento.minute,
            )
        }.getOrDefault(iso)
    }

    fun rotuloStatus(status: String?): String = when (status) {
        "agendado" -> "Agendado"
        "concluido" -> "Concluído"
        "nao_compareceu" -> "Não compareceu"
        else -> status.orEmpty()
    }

    /** Link do WhatsApp a partir do telefone guardado no banco. */
    fun linkWhatsapp(telefone: String?, mensagem: String = ""): String? {
        var d = telefone?.filter { it.isDigit() }.orEmpty()
        if (d.length == 10 || d.length == 11) d = "55$d"
        if (d.length < 12) return null
        val texto = if (mensagem.isBlank()) "" else "?text=" + java.net.URLEncoder.encode(mensagem, "UTF-8")
        return "https://wa.me/$d$texto"
    }
}
