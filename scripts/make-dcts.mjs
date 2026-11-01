// CommonJS users need their own type files: a `.d.ts` in an ES module package is read as ESM,
// which TypeScript rejects for `require`. Copy every `.d.ts` to a `.d.cts` that points at siblings
// with the `.cjs` extension.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

let count = 0
for (const file of walk('dist').filter((f) => f.endsWith('.d.ts'))) {
  const source = readFileSync(file, 'utf8').replace(/((?:from|declare module)\s+')(\.{1,2}\/[^']+)\.js(')/g, '$1$2.cjs$3')
  writeFileSync(file.replace(/\.d\.ts$/, '.d.cts'), source)
  count++
}
console.log(`wrote ${count} .d.cts files`)
