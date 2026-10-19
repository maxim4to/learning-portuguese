/**
 * Topic page: the five tabs (?tab= in the URL, arrows, deep links on reload), the theory side plan, examples with
 * per-row «Добавить / Убрать» to review, the agent tab, unknown and not-yet-written topics, back / forward.
 */
import { expect, test } from '../../../helpers/test'
import { topic as loadTopic } from '../../../helpers/C-content'
import { card, fsrs, progress } from '../../../fixtures/seed'

const ID = 'a1-ser-estar'
const T = loadTopic(ID)
const TABS = [
  ['Теория', null],
  ['Примеры', 'examples'],
  [/Упражнения/, 'exercises'],
  [/Мини-тест/, 'mini-test'],
  [/С агентом/, 'tutor'],
] as const

test.describe('topic page tabs', () => {
  test('every tab: URL ?tab=, selected state, its panel; reload keeps the tab', async ({ app, page }) => {
    await app.goto(`/topic/${ID}`)
    await expect(app.heading).toHaveText(T.title)
    const tablist = page.getByRole('tablist', { name: 'Разделы темы' })
    await expect(tablist.getByRole('tab')).toHaveCount(5)
    for (const [name, param] of TABS) {
      const tab = tablist.getByRole('tab', { name })
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      if (param) await expect(page).toHaveURL(new RegExp(`\\?tab=${param}$`))
      else await expect(page).not.toHaveURL(/tab=/)
      await expect(page.getByRole('tabpanel')).toHaveCount(1) // hidden panels stay mounted but are not exposed
    }
    // Deep link on reload: the agent tab.
    await page.reload()
    await expect(tablist.getByRole('tab', { name: /С агентом/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Скопировать промпт' })).toBeVisible()
    // Unknown ?tab= falls back to theory.
    await app.goto(`/topic/${ID}?tab=nope`)
    await expect(tablist.getByRole('tab', { name: 'Теория' })).toHaveAttribute('aria-selected', 'true')
  })

  test('keyboard: ←/→/Home/End move between tabs (roving tabindex)', async ({ app, page, isMobile }) => {
    test.skip(isMobile, 'hardware keyboard')
    await app.goto(`/topic/${ID}`)
    const tablist = page.getByRole('tablist', { name: 'Разделы темы' })
    const tab = (name: string | RegExp) => tablist.getByRole('tab', { name })
    // Each key: focus and selection move together (automatic activation); wait for the selection before the next key.
    const press = async (key: string, name: string | RegExp) => {
      await page.keyboard.press(key)
      await expect(tab(name)).toBeFocused()
      await expect(tab(name)).toHaveAttribute('aria-selected', 'true')
    }
    await tab('Теория').focus()
    await press('ArrowRight', 'Примеры')
    await expect(page).toHaveURL(/tab=examples/)
    await press('End', /С агентом/)
    await press('ArrowRight', 'Теория') // wraps
    await press('ArrowLeft', /С агентом/)
    await press('Home', 'Теория')
    await expect(page).not.toHaveURL(/tab=/)
  })

  test('theory: plan with counts and «Тема ещё не начата» → with progress shows the last result', async ({ app, page, seed }) => {
    await seed({ progress: [progress(ID, 7, 10)] })
    await app.goto(`/topic/${ID}`)
    const plan = page.getByRole('complementary', { name: 'План темы' })
    await expect(plan).toContainText('Последний результат 70% · попыток 1')
    await expect(plan).toContainText(`${T.examples.length} примеров`)
    await expect(plan).toContainText(`${T.exercises.length} задани`)
    await plan.getByRole('button', { name: 'К упражнениям' }).click()
    await expect(page).toHaveURL(/tab=exercises/)
    // The examples tab's «К упражнениям» goes to the exercises too.
    await page.getByRole('tab', { name: 'Примеры' }).click()
    await page.getByRole('tabpanel').getByRole('button', { name: 'К упражнениям' }).click()
    await expect(page.getByRole('tab', { name: /Упражнения/ })).toHaveAttribute('aria-selected', 'true')
  })

  test('examples: per-row add → «В повторении» + toast «Отменить»; remove; card with history asks first', async ({ app, page, seed }) => {
    // Example 1 is already a card with review history (removal asks), the others are not cards yet.
    await seed({ cards: [card(`ex:${ID}:1`, { kind: 'grammar', front: T.examples[1].ru, back: T.examples[1].pt, topicId: ID, fsrs: fsrs({ reps: 2 }) })] })
    await app.goto(`/topic/${ID}?tab=examples`)
    const panel = page.getByRole('tabpanel')
    const bar = panel.getByText(/^В повторении: \d+ из/)
    await expect(bar).toHaveText(`В повторении: 1 из ${T.examples.length} примеров`)

    const add0 = panel.getByRole('button', { name: `Добавить в повторение: «${T.examples[0].pt}»` }).filter({ visible: true })
    await add0.click()
    const remove0 = panel.getByRole('button', { name: `Убрать из повторения: «${T.examples[0].pt}»` }).filter({ visible: true })
    await expect(remove0).toBeVisible()
    await expect(bar).toHaveText(`В повторении: 2 из ${T.examples.length} примеров`)
    // Undo from the toast removes it again.
    await page.getByRole('button', { name: 'Отменить' }).click()
    await expect(add0).toBeVisible()
    await expect(bar).toHaveText(`В повторении: 1 из ${T.examples.length} примеров`)

    // Add again, then «Убрать» removes at once (never reviewed).
    await add0.click()
    await expect(remove0).toBeVisible()
    await remove0.click()
    await expect(add0).toBeVisible()

    // A card with review history: confirm dialog; «Оставить» keeps it, «Убрать» deletes.
    const remove1 = panel.getByRole('button', { name: `Убрать из повторения: «${T.examples[1].pt}»` }).filter({ visible: true })
    await remove1.click()
    const dlg = page.getByRole('alertdialog', { name: 'Убрать из повторения?' })
    await expect(dlg).toContainText('уже повторялась (2 раза)')
    await dlg.getByRole('button', { name: 'Оставить' }).click()
    await expect(dlg).toBeHidden()
    await expect(remove1).toBeVisible()
    await remove1.click()
    await dlg.getByRole('button', { name: 'Убрать' }).click()
    await expect(panel.getByRole('button', { name: `Добавить в повторение: «${T.examples[1].pt}»` }).filter({ visible: true })).toBeVisible()
    await expect(bar).toHaveCount(0)

    // Persisted: adding survives a reload and is visible on /review.
    await add0.click()
    await expect(remove0).toBeVisible()
    await page.reload()
    await expect(remove0).toBeVisible()
    const cards = await app.storageJson<Record<string, { kind: string }>>('ptpt:v1:cards')
    expect(Object.keys(cards ?? {})).toEqual([`ex:${ID}:0`])
  })

  test('agent tab: mark a session done with a self-assessment → saved to progress', async ({ app, page }) => {
    await app.goto(`/topic/${ID}?tab=tutor`)
    const done = page.getByRole('region', { name: 'Отметить пройденным' })
    const save = done.getByRole('button', { name: 'Отметить пройденным' })
    await expect(save).toBeDisabled()
    await done.getByRole('radio', { name: /Нормально/ }).click()
    await expect(save).toBeEnabled()
    await done.getByRole('textbox', { name: 'Что повторить (необязательно)' }).fill('Итог: 8/10 · ser vs estar')
    await expect(done.getByText('Найден итог агента: 8/10')).toBeVisible()
    await save.click()
    await expect(done.getByRole('status')).toHaveText(/^Занятие засчитано: 8\/10 · статус: /)
    await expect(done.getByText('Прошлые занятия с агентом')).toBeVisible()
    const stored = await app.storageJson<Record<string, { history: { source: string }[] }>>('ptpt:v1:progress')
    expect(stored?.[ID]?.history.at(-1)?.source).toBe('tutor')
  })

  test('unknown topic → «Тема не найдена» with a way back (every syllabus topic has content)', async ({ app, page }) => {
    await app.goto('/topic/no-such-topic')
    await expect(page.getByText('Тема не найдена')).toBeVisible()
    await expect(page.getByText('no-such-topic')).toBeVisible()
    await page.getByRole('link', { name: 'К курсу' }).click()
    await expect(page).toHaveURL(/\/syllabus$/)
  })

  test('back link and browser back/forward between the course and topics', async ({ app, page }) => {
    await app.goto('/syllabus')
    await app.main.getByRole('link', { name: /Ser и estar/ }).first().click()
    await expect(app.heading).toHaveText(T.title)
    await page.getByRole('tab', { name: /Упражнения/ }).click()
    await expect(page).toHaveURL(/tab=exercises/)
    // Tabs replace the history entry: Back leaves the topic.
    await page.goBack()
    await expect(page).toHaveURL(/\/syllabus$/)
    await page.goForward()
    await expect(page).toHaveURL(/\/topic\/a1-ser-estar\?tab=exercises$/)
    await expect(page.getByRole('tab', { name: /Упражнения/ })).toHaveAttribute('aria-selected', 'true')
    // The header back link «Курс».
    await app.main.getByRole('link', { name: /Курс/ }).first().click()
    await expect(page).toHaveURL(/\/syllabus$/)
  })
})
