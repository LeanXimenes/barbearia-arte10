import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Troca __SITE_URL__ no index.html pelo endereço público do site.
 * No Netlify a variável URL é preenchida automaticamente; fora dele dá
 * para usar VITE_SITE_URL. Sem nenhuma das duas, fica relativo.
 */
function enderecoDoSite(): Plugin {
  const url = (process.env.VITE_SITE_URL || process.env.URL || '').replace(/\/+$/, '')
  return {
    name: 'arte10-endereco-do-site',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', url),
  }
}

export default defineConfig({
  plugins: [react(), enderecoDoSite()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
  server: {
    port: 5173,
    host: true,
  },
})
