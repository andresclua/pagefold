import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

// Single entry for now; add one entry per module (head, preload...) as they land
export default defineConfig({
  define: { __VERSION__: JSON.stringify(version) },
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    sourcemap: true,
    target: 'es2020',
  },
})
