/**
 * «Импорт списка»: separators (—, -, tab, ;), numbering and the «СЛОВА:» header, duplicates glued, lines that resolve
 * to the same lemma, words already in the dictionary, own words, skipped lines; one batch; toast undo.
 */
import { expect, test } from '../../../helpers/test'
import { DICT_SEED } from '../../../fixtures/d-words'
import { storedCards, storedWords, toastBox } from '../../../helpers/d-dict'

const LIST = [
  'СЛОВА:',
  '1. o pequeno-almoço — завтрак',
  '2. levantar-se - вставать',
  'a chávena\tчашка',
  'fixe; классный',
  'a saúde — здоровье',
  'xyzzyqua — моё слово',
  'sem separador',
  'levanto-me — встаю',
  'fixe; классный',
].join('\n')

test('paste → preview → add the picked rows in one batch → undo', async ({ app, page, seed }) => {
  await seed(DICT_SEED)
  await app.goto('/words')
  await page.getByRole('button', { name: 'Импорт списка' }).click()
  const dlg = page.getByRole('dialog', { name: 'Импорт списка' })
  const text = dlg.getByRole('textbox', { name: 'Список слов' })
  await expect(text).toBeFocused()
  await expect(dlg.getByRole('button', { name: 'Разобрать' })).toBeDisabled()
  await text.fill(LIST)
  await expect(dlg.getByText(/Строк со словами: 7 · повторы склеены · без разделителя или перевода: 1/)).toBeVisible()
  await dlg.getByRole('button', { name: 'Разобрать (7)' }).click()

  const rows = dlg.getByRole('list', { name: 'Разбор списка' }).getByRole('listitem')
  await expect(rows).toHaveCount(7)
  await expect(dlg.getByRole('status').filter({ hasText: 'Найдено в словаре приложения' })).toHaveText(
    /Найдено в словаре приложения: 4 · своих слов: 1 · уже в моём словаре: 1/,
  )
  const row = (t: string) => rows.filter({ hasText: t })
  await expect(row('o pequeno-almoço')).toContainText('найдено')
  await expect(row('xyzzyqua')).toContainText('своё слово')
  await expect(row('a saúde')).toContainText('В словаре')
  await expect(row('a saúde').getByRole('checkbox')).not.toBeChecked()
  await expect(row('levanto-me')).toContainText('То же слово, что в строке')
  await expect(row('levanto-me')).toContainText('повтор')
  await dlg.getByText('Пропущено строк: 1').click()
  await expect(dlg.getByText(/Строка \d+: sem separador — нет разделителя/)).toBeVisible()

  // Untick the own word.
  await row('xyzzyqua').getByRole('checkbox').uncheck()
  const add = dlg.getByRole('button', { name: /^Добавить \d+ слов/ })
  const label = (await add.textContent())!
  const n = Number(label.match(/\d+/)![0])
  await add.click()
  await expect(dlg).toBeHidden()
  await expect(toastBox(page)).toContainText(`Добавлено в словарь: ${n}`)
  const words = await storedWords(page)
  expect(words['pequeno-almoço#noun']?.sources.at(-1)?.src).toBe('manual:tutor')
  expect(words['levantar-se#verb']).toBeTruthy()
  expect(words['chávena#noun']).toBeTruthy()
  expect(words['u:xyzzyqua']).toBeUndefined()
  expect((await storedCards(page))['lex:chávena#noun:recognize']).toBeTruthy()

  await toastBox(page).getByRole('button', { name: 'Отменить' }).click()
  await expect.poll(async () => Object.keys(await storedWords(page)).sort()).toEqual(DICT_SEED.words!.map((w) => w.id).sort())
})

test('«Назад» keeps the text; nothing picked disables «Добавить»', async ({ app, page }) => {
  await app.goto('/words')
  await page.getByRole('button', { name: 'Импорт списка' }).click()
  const dlg = page.getByRole('dialog', { name: 'Импорт списка' })
  await dlg.getByRole('textbox', { name: 'Список слов' }).fill('a janela — окно')
  await dlg.getByRole('button', { name: 'Разобрать (1)' }).click()
  await dlg.getByRole('list', { name: 'Разбор списка' }).getByRole('checkbox').uncheck()
  await expect(dlg.getByRole('button', { name: 'Ничего не выбрано' })).toBeDisabled()
  await dlg.getByRole('button', { name: 'Назад' }).click()
  await expect(dlg.getByRole('textbox', { name: 'Список слов' })).toHaveValue('a janela — окно')
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
})
