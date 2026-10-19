/**
 * Adversarial use of the exercise runner: double clicks, fast Enter repeats, leaving mid-run and coming back
 * (resume), reload with an answered-but-not-advanced task, keys while the panel is hidden, «Начать заново».
 */
import { expect, test } from '../../../helpers/test'
import { ALL_KINDS_TOPIC, topic as loadTopic } from '../../../helpers/C-content'
import { CRunner } from '../../../helpers/C-runner'

const T = loadTopic(ALL_KINDS_TOPIC)
const total = T.exercises.length
const id = (n: number) => `${ALL_KINDS_TOPIC}-ex-${String(n).padStart(2, '0')}`
const URL = `/topic/${ALL_KINDS_TOPIC}?tab=exercises`

/** «N / M» counter of the run (phone header or desktop side panel — whichever is visible). */
const counter = (page: import('@playwright/test').Page, n: number) =>
  page.getByText(new RegExp(`^Задание ${n} / ${total}$`)).filter({ visible: true }).first()

test.describe('exercise runner robustness', () => {
  test('fast repeated Enter: checks once and does not skip the feedback', async ({ app, page, isMobile }) => {
    test.skip(isMobile, 'hardware keyboard flow')
    const run = new CRunner(page)
    await app.goto(URL)
    await page.keyboard.press('Enter') // focus the first field
    await page.keyboard.type(T.exercises[0].type === 'fill-gap' ? T.exercises[0].answer[0] : 'x')
    // Three Enters in a row: check, then two bounces inside the 250 ms «Дальше» guard.
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(run.verdict()).toHaveText('Верно!')
    expect(await run.currentId()).toBe(id(1))
    await expect(run.nextButton).toBeFocused()
  })

  /** Answers ex-01…ex-07 (fill-gaps) correctly; ex-07's verdict is on screen, ex-08 (a choice) comes next. */
  async function toLastFillGap(run: CRunner) {
    for (let i = 1; i <= 7; i++) {
      const ex = await run.current()
      await run.answer(ex, 'mouse')
      await expect(run.verdict()).toHaveText('Верно!')
      if (i < 7) {
        await run.nextButton.click()
        await expect(run.task).not.toHaveAttribute('aria-labelledby', `${ex.id}-h`)
      }
    }
  }

  test('double click on an option answers once', async ({ app, page }) => {
    const run = new CRunner(page)
    await app.goto(URL)
    await toLastFillGap(run)
    await run.nextButton.click()
    await expect(run.task).toHaveAttribute('aria-labelledby', `${id(8)}-h`)
    await run.options().first().dblclick()
    await expect(run.verdict()).toHaveText('Верно!')
    await run.nextButton.click()
    await expect(run.task).toHaveAttribute('aria-labelledby', `${id(9)}-h`)
    await expect(counter(page, 9)).toBeVisible()
  })

  test('double click on «Дальше» does not answer the next task [BUG C-01]', async ({ app, page }) => {
    test.fail(true, 'BUG C-01: docs/testing-bugs/C.md#c-01 — the 2nd click of a double click lands on the next task')
    const run = new CRunner(page)
    await app.goto(URL)
    await toLastFillGap(run)
    await run.nextButton.dblclick()
    await expect(run.task).toHaveAttribute('aria-labelledby', `${id(8)}-h`)
    await expect(run.verdict()).toHaveCount(0, { timeout: 2000 })
    await expect(run.options().first()).toBeEnabled({ timeout: 2000 })
  })

  test('choice by arrows: ↓/↑ move the roving focus, Enter answers; focus then on «Дальше»', async ({ app, page, isMobile }) => {
    test.skip(isMobile, 'hardware keyboard')
    const run = new CRunner(page)
    await app.goto(URL)
    await toLastFillGap(run)
    await page.waitForTimeout(300) // NEXT_GUARD_MS (250 ms) for a keyboard «Дальше»
    await page.keyboard.press('Enter')
    await expect(run.task).toHaveAttribute('aria-labelledby', `${id(8)}-h`)
    const ex = await run.current()
    if (ex.type !== 'choice') throw new Error('ex-08 must be a choice')
    await expect(run.options().first()).toBeFocused()
    for (let i = 0; i < ex.correct; i++) await page.keyboard.press('ArrowDown')
    await expect(run.options().nth(ex.correct)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(run.verdict()).toHaveText('Верно!')
    await expect(run.nextButton).toBeFocused()
  })

  test('leaving mid-run and coming back resumes; «Начать заново» restarts', async ({ app, page }) => {
    const run = new CRunner(page)
    await app.goto(URL)
    for (let i = 0; i < 3; i++) {
      const ex = await run.current()
      await run.answer(ex, 'mouse', i === 1 ? 'wrong' : 'correct')
      await run.nextButton.click()
      await expect(run.task).not.toHaveAttribute('aria-labelledby', `${ex.id}-h`)
    }
    await app.nav.open('Курс')
    await expect(app.heading).toHaveText('Курс')
    await page.goBack()
    await expect(page).toHaveURL(/tab=exercises/)
    await expect(page.getByRole('status').filter({ hasText: `Продолжаем с задания 4 из ${total}.` })).toBeVisible()
    expect(await run.currentId()).toBe(id(4))

    await page.getByRole('button', { name: 'Начать заново' }).click()
    await expect(page.getByText(/Продолжаем с задания/)).toBeHidden()
    expect(await run.currentId()).toBe(id(1))
    await expect(counter(page, 1)).toBeVisible()
  })

  test('reload after answering (before «Дальше») keeps the verdict and the run', async ({ app, page }) => {
    const run = new CRunner(page)
    await app.goto(URL)
    await run.answer(await run.current(), 'mouse', 'wrong')
    await expect(run.verdict()).toHaveText('Неверно')
    await page.reload()
    await expect(run.verdict()).toHaveText('Неверно')
    await expect(run.nextButton).toBeVisible()
    await run.nextButton.click()
    expect(await run.currentId()).toBe(id(2))
    // The progress list (desktop) / counter shows one done.
    await expect(counter(page, 2)).toBeVisible()
  })

  test('switching tabs mid-run keeps the run; keys on a hidden panel are ignored', async ({ app, page, isMobile }) => {
    const run = new CRunner(page)
    await app.goto(URL)
    for (let i = 0; i < 7; i++) {
      const ex = await run.current()
      await run.answer(ex, 'mouse')
      await run.nextButton.click()
      await expect(run.task).not.toHaveAttribute('aria-labelledby', `${ex.id}-h`)
    }
    expect(await run.currentId()).toBe(id(8)) // a choice: digits would answer it
    await page.getByRole('tab', { name: 'Теория' }).click()
    await expect(page).not.toHaveURL(/tab=/)
    await expect(page.locator('#topic-panel-exercises')).toBeHidden()
    await expect(page.locator('#topic-panel-theory')).toBeVisible()
    if (!isMobile) {
      await page.keyboard.press('1')
      await page.keyboard.press('Enter')
    }
    await page.getByRole('tab', { name: /Упражнения/ }).click()
    await expect(run.task).toHaveAttribute('aria-labelledby', `${id(8)}-h`)
    await expect(run.verdict()).toHaveCount(0)
    await expect(run.options().first()).toBeEnabled()
  })

  test('mini-test and lesson runs are independent', async ({ app, page }) => {
    const run = new CRunner(page)
    await app.goto(URL)
    await run.answer(await run.current(), 'mouse')
    await run.nextButton.click()
    await page.getByRole('tab', { name: /Мини-тест/ }).click()
    await expect(run.task).toHaveAttribute('aria-labelledby', `${ALL_KINDS_TOPIC}-mt-01-h`)
    await page.getByRole('tab', { name: /Упражнения/ }).click()
    await expect(run.task).toHaveAttribute('aria-labelledby', `${id(2)}-h`)
  })
})
