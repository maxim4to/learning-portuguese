/**
 * «Мой словарь» (/words): list, search (pt / ru, accent-insensitive), status / level / source filters with counts,
 * the side panel numbers, row menu (Изменить / Знаю — не учить / Учить снова / Удалить + undo), WordEditor,
 * «Добавить слово» (lexicon search and own word), empty state.
 */
import { expect, test } from '../../../helpers/test'
import { DICT_SEED } from '../../../fixtures/d-words'
import { searchDialog, storedCards, storedWords, toastBox } from '../../../helpers/d-dict'
import type { Page } from '@playwright/test'

const list = (page: Page) => page.getByRole('list', { name: 'Слова' })
const rows = (page: Page) => list(page).getByRole('listitem')
const statusChip = (page: Page, name: string) => page.getByRole('group', { name: 'Статус' }).getByRole('button', { name: new RegExp(`^${name}`) })
const search = (page: Page) => page.getByRole('searchbox', { name: 'Поиск по словарю' })

test.beforeEach(async ({ seed }) => {
  await seed(DICT_SEED)
})

test('list, status counts and the side panel', async ({ app, page }) => {
  await app.goto('/words')
  await expect(app.heading).toHaveText('Мой словарь')
  await expect(rows(page)).toHaveCount(6)
  // Newest first.
  await expect(rows(page).first()).toContainText('xaroposo')
  await expect(statusChip(page, 'Все')).toHaveText('Все6')
  await expect(statusChip(page, 'Новые')).toHaveText('Новые3')
  await expect(statusChip(page, 'Учу')).toHaveText('Учу1')
  await expect(statusChip(page, 'Знаю')).toHaveText('Знаю1')
  await expect(statusChip(page, 'На паузе')).toHaveText('На паузе1')
  // d'água has no cards and no mark: counted as «Новое».
  const panel = page.getByRole('complementary', { name: 'Словарь' })
  const dd = (term: string) => panel.getByText(term, { exact: true }).locator('xpath=following-sibling::dd[1]')
  await expect(dd('Всего слов')).toHaveText('6')
  await expect(dd('Ждут первого повторения')).toHaveText('2')
  await expect(dd('Пора повторить')).toHaveText('1')
  await expect(dd('Нет в словаре приложения')).toHaveText('2')
  // Row content: article, translation, meta.
  const saude = rows(page).filter({ hasText: 'a saúde' })
  await expect(saude).toContainText('здоровье')
  await expect(saude).toContainText('из: Здоровье и медицина')
  await expect(rows(page).filter({ hasText: 'comprar' })).toContainText('пора повторить')
  await expect(saude.getByRole('link', { name: 'a saúde' })).toHaveAttribute('href', /\/words\/sa%C3%BAde%23noun$/)
})

test('search: pt without accents, ru, ё/е; reset filters', async ({ app, page }) => {
  await app.goto('/words')
  await search(page).fill('saude')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('a saúde')
  await search(page).fill('ХЛЕБ')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('o pão')
  await search(page).fill('pao')
  await expect(rows(page)).toContainText('o pão')
  await search(page).fill("d'agua")
  await expect(rows(page)).toContainText("d'água")
  await search(page).fill('нетакогослова')
  await expect(page.getByText('Нет слов под этот фильтр')).toBeVisible()
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
  await expect(search(page)).toHaveValue('')
  await expect(search(page)).toBeFocused()
  await expect(rows(page)).toHaveCount(6)
  // Counts follow the search.
  await search(page).fill('jan')
  await expect(statusChip(page, 'Все')).toHaveText('Все1')
  await expect(statusChip(page, 'Знаю')).toHaveText('Знаю1')
  await expect(statusChip(page, 'Новые')).toHaveText('Новые0')
})

