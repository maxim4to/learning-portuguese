/**
 * Full lesson of a topic that has every exercise kind in the content: keyboard only on desktop, mouse / touch
 * everywhere; mistakes → «Работа над ошибками» and review cards; the end screen; the topic status on «Курс».
 */
import { expect, test } from '../../../helpers/test'
import { ALL_KINDS_TOPIC, topic as loadTopic } from '../../../helpers/C-content'
import { CRunner } from '../../../helpers/C-runner'
import { wordPoint } from '../../../helpers/C-dom'

const T = loadTopic(ALL_KINDS_TOPIC)
const id = (n: number) => `${ALL_KINDS_TOPIC}-ex-${String(n).padStart(2, '0')}`
/** Deliberate mistakes: one typed, one order-words, one match; one «Не знаю» on a translation. */
const WRONG = [id(1), id(14), id(21)]
const SKIP = [id(16)]
const total = T.exercises.length
const correct = total - WRONG.length - SKIP.length
const pct = Math.round((correct / total) * 100)

test.describe('lesson: every exercise kind', () => {
  test('content sanity: the topic covers all eight kinds present in the content', () => {
    const kinds = new Set(T.exercises.map((e) => e.type))
    expect([...kinds].sort()).toEqual(['choice', 'fill-gap', 'listen-choice', 'listen-type', 'match', 'order-words', 'transform', 'translate-ru-pt'])
  })

  test('keyboard only: focus follows the run, Enter / Shift+Enter / digits / arrows, end screen', async ({ app, page, isMobile }) => {
    test.skip(isMobile, 'keyboard-only flow is a desktop (fine pointer) contract')
    test.setTimeout(90_000)
    const run = new CRunner(page)
    await app.goto(`/topic/${ALL_KINDS_TOPIC}?tab=exercises`)
    await expect(run.task).toBeVisible()
    // Plain page load never takes focus; the first Enter aimed at the task focuses its primary control.
    await expect(run.textFields().first()).not.toBeFocused()
    await page.keyboard.press('Enter')
    await expect(run.textFields().first()).toBeFocused()

    const answered = await run.runAll({ mode: 'keyboard', wrong: WRONG, skip: SKIP })
    expect(answered.map((e) => e.id)).toEqual(T.exercises.map((e) => e.id))

    // End screen: heading with the score, status change, one primary next step (focused), «Что дальше», mistakes.
    const result = page.getByRole('heading', { level: 2, name: new RegExp(`^Упражнения пройдены: ${correct} из ${total}`) })
    await expect(result).toBeVisible()
    await expect(page.getByText('Сохраняю…')).toBeHidden()
    const primary = page.getByRole('button', { name: /^Мини-тест · 10 вопросов/ })
    await expect(primary).toBeFocused()
    await expect(page.getByText('Статус темы:')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Что дальше' })).toBeVisible()
    await expect(page.getByRole('heading', { name: `Работа над ошибками · ${WRONG.length + SKIP.length}` })).toBeVisible()

    // Enter (focus on the primary) → the mini-test tab. ResultScreen ignores a keyboard click within BOUNCE_MS (450 ms)
    // of appearing (the held Enter of «Завершить») — a documented app timer.
    await page.waitForTimeout(500)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/tab=mini-test/)
    await expect(page.getByRole('tab', { name: /Мини-тест/ })).toHaveAttribute('aria-selected', 'true')
  })

  test('mouse / touch: whole run, accents keep focus, lookup locked until answered, results persist', async ({ app, page, isMobile }) => {
    test.setTimeout(90_000)
    const run = new CRunner(page)
    await app.goto(`/topic/${ALL_KINDS_TOPIC}`)
    await page.getByRole('tab', { name: /Упражнения/ }).click()
    await expect(page).toHaveURL(/tab=exercises/)

    await run.runAll({
      mode: 'mouse',
      wrong: WRONG,
      skip: SKIP,
      beforeAnswer: async (ex) => {
        if (ex.id === id(6)) {
          // Accent keys insert at the caret and never take focus from the field.
          const field = run.textFields().first()
          await field.click()
          await page.keyboard.type('conhe')
          await run.task.getByRole('button', { name: 'Вставить ç' }).click()
          await expect(field).toBeFocused()
          await page.keyboard.type('o')
          await expect(field).toHaveValue('conheço')
        }
        if (ex.id === id(8) && !isMobile) {
          // Lookup is locked before answering: a double click on a prompt word opens nothing.
          const pt = await wordPoint(run.task.getByText(/autocarro/).first(), 'autocarro')
          await page.mouse.dblclick(pt.x, pt.y)
        }
      },
      afterAnswer: async (ex) => {
        if (ex.id === id(8) && !isMobile) {
          await expect(page.getByRole('dialog')).toHaveCount(0)
          const pt = await wordPoint(run.task.getByText(/autocarro/).first(), 'autocarro')
          await page.mouse.dblclick(pt.x, pt.y)
          await expect(app.lookup.root).toBeVisible()
          await expect(app.lookup.root).toContainText(/autocarro/i)
          await app.lookup.close()
        }
      },
    })

    await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^Упражнения пройдены: ${correct} из ${total}`) })).toBeVisible()
    await expect(page.getByText('Сохраняю…')).toBeHidden()
    // Typed mistakes are already cards; «Не знаю» waits for consent.
    const mistakes = page.getByRole('region', { name: /Работа над ошибками/ })
    await expect(mistakes.getByText('не знаю', { exact: true })).toBeVisible()
    await expect(mistakes.getByText('Ошибки уже в повторении, «Не знаю» — добавьте сами.')).toBeVisible()

    // Progress persisted (LocalRepository): the theory tab and «Курс» show it after a reload.
    await page.reload()
    await page.getByRole('tab', { name: 'Теория' }).click()
    await expect(page.getByText(`Последний результат ${pct}% · попыток 1`)).toBeVisible()
    await app.nav.open('Курс')
    // The topic's row in its level (the «Продолжить / Подтянуть» card above the list may link to the same topic).
    const row = app.main
      .getByRole('region', { name: `Уровень ${T.level}` })
      .getByRole('link', { name: new RegExp(T.title.replace(/[()]/g, '.')) })
    await expect(row).toContainText(`${pct}%`)
    await expect(row).toContainText('Статус: Изучаю')
    const stored = await app.storageJson<Record<string, { status: string; attempts: number }>>('ptpt:v1:progress')
    expect(stored?.[ALL_KINDS_TOPIC]).toMatchObject({ status: 'learning', attempts: 1 })
    const errors = await app.storageJson<unknown[]>('ptpt:v1:errors')
    expect(errors?.length).toBe(WRONG.length + SKIP.length)
  })

  test('«Повторить ошибки» runs only the mistakes and does not change the status', async ({ app, page }) => {
    test.setTimeout(60_000)
    const run = new CRunner(page)
    await app.goto(`/topic/${ALL_KINDS_TOPIC}?tab=exercises`)
    await run.runAll({ mode: 'mouse', wrong: WRONG, skip: SKIP })
    await expect(page.getByText('Сохраняю…')).toBeHidden()
    await page.getByRole('button', { name: `Повторить ошибки (${WRONG.length + SKIP.length})` }).first().click()
    await expect(page.getByText('Упражнения: работа над ошибками').filter({ visible: true }).first()).toBeVisible()
    const redone = await run.runAll({ mode: 'mouse' })
    expect(redone.map((e) => e.id).sort()).toEqual([...WRONG, ...SKIP].sort())
    await expect(page.getByRole('heading', { level: 2, name: /^Ошибки повторены: 4 из 4/ })).toBeVisible()
    await expect(page.getByText('Повтор ошибок не меняет статус.')).toBeVisible()
    const stored = await app.storageJson<Record<string, { attempts: number }>>('ptpt:v1:progress')
    expect(stored?.[ALL_KINDS_TOPIC]?.attempts).toBe(1)
  })
})
