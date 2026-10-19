/**
 * Shared Playwright `test` for every e2e spec (import { test, expect } from '../../helpers/test').
 *
 * Fixtures:
 *   - network guard (auto): any request to a host other than localhost / 127.0.0.1 is aborted and fails the
 *     test at the end — e2e never talks to production (Firebase, fonts, analytics…).
 *   - consoleErrors (auto): uncaught page errors fail the test; `console.error` lines are collected in
 *     `consoleErrors` for specs that want to assert on them.
 *   - seed(seed, { mode, user }): writes the app's storage before the first app script runs (addInitScript,
 *     guarded so a reload doesn't overwrite what the app wrote since). Call it BEFORE page.goto.
 *   - app: page objects (tests/helpers/pages.ts).
 */
import { test as base, expect, type Page } from '@playwright/test'
import { localEntries, snapshotEntries, type Seed, type SeedUser } from '../fixtures/seed'
import { App } from './pages'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface SeedOptions {
  /** 'local' (default): LocalRepository keys. 'snapshot': Firebase-mode device snapshot for `user`. */
  mode?: 'local' | 'snapshot'
  user?: SeedUser
}

interface Fixtures {
  networkGuard: string[]
  consoleErrors: string[]
  seed: (seed: Seed, opts?: SeedOptions) => Promise<void>
  app: App
}

/** Writes storage entries on first load only (marker key outside the app's `ptpt:v1:` prefix survives resets). */
export async function seedPage(page: Page, seed: Seed, opts: SeedOptions = {}) {
  const entries = opts.mode === 'snapshot' ? snapshotEntries(opts.user ?? { uid: 'e2e-user', email: 'e2e-user@example.test' }, seed) : localEntries(seed)
  await page.addInitScript((e: Record<string, string>) => {
    try {
      if (localStorage.getItem('__e2e_seeded')) return
      for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v)
      localStorage.setItem('__e2e_seeded', '1')
    } catch {
      // storage unavailable
    }
  }, entries)
}

export const test = base.extend<Fixtures>({
  networkGuard: [
    async ({ context }, use) => {
      const blocked: string[] = []
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url())
        if (url.protocol === 'data:' || url.protocol === 'blob:' || LOCAL_HOSTS.has(url.hostname)) return route.continue()
        blocked.push(url.href)
        return route.abort('blockedbyclient')
      })
      await use(blocked)
      expect(blocked, 'requests to non-local hosts (e2e must not reach the network)').toEqual([])
    },
    { auto: true },
  ],
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      const pageErrors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      page.on('pageerror', (e) => pageErrors.push(String(e)))
      await use(errors)
      expect(pageErrors, 'uncaught exceptions in the page').toEqual([])
    },
    { auto: true },
  ],
  seed: async ({ page }, use) => {
    await use((seed, opts) => seedPage(page, seed, opts))
  },
  app: async ({ page }, use) => {
    await use(new App(page))
  },
})

export { expect }
