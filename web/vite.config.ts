import { fileURLToPath } from 'node:url'
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

/**
 * Site do painel do dono (outro endereço no Netlify): a raiz leva direto
 * para /admin/ (onde ficam o painel, o service worker e o manifesto).
 */
function raizDoPainel(): Plugin {
  return {
    name: 'arte10-raiz-do-painel',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_redirects', source: '/  /admin/  302\n' })
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source:
          '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
          '<meta http-equiv="refresh" content="0; url=/admin/"><title>Painel · Arte 10</title>' +
          '<meta name="robots" content="noindex"></head>' +
          // Sem <script> embutido: a política de segurança (CSP) do site não permite.
          // O _redirects e o meta refresh já levam para /admin/.
          '<body><a href="/admin/">Abrir o painel</a></body></html>\n',
      })
    },
  }
}

const caminho = (arquivo: string) => fileURLToPath(new URL(arquivo, import.meta.url))

// "npm run build"        -> dist/        só o site dos clientes
// "npm run build:painel" -> dist-painel/ só o painel do dono (outro site no Netlify)
export default defineConfig(({ mode }) => {
  const painel = mode === 'painel'
  return {
    plugins: [react(), enderecoDoSite(), ...(painel ? [raizDoPainel()] : [])],
    build: {
      outDir: painel ? 'dist-painel' : 'dist',
      sourcemap: false,
      target: 'es2020',
      rollupOptions: {
        input: painel ? { painel: caminho('./admin/index.html') } : { site: caminho('./index.html') },
      },
    },
    server: {
      port: 5173,
      host: true,
    },
  }
})
