import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // Worker threads start about twice as fast as the default child processes.
    pool: 'threads',
    include: ['src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
    },
  },
})
