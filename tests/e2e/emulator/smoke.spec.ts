/**
 * Smoke (Firebase emulators): a test user signs in, changes a synced setting, the write reaches Firestore and
 * survives a reload and a brand-new device (fresh browser context, no snapshot).
 */
import { fsGet, signIn, signInFresh, syncStatus, workerUsers } from '../../helpers/emulator'
import { expect, test } from '../../helpers/test'

test('signed-in write persists across reload and devices', async ({ app, page, browser }, info) => {
  const { a: email } = workerUsers(info)
  await page.goto('')
  await expect(page.getByRole('button', { name: 'Войти через Google' })).toBeVisible()
  const uid = await signInFresh(page, email)

  await app.goto('/settings')
  await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')
  const sw = page.getByRole('switch', { name: 'Не учитывать ошибки в акцентах' })
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'true')

  await expect.poll(async () => (await fsGet<{ lenientAccents?: boolean }>(uid, 'meta', 'settings'))?.lenientAccents, { timeout: 10_000 }).toBe(true)
  await expect(syncStatus(page)).toHaveAttribute('data-sync-status', 'synced')

  await page.reload()
  await expect(page.getByRole('switch', { name: 'Не учитывать ошибки в акцентах' })).toHaveAttribute('aria-checked', 'true')

  // Another device: empty storage, signs in, gets the value from the server.
  const ctx = await browser.newContext()
  const page2 = await ctx.newPage()
  await page2.goto('settings')
  expect(await signIn(page2, email)).toBe(uid)
  await expect(page2.getByRole('switch', { name: 'Не учитывать ошибки в акцентах' })).toHaveAttribute('aria-checked', 'true')
  await ctx.close()
})
