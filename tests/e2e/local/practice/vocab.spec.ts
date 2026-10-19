/** «Практика · Словари»: index with level filter, theme page, the self-test quiz (keys / taps) and its result. */
import { expect, test } from '../../../helpers/test'
import { vocabIds, vocabTheme } from '../../../helpers/C-content'

const ID = 'saude'
const V = vocabTheme(ID)
const themes = vocabIds().map(vocabTheme)

test.describe('vocab themes', () => {
  test('index: all themes, level filter (?level=), theme page with words and a back link', async ({ app, page }) => {
    await app.goto('/practice/vocab')
    await expect(page.getByRole('navigation', { name: 'Разделы практики' }).getByRole('link', { name: /Словари/ })).toHaveAttribute('aria-current', 'page')
    const rows = app.main.getByRole('list').getByRole('link', { name: / слов/ })
    await expect(rows).toHaveCount(themes.length)
    const b1 = themes.filter((t) => t.level === 'B1').length
    await page.getByRole('group', { name: 'Фильтр по уровню' }).getByRole('button', { name: new RegExp(`^B1 ${b1}$`) }).click()
    await expect(page).toHaveURL(/\/practice\/vocab\?level=B1$/)
    await expect(rows).toHaveCount(b1)
    await page.getByRole('group', { name: 'Фильтр по уровню' }).getByRole('button', { name: /^Все / }).click()
    await expect(rows).toHaveCount(themes.length)

    await app.main.getByRole('link', { name: new RegExp(`^${V.title} `) }).click()
    await expect(page).toHaveURL(new RegExp(`/practice/vocab/${ID}$`))
    await expect(app.heading).toHaveText(V.title)
    await expect(page.getByRole('region', { name: 'Слова темы' }).getByRole('listitem')).toHaveCount(V.words.length)
    await app.main.getByRole('link', { name: 'Практика · Словари' }).first().click()
    await expect(page).toHaveURL(/\/practice\/vocab$/)
  })

  test('self-test: flip and grade every card; one «Не знаю» → result and «Повторить незнакомые»', async ({ app, page, isMobile }) => {
    test.setTimeout(90_000)
    await app.goto(`/practice/vocab/${ID}`)
    await page.getByRole('button', { name: 'Проверить себя' }).click()
    const quiz = page.getByRole('region', { name: 'Самопроверка' })
    await expect(quiz).toBeVisible()
    const n = V.words.length
    for (let i = 0; i < n; i++) {
      await expect(quiz.getByRole('progressbar', { name: `Пройдено ${i} из ${n}` })).toBeVisible()
      if (isMobile) {
        await quiz.getByRole('button', { name: 'Показать ответ' }).click()
        await quiz.getByRole('button', { name: i === 0 ? /^Не знаю/ : /^Знаю/ }).click()
      } else {
        await page.keyboard.press('Enter') // flips unless focus is on a button (then the button flips)
        await expect(quiz.getByRole('button', { name: /^Знаю/ })).toBeVisible()
        await page.keyboard.press(i === 0 ? '1' : '2')
      }
    }
    await expect(quiz.getByText(`${n - 1} / ${n}`, { exact: true })).toBeVisible()
    await expect(quiz.getByText(/^Незнакомых слов: 1 — /)).toBeVisible()
    await quiz.getByRole('button', { name: 'Повторить незнакомые (1)' }).click()
    await expect(quiz.getByRole('progressbar', { name: 'Пройдено 0 из 1' })).toBeVisible()
    await quiz.getByRole('button', { name: 'Показать ответ' }).click()
    await quiz.getByRole('button', { name: /^Знаю/ }).click()
    await expect(quiz.getByText('Все слова знакомы!')).toBeVisible()
    await quiz.getByRole('button', { name: 'Закрыть' }).click()
    await expect(quiz).toBeHidden()
  })

  test('unknown theme → not-found with a way back', async ({ app }) => {
    await app.goto('/practice/vocab/nope')
    await expect(app.main.getByRole('link', { name: /Словар/ }).first()).toBeVisible()
  })
})
