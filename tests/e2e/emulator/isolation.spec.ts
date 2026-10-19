/**
 * Users and devices (workstream E): sign-out forgets the device snapshot, two allowed users never see each
 * other's data (UI, server, snapshot keys), a signed-in but not allowed account gets <AccessDenied>.
 */
import { readFileSync } from 'node:fs'
import { progress } from '../../fixtures/seed'
import { DENIED_EMAIL, fsGet, signInFresh, syncStatus, workerUsers } from '../../helpers/emulator'
import { answerConnectivityProbe, expectSnapshot, seedServer, serverIds, snapshotKeys } from '../../helpers/e-emu'
import { expect, test } from '../../helpers/test'

const A1_TOPICS = (JSON.parse(readFileSync(new URL('../../../content/syllabus.json', import.meta.url), 'utf8')) as {
  levels: { level: string; modules: { topics: string[] }[] }[]
}).levels
  .find((l) => l.level === 'A1')!
  .modules.flatMap((m) => m.topics).length
const LENIENT = 'Не учитывать ошибки в акцентах'

test.beforeEach(({ context }) => answerConnectivityProbe(context))

test('sign-out forgets this user’s device snapshot and cached sign-in', async ({ page }, info) => {
  const { a: email } = workerUsers(info)
  await page.goto('settings')
  const uid = await signInFresh(page, email)
  await seedServer(uid, { progress: [progress('a1-ser-estar', 10, 10)] })
  await expectSnapshot(page, uid, (d) => 'a1-ser-estar' in (d.progress ?? {}))
  expect(await page.evaluate(() => localStorage.getItem('ptpt:v1:auth-user'))).toContain(uid)

  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page.getByRole('button', { name: 'Войти через Google' })).toBeVisible()
  expect(await snapshotKeys(page)).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('ptpt:v1:auth-user'))).toBeNull()
  // Nothing re-saves it later (the store was disposed with persist: false).
  await page.reload()
  await expect(page.getByRole('button', { name: 'Войти через Google' })).toBeVisible()
  expect(await snapshotKeys(page)).toEqual([])
  // Server data is untouched.
  expect((await serverIds(uid)).progress).toEqual(['a1-ser-estar'])
})

test('two allowed users on one browser never see each other’s data', async ({ page }, info) => {
  const { a, b } = workerUsers(info)
  await page.goto('settings')
  const uidA = await signInFresh(page, a)
  await seedServer(uidA, { progress: [progress('a1-ser-estar', 10, 10)] })
  await page.getByRole('switch', { name: LENIENT }).click()
  await expect.poll(async () => (await fsGet<{ lenientAccents?: boolean }>(uidA, 'meta', 'settings'))?.lenientAccents).toBe(true)
  await expectSnapshot(page, uidA, (d) => 'a1-ser-estar' in (d.progress ?? {}))
  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page.getByRole('button', { name: 'Войти через Google' })).toBeVisible()

  const uidB = await signInFresh(page, b)
  expect(uidB).not.toBe(uidA)
  await page.goto('settings')
  await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')
  await expect(page.getByRole('switch', { name: LENIENT })).toHaveAttribute('aria-checked', 'false')
  await page.goto('syllabus')
  await expect(page.getByText(`0/${A1_TOPICS}`)).toBeVisible()
  await expect(page.getByText(`1/${A1_TOPICS}`)).toHaveCount(0)
  expect(await snapshotKeys(page)).toEqual([`ptpt:v1:snap:${uidB}`])
  const snapB = await page.evaluate((k) => localStorage.getItem(k), `ptpt:v1:snap:${uidB}`)
  expect(snapB).not.toContain('a1-ser-estar')
  expect(snapB).not.toContain('lenientAccents":true')

  // B's writes land under B only; A's server data is intact.
  await page.goto('settings')
  await page.getByRole('switch', { name: 'Перевод по нажатию на слово' }).click()
  // Settings writes are debounced: wait for the document instead of the status line.
  await expect.poll(async () => (await serverIds(uidB)).meta).toEqual(['settings'])
  const [srvA, srvB] = await Promise.all([serverIds(uidA), serverIds(uidB)])
  expect(srvA.progress).toEqual(['a1-ser-estar'])
  expect(srvB.progress).toEqual([])
})

test('a signed-in account that is not allowed gets «Нет доступа к данным»', async ({ page }) => {
  await page.goto('')
  // Not signIn(): it waits for the main navigation, which a denied account never gets.
  await page.waitForFunction(() => typeof (window as { __emuSignIn?: unknown }).__emuSignIn === 'function')
  await page.evaluate((e) => (window as unknown as { __emuSignIn(e: string): Promise<string> }).__emuSignIn(e), DENIED_EMAIL)
  const alert = page.getByRole('alert').filter({ has: page.getByRole('heading', { name: 'Нет доступа к данным' }) })
  await expect(alert).toBeVisible()
  await expect(alert).toContainText(DENIED_EMAIL)
  await expect(page.getByRole('navigation', { name: 'Основные разделы' })).toHaveCount(0)
  // «Повторить» stays denied, «Выйти» returns to the sign-in screen and leaves no snapshot behind.
  await alert.getByRole('button', { name: 'Повторить' }).click()
  await expect(alert).toBeVisible()
  await alert.getByRole('button', { name: 'Выйти' }).click()
  await expect(page.getByRole('button', { name: 'Войти через Google' })).toBeVisible()
  expect(await snapshotKeys(page)).toEqual([])
})
