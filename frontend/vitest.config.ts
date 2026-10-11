import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    environmentOptions: {
      jsdom: { url: 'http://localhost:4173/' },
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/app/routes.tsx', 'src/components/FloatingPanel.tsx'],
      reporter: ['text', 'html'],
    },
  },
})