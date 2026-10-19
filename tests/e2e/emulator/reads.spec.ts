/**
 * Firestore read cost of a typical session (workstream E). The emulator has no billing counters, so the Listen
 * stream is read through CDP (FirestoreTraffic) and billed reads are estimated as Firestore bills them:
 * one per delivered document, one per empty query result, one per missing single document.
 *
 * Numbers are attached to the test (annotations «reads: …») and printed; the asserts are budgets, not exact counts.
 */
import { NOW, DAY, card, errorEntry, fsrs, progress, word, wordCard, type Seed } from '../../fixtures/seed'
import { signInFresh, syncStatus, workerUsers } from '../../helpers/emulator'
import { FirestoreTraffic, answerConnectivityProbe, expectSnapshot, newDevice, seedServer } from '../../helpers/e-emu'
import { expect, test } from '../../helpers/test'

/** A learner a few months in: 40 topics touched, 150 dictionary words (×2 card modes), 50 other cards, 200 errors. */
function typicalUser(): Seed {
  const later = { fsrs: fsrs({ due: NOW + 5 * DAY }) }
  const words = Array.from({ length: 150 }, (_, i) => word(`palavra${i}`, `слово ${i}`))
  return {
    progress: Array.from({ length: 40 }, (_, i) => progress(`t-${i}`, 7, 10)),
    words,
    cards: [
      ...words.flatMap((w) => [wordCard(w, 'recognize', later), wordCard(w, 'produce', later)]),
      ...Array.from({ length: 50 }, (_, i) => card(`err-${i}`, i < 5 ? {} : later)),
    ],
    errors: Array.from({ length: 200 }, (_, i) => errorEntry(`e-${i}`)),
    settings: { lenientAccents: true },
  }
}
const DOCS = 40 + 150 + 350 + 200 + 1

test('read cost: cold device, warm reload, a short session', async ({ page }, info) => {
  test.setTimeout(90_000)
  const { a: email } = workerUsers(info)
  const report = (name: string, v: unknown) => {
    info.annotations.push({ type: `reads: ${name}`, description: JSON.stringify(v) })
    console.info(`[reads] ${name}: ${JSON.stringify(v)}`)
  }

  await answerConnectivityProbe(page.context())
  await page.goto('settings')
  const uid = await signInFresh(page, email)
  await seedServer(uid, typicalUser())

  // 1) Cold: a brand-new device (no snapshot, no Firestore cache) signs in.
  const device = await newDevice(page.context().browser()!)
  const dev = device.page
  const traffic = await FirestoreTraffic.attach(dev)
  await dev.goto('settings')
  await dev.waitForFunction(() => typeof (window as { __emuSignIn?: unknown }).__emuSignIn === 'function')
  await dev.evaluate((e) => (window as unknown as { __emuSignIn(e: string): Promise<string> }).__emuSignIn(e), email)
  await expect(syncStatus(dev)).toHaveAttribute('data-sync-status', 'synced', { timeout: 30_000 })
  await expectSnapshot(dev, uid, (d) => Object.keys(d.cards ?? {}).length === 350 && Object.keys(d.errors ?? {}).length === 200)
  const cold = traffic.reads()
  report('cold device sign-in', { ...cold, documents: DOCS })
  expect(cold.billed, 'cold start reads every document once (+ empty-result minimums)').toBeGreaterThanOrEqual(DOCS)
  expect(cold.billed, 'no document is read twice on a cold start').toBeLessThanOrEqual(DOCS + 5)

  // 2) Warm reload: same device, nothing changed on the server.
  let mark = traffic.reads()
  await dev.reload()
  await expect(syncStatus(dev)).toHaveAttribute('data-sync-status', 'synced', { timeout: 30_000 })
  await expect.poll(() => traffic.since(mark).targetsAdded).toBeGreaterThanOrEqual(5)
  await dev.waitForTimeout(1500) // let the resumed listeners settle
  const warm = { ...traffic.since(mark), resumeRequests: traffic.resumeRequests }
  report('warm reload (no server changes)', warm)
  // The client asks to resume every listener from its cached resume token. Production then bills only the changed
  // documents (0 here); the emulator ignores resume tokens and re-sends everything (`docs`), `billed` counts new
  // document versions only. NB: a resume token older than ~30 min is a full re-read in production (= cold).
  expect(warm.resumeRequests, 'the reload resumes the listeners from the persistent cache').toBeGreaterThanOrEqual(5)
  expect.soft(warm.billed, 'nothing changed: a resumed reload costs (almost) nothing').toBeLessThanOrEqual(5)

  // 3) A short session: three reviews + one setting, then idle.
  mark = traffic.reads()
  const byColBefore = traffic.docsByCollection()
  const writesBefore = traffic.writesSent
  const nav = dev.getByRole('navigation', { name: 'Основные разделы' })
  await nav.getByRole('link', { name: 'Повторение' }).click()
  await dev.getByRole('button', { name: 'Начать' }).click()
  for (let i = 0; i < 3; i++) {
    await dev.getByRole('button', { name: 'Показать ответ' }).click()
    await dev.getByRole('button', { name: /^Хорошо/ }).click()
  }
  await nav.getByRole('link', { name: 'Настройки' }).click()
  await dev.getByRole('switch', { name: 'Не учитывать ошибки в акцентах' }).click()
  await expect(syncStatus(dev)).toHaveAttribute('data-sync-status', 'synced', { timeout: 20_000 })
  await dev.waitForTimeout(1500)
  const byCol = traffic.docsByCollection()
  const session = { ...traffic.since(mark), writesSent: traffic.writesSent - writesBefore, byCollection: Object.fromEntries(Object.entries(byCol).map(([k, v]) => [k, v - (byColBefore[k] ?? 0)])) }
  report('session: 3 reviews + 1 setting (own writes echoed back)', session)
  expect.soft(session.billed, 'own writes cost ~1 read each (listener echo), no re-reads').toBeLessThanOrEqual(session.writesSent + 2)

  await traffic.detach()
  await device.close()
})
