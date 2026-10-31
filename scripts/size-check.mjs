// Fails when the minified + gzipped core exceeds the budget. Also reports each module.
import { readFileSync } from 'node:fs'
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
const { exports } = JSON.parse(readFileSync('package.json', 'utf8'))
// Only the JavaScript modules: skip the main entry and patterns such as ./css/*
for (const name of Object.keys(exports).filter((k) => k !== '.' && !k.includes('*'))) {
  console.log(`${name.slice(2)}: ${await sizeOf(`dist/${name.slice(2)}.js`)} B`)
}

if (core > BUDGET) {
  console.error('Size budget exceeded')
  process.exit(1)
}
