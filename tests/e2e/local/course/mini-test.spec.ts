/** Mini-test: full pass, percentage and status, attempt history, retake; low result → mistakes first. */
import { expect, test } from '../../../helpers/test'
import { ALL_KINDS_TOPIC, topic as loadTopic } from '../../../helpers/C-content'
import { CRunner } from '../../../helpers/C-runner'
import { progress } from '../../../fixtures/seed'

const T = loadTopic(ALL_KINDS_TOPIC)
const N = T.miniTest.length

test.describe('mini-test', () => {
  test('pass with 100 % → «Уверенно», next topic as the primary step, history counts attempts', async ({ app, page, isMobile }) => {
    test.setTimeout(60_000)
    const run = new CRunner(page)
    await app.goto(`/topic/${ALL_KINDS_TOPIC}?tab=mini-test`)
    if (!isMobile) await page.keyboard.press('Enter')
    const done = await run.runAll({ mode: isMobile ? 'mouse' : 'keyboard' })
    expect(done.map((e) => e.id)).toEqual(T.miniTest.map((e) => e.id))

    await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^Мини-тест: ${N} из ${N}`) })).toBeVisible()
    await expect(page.getByText('Материал усвоен уверенно.')).toBeVisible()
    await expect(page.getByText('Сохраняю…')).toBeHidden()
    // Not started → confident; no mistakes block; primary = the next topic in course order.
    const status = page.getByText('Статус темы:').locator('..')
    await expect(status).toContainText('Не начато')
    await expect(status).toContainText('Уверенно')
    await expect(page.getByRole('heading', { name: /Работа над ошибками/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /^Следующая тема: / })).toBeVisible()

    // Retake: «Пройти заново» starts a fresh run at question 1.
    await page.getByRole('button', { name: 'Пройти заново' }).click()
    await expect(run.task).toHaveAttribute('aria-labelledby', `${T.miniTest[0].id}-h`)

    // Attempt history: the theory tab reports the last result and the attempt count; stored history has the source.
    await page.getByRole('tab', { name: 'Теория' }).click()
    await expect(page.getByText('Последний результат 100% · попыток 1')).toBeVisible()
    const stored = await app.storageJson<Record<string, { history: { source: string }[] }>>('ptpt:v1:progress')
    expect(stored?.[ALL_KINDS_TOPIC]?.history.map((h) => h.source)).toEqual(['mini-test'])
  })

  test('low result → «Повторить ошибки» or the prerequisite first; status «Слабо»; second attempt adds to history', async ({ app, page, seed }) => {
    test.setTimeout(60_000)
    // An earlier attempt exists (history), the prerequisite is solid → the primary is «Повторить ошибки».
    await seed({ progress: [progress(ALL_KINDS_TOPIC, 9, 10, { source: 'mini-test' }), progress('a1-pronomes-pessoais-tratamento', 9, 10)] })
    const run = new CRunner(page)
    await app.goto(`/topic/${ALL_KINDS_TOPIC}?tab=mini-test`)
    const wrong = T.miniTest.slice(0, 6).map((e) => e.id)
    await run.runAll({ mode: 'mouse', wrong: wrong.filter((x) => !x.endsWith('mt-01')), skip: [wrong[0]] })
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^Мини-тест: ${N - 6} из ${N}`) })).toBeVisible()
    await expect(page.getByText('Сохраняю…')).toBeHidden()
    const status = page.getByText('Статус темы:').locator('..')
    await expect(status).toContainText('Уверенно')
    await expect(status).toContainText('Слабо')
    await expect(page.getByRole('button', { name: 'Повторить ошибки (6)' })).toBeFocused()
    await expect(page.getByRole('heading', { name: 'Работа над ошибками · 6' })).toBeVisible()

    await page.getByRole('tab', { name: 'Теория' }).click()
    await expect(page.getByText('Последний результат 40% · попыток 2')).toBeVisible()
  })
})
