import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

// One entry per module, so bundlers only include what you import
const entry = {
  index: 'src/index.ts',
  head: 'src/plugins/head.ts',
  scripts: 'src/plugins/scripts.ts',
  js: 'src/plugins/js.ts',
  overlap: 'src/plugins/overlap.ts',
  preload: 'src/plugins/preload.ts',
}

export default defineConfig({
  define: { __VERSION__: JSON.stringify(version) },
  build: {
    lib: {
      entry,
      formats: ['es', 'cjs'],
      fileName: (format, name) => `${name}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    sourcemap: true,
    target: 'es2020',
    // CommonJS users read the class from `.default`, the same shape for every module
    rollupOptions: { output: { exports: 'named' } },
  },
})
