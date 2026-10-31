// Fails when the minified + gzipped core bundle exceeds the budget.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { transformSync } from 'esbuild'

const BUDGET = 8192 // bytes, minified + gzip, core only
const { code } = transformSync(readFileSync('dist/index.js', 'utf8'), { minify: true, format: 'esm' })
const size = gzipSync(code).length

console.log(`core: ${size} B minified+gzip (budget ${BUDGET} B)`)
if (size > BUDGET) {
  console.error('Size budget exceeded')
  process.exit(1)
}
