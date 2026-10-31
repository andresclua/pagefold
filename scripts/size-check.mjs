// Fails when the gzipped core bundle exceeds the budget.
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUDGET = 4096 // bytes gzip, core only
const size = gzipSync(readFileSync('dist/index.js')).length

console.log(`core: ${size} B gzip (budget ${BUDGET} B)`)
if (size > BUDGET) {
  console.error('Size budget exceeded')
  process.exit(1)
}
