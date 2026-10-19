/**
 * Local mode persistence (workstream E): LocalRepository/LocalBackend data survives reloads, reaches a second tab
 * through the `storage` event, corrupted storage values never crash the app, storage quota errors are handled.
 */
import type { Page } from '@playwright/test'
import { NOW, card, progress, word, wordCard } from '../../../fixtures/seed'
import { expect, test } from '../../../helpers/test'

const LENIENT = 'Не учитывать ошибки в акцентах'
const lenient = (page: Page) => page.getByRole('switch', { name: LENIENT })
const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key)

test.describe('survives reload', () => {
  test('settings, theme and a review rating are written to localStorage and come back after a reload', async ({ app, page, seed }) => {
    await page.clock.setFixedTime(NOW)
    await seed({ cards: [card('err-1', { front: 'Pergunta', back: 'Resposta' })], progress: [progress('a1-ser-estar', 10, 10)] })
    await app.goto('/settings')
    await lenient(page).click()
    await page.getByRole('radio', { name: 'Тёмная' }).click()
    await expect.poll(() => stored(page, 'ptpt:v1:settings')).toContain('"lenientAccents":true')
    expect(await stored(page, 'ptpt:v1:theme')).toBe('dark')

    await app.goto('/review')
    await page.getByRole('button', { name: 'Начать' }).click()
    await page.getByRole('button', { name: 'Показать ответ' }).click()
    await page.getByRole('button', { name: /^Хорошо/ }).click()
    await expect.poll(async () => JSON.parse((await stored(page, 'ptpt:v1:cards')) ?? '{}')['err-1']?.fsrs?.reps).toBe(4)

    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await app.goto('/settings')
    await expect(lenient(page)).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio', { name: 'Тёмная' })).toBeChecked()
    expect(JSON.parse((await stored(page, 'ptpt:v1:cards')) ?? '{}')['err-1'].fsrs.reps).toBe(4)
    expect(JSON.parse((await stored(page, 'ptpt:v1:progress')) ?? '{}')).toHaveProperty('a1-ser-estar')
  })

  test('a second tab follows changes through the storage event', async ({ app, context, page }) => {
    await app.goto('/settings')
    const tab2 = await context.newPage()
    await tab2.goto('settings')
    await expect(lenient(tab2)).toHaveAttribute('aria-checked', 'false')
    await lenient(page).click()
    await expect(lenient(tab2)).toHaveAttribute('aria-checked', 'true')
    // And the other way round, for a collection (progress written by tab 2 shows on tab 1's course map).
    await app.goto('/syllabus')
    await tab2.evaluate((p) => localStorage.setItem('ptpt:v1:progress', JSON.stringify({ [p.topicId]: p })), progress('a1-ser-estar', 10, 10))
    // A direct setItem in tab 2 fires `storage` in tab 1 only.
    await expect(page.locator('main li a[href$="/topic/a1-ser-estar"]')).toContainText('Уверенно')
  })
})

/** Values that can end up in storage: hand edits, an older/newer app version, a half-written value. */
const CORRUPT: [key: string, value: string][] = [
  ['ptpt:v1:progress', '{not json'],
  ['ptpt:v1:progress', '[1,2,3]'],
  ['ptpt:v1:progress', '"text"'],
  ['ptpt:v1:progress', '{"a1-ser-estar":{"topicId":"a1-ser-estar"}}'],
  ['ptpt:v1:cards', '{not json'],
  ['ptpt:v1:cards', '42'],
  ['ptpt:v1:cards', '{"c1":{"id":"c1"}}'],
  ['ptpt:v1:cards', '{"c1":null}'],
  ['ptpt:v1:words', '{not json'],
  ['ptpt:v1:words', '{"u:casa":{"id":"u:casa"}}'],
  ['ptpt:v1:errors', '{not json'],
  ['ptpt:v1:errors', '{"x":1}'],
  ['ptpt:v1:errors', '[null]'],
  ['ptpt:v1:settings', '{not json'],
  ['ptpt:v1:settings', '"dark"'],
  ['ptpt:v1:settings', '{"wordModes":"all","newCardsPerDay":"many","rate":null}'],
  ['ptpt:v1:theme', 'purple'],
]

