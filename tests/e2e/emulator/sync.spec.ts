/**
 * Local-first sync against the Firebase emulators (workstream E): first paint, optimistic writes, offline queue,
 * rollback, multi-tab / multi-device convergence, conflict policy, complete-listing deletes, revalidation.
 * Each test uses this worker's own pair of test users (e2e-w<N>-a|b@example.test), wiped first.
 */
import { readFileSync } from 'node:fs'
import { NOW, DAY, card, fsrs, progress } from '../../fixtures/seed'
import { fsGet, signIn, signInFresh, syncStatus, wipeUser, workerUsers } from '../../helpers/emulator'
import {
  FirestoreTraffic,
  answerConnectivityProbe,
  expectSnapshot,
  holdFirestore,
  openSignedIn,
  readFlash,
  seedServer,
  serverDoc,
  setVisibility,
  newDevice,
  watchFlash,
} from '../../helpers/e-emu'
import { expect, test } from '../../helpers/test'

const LENIENT = 'Не учитывать ошибки в акцентах'
const A1_TOPICS = (JSON.parse(readFileSync(new URL('../../../content/syllabus.json', import.meta.url), 'utf8')) as {
  levels: { level: string; modules: { topics: string[] }[] }[]
}).levels
  .find((l) => l.level === 'A1')!
  .modules.flatMap((m) => m.topics).length

/** «1/14» next to the A1 level header on /syllabus = one confident A1 topic. */
const a1Count = (n: number) => `${n}/${A1_TOPICS}`
const confident = progress('a1-ser-estar', 10, 10)
const lenientSwitch = (page: import('@playwright/test').Page) => page.getByRole('switch', { name: LENIENT })

test.beforeEach(({ context }) => answerConnectivityProbe(context))

test.describe('first paint', () => {
  test('first sign-in on a device without a snapshot: skeleton until the server answers, then the data', async ({ browser, page }, info) => {
    const { a: email } = workerUsers(info)
    // Server data exists (another device).
    await page.goto('')
    const uid = await signInFresh(page, email)
    await seedServer(uid, { progress: [confident] })

    const device = await newDevice(browser)
    const p2 = device.page
    await p2.goto('syllabus')
    const hold = await holdFirestore(p2, ['listen'])
    expect(await signIn(p2, email)).toBe(uid)
    // Nothing from the server yet, no snapshot: skeleton, never an empty course map.
    await expect(p2.getByRole('status', { name: 'Загрузка' })).toBeVisible()
    await expect(p2.getByText(a1Count(1))).toHaveCount(0)
    await expect(p2.getByText(a1Count(0))).toHaveCount(0)
    await hold.release()
    await expect(p2.getByText(a1Count(1))).toBeVisible()
    await expect(p2.getByRole('status', { name: 'Загрузка' })).toHaveCount(0)
    await device.close()
  })

  test('a returning device renders from its snapshot before the server answers (syllabus and dashboard, no flash)', async ({ page }, info) => {
    const { a: email } = workerUsers(info)
    await page.goto('')
    const uid = await signInFresh(page, email)
    await seedServer(uid, { progress: [confident], cards: [card('err-1')] })
    await page.goto('syllabus')
    await expect(page.getByText(a1Count(1))).toBeVisible()
    await expectSnapshot(page, uid, (d) => 'a1-ser-estar' in (d.progress ?? {}), 'snapshot saved')

    // Reload with the server unreachable (held): the page must come up complete from the snapshot.
    await watchFlash(page, a1Count(1), [a1Count(0)])
    const hold = await holdFirestore(page.context())
    await page.reload()
    await expect(page.getByText(a1Count(1))).toBeVisible()
    let flash = await readFlash(page)
    expect(flash, 'no skeleton / sign-in screen / empty course map before the data').toMatchObject({ skeleton: false, signIn: false, seen: [] })
    // The listeners did start (and are still parked), so everything above came from the device.
    await expect.poll(() => hold.parked, { message: 'Listen requests were made and held' }).toBeGreaterThan(0)
    await expect(page.getByText(a1Count(1))).toBeVisible()

    await watchFlash(page, 'Прогресс по уровням', ['Начните с диагностики'])
    await page.goto('')
    await expect(page.getByRole('heading', { name: 'Прогресс по уровням' })).toBeVisible()
    flash = await readFlash(page)
    expect(flash).toMatchObject({ skeleton: false, signIn: false, seen: [] })
    await hold.release()
  })
})

