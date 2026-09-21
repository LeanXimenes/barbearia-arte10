package br.com.barbeariaarte10.admin.ui.telas.agenda

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.barbeariaarte10.admin.Grafo
import br.com.barbeariaarte10.admin.core.Formato
import br.com.barbeariaarte10.admin.core.Resultado
import br.com.barbeariaarte10.admin.dados.modelo.AgendaDoDia
import br.com.barbeariaarte10.admin.dados.modelo.DiaCalendario
import br.com.barbeariaarte10.admin.dados.modelo.ItemAgenda
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate

data class EstadoAgenda(
    val data: LocalDate = Formato.hoje(),
    val carregando: Boolean = true,
    val agenda: AgendaDoDia? = null,
    val calendario: List<DiaCalendario> = emptyList(),
    val erro: String? = null,
    /** Operação de bloqueio/desbloqueio em andamento. */
    val processando: Boolean = false,
    val aviso: String? = null,
    val itemSelecionado: ItemAgenda? = null,
)

class AgendaViewModel : ViewModel() {

    private val _estado = MutableStateFlow(EstadoAgenda())
    val estado: StateFlow<EstadoAgenda> = _estado.asStateFlow()

    init {
        carregar()
        carregarCalendario()
        observarMudancas()
    }

    fun irPara(data: LocalDate) {
        if (data == _estado.value.data) return
        _estado.update { it.copy(data = data, itemSelecionado = null) }
        carregar()
        carregarCalendario()
    }

    fun irParaTexto(iso: String?) {
        val data = iso?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return
        irPara(data)
    }

    fun avancarDias(dias: Int) = irPara(Formato.somarDias(_estado.value.data, dias))

    fun carregar(silencioso: Boolean = false) {
        if (!silencioso) _estado.update { it.copy(carregando = true, erro = null) }

        viewModelScope.launch {
            when (val resultado = Grafo.agenda.agendaDoDia(_estado.value.data)) {
                is Resultado.Sucesso -> _estado.update {
                    it.copy(carregando = false, agenda = resultado.dado, erro = null)
                }
                is Resultado.Falha -> _estado.update {
                    it.copy(carregando = false, erro = resultado.mensagem)
                }
            }
        }
    }

    /** Alimenta o seletor de dias com a contagem de cada data. */
    private fun carregarCalendario() {
        val inicio = Formato.somarDias(_estado.value.data, -7)
        val fim = Formato.somarDias(_estado.value.data, 45)

        viewModelScope.launch {
            val resultado = Grafo.agenda.visaoGeral(inicio, fim)
            if (resultado is Resultado.Sucesso) {
                _estado.update { it.copy(calendario = resultado.dado) }
            }
        }
    }

    private fun observarMudancas() {
        viewModelScope.launch {
            Grafo.agenda.mudancasNaAgenda().collect {
                carregar(silencioso = true)
                carregarCalendario()
            }
        }
    }

    fun selecionar(item: ItemAgenda?) {
        _estado.update { it.copy(itemSelecionado = item, aviso = null) }
    }

    fun limparAviso() = _estado.update { it.copy(aviso = null) }

    /** Bloqueia um horário livre (item 15). */
    fun bloquear(item: ItemAgenda, motivo: String?) {
        if (_estado.value.processando) return
        _estado.update { it.copy(processando = true, aviso = null) }

        viewModelScope.launch {
            val resposta = Grafo.agenda.bloquear(
                data = _estado.value.data,
                inicio = item.horarioInicio,
                fim = item.horarioFim,
                motivo = motivo,
            )

            when (resposta) {
                is Resultado.Sucesso -> {
                    val corpo = resposta.dado
                    if (corpo.ok) {
                        _estado.update {
                            it.copy(processando = false, itemSelecionado = null, aviso = "Horário bloqueado.")
                        }
                    } else {
                        _estado.update {
                            it.copy(
                                processando = false,
                                itemSelecionado = null,
                                aviso = corpo.mensagem ?: "Não foi possível bloquear.",
                            )
                        }
                    }
                    carregar(silencioso = true)
                }
                is Resultado.Falha -> _estado.update {
                    it.copy(processando = false, aviso = resposta.mensagem)
                }
            }
        }
    }

    /** Desbloqueia (item 16). Nunca toca em agendamento de cliente. */
    fun desbloquear(item: ItemAgenda) {
        val id = item.id ?: return
        if (_estado.value.processando) return
        _estado.update { it.copy(processando = true, aviso = null) }

        viewModelScope.launch {
            when (val resposta = Grafo.agenda.desbloquear(id)) {
                is Resultado.Sucesso -> {
                    val corpo = resposta.dado
                    _estado.update {
                        it.copy(
                            processando = false,
                            itemSelecionado = null,
                            aviso = if (corpo.ok) "Horário liberado." else corpo.mensagem,
                        )
                    }
                    carregar(silencioso = true)
                }
                is Resultado.Falha -> _estado.update {
                    it.copy(processando = false, aviso = resposta.mensagem)
                }
            }
        }
    }

    /** Marca o desfecho do atendimento. O horário continua ocupado. */
    fun marcarStatus(item: ItemAgenda, status: String) {
        val id = item.id ?: return
        if (_estado.value.processando) return
        _estado.update { it.copy(processando = true, aviso = null) }

        viewModelScope.launch {
            when (val resposta = Grafo.agenda.atualizarStatus(id, status)) {
                is Resultado.Sucesso -> {
                    _estado.update {
                        it.copy(
                            processando = false,
                            itemSelecionado = null,
                            aviso = if (resposta.dado.ok) "Atendimento atualizado." else resposta.dado.mensagem,
                        )
                    }
                    carregar(silencioso = true)
                }
                is Resultado.Falha -> _estado.update {
                    it.copy(processando = false, aviso = resposta.mensagem)
                }
            }
        }
    }
}
