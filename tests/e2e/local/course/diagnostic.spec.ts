/** Diagnostic: start → stages → result; stop early; leave and resume after a reload; exit; lastDiagnosticAt. */
import { expect, test } from '../../../helpers/test'
import { diagnostic } from '../../../helpers/C-content'
import { CRunner } from '../../../helpers/C-runner'

const Q = diagnostic().questions
const perLevel = (l: string) => Q.filter((q) => q.level === l).length
const A1 = perLevel('A1')

test.describe('diagnostic', () => {
  test('first stage → «Завершить сейчас» → result with the map; dashboard and intro remember it', async ({ app, page, isMobile }) => {
    test.setTimeout(90_000)
    const run = new CRunner(page)
    await app.goto('/diagnostic')
    await expect(app.heading).toHaveText('Диагностика уровня')
    await expect(page.getByText('Вы ещё не проходили диагностику — результат появится здесь.')).toBeVisible()
    const start = page.getByRole('button', { name: 'Начать' })
    if (isMobile) await start.click()
    else {
      await expect(start).toBeFocused() // autofocus: Enter starts
      await page.keyboard.press('Enter')
    }
    await expect(page.getByText(new RegExp(`^Этап 1 из 3 · уровень A1$`)).filter({ visible: true }).first()).toBeVisible()
    const done = await run.runAll({ mode: isMobile ? 'mouse' : 'keyboard' })
    expect(done).toHaveLength(A1)
    expect(new Set(done.map((e) => e.id)).size).toBe(A1)

    // Interstitial: 100 %, the next level is the primary (focused); stop now instead.
    await expect(page.getByText('Этап 1 из 3 завершён · уровень A1')).toBeVisible()
    await expect(page.getByText(`Верно ${A1} из ${A1}`)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Дальше: уровень A2 →' })).toBeFocused()
    await page.getByRole('button', { name: /^Завершить сейчас \(A2, B1 не будут оценены\)$/ }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Результат диагностики' })).toBeVisible()
    await expect(page.getByText(new RegExp(`верно ${A1} из ${A1}`))).toBeVisible()
    await expect(page.getByText('Не оценивались: A2, B1 — диагностика остановлена раньше.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Рекомендуемый маршрут' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Карта тем' })).toBeVisible()
    const settings = await app.storageJson<{ lastDiagnosticAt?: number }>('ptpt:v1:settings')
    expect(settings?.lastDiagnosticAt).toEqual(expect.any(Number))

    // Dashboard: no onboarding / «Пройдите диагностику» any more.
    await app.nav.open('Главная')
    await expect(app.heading).toHaveText('Сегодня')
    await expect(page.getByRole('link', { name: /Пройдите диагностику/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Пройти диагностику' })).toHaveCount(0)

    // Intro: the last result with the skipped levels and «Пройти заново».
    await app.goto('/diagnostic')
    const last = page.getByRole('region', { name: 'Последний результат' })
    await expect(last).toContainText('Не оценивались: A2, B1')
    await expect(page.getByRole('button', { name: /^Пройти заново/ })).toBeVisible()
    await last.getByRole('button', { name: 'Карта тем и маршрут' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Последний результат' })).toBeVisible()
    await page.getByRole('button', { name: '← Назад' }).click()
    await expect(app.heading).toHaveText('Диагностика уровня')
  })

  test('all three stages by keyboard → full result', async ({ app, page, isMobile }) => {
    test.skip(isMobile, 'the long run is covered by keyboard on desktop; touch is covered by the first stage')
    test.setTimeout(150_000)
    const run = new CRunner(page)
    await app.goto('/diagnostic')
    await page.keyboard.press('Enter')
    for (const [i, level] of (['A1', 'A2', 'B1'] as const).entries()) {
      await expect(page.getByText(`Этап ${i + 1} из 3 · уровень ${level}`).filter({ visible: true }).first()).toBeVisible()
      // One wrong answer per stage (the first task) — still far above the stop threshold.
      const first = await run.currentId()
      const done = await run.runAll({ mode: 'keyboard', wrong: [first] })
      expect(done).toHaveLength(perLevel(level))
      if (level !== 'B1') {
        const go = page.getByRole('button', { name: `Дальше: уровень ${level === 'A1' ? 'A2' : 'B1'} →` })
        await expect(go).toBeFocused()
        await page.keyboard.press('Enter')
        await expect(page.getByText(`Этап ${i + 2} из 3 · уровень`).filter({ visible: true }).first()).toBeVisible()
      }
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Результат диагностики' })).toBeVisible()
    await expect(page.getByText(new RegExp(`верно ${Q.length - 3} из ${Q.length}`))).toBeVisible()
    await expect(page.getByText('Ошибки записаны в журнал (+3); карточки на повторение не создавались.')).toBeVisible()
    await expect(page.getByText(/Не оценивались/)).toHaveCount(0)
    const errors = await app.storageJson<unknown[]>('ptpt:v1:errors')
    expect(errors).toHaveLength(3)
    expect(await app.storageJson('ptpt:v1:cards')).toBeNull()
  })

  test('low first stage offers to stop; «Остановить здесь» logs the errors', async ({ app, page }) => {
    test.setTimeout(90_000)
    const run = new CRunner(page)
    await app.goto('/diagnostic')
    await page.getByRole('button', { name: 'Начать' }).click()
    await run.runAll({ mode: 'mouse', wrong: Q.filter((q) => q.level === 'A1').map((q) => q.id) })
    await expect(page.getByText(`Верно 0 из ${A1}`)).toBeVisible()
    await expect(page.getByText(/На уровне A1 много ошибок/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Остановить здесь' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Продолжить: A2' })).toBeVisible()
    await page.getByRole('button', { name: 'Остановить здесь' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Результат диагностики' })).toBeVisible()
    await expect(page.getByText(`Ошибки записаны в журнал (+${A1}); карточки на повторение не создавались.`)).toBeVisible()
  })

  test('interrupted run survives a reload and resumes; «Выйти» → «Прервать» discards it', async ({ app, page }) => {
    const run = new CRunner(page)
    await app.goto('/diagnostic')
    await page.getByRole('button', { name: 'Начать' }).click()
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const ex = await run.current()
      ids.push(ex.id)
      await run.answer(ex, 'mouse')
      await run.nextButton.click()
      await expect(run.task).not.toHaveAttribute('aria-labelledby', `${ex.id}-h`)
    }
    const fourth = await run.currentId()

    await page.reload()
    await expect(page.getByText('Незаконченная диагностика.')).toBeVisible()
    await expect(page.getByText(/Этап 1 из 3 — можно продолжить с того же места/)).toBeVisible()
    await page.getByRole('button', { name: 'Продолжить' }).click()
    await expect(page.getByRole('status').filter({ hasText: `Продолжаем с задания 4 из ${A1}.` })).toBeVisible()
    expect(await run.currentId()).toBe(fourth)

    // Exit: confirm group, «Продолжить тест» returns focus to «Выйти»; «Прервать» goes back to the intro.
    const exit = page.getByRole('button', { name: 'Выйти' })
    await exit.click()
    const confirm = page.getByRole('alertdialog', { name: 'Прервать диагностику?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Продолжить тест' }).click()
    await expect(exit).toBeFocused()
    await exit.click()
    await confirm.getByRole('button', { name: 'Прервать' }).click()
    await expect(app.heading).toHaveText('Диагностика уровня')
    await expect(page.getByText('Незаконченная диагностика.')).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('Незаконченная диагностика.')).toHaveCount(0)
  })
})
