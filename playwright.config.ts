/**
 * Playwright e2e — LOCAL mode (no Firebase: empty VITE_FIREBASE_* → LocalRepository). See docs/testing.md.
 *   npm run test:e2e            all local specs × 3 projects
 *   npm run test:a11y           only specs tagged @a11y
 * The app is built once (`vite build` into .e2e/local-dist, ~2 s) and served by `vite preview`, base /learning-portuguese/.
 * Emulator-backed specs live in tests/e2e/emulator and use playwright.emulator.config.ts.
 */
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 4317)
const OUT_DIR = process.env.E2E_OUT_DIR ?? `.e2e/local-dist`
export const BASE_PATH = '/learning-portuguese/'
const LOCAL_ENV = 'VITE_FIREBASE_API_KEY= VITE_FIREBASE_AUTH_DOMAIN= VITE_FIREBASE_PROJECT_ID= VITE_FIREBASE_APP_ID= VITE_FIREBASE_EMULATOR_HOST= VITE_BASE_PATH=/learning-portuguese/'

export default defineConfig({
  testDir: 'tests/e2e/local',
  outputDir: 'test-results/e2e-local',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/local' }]] : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/local' }]],
  use: {
    baseURL: `http://localhost:${PORT}${BASE_PATH}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Europe/Lisbon',
    // The service worker is exercised only by the PWA specs (they opt in with test.use({ serviceWorkers: 'allow' })).
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `env ${LOCAL_ENV} npx vite build --outDir ${OUT_DIR} --emptyOutDir --logLevel error && env ${LOCAL_ENV} npx vite preview --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE_PATH}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
