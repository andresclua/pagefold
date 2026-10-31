import { defineConfig } from 'vite'

// Single entry for now; add one entry per module (head, preload...) as they land
export default defineConfig({
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
