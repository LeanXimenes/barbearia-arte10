// Serve uma pasta de build (dist/, dist-painel/…) com os MESMOS cabeçalhos
// de public/_headers — para conferir a CSP no computador antes de publicar.
//
//   node scripts/servir-dist.mjs <pasta> <porta> [--demo]
//
// --demo: troca o Supabase de produção por http://localhost:54321 na CSP
// (o banco de demonstração de supabase/tests/servidor-local.mjs).
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'

const [pasta = 'dist', porta = '5180', ...opcoes] = process.argv.slice(2)
const raiz = resolve(pasta)
const demo = opcoes.includes('--demo')

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

// Lê o bloco "/*" do _headers (o mesmo arquivo que o Netlify usa).
function cabecalhosDoNetlify() {
  const arquivo = join(raiz, '_headers')
  const saida = {}
  if (!existsSync(arquivo)) return saida
  let dentro = false
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    if (/^\S/.test(linha)) dentro = linha.trim() === '/*'
    else if (dentro && linha.includes(':')) {
      const i = linha.indexOf(':')
      saida[linha.slice(0, i).trim()] = linha.slice(i + 1).trim()
    }
  }
  if (demo && saida['Content-Security-Policy']) {
    saida['Content-Security-Policy'] = saida['Content-Security-Policy']
      .replace(/https:\/\/[a-z0-9]+\.supabase\.co/g, 'http://localhost:54321')
      .replace(/wss:\/\/[a-z0-9]+\.supabase\.co/g, 'ws://localhost:54321')
      .replace('; upgrade-insecure-requests', '')
  }
  return saida
}

const CABECALHOS = cabecalhosDoNetlify()

createServer((req, res) => {
  const caminho = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  let arquivo = normalize(join(raiz, caminho))
  if (!arquivo.startsWith(raiz)) {
    res.writeHead(403).end()
    return
  }
  if (existsSync(arquivo) && statSync(arquivo).isDirectory()) arquivo = join(arquivo, 'index.html')
  // Página única: rota que não é arquivo cai no index.html (como no Netlify).
  if (!existsSync(arquivo)) arquivo = join(raiz, 'index.html')
  res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream', ...CABECALHOS })
  res.end(readFileSync(arquivo))
}).listen(Number(porta), () => {
  console.log(`Servindo ${raiz} em http://localhost:${porta}${demo ? ' (CSP da demonstração)' : ''}`)
})
