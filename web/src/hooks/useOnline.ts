import { useEffect, useState } from 'react'

/**
 * Acompanha o estado da conexão para que o site possa avisar em vez de
 * fingir que uma operação deu certo (item 22).
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  )

  useEffect(() => {
    const entrou = () => setOnline(true)
    const saiu = () => setOnline(false)

    window.addEventListener('online', entrou)
    window.addEventListener('offline', saiu)
    return () => {
      window.removeEventListener('online', entrou)
      window.removeEventListener('offline', saiu)
    }
  }, [])

  return online
}
