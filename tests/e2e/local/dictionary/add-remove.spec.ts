/**
 * Saving from the lookup card: chosen meanings, «Знаю», undo (in the card and in the toast), saved state on reopen
 * and after a reload, «Открыть в словаре», the source link back to the dialogue line (anchor scroll + flash),
 * the same lemma from another form, «Сохранить этот пример», rapid double saves.
 */
import { expect, test } from '../../../helpers/test'
import { cardTitle, clickWord, injectPt, lookupCard, pressWord, storedCards, storedWords, toastBox } from '../../../helpers/d-dict'

const DIALOGUE = '/practice/situations/banco-conta'

test('save with chosen meanings → entry + PT→RU card; in-card undo; save again; reopen shows saved', async ({ app, page, isMobile }) => {
  await app.goto('/words')
  const p = await injectPt(page, 'Tenho de fazê-lo amanhã.')
  await pressWord(page, p, 'fazê-lo', { touch: isMobile })
  await cardTitle(page)
  const card = lookupCard(page)
  const chips = card.getByRole('list', { name: 'Значения в словарь:' }).getByRole('button')
  await expect(chips).toHaveCount(3)
  for (const c of await chips.all()) await expect(c).toHaveAttribute('aria-pressed', 'true')
  // None kept → explained, both actions disabled.
  for (const c of await chips.all()) await c.click()
  await expect(card.getByText('Выберите хотя бы одно значение.')).toBeVisible()
  await expect(card.getByRole('button', { name: 'В словарь' })).toBeDisabled()
  await expect(card.getByRole('button', { name: 'Знаю' })).toBeDisabled()
  await chips.first().click()
  await card.getByRole('button', { name: 'В словарь' }).click()

  await expect(card.getByText('в вашем словаре')).toBeVisible()
  await expect(card.getByText('Новое', { exact: true })).toBeVisible()
  await expect(toastBox(page)).toContainText('Добавлено в словарь: fazer')
  const words = await storedWords(page)
  expect(words['fazer#verb']).toMatchObject({ lemma: 'fazer', lexId: 'fazer#verb', ru: 'делать', pos: 'verb', sources: [{ src: 'manual', form: 'fazê-lo', sentence: 'Tenho de fazê-lo amanhã.' }] })
  const cards = await storedCards(page)
  expect(Object.keys(cards).filter((k) => k.startsWith('lex:fazer#verb'))).toEqual(['lex:fazer#verb:recognize'])

  // In-card undo (a toast under the phone's modal sheet can't be reached).
  await card.getByRole('button', { name: 'Отменить' }).click()
  await expect(card.getByRole('button', { name: 'В словарь' })).toBeVisible()
  await expect.poll(async () => Object.keys(await storedWords(page))).toEqual([])
  expect(Object.keys(await storedCards(page)).filter((k) => k.startsWith('lex:'))).toEqual([])

  await card.getByRole('button', { name: 'В словарь' }).click()
  await expect(card.getByText('в вашем словаре')).toBeVisible()
  // The chosen meanings survive the undo.
  await expect.poll(async () => (await storedWords(page))['fazer#verb']?.ru).toBe('делать')

  // Reopen after a reload: saved state, no meaning chips.
  await page.reload()
  const p2 = await injectPt(page, 'Vou fazer o jantar.')
  await pressWord(page, p2, 'fazer', { touch: isMobile })
  await cardTitle(page)
  await expect(lookupCard(page).getByText('в вашем словаре')).toBeVisible()
  await expect(lookupCard(page).getByRole('list', { name: 'Значения в словарь:' })).toHaveCount(0)
  // Text without a source: nothing to save as an example.
  await expect(lookupCard(page).getByRole('button', { name: 'Сохранить этот пример' })).toHaveCount(0)
})