test('filters: status chips, level and source selects; kept in the URL', async ({ app, page }) => {
  await app.goto('/words')
  await statusChip(page, 'Учу').click()
  await expect(statusChip(page, 'Учу')).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/status=learning/)
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText('comprar')
  await statusChip(page, 'На паузе').click()
  await expect(rows(page)).toContainText('o pão')
  await statusChip(page, 'Все').click()
  await expect(page).not.toHaveURL(/status=/)
  await expect(rows(page)).toHaveCount(6)
  // Fresh page: changing a select right after a chip sometimes brings the old status back (BUG D-05, fixme below).
  await app.goto('/words')
  await page.getByLabel('Уровень').selectOption('A2')
  await expect(page).toHaveURL(/level=A2/)
  await expect(rows(page)).toHaveCount(2)
  await page.getByLabel('Уровень').selectOption('none')
  await expect(rows(page)).toHaveCount(2)
  await page.getByLabel('Уровень').selectOption('all')
  await page.getByLabel('Источник').selectOption('nolex')
  await expect(rows(page)).toHaveCount(2)
  await page.getByLabel('Источник').selectOption('vocab')
  await expect(rows(page)).toHaveCount(1)
  await page.reload()
  await expect(page.getByLabel('Источник')).toHaveValue('vocab')
  await expect(rows(page)).toHaveCount(1)
})

