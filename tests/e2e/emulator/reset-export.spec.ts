/**
 * Data management on the emulator (workstream E): «Сбросить весь прогресс» deletes exactly the documented
 * collections (settings only with the switch), export → reset → import round-trip, legacy word-card cleanup.
 */
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { NOW, card, errorEntry, progress, word, wordCard, type Seed } from '../../fixtures/seed'
import { fsGet, signInFresh, syncStatus, workerUsers } from '../../helpers/emulator'
import { answerConnectivityProbe, expectSnapshot, newDevice, openSignedIn, seedServer, serverIds } from '../../helpers/e-emu'
import { expect, test } from '../../helpers/test'

const casa = word('casa', 'дом')
const FULL: Seed = {
  progress: [progress('a1-ser-estar', 10, 10), progress('a1-ter-haver', 4, 10, { source: 'diagnostic' })],
  cards: [card('err-1'), wordCard(casa)],
  errors: [errorEntry('e1'), errorEntry('e2')],
  words: [casa],
  settings: { lenientAccents: true, newCardsPerDay: 7, lastDiagnosticAt: NOW - 86_400_000 },
}

test.beforeEach(({ context }) => answerConnectivityProbe(context))

async function openReset(page: Page) {
  await page.getByRole('button', { name: 'Сбросить…' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Сбросить весь прогресс?' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function confirmReset(page: Page, alsoSettings: boolean) {
  const dialog = await openReset(page)
  // Counts come from the store (2 topics, 2 cards, 1 word, 2 errors).
  const what = dialog.getByRole('list', { name: 'Что будет удалено' })
  await expect(what).toContainText('2 темы')
  await expect(what).toContainText('2 карточки')
  await expect(what).toContainText('1 слово')
  await expect(what).toContainText('2 записи')
  if (alsoSettings) await dialog.getByRole('switch', { name: 'Также сбросить настройки' }).click()
  const go = dialog.getByRole('button', { name: 'Сбросить прогресс' })
  await expect(go).toBeDisabled()
  await dialog.getByLabel(/Чтобы подтвердить, введите/).fill('сбросить')
  await go.click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(alsoSettings ? 'Прогресс и настройки сброшены' : 'Прогресс сброшен')).toBeVisible()
  // The app starts over on the home page (first-run state).
  await expect(page.getByText('Начните с диагностики')).toBeVisible()
}

/** Device-only progress keys the reset must clear, plus keys it must keep. */
async function seedDeviceKeys(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('ptpt:v1:srs-new:2026-10-19', '3')
    localStorage.setItem('ptpt:v1:writing:no-cafe', '"rascunho"')
    localStorage.setItem('ptpt:v1:theme', 'dark')
    sessionStorage.setItem('ptpt:v1:run:topic:a1-ser-estar:exercises', '{}')
    sessionStorage.setItem('ptpt:v1:diagnostic', '{}')
  })
}

test.describe('reset progress', () => {
  test('deletes progress, cards, errors and words everywhere; settings stay (minus lastDiagnosticAt)', async ({ page }, info) => {
    const { a: email } = workerUsers(info)
    await page.goto('settings')
    const uid = await signInFresh(page, email)
    await seedServer(uid, FULL)
    await expectSnapshot(page, uid, (d) => Object.keys(d.cards ?? {}).length === 2 && Object.keys(d.errors ?? {}).length === 2 && !!(d.meta?.settings as { lastDiagnosticAt?: number } | undefined)?.lastDiagnosticAt)
    await seedDeviceKeys(page)

    await confirmReset(page, false)
    await page.getByRole('link', { name: 'Настройки' }).first().click()
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')
    await expect.poll(() => serverIds(uid)).toEqual({ progress: [], cards: [], errors: [], words: [], meta: ['settings'] })
    const settings = await fsGet<Record<string, unknown>>(uid, 'meta', 'settings')
    expect(settings).toMatchObject({ lenientAccents: true, newCardsPerDay: 7 })
    expect(settings).not.toHaveProperty('lastDiagnosticAt')

    const keys = await page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).filter((k) => k.startsWith('ptpt:')) }))
    expect(keys.local).toEqual(expect.arrayContaining(['ptpt:v1:theme', 'ptpt:v1:auth-user', `ptpt:v1:snap:${uid}`]))
    expect(keys.local.filter((k) => k.startsWith('ptpt:v1:srs-new') || k.startsWith('ptpt:v1:writing'))).toEqual([])
    expect(keys.session).toEqual([])
    await expectSnapshot(page, uid, (d) => ['progress', 'cards', 'errors', 'words'].every((c) => Object.keys(d[c] ?? {}).length === 0))

    // Another device of the same user converges to the empty state (and its badges reset).
    await page.goto('review')
    await expect(page.getByRole('navigation', { name: 'Основные разделы' }).getByText('к повторению')).toHaveCount(0)
  })

  test('with «Также сбросить настройки» the settings document goes too', async ({ page }, info) => {
    const { a: email } = workerUsers(info)
    await page.goto('settings')
    const uid = await signInFresh(page, email)
    await seedServer(uid, FULL)
    await expectSnapshot(page, uid, (d) => Object.keys(d.cards ?? {}).length === 2 && !!d.meta?.settings)
    await confirmReset(page, true)
    await expect.poll(() => serverIds(uid)).toEqual({ progress: [], cards: [], errors: [], words: [], meta: [] })
    await page.getByRole('link', { name: 'Настройки' }).first().click()
    await expect(page.getByRole('switch', { name: 'Не учитывать ошибки в акцентах' })).toHaveAttribute('aria-checked', 'false')
  })

  test('a second device sees the reset', async ({ browser, page }, info) => {
    const { a: email } = workerUsers(info)
    await page.goto('settings')
    const uid = await signInFresh(page, email)
    await seedServer(uid, FULL)
    const device = await newDevice(browser)
    const dev2 = device.page
    await openSignedIn(dev2, email, 'syllabus')
    await expect(dev2.getByText(/^1\/\d+$/).first()).toBeVisible()
    await expectSnapshot(page, uid, (d) => Object.keys(d.cards ?? {}).length === 2)
    await confirmReset(page, false)
    await expect(dev2.getByText(/^1\/\d+$/)).toHaveCount(0)
    await expectSnapshot(dev2, uid, (d) => Object.keys(d.progress ?? {}).length === 0)
    await device.close()
  })
})