test('«Сохранить этот пример» adds the new sentence as a source (source-tagged text)', async ({ app, page, isMobile }) => {
  await app.goto('/words')
  const p = await injectPt(page, 'Amanhã levanto-me cedo.', { src: 'situation:banco-conta:dialogue:0' })
  await pressWord(page, p, 'levanto-me', { touch: isMobile })
  await expect(await cardTitle(page)).toHaveText(/levanto-me.*levantar-se/)
  await lookupCard(page).getByRole('button', { name: 'В словарь' }).click()
  await expect(lookupCard(page).getByText('в вашем словаре')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(lookupCard(page)).toHaveCount(0)

  // Another form of the same lemma in another source → same entry, offer to save the example.
  const q = await injectPt(page, 'Ele levantou-se tarde.', { src: 'situation:banco-conta:dialogue:3', id: 'd-probe-2' })
  await pressWord(page, q, 'levantou-se', { touch: isMobile })
  await expect(await cardTitle(page)).toHaveText(/levantou-se.*levantar-se/)
  const card = lookupCard(page)
  await expect(card.getByText('в вашем словаре')).toBeVisible()
  await card.getByRole('button', { name: 'Сохранить этот пример' }).click()
  await expect(card.getByRole('button', { name: 'Сохранить этот пример' })).toHaveCount(0)
  await expect.poll(async () => (await storedWords(page))['levantar-se#verb']?.sources.map((s) => s.form)).toEqual(['levanto-me', 'levantou-se'])
  expect(Object.keys(await storedWords(page))).toEqual(['levantar-se#verb'])
})

test('«Знаю» saves the word as known without cards', async ({ app, page, isMobile }) => {
  await app.goto('/words')
  const p = await injectPt(page, 'Abri a janela.')
  await pressWord(page, p, 'janela', { touch: isMobile })
  await cardTitle(page)
  await lookupCard(page).getByRole('button', { name: 'Знаю' }).click()
  await expect(lookupCard(page).getByText('Знаю', { exact: true })).toBeVisible()
  await expect(toastBox(page)).toContainText('Отмечено «Знаю»: a janela')
  const w = (await storedWords(page))['janela#noun']
  expect(w).toMatchObject({ mark: 'known', lemma: 'janela', gender: 'f' })
  expect(Object.keys(await storedCards(page)).filter((k) => k.startsWith('lex:'))).toEqual([])
})

test('toast «Отменить» removes the saved word (desktop)', async ({ app, page, isMobile }) => {
  test.skip(isMobile, 'the toast is under the modal sheet on phones; the in-card undo is covered above')
  await app.goto('/words')
  const p = await injectPt(page, 'Abri a janela.')
  await clickWord(page, p, 'janela')
  await cardTitle(page)
  await lookupCard(page).getByRole('button', { name: 'В словарь' }).click()
  await expect(toastBox(page)).toContainText('Добавлено в словарь: a janela')
  await toastBox(page).getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(async () => Object.keys(await storedWords(page))).toEqual([])
  // The click outside closed the popover; reopening shows the word unsaved.
  await clickWord(page, p, 'janela')
  await cardTitle(page)
  await expect(lookupCard(page).getByRole('button', { name: 'В словарь' })).toBeVisible()
})

test('rapid double save creates one entry and one card', async ({ app, page, isMobile }) => {
  await app.goto('/words')
  const p = await injectPt(page, 'Abri a janela.')
  await pressWord(page, p, 'janela', { touch: isMobile })
  await cardTitle(page)
  const btn = lookupCard(page).getByRole('button', { name: 'В словарь' })
  await btn.evaluate((b) => {
    ;(b as HTMLButtonElement).click()
    ;(b as HTMLButtonElement).click()
  })
  await expect(lookupCard(page).getByText('в вашем словаре')).toBeVisible()
  const words = await storedWords(page)
  expect(Object.keys(words)).toEqual(['janela#noun'])
  expect(words['janela#noun'].sources).toHaveLength(1)
  expect(Object.keys(await storedCards(page)).filter((k) => k.startsWith('lex:'))).toEqual(['lex:janela#noun:recognize'])
})

test('«Открыть в словаре» → word page → source link back scrolls to the dialogue line and flashes it', async ({ app, page, isMobile }) => {
  await app.goto(DIALOGUE)
  const line = page.locator('#dlg-line-2')
  await pressWord(page, line, 'documento', { touch: isMobile })
  await cardTitle(page)
  const card = lookupCard(page)
  await card.getByRole('button', { name: 'В словарь' }).click()
  await card.getByRole('link', { name: 'Открыть в словаре' }).click()
  await expect(page).toHaveURL(/\/words\/documento%20de%20identifica/)
  await expect(app.heading).toContainText('documento de identificação')
  const src = app.main.getByRole('region', { name: 'Где встретилось' }).getByRole('link', { name: /Ситуация «.*» · реплика 3/ })
  await expect(src).toHaveAttribute('href', /\/practice\/situations\/banco-conta#dlg-line-2$/)
  await src.click()
  await expect(page).toHaveURL(/banco-conta#dlg-line-2$/)
  await expect(line).toHaveClass(/anchor-flash/)
  await expect(line).toBeInViewport()
})