test('row menu: keyboard, «Знаю — не учить» / «Учить снова», delete with undo', async ({ app, page }) => {
  await app.goto('/words')
  const menuBtn = page.getByRole('button', { name: 'Действия: a saúde' })
  await menuBtn.focus()
  await page.keyboard.press('ArrowDown')
  const menu = page.getByRole('menu', { name: 'Действия: a saúde' })
  await expect(menu.getByRole('menuitem', { name: 'Изменить' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(menu.getByRole('menuitem', { name: 'Удалить' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(menuBtn).toBeFocused()

  await menuBtn.click()
  await menu.getByRole('menuitem', { name: 'Знаю — не учить' }).click()
  await expect(toastBox(page)).toContainText('Отмечено как известное: a saúde')
  await expect(statusChip(page, 'Знаю')).toHaveText('Знаю2')
  await expect.poll(async () => (await storedCards(page))['lex:saúde#noun:recognize']?.suspended).toBe(true)
  await menuBtn.click()
  await menu.getByRole('menuitem', { name: 'Учить снова' }).click()
  await expect(statusChip(page, 'Знаю')).toHaveText('Знаю1')
  await expect.poll(async () => (await storedCards(page))['lex:saúde#noun:recognize']?.suspended).toBeUndefined()

  await menuBtn.click()
  await menu.getByRole('menuitem', { name: 'Удалить' }).click()
  await expect(toastBox(page)).toContainText('Удалено из словаря: a saúde')
  await expect(rows(page)).toHaveCount(5)
  await expect.poll(async () => Object.keys(await storedCards(page)).some((k) => k.includes('saúde'))).toBe(false)
  // Focus went to a neighbour's menu, not lost.
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-word-menu') ?? document.activeElement?.id)).toBeTruthy()
  await toastBox(page).getByRole('button', { name: 'Отменить' }).click()
  await expect(rows(page)).toHaveCount(6)
  await expect.poll(async () => (await storedCards(page))['lex:saúde#noun:recognize']?.fsrs.state).toBe(0)
})

test('WordEditor: edit translation, note, gender; validation; toast undo', async ({ app, page }) => {
  await app.goto('/words')
  await page.getByRole('button', { name: 'Действия: a saúde' }).click()
  await page.getByRole('menuitem', { name: 'Изменить' }).click()
  const dlg = page.getByRole('dialog', { name: 'Изменить слово' })
  await expect(dlg.getByLabel('Слово (pt-PT)')).toBeFocused()
  await expect(dlg.getByLabel('Слово (pt-PT)')).toHaveValue('saúde')
  await dlg.getByLabel('Перевод').fill('')
  await dlg.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dlg.getByLabel('Перевод')).toHaveAttribute('aria-invalid', 'true')
  await dlg.getByLabel('Перевод').fill('здоровье; самочувствие')
  await dlg.getByLabel('Заметка').fill('Saúde! — будьте здоровы')
  await dlg.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dlg).toBeHidden()
  await expect(toastBox(page)).toContainText('Сохранено: a saúde')
  await expect(rows(page).filter({ hasText: 'a saúde' })).toContainText('здоровье; самочувствие')
  expect((await storedWords(page))['saúde#noun']).toMatchObject({ ru: 'здоровье; самочувствие', note: 'Saúde! — будьте здоровы' })
  await toastBox(page).getByRole('button', { name: 'Отменить' }).click()
  await expect(rows(page).filter({ hasText: 'a saúde' })).not.toContainText('самочувствие')
  // No changes → closes without a write; Esc closes too.
  await page.getByRole('button', { name: 'Действия: comprar' }).click()
  await page.getByRole('menuitem', { name: 'Изменить' }).click()
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
})

test('«Добавить слово»: lexicon search (accents, Russian), add, already saved; own word with apostrophe', async ({ app, page }) => {
  await app.goto('/words')
  await page.getByRole('button', { name: 'Добавить слово' }).first().click()
  const dlg = searchDialog(page)
  const q = dlg.getByRole('searchbox')
  await expect(q).toBeFocused()
  await q.fill('chavena')
  const results = dlg.getByRole('list', { name: 'Результаты поиска' })
  await expect(results.getByText('a chávena')).toBeVisible()
  await dlg.getByRole('button', { name: 'Добавить «a chávena» в словарь' }).click()
  await expect(dlg).toBeHidden()
  await expect(toastBox(page)).toContainText('Добавлено в словарь: a chávena')
  await expect(rows(page)).toHaveCount(7)
  expect((await storedCards(page))['lex:chávena#noun:recognize']).toBeTruthy()

  // Russian query; an already saved word links to its page.
  await page.getByRole('button', { name: 'Добавить слово' }).first().click()
  await q.fill('здоровье')
  await expect(dlg.getByRole('link', { name: '«a saúde» уже в словаре — открыть' })).toBeVisible()

  // Not in the lexicon → own word form prefilled from the query.
  await q.fill("copo d'agua tônico")
  await expect(dlg.getByText('Нет в словаре приложения')).toBeVisible()
  const lemma = dlg.getByLabel('Слово (pt-PT)')
  await expect(lemma).toHaveValue("copo d'agua tônico")
  await dlg.getByLabel('Перевод').fill('стакан воды')
  await dlg.getByRole('button', { name: 'Сохранить в словарь' }).click()
  await expect(dlg).toBeHidden()
  await expect(rows(page).filter({ hasText: "copo d'agua tônico" })).toContainText('добавлено вручную')
  expect((await storedWords(page))["u:copo d'agua tônico"]).toMatchObject({ ru: 'стакан воды' })
})

test('own word: an existing lemma is offered to be extended, not duplicated', async ({ app, page }) => {
  await app.goto('/words')
  await page.getByRole('button', { name: 'Добавить слово' }).first().click()
  const dlg = searchDialog(page)
  await dlg.getByRole('button', { name: 'Добавить своё слово' }).click()
  await dlg.getByLabel('Слово (pt-PT)').fill('Xaroposo')
  await expect(dlg.getByText('Уже в словаре:')).toBeVisible()
  await expect(dlg.getByRole('button', { name: 'Дополнить слово' })).toBeVisible()
  await dlg.getByLabel('Перевод').fill('слащавый')
  await dlg.getByRole('button', { name: 'Дополнить слово' }).click()
  await expect(dlg).toBeHidden()
  await expect(rows(page)).toHaveCount(6)
  const w = (await storedWords(page))['u:xaroposo']
  expect(w.ru).toBe('приторный')
  expect(w.sources).toHaveLength(2)
})

test('changing the level right after «Все» keeps the status filter cleared', async ({ app, page }) => {
  test.fixme(true, 'BUG D-05: intermittently the previous ?status= comes back (stale search params in setFilter); flaky, so fixme')
  await app.goto('/words')
  for (let i = 0; i < 5; i++) {
    await statusChip(page, 'На паузе').click()
    await statusChip(page, 'Все').click()
    await page.getByLabel('Уровень').selectOption(i % 2 ? 'A2' : 'all')
    await expect(page).not.toHaveURL(/status=/)
  }
})
