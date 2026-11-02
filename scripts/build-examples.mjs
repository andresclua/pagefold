// Copies the examples into the docs site, next to the built library files they load,
// so each one is served from the same place as the documentation (/examples/<name>/).
import { cpSync, rmSync, mkdirSync, readdirSync } from 'node:fs'

// Paths are relative to the repository root, whatever folder this runs from
process.chdir(new URL('..', import.meta.url).pathname)

const out = 'docs/public/examples'
rmSync(out, { recursive: true, force: true })
cpSync('examples', out, { recursive: true })

// The <script> builds (global names) and the two themes
mkdirSync(`${out}/_lib`)
for (const f of readdirSync('dist/umd'))
  if (f.endsWith('.js')) cpSync(`dist/umd/${f}`, `${out}/_lib/${f}`)
for (const f of readdirSync('dist/css')) cpSync(`dist/css/${f}`, `${out}/_lib/${f}`)