/** Which corruptions currently crash, keyed `key=value` (see docs/testing-bugs/E.md#e-03). */
const KNOWN_CRASH = new Set<string>([
  'ptpt:v1:progress=[1,2,3]',
  'ptpt:v1:progress="text"',
  'ptpt:v1:progress={"a1-ser-estar":{"topicId":"a1-ser-estar"}}',
  'ptpt:v1:cards={"c1":{"id":"c1"}}',
  'ptpt:v1:words={"u:casa":{"id":"u:casa"}}',
  'ptpt:v1:errors={"x":1}',
  'ptpt:v1:errors=[null]',
  'ptpt:v1:settings={"wordModes":"all","newCardsPerDay":"many","rate":null}',
])

test.describe('corrupted storage', () => {
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile, 'storage parsing is browser-independent: desktop-chromium only')

  for (const [key, value] of CORRUPT) {
    test(`${key} = ${value} → the app still opens`, async ({ app, page, consoleErrors }) => {
      if (KNOWN_CRASH.has(`${key}=${value}`)) test.fail(true, 'BUG E-03: docs/testing-bugs/E.md#e-03')
      await page.addInitScript(
        ([k, v]) => {
          if (!sessionStorage.getItem('__corrupted')) {
            localStorage.setItem(k, v)
            sessionStorage.setItem('__corrupted', '1')
          }
        },
        [key, value] as const,
      )
      for (const path of ['/', '/syllabus', '/review', '/words', '/settings']) {
        await app.goto(path)
        await expect(app.heading, `${path} renders a page`).toBeVisible()
      }
      void consoleErrors
    })
  }
})

test.describe('storage quota', () => {
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile, 'desktop-chromium only')

  /** After `__quota = true`, every app write to localStorage throws QuotaExceededError. */
  async function fillQuota(page: Page) {
    await page.addInitScript(() => {
      const set = Storage.prototype.setItem
      Storage.prototype.setItem = function (k: string, v: string) {
        if ((window as { __quota?: boolean }).__quota && k.startsWith('ptpt:v1:')) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        return set.call(this, k, v)
      }
    })
  }

  test('a settings write that hits the quota is rolled back and reported, the app keeps working', async ({ app, page }) => {
    test.fail(true, 'BUG E-04: docs/testing-bugs/E.md#e-04 — unhandled QuotaExceededError, the switch keeps the unsaved value')
    await fillQuota(page)
    await app.goto('/settings')
    await page.evaluate(() => ((window as { __quota?: boolean }).__quota = true))
    await lenient(page).click()
    await expect(page.getByText(/Не удалось сохранить/)).toBeVisible()
    await expect(lenient(page)).toHaveAttribute('aria-checked', 'false')
    // Still usable once space is back.
    await page.evaluate(() => ((window as { __quota?: boolean }).__quota = false))
    await lenient(page).click()
    await expect.poll(() => stored(page, 'ptpt:v1:settings')).toContain('"lenientAccents":true')
  })

  test('a review rating that hits the quota does not crash the session', async ({ app, page, seed }) => {
    await page.clock.setFixedTime(NOW)
    const w = word('casa', 'дом')
    await seed({ cards: [card('err-1'), card('err-2')], words: [w] })
    await fillQuota(page)
    await app.goto('/review')
    await page.evaluate(() => ((window as { __quota?: boolean }).__quota = true))
    await page.getByRole('button', { name: 'Начать' }).click()
    await page.getByRole('button', { name: 'Показать ответ' }).click()
    await page.getByRole('button', { name: /^Хорошо/ }).click()
    await expect(page.getByText(/Не удалось сохранить/)).toBeVisible()
    await expect(app.main).toBeVisible()
    void wordCard
  })

  test('the theme choice survives storage being unavailable (lasts for the page)', async ({ app, page }) => {
    await fillQuota(page)
    await app.goto('/settings')
    await page.evaluate(() => ((window as { __quota?: boolean }).__quota = true))
    await page.getByRole('radio', { name: 'Тёмная' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})