test.describe('writes', () => {
  test('a write is optimistic (UI at once, «в очереди») and reaches Firestore', async ({ app, page }, info) => {
    const { a: email } = workerUsers(info)
    await page.goto('settings')
    const uid = await signInFresh(page, email)
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')

    const hold = await holdFirestore(page.context(), ['write'])
    await lenientSwitch(page).click()
    await expect(lenientSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'syncing')
    await expect(syncStatus(page)).toContainText('в очереди: 1')
    await expectSnapshot(page, uid, (d) => (d.meta?.settings as { lenientAccents?: boolean })?.lenientAccents === true, 'optimistic value in the snapshot')
    expect((await fsGet<{ lenientAccents?: boolean }>(uid, 'meta', 'settings'))?.lenientAccents).toBeUndefined()

    await hold.release()
    await expect.poll(async () => (await fsGet<{ lenientAccents?: boolean }>(uid, 'meta', 'settings'))?.lenientAccents).toBe(true)
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')
    void app
  })

  test('offline: writes queue on the device and sync on reconnect', async ({ page, context }, info) => {
    const { a: email } = workerUsers(info)
    await page.goto('settings')
    const uid = await signInFresh(page, email)
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')

    await context.setOffline(true)
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'offline')
    await expect(page.getByText(/Нет сети — прогресс сохранится/)).toBeVisible()
    await lenientSwitch(page).click()
    await expect(lenientSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect(syncStatus(page)).toContainText('в очереди: 1')
    expect((await fsGet<{ lenientAccents?: boolean }>(uid, 'meta', 'settings'))?.lenientAccents).toBeUndefined()

    await context.setOffline(false)
    await expect.poll(async () => (await fsGet<{ lenientAccents?: boolean }>(uid, 'meta', 'settings'))?.lenientAccents, { timeout: 20_000 }).toBe(true)
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced', { timeout: 20_000 })
  })

  test('offline reload: the queued write survives and is sent after reconnect', async ({ page, context }, info) => {
    const { a: email } = workerUsers(info)
    await page.goto('settings')
    const uid = await signInFresh(page, email)
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')
    // Offline for Firestore only (the page itself must still load: no service worker in this config).
    const hold = await holdFirestore(context)
    await lenientSwitch(page).click()
    await expect(lenientSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expectSnapshot(page, uid, (d) => (d.meta?.settings as { lenientAccents?: boolean })?.lenientAccents === true)
    await page.reload()
    await expect(lenientSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await hold.release()
    await expect.poll(async () => (await fsGet<{ lenientAccents?: boolean }>(uid, 'meta', 'settings'))?.lenientAccents, { timeout: 20_000 }).toBe(true)
  })

  test('a write the server rejects is rolled back with a toast', async ({ page }, info) => {
    const { a: email } = workerUsers(info)
    await page.goto('settings')
    const uid = await signInFresh(page, email)
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')
    // A restore file whose progress document is over Firestore's 1 MiB limit: the batch is rejected (invalid-argument).
    const huge = { ...progress('a1-ser-estar', 9, 10), history: [{ topicId: 'a1-ser-estar', correct: 9, total: 10, at: NOW, source: 'lesson', pad: 'x'.repeat(1_100_000) }] }
    const bundle = { app: 'portugues-pt', version: 1, exportedAt: NOW, progress: [huge], cards: [], errors: [], settings: { lenientAccents: true }, words: [] }
    await page.locator('input[type="file"]').setInputFiles({ name: 'huge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) })
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click()
    await expect(page.getByText(/Не удалось сохранить изменения — они отменены/)).toBeVisible({ timeout: 20_000 })
    // Rolled back: the switch is off again, nothing on the server, the snapshot has no trace.
    await expect(lenientSwitch(page)).toHaveAttribute('aria-checked', 'false')
    expect(await serverDoc(uid, 'progress', 'a1-ser-estar')).toBeUndefined()
    await expectSnapshot(page, uid, (d) => !('a1-ser-estar' in (d.progress ?? {})) && (d.meta?.settings as { lenientAccents?: boolean } | undefined)?.lenientAccents !== true)
  })
})

test.describe('convergence', () => {
  test('two tabs of one browser see each other’s writes', async ({ context, page }, info) => {
    const { a: email } = workerUsers(info)
    await page.goto('settings')
    await signInFresh(page, email)
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')
    const tab2 = await context.newPage()
    await tab2.goto('settings')
    await expect(syncStatus(tab2)).toHaveAttribute('data-sync-status', 'synced')

    await lenientSwitch(page).click()
    await expect(lenientSwitch(tab2)).toHaveAttribute('aria-checked', 'true')
    await tab2.getByRole('switch', { name: 'Перевод по нажатию на слово' }).click()
    await expect(page.getByRole('switch', { name: 'Перевод по нажатию на слово' })).toHaveAttribute('aria-checked', 'false')
  })

  test('two devices of one user converge', async ({ browser, page }, info) => {
    const { a: email } = workerUsers(info)
    await page.goto('settings')
    const uid = await signInFresh(page, email)
    const device = await newDevice(browser)
    const dev2 = device.page
    await openSignedIn(dev2, email, 'settings')
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')
    await expect(syncStatus(dev2)).toHaveAttribute('data-sync-status', 'synced')

    await lenientSwitch(page).click()
    await expect(lenientSwitch(dev2)).toHaveAttribute('aria-checked', 'true')
    await seedServer(uid, { progress: [confident] })
    await dev2.goto('syllabus')
    await page.goto('syllabus')
    await expect(page.getByText(a1Count(1))).toBeVisible()
    await expect(dev2.getByText(a1Count(1))).toBeVisible()
    await device.close()
  })

  test('card conflict: the newer review wins over a later-acknowledged older one', async ({ page, context }, info) => {
    test.fail(true, 'BUG E-01: docs/testing-bugs/E.md#e-01 — an older offline review overwrites a newer one from another device')
    const { a: email } = workerUsers(info)
    await page.clock.setFixedTime(NOW)
    const traffic = await FirestoreTraffic.attach(page)
    await page.goto('review')
    const uid = await signInFresh(page, email)
    const due = card('err-1', { front: 'Pergunta um', back: 'Resposta um' })
    await seedServer(uid, { cards: [due] })
    await expect(page.getByRole('button', { name: 'Начать' })).toBeVisible()

    // This device reviews offline (older review: NOW)…
    const hold = await holdFirestore(context, ['write'])
    await page.getByRole('button', { name: 'Начать' }).click()
    await page.getByRole('button', { name: 'Показать ответ' }).click()
    await page.getByRole('button', { name: /^Хорошо/ }).click()
    await expectSnapshot(page, uid, (d) => (d.cards?.['err-1'] as { fsrs: { reps: number } } | undefined)?.fsrs.reps === 4, 'local review applied')
    expect((await serverDoc<{ fsrs: { reps: number } }>(uid, 'cards', 'err-1'))?.fsrs.reps, 'the local review is still pending').toBe(3)
    // …another device reviewed the same card an hour later and that reached the server first…
    const newer = { ...due, fsrs: fsrs({ last_review: NOW + 3_600_000, due: NOW + 9 * DAY, reps: 9 }), updatedAt: NOW + 3_600_000 }
    await seedServer(uid, { cards: [newer] })
    // …and this device's listener received it while its own write was still pending.
    await expect
      .poll(() => traffic.messages().some((m) => JSON.stringify(m).includes('cards/err-1') && JSON.stringify(m).includes('"reps":{"integerValue":"9"}')))
      .toBe(true)
    await hold.release()
    // Wait until this device has nothing pending any more.
    await page.getByRole('link', { name: 'Настройки' }).first().click()
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced', { timeout: 20_000 })

    const reps = async () => (await serverDoc<{ fsrs: { reps: number } }>(uid, 'cards', 'err-1'))?.fsrs.reps
    await expect.poll(reps, { message: 'server ends with the newer review (reps 9)', timeout: 10_000 }).toBe(9)
    await expectSnapshot(page, uid, (d) => (d.cards?.['err-1'] as { fsrs: { reps: number } } | undefined)?.fsrs.reps === 9, 'device converges to the newer review')
    await traffic.detach()
  })

  test('documents missing on the server disappear only after a complete server listing', async ({ page }, info) => {
    const { a: email } = workerUsers(info)
    await page.goto('syllabus')
    const uid = await signInFresh(page, email)
    await seedServer(uid, { progress: [confident] })
    await expect(page.getByText(a1Count(1))).toBeVisible()
    await expectSnapshot(page, uid, (d) => 'a1-ser-estar' in (d.progress ?? {}))
    // Another device deleted it while this one was closed (owner REST, no listener here after the reload).
    const hold = await holdFirestore(page.context(), ['listen'])
    await page.reload()
    await wipeUser(uid)
    // Cache / snapshot only: still shown (an incomplete listing never deletes).
    await expect(page.getByText(a1Count(1))).toBeVisible()
    await hold.release()
    await expect(page.getByText(a1Count(0))).toBeVisible({ timeout: 15_000 })
    await expectSnapshot(page, uid, (d) => !('a1-ser-estar' in (d.progress ?? {})))
  })

  test('re-listens after the tab was hidden for more than 10 minutes (not after a short pause)', async ({ page }, info) => {
    const { a: email } = workerUsers(info)
    await page.clock.setFixedTime(NOW)
    const traffic = await FirestoreTraffic.attach(page)
    await page.goto('settings')
    await signInFresh(page, email)
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')
    await expect.poll(() => traffic.reads().targetsAdded).toBeGreaterThanOrEqual(5)
    const before = traffic.reads().targetsAdded

    await setVisibility(page, 'hidden')
    await page.clock.setFixedTime(NOW + 5 * 60_000)
    await setVisibility(page, 'visible')
    await page.waitForTimeout(1000) // nothing should happen: give a wrong re-listen the chance to show up
    expect(traffic.reads().targetsAdded, '5 min hidden: no re-listen').toBe(before)

    await setVisibility(page, 'hidden')
    await page.clock.setFixedTime(NOW + 16 * 60_000)
    await setVisibility(page, 'visible')
    await expect.poll(() => traffic.reads().targetsAdded, { message: '11 min hidden: all 5 listeners re-attached' }).toBeGreaterThanOrEqual(before + 5)
    await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')
    await traffic.detach()
  })
})
