/**
 * Local mode data management (workstream E): «Сбросить весь прогресс» (what goes, what stays), export → reset →
 * import round-trip, an old backup without `words`, a broken file, legacy word-card cleanup.
 */
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { NOW, card, errorEntry, progress, word, wordCard, type Seed } from '../../../fixtures/seed'
import { expect, test } from '../../../helpers/test'

test.skip(({ isMobile }) => !!isMobile, 'data logic is viewport-independent; desktop-chromium covers it (dialogs: mobile in a11y specs)')

const casa = word('casa', 'дом')
const FULL: Seed = {
  progress: [progress('a1-ser-estar', 10, 10), progress('a1-ter-haver', 4, 10, { source: 'diagnostic' })],
  cards: [card('err-1'), wordCard(casa)],
  errors: [errorEntry('e1'), errorEntry('e2')],
  words: [casa],
  settings: { lenientAccents: true, newCardsPerDay: 7, lastDiagnosticAt: NOW - 86_400_000 },
  theme: 'dark',
}
const keys = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ptpt:')).sort())
const json = async (page: Page, key: string) => JSON.parse((await page.evaluate((k) => localStorage.getItem(k), key)) ?? 'null')

async function reset(page: Page, alsoSettings: boolean) {
  await page.getByRole('button', { name: 'Сбросить…' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Сбросить весь прогресс?' })
  await expect(dialog).toContainText('на этом устройстве')
  if (alsoSettings) await dialog.getByRole('switch', { name: 'Также сбросить настройки' }).click()
  await dialog.getByLabel(/Чтобы подтвердить, введите/).fill('СБРОСИТЬ')
  await dialog.getByRole('button', { name: 'Сбросить прогресс' }).click()
  await expect(page.getByText('Начните с диагностики')).toBeVisible()
}

test('reset clears progress, cards, errors, words and device progress; theme and settings stay', async ({ app, page, seed }) => {
  await seed(FULL)
  await app.goto('/settings')
  await page.evaluate(() => {
    localStorage.setItem('ptpt:v1:srs-new:2026-10-19', '3')
    localStorage.setItem('ptpt:v1:writing:no-cafe', 'rascunho')
    sessionStorage.setItem('ptpt:v1:run:x', '{}')
  })
  await reset(page, false)
  expect(await keys(page)).toEqual(['ptpt:v1:settings', 'ptpt:v1:theme'])
  const settings = await json(page, 'ptpt:v1:settings')
  expect(settings).toMatchObject({ lenientAccents: true, newCardsPerDay: 7 })
  expect(settings).not.toHaveProperty('lastDiagnosticAt')
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('ptpt:')))).toEqual([])
  // Nothing comes back after a reload (no in-memory copy re-saved).
  await page.reload()
  await expect(page.getByText('Начните с диагностики')).toBeVisible()
  expect(await keys(page)).toEqual(['ptpt:v1:settings', 'ptpt:v1:theme'])
})

test('reset with «Также сбросить настройки» also removes the settings', async ({ app, page, seed }) => {
  await seed(FULL)
  await app.goto('/settings')
  await reset(page, true)
  expect(await keys(page)).toEqual(['ptpt:v1:theme'])
  await app.goto('/settings')
  await expect(page.getByRole('switch', { name: 'Не учитывать ошибки в акцентах' })).toHaveAttribute('aria-checked', 'false')
})

test('export → reset → import round-trip restores everything', async ({ app, page, seed }) => {
  await seed(FULL)
  await app.goto('/settings')
  const before = Object.fromEntries(await Promise.all(['progress', 'cards', 'words', 'errors', 'settings'].map(async (k) => [k, await json(page, `ptpt:v1:${k}`)] as const)))
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Сохранить копию' }).click()])
  const file = readFileSync(await download.path(), 'utf8')
  await reset(page, true)
  await app.goto('/settings')
  await page.locator('input[type="file"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(file) })
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Импорт выполнен' })).toBeVisible()
  for (const k of ['progress', 'cards', 'words', 'errors'] as const) expect(await json(page, `ptpt:v1:${k}`), k).toEqual(before[k])
  // Settings are replaced by the file's (defaults merged in by export), lastDiagnosticAt included.
  expect(await json(page, 'ptpt:v1:settings')).toMatchObject(before.settings)
  await expect(page.getByRole('switch', { name: 'Не учитывать ошибки в акцентах' })).toHaveAttribute('aria-checked', 'true')
})

test('an old backup without `words` imports and keeps the current dictionary', async ({ app, page, seed }) => {
  await seed({ words: [casa] })
  await app.goto('/settings')
  const old = { app: 'portugues-pt', version: 1, exportedAt: NOW, progress: [progress('a1-ser-estar', 9, 10)], cards: [card('err-9')], errors: [], settings: { lenientAccents: true } }
  await page.locator('input[type="file"]').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) })
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Импорт выполнен' })).toBeVisible()
  expect(Object.keys(await json(page, 'ptpt:v1:words'))).toEqual(['u:casa'])
  expect(Object.keys(await json(page, 'ptpt:v1:progress'))).toEqual(['a1-ser-estar'])
  expect(Object.keys(await json(page, 'ptpt:v1:cards'))).toEqual(['err-9'])
})

for (const [name, body] of [
  ['not JSON', '{"app":'],
  ['another app', '{"app":"other","version":1}'],
] as const) {
  test(`import of a broken file (${name}) reports an error and changes nothing`, async ({ app, page, seed }) => {
    await seed({ progress: [progress('a1-ser-estar', 10, 10)], settings: { newCardsPerDay: 7 } })
    await app.goto('/settings')
    const before = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => k.startsWith('ptpt:')).sort()))
    await page.locator('input[type="file"]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(body) })
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: /^Ошибка импорта/ })).toBeVisible()
    expect(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => k.startsWith('ptpt:')).sort()))).toBe(before)
  })
}

test('a backup with malformed documents is rejected or sanitized: the app keeps working after the import', async ({ app, page }) => {
  const bad = { app: 'portugues-pt', version: 1, exportedAt: NOW, progress: [{ topicId: 'a1-ser-estar' }], cards: [{ id: 'c1' }], errors: [{ id: 'e1' }], settings: {} }
  await app.goto('/settings')
  await page.locator('input[type="file"]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) })
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /^(Импорт выполнен|Ошибка импорта)/ })).toBeVisible()
  for (const path of ['/', '/syllabus', '/review']) {
    await app.goto(path)
    await expect(app.heading, path).toBeVisible()
  }
})

test('legacy word cards (w:*, g:*) are offered for cleanup and only they are deleted', async ({ app, page, seed }) => {
  await seed({ cards: [card('w:casa'), card('g:bom-dia'), card('ph:bom-dia'), wordCard(casa)], words: [casa] })
  await app.goto('/settings')
  await expect(page.getByText(/^2 карточки слов из тем/)).toBeVisible()
  await page.getByRole('button', { name: 'Удалить…' }).click()
  await page.getByRole('alertdialog', { name: 'Удалить старые карточки слов?' }).getByRole('button', { name: 'Удалить 2' }).click()
  await expect(page.getByText('Удалено старых карточек слов: 2')).toBeVisible()
  expect(Object.keys(await json(page, 'ptpt:v1:cards')).sort()).toEqual(['lex:u:casa:recognize', 'ph:bom-dia'])
  await page.reload()
  await expect(page.getByText('Удалить старые карточки слов')).toHaveCount(0)
})
