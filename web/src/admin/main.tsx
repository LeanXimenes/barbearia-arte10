import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PainelApp } from './App'
import '../estilos/base.css'
import '../estilos/agendamento.css'
import '../estilos/conta.css'
import './painel.css'

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('Elemento #raiz não encontrado em admin/index.html')

createRoot(raiz).render(
  <StrictMode>
    <PainelApp />
  </StrictMode>,
)
