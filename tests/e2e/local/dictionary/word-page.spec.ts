/**
 * /words/:id: meanings, sources with links, the four card modes with unlock hints, facts, themes, «Другие слова
 * темы» (+ в словарь), «Знаю — не учить» / «Учить снова», delete (→ /words), unknown id, edit from the header.
 */
import { expect, test } from '../../../helpers/test'
import { DICT_SEED, comprar, saude, xaroposo } from '../../../fixtures/d-words'
import { fakeSpeech, storedCards, storedWords, toastBox } from '../../../helpers/d-dict'
import type { Page } from '@playwright/test'

const href = (id: string) => `/words/${encodeURIComponent(id)}`
const region = (page: Page, name: string) => page.getByRole('main').getByRole('region', { name })
const STEP: Record<string, number> = { 'PT → RU': 1, 'RU → PT': 2, 'Пропуск в предложении': 3, 'На слух': 4 }
const modeRow = (page: Page, label: string) => region(page, 'Карточки').getByRole('listitem').filter({ hasText: `Шаг ${STEP[label]}: ${label}` })

test.beforeEach(async ({ seed, page }) => {
  await fakeSpeech(page, { ptVoice: true })
  await seed(DICT_SEED)
})

test('learning word: meanings, source link, staged modes with hints, facts', async ({ app, page }) => {
  await app.goto(href(comprar.id))
  await expect(app.heading).toHaveText('comprar')
  await expect(region(page, 'Перевод')).toContainText('покупать')
  const src = region(page, 'Где встретилось')
  await expect(src.getByRole('link', { name: /Ситуация «.+» · реплика 4/ })).toHaveAttribute('href', /banco-conta#dlg-line-3$/)
  await expect(src).toContainText('Ontem comprei pão na padaria.')
  await expect(src).toContainText('Вчера я купил хлеб в булочной.')

  const cards = region(page, 'Карточки')
  await expect(cards).toContainText('1 из 4 · открываются по очереди')
  await expect(modeRow(page, 'PT → RU')).toContainText('Пора повторить')
  // produce: recognize already in Review → condition met, created after the next review.
  await expect(modeRow(page, 'RU → PT')).toContainText('Условие выполнено — карточка появится после следующего повторения')
  await expect(modeRow(page, 'RU → PT')).toContainText('скоро')
  await expect(modeRow(page, 'Пропуск в предложении')).toContainText('Откроется, когда PT → RU держится ≥ 4 дней')
  await expect(modeRow(page, 'На слух')).toContainText('закрыта')

  const facts = page.getByRole('complementary', { name: 'О слове' })
  await expect(facts).toContainText('Учу')
  await expect(facts).toContainText('глагол')
  await expect(facts.getByText('Карточек').locator('xpath=following-sibling::dd[1]')).toHaveText('1')
})

test('new noun from a theme: «Есть в темах», «Другие слова темы» → + в словарь turns into ✓', async ({ app, page }) => {
  await app.goto(href(saude.id))
  await expect(app.heading).toHaveText('a saúde')
  await expect(modeRow(page, 'RU → PT')).toContainText('Откроется после первого успешного повторения PT → RU')
  const facts = page.getByRole('complementary', { name: 'О слове' })
  await expect(facts.getByRole('link', { name: 'Здоровье и медицина' })).toHaveAttribute('href', /\/practice\/vocab\/saude$/)
  const other = region(page, 'Другие слова темы')
  await expect(other.getByRole('listitem')).toHaveCount(5)
  await expect(other).not.toContainText('a saúde —')
  const add = other.getByRole('button', { name: /^Добавить «.+» в словарь$/ }).first()
  const name = (await add.getAttribute('aria-label'))!.match(/«(.+)»/)![1]
  await add.click()
  await expect(other.getByRole('button', { name: `«${name}» уже в словаре` })).toBeDisabled()
  await expect(other.getByRole('listitem')).toHaveCount(5)
  await expect.poll(async () => Object.values(await storedWords(page)).some((w) => w.sources.some((s) => s.src === 'vocab:saude') && w.id !== saude.id)).toBe(true)
})

test('own word: no lexicon note with Infopédia / Priberam; cloze unavailable without a sentence', async ({ app, page }) => {
  await app.goto(href(xaroposo.id))
  await expect(region(page, 'Перевод')).toContainText('Этого слова нет в словаре приложения — перевод ваш.')
  await expect(region(page, 'Перевод').getByRole('link', { name: /Priberam/ })).toHaveAttribute('href', 'https://dicionario.priberam.org/xaroposo')
  await expect(modeRow(page, 'Пропуск в предложении')).toContainText('Нужен пример из источника')
  await expect(region(page, 'Где встретилось')).toContainText('Добавлено вручную')
})

test('«Знаю — не учить» suspends cards, «Учить снова» resumes; header edit; delete → /words with undo', async ({ app, page }) => {
  await app.goto(href(comprar.id))
  const facts = page.getByRole('complementary', { name: 'О слове' })
  await facts.getByRole('button', { name: 'Знаю — не учить' }).click()
  await expect(toastBox(page)).toContainText('Отмечено как известное: comprar')
  await expect(page.getByRole('main').getByText('Знаю', { exact: true }).first()).toBeVisible()
  await expect(modeRow(page, 'PT → RU')).toContainText('Приостановлена')
  await expect(modeRow(page, 'RU → PT')).toContainText('Слово отмечено как известное')
  await facts.getByRole('button', { name: 'Учить снова' }).click()
  await expect(modeRow(page, 'PT → RU')).toContainText('Пора повторить')

  await page.getByRole('button', { name: 'Изменить' }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Изменить слово' })
  // Switching a mode off for this word.
  await dlg.getByRole('checkbox', { name: /RU → PT/ }).uncheck()
  await dlg.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dlg).toBeHidden()
  await expect(modeRow(page, 'RU → PT')).toContainText('Выключено для этого слова')

  await facts.getByRole('button', { name: 'Удалить из словаря' }).click()
  await expect(page).toHaveURL(/\/words$/)
  await expect(toastBox(page)).toContainText('Удалено из словаря: comprar')
  expect((await storedWords(page))[comprar.id]).toBeUndefined()
  expect((await storedCards(page))[`lex:${comprar.id}:recognize`]).toBeUndefined()
  await toastBox(page).getByRole('button', { name: 'Отменить' }).click()
  await expect(page.getByRole('list', { name: 'Слова' }).getByRole('link', { name: 'comprar' })).toBeVisible()
  // FSRS progress came back with the undo.
  expect((await storedCards(page))[`lex:${comprar.id}:recognize`]?.fsrs.state).toBe(2)
})

test('unknown id: «Слово не найдено» with a way back', async ({ app, page }) => {
  await app.goto('/words/nope%23noun')
  await expect(app.heading).toHaveText('Слово не найдено')
  await page.getByRole('main').getByRole('link', { name: 'Открыть словарь' }).click()
  await expect(page).toHaveURL(/\/words$/)
})
