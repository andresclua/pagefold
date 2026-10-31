// Fails when the minified + gzipped core exceeds the budget. Also reports each module.
import { readdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const BUDGET = 8192 // bytes, minified + gzip, core only

async function sizeOf(file) {
  const { outputFiles } = await build({
    entryPoints: [file],
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
  })
  return gzipSync(outputFiles[0].contents).length
}

const core = await sizeOf('dist/index.js')
console.log(`core: ${core} B minified+gzip (budget ${BUDGET} B)`)

// Standalone size of each module, including the shared code it pulls in
for (const file of readdirSync('dist').filter((f) => f.endsWith('.js') && f !== 'index.js' && !f.includes('-'))) {
  console.log(`${file.replace('.js', '')}: ${await sizeOf(`dist/${file}`)} B`)
}

if (core > BUDGET) {
  console.error('Size budget exceeded')
  process.exit(1)
}
