// =====================================================================
// Gera supabase/instalar_tudo.sql = todas as migrações (em ordem) + seed.
//
//   node supabase/gerar_instalador.mjs
//
// O instalador é o que o dono cola UMA vez no SQL Editor do Supabase.
// Ele pode ser rodado de novo sem estragar nada (é idempotente) — a
// suíte de testes confere isso e também confere que o arquivo está em dia
// com as migrações.
// =====================================================================
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))

export function montarInstalador() {
  const pasta = join(aqui, 'migrations')
  const arquivos = readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort()

  const partes = [
    '-- =====================================================================',
    '-- BARBEARIA ARTE 10 — INSTALADOR COMPLETO DO BANCO',
    '-- =====================================================================',
    '-- ARQUIVO GERADO por supabase/gerar_instalador.mjs — não edite à mão.',
    '--',
    '-- Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.',
    '-- Pode ser executado mais de uma vez sem problema.',
    '-- =====================================================================',
    '',
  ]

  for (const arquivo of arquivos) {
    partes.push(`-- >>>>>>>>>> ${arquivo}`, readFileSync(join(pasta, arquivo), 'utf8').trim(), '')
  }

  partes.push('-- >>>>>>>>>> seed.sql', readFileSync(join(aqui, 'seed.sql'), 'utf8').trim(), '')
  partes.push("select 'Barbearia Arte 10: banco instalado com sucesso.' as resultado;", '')

  return partes.join('\n').replace(/\r\n/g, '\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const destino = join(aqui, 'instalar_tudo.sql')
  writeFileSync(destino, montarInstalador())
  console.log(`Gerado: ${destino}`)
}
