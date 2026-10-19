/**
 * Playwright e2e against the Firebase emulators (Auth :9099 + Firestore :8080, project demo-ptpt).
 *   npm run test:e2e:emulator   (firebase emulators:exec … starts/stops the emulators around the run)
 * The app is built with demo Firebase config + VITE_FIREBASE_EMULATOR_HOST, which exposes window.__emuSignIn(email)
 * (src/data/auth.ts) — tests sign in test users without the Google popup. globalSetup installs firestore.rules into
 * the emulator with the ALLOWED_EMAILS line replaced by the test emails (tests/helpers/emulator.ts).
 */
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_EMU_PORT ?? 4318)
const EMU_ENV =
  'VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_AUTH_DOMAIN=demo-ptpt.firebaseapp.com VITE_FIREBASE_PROJECT_ID=demo-ptpt VITE_FIREBASE_APP_ID=demo-app VITE_FIREBASE_EMULATOR_HOST=127.0.0.1 VITE_BASE_PATH=/learning-portuguese/'

export default defineConfig({
  testDir: 'tests/e2e/emulator',
  outputDir: 'test-results/e2e-emulator',
  globalSetup: './tests/helpers/emulator-global-setup.ts',
  // Tests share one emulator; each test uses its own user (unique email), so they can still run in parallel.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/emulator' }]],
  use: {
    baseURL: `http://localhost:${PORT}/learning-portuguese/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Europe/Lisbon',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'emulator-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `env ${EMU_ENV} npx vite build --outDir .e2e/emu-dist --emptyOutDir --logLevel error && env ${EMU_ENV} npx vite preview --outDir .e2e/emu-dist --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/learning-portuguese/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
