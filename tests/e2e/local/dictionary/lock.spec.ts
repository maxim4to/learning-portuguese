/**
 * Lookup lock: exercise tasks can't be looked up until answered (the translation would give the answer away);
 * afterwards they can, and keys go to the card, not the runner, while it is open. The diagnostic is always locked
 * (doc 1.3). VocabQuiz: locked until flipped.
 */
import { expect, test } from '../../../helpers/test'
import { cardTitle, clickWord, lookupCard, pressWord } from '../../../helpers/d-dict'

const TOPIC = '/topic/a1-ser-estar?tab=exercises'

test('exercise: no lookup before the answer, lookup after; Enter stays with the open card', async ({ app, page, isMobile }) => {
  await app.goto(TOPIC)
  const task = app.exercise.task
  await expect(task).toContainText('russo, mas vivo em Portugal.')
  await expect(app.exercise.panel.locator('[data-pt-src^="exercise:"]').first()).toHaveAttribute('data-lookup', 'off')
  await pressWord(page, task, 'Portugal', { touch: isMobile })
  await expect(lookupCard(page)).toHaveCount(0)
  // Selection is ignored too.
  await app.exercise.typeAnswer('sou')
  await expect(task.getByText('Верно!')).toBeVisible()
  await expect(app.exercise.panel.locator('[data-pt-src^="exercise:"]').first()).toHaveAttribute('data-lookup', 'on')
  await pressWord(page, task, 'russo', { touch: isMobile })
  await expect(await cardTitle(page)).toHaveText(/russo/)
  if (!isMobile) {
    // Enter while the popover is open does not move the runner on.
    await page.keyboard.press('Enter')
    await expect(task).toContainText('Eu sou russo')
    await page.keyboard.press('Escape')
    await expect(lookupCard(page)).toHaveCount(0)
  } else {
    await page.keyboard.press('Escape')
  }
  await app.exercise.next()
  await expect(task).toContainText('doente e não vai trabalhar')
  await expect(app.exercise.panel.locator('[data-pt-src^="exercise:"]').first()).toHaveAttribute('data-lookup', 'off')
})

test('exercise: selecting text of a locked task offers no chip', async ({ app, page, isMobile }) => {
  test.skip(isMobile, 'desktop chip')
  await app.goto(TOPIC)
  const task = app.exercise.task
  await expect(task).toContainText('russo, mas vivo')
  await task.getByText(/russo, mas vivo/).first().dblclick()
  await expect(page.getByRole('button', { name: /Перевести и добавить в словарь/ })).toHaveCount(0)
  await expect(lookupCard(page)).toHaveCount(0)
})

test('diagnostic: lookup stays off even after an answer', async ({ app, page }) => {
  await app.goto('/diagnostic')
  await page.getByRole('button', { name: 'Начать' }).click()
  // Items are picked at random; the first ones are A1 choices.
  const radio = app.main.getByRole('radio').first()
  const box = app.main.getByRole('textbox', { name: /Ваш ответ/ }).first()
  await expect(radio.or(box)).toBeVisible()
  if (await radio.count()) await radio.click()
  else {
    await box.fill('xxx')
    await box.press('Enter')
  }
  await expect(app.main.getByRole('button', { name: /^(Дальше|Завершить)/ }).first()).toBeVisible()
  // Regression D-08 (doc 1.3): the diagnostic measures the level — lookup stays off after the answer too.
  await expect(page.locator('main [data-lookup="on"]')).toHaveCount(0)
})

test('VocabQuiz: locked until the card is flipped', async ({ app, page }) => {
  await app.goto('/practice/vocab/saude')
  await page.getByRole('button', { name: 'Проверить себя' }).click()
  const quiz = page.getByRole('region', { name: 'Самопроверка' })
  await expect(quiz).toHaveAttribute('data-lookup', 'off')
  await quiz.getByRole('button', { name: /Показать ответ/ }).click()
  await expect(quiz).toHaveAttribute('data-lookup', 'on')
})

test('review exercise cards (errors) are locked before the answer', async ({ app, page, seed, isMobile }) => {
  const { card, fsrs, NOW, DAY } = await import('../../../fixtures/seed')
  await seed({ cards: [card('error:a1-ser-estar-ex-01', { kind: 'error', exerciseId: 'a1-ser-estar-ex-01', topicId: 'a1-ser-estar', fsrs: fsrs({ due: NOW - DAY }) })] })
  await app.goto('/review')
  await page.getByRole('button', { name: 'Начать' }).click()
  const box = page.locator('[data-pt-src="exercise:a1-ser-estar-ex-01"]')
  await expect(box).toHaveAttribute('data-lookup', 'off')
  await pressWord(page, box, 'Portugal', { touch: isMobile })
  await expect(lookupCard(page)).toHaveCount(0)
  const field = page.getByRole('textbox', { name: /Ваш ответ/ }).first()
  await field.click()
  await field.fill('sou')
  await field.press('Enter')
  await expect(box).toHaveAttribute('data-lookup', 'on')
  if (!isMobile) {
    await page.waitForTimeout(400) // post-answer auto-scroll (ReviewSession, documented timer; see D-07)
    await clickWord(page, box, 'Portugal')
    await cardTitle(page)
  }
})
