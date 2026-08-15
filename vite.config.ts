import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/game/**'],
      thresholds: { lines: 50 },
    },
  },
})
