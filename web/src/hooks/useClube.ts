import { useCallback, useEffect, useState } from 'react'
import type { Plano, Promocao } from '../lib/tipos'
import { carregarPlanos, carregarPromocoes } from '../servicos/api'

/** Planos e promoções ativos (o dono muda no banco; o site só mostra). */
export function useClube() {
  const [planos, setPlanos] = useState<Plano[]>([])
  const [promocoes, setPromocoes] = useState<Promocao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    setErro(false)
    try {
      const [p, q] = await Promise.all([carregarPlanos(), carregarPromocoes()])
      setPlanos(p)
      setPromocoes(q)
    } catch {
      setErro(true)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  return { planos, promocoes, carregando, erro, recarregar }
}
