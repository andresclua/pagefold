import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { __VERSION__: JSON.stringify('0.0.0-test') },
  test: { environment: 'jsdom', include: ['tests/unit/**/*.test.ts'] },
})
