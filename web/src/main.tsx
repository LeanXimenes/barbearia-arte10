import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './estilos/base.css'
import './estilos/site.css'
import './estilos/agendamento.css'

const raiz = document.getElementById('root')

if (!raiz) {
  throw new Error('Elemento #root nao encontrado no index.html')
}

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>
)
