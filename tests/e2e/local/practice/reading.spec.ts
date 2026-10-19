/** «Практика · Чтение»: index with level filter, text page (audio buttons, glossary), comprehension questions → result. */
import { expect, test } from '../../../helpers/test'
import { reading as loadReading, readingIds } from '../../../helpers/C-content'
import { CRunner } from '../../../helpers/C-runner'

const ID = 'a2-a-minha-rotina'
const R = loadReading(ID)
const texts = readingIds().map(loadReading)

test.describe('reading', () => {
  test('index: every text, level filter, open a text; audio buttons do not crash', async ({ app, page }) => {
    await app.goto('/practice/reading')
    const rows = app.main.getByRole('list').getByRole('link', { name: / абзац/ })
    await expect(rows).toHaveCount(texts.length)
    const b2 = texts.filter((t) => t.level === 'B2').length
    await page.getByRole('group', { name: 'Фильтр по уровню' }).getByRole('button', { name: new RegExp(`^B2 ${b2}$`) }).click()
    await expect(page).toHaveURL(/\/practice\/reading\?level=B2$/)
    await expect(rows).toHaveCount(b2)
    await page.goBack() // the filter replaced the entry: Back leaves «Чтение»
    await expect(page).not.toHaveURL(/\/practice\/reading/)

    await app.goto(`/practice/reading/${ID}`)
    await expect(app.heading).toHaveText(R.title)
    await expect(page.getByRole('button', { name: /^Прослушать абзац \d+$/ })).toHaveCount(R.paragraphs.length)
    await page.getByRole('button', { name: 'Прослушать абзац 1', exact: true }).click()
    await page.getByRole('button', { name: /Прочитать весь текст|Стоп|Остановить/ }).first().click()
    await expect(page.getByRole('region', { name: 'Словарик' }).getByRole('listitem')).toHaveCount(R.glossary.length)
    await app.main.getByRole('link', { name: 'Практика · Чтение' }).first().click()
    await expect(page).toHaveURL(/\/practice\/reading$/)
  })

  test('questions: answer all (one wrong) → «Вопросы к тексту» result, status, retry the mistake', async ({ app, page, isMobile }) => {
    test.setTimeout(60_000)
    const run = new CRunner(page)
    await app.goto(`/practice/reading/${ID}`)
    await page.getByRole('button', { name: 'Ответить на вопросы' }).click()
    const wrong = [R.questions[0].id]
    const done = await run.runAll({ mode: isMobile ? 'mouse' : 'keyboard', wrong })
    expect(done.map((e) => e.id)).toEqual(R.questions.map((q) => q.id))
    const n = R.questions.length
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^Вопросы к тексту: ${n - 1} из ${n}`) })).toBeVisible()
    await expect(page.getByText('Статус текста:')).toBeVisible()
    await expect(page.getByText('Сохраняю…')).toBeHidden()
    await expect(page.getByRole('link', { name: 'К текстам' })).toBeVisible()

    await page.getByRole('button', { name: 'Повторить ошибки (1)' }).click()
    const again = await run.runAll({ mode: 'mouse' })
    expect(again.map((e) => e.id)).toEqual(wrong)
    await expect(page.getByRole('heading', { level: 2, name: /^Ошибки повторены: 1 из 1/ })).toBeVisible()

    // Progress keyed by the text id; the index shows it after a reload.
    const stored = await app.storageJson<Record<string, { attempts: number; status: string }>>('ptpt:v1:progress')
    expect(stored?.[ID]).toMatchObject({ attempts: 1, status: 'confident' })
  })
})
