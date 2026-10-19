/**
 * Vitest: unit (node) + component (jsdom) projects. See docs/testing.md.
 *   npm test               all projects once
 *   npm run test:coverage  + v8 coverage of src/ (coverage/index.html)
 * Not the app's vite.config.ts on purpose: no PWA plugin; `virtual:pwa-register/react` is stubbed.
 */
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const alias = {
  '@': r('./src'),
  'virtual:pwa-register/react': r('./tests/helpers/pwa-register-stub.ts'),
}

export default defineConfig({
  resolve: { alias },
  test: {
    // Empty Firebase env: the app modules run in local mode (LocalRepository) under test.
    env: { VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: '', VITE_FIREBASE_AUTH_DOMAIN: '' },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts', 'scripts/**/*.test.ts'],
          // Needs the Firestore emulator: npm run test:rules.
          exclude: ['scripts/rules.test.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['tests/component/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/helpers/setup-dom.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/generated/**', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
})