test('export → reset → import restores the same documents', async ({ page }, info) => {
  const { a: email } = workerUsers(info)
  await page.goto('settings')
  const uid = await signInFresh(page, email)
  await seedServer(uid, FULL)
  await expectSnapshot(page, uid, (d) => Object.keys(d.cards ?? {}).length === 2 && Object.keys(d.errors ?? {}).length === 2 && !!d.meta?.settings && Object.keys(d.words ?? {}).length === 1 && Object.keys(d.progress ?? {}).length === 2)
  const before = await serverIds(uid)

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Сохранить копию' }).click()])
  expect(download.suggestedFilename()).toMatch(/^portugues-pt-\d{4}-\d{2}-\d{2}\.json$/)
  const file = readFileSync(await download.path(), 'utf8')
  const bundle = JSON.parse(file) as { app: string; progress: unknown[]; cards: unknown[]; errors: unknown[]; words: unknown[]; settings: Record<string, unknown> }
  expect(bundle.app).toBe('portugues-pt')
  expect([bundle.progress.length, bundle.cards.length, bundle.errors.length, bundle.words.length]).toEqual([2, 2, 2, 1])

  await confirmReset(page, true)
  await expect.poll(() => serverIds(uid)).toEqual({ progress: [], cards: [], errors: [], words: [], meta: [] })

  await page.getByRole('link', { name: 'Настройки' }).first().click()
  await page.locator('input[type="file"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(file) })
  await expect(page.getByRole('alertdialog', { name: /Восстановить из «backup\.json»/ })).toBeVisible()
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Импорт выполнен' })).toBeVisible()
  await expect.poll(() => serverIds(uid)).toEqual(before)
  expect(await fsGet(uid, 'meta', 'settings')).toMatchObject({ lenientAccents: true, newCardsPerDay: 7 })
  await expect(page.getByRole('switch', { name: 'Не учитывать ошибки в акцентах' })).toHaveAttribute('aria-checked', 'true')
})

test('import of a broken file reports an error and writes nothing', async ({ page }, info) => {
  const { a: email } = workerUsers(info)
  await page.goto('settings')
  const uid = await signInFresh(page, email)
  await page.locator('input[type="file"]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"') })
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Ошибка импорта/ })).toBeVisible()
  expect(await serverIds(uid)).toEqual({ progress: [], cards: [], errors: [], words: [], meta: [] })
})

test.describe('legacy word cards', () => {
  const legacy: Seed = {
    cards: [card('w:casa', { kind: 'vocab' as never }), card('g:bom-dia', { kind: 'vocab' as never }), card('ph:bom-dia', { kind: 'phrase' as never }), wordCard(casa)],
    words: [casa],
  }

  test('«Удалить старые карточки слов» deletes w:* and g:* cards only', async ({ page }, info) => {
    const { a: email } = workerUsers(info)
    await page.goto('')
    const uid = await signInFresh(page, email)
    await seedServer(uid, legacy)
    await expectSnapshot(page, uid, (d) => Object.keys(d.cards ?? {}).length === 4)
    await page.getByRole('link', { name: 'Настройки' }).first().click()
    await expect(page.getByText('Удалить старые карточки слов')).toBeVisible()
    await expect(page.getByText(/^2 карточки слов из тем/)).toBeVisible()
    await page.getByRole('button', { name: 'Удалить…' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Удалить старые карточки слов?' })
    await expect(dialog.getByRole('button', { name: 'Отмена' })).toBeFocused()
    await dialog.getByRole('button', { name: 'Удалить 2' }).click()
    await expect(page.getByText('Удалено старых карточек слов: 2')).toBeVisible()
    await expect.poll(async () => (await serverIds(uid)).cards).toEqual(['lex:u:casa:recognize', 'ph:bom-dia'].sort())
  })

  test('the cleanup offer appears when the cards arrive after Settings was opened (first sign-in on a device)', async ({ page }, info) => {
    test.fail(true, 'BUG E-02: docs/testing-bugs/E.md#e-02 — the legacy-card count is taken once on mount')
    const { a: email } = workerUsers(info)
    await page.goto('settings')
    const uid = await signInFresh(page, email)
    await seedServer(uid, legacy)
    await expectSnapshot(page, uid, (d) => Object.keys(d.cards ?? {}).length === 4)
    await expect(page.getByText('Удалить старые карточки слов')).toBeVisible()
  })
})
