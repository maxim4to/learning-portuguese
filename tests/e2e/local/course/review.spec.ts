/**
 * «Повторение» with course cards: a grammar (example) flashcard and an error card reviewed as its original exercise;
 * ratings by mouse and by keys; the session summary; FSRS state persisted; error log → cards.
 */
import { expect, test } from '../../../helpers/test'
import { card, errorEntry, NOW } from '../../../fixtures/seed'
import { exerciseById, topic as loadTopic } from '../../../helpers/C-content'
import type { Page } from '@playwright/test'

const SER = loadTopic('a1-ser-estar')
const EX_ID = 'a1-ser-estar-ex-08'
const EX = exerciseById(EX_ID)
const grammar = card(`ex:${SER.id}:0`, { kind: 'grammar', front: SER.examples[0].ru, back: SER.examples[0].pt, topicId: SER.id })
const error = card(`error:${EX_ID}`, { kind: 'error', exerciseId: EX_ID, topicId: SER.id, front: 'q', back: 'a' })

/** Reviews whatever card is on screen; returns its kind. */
async function reviewOne(page: Page, keyboard: boolean): Promise<'grammar' | 'error'> {
  const exercise = page.locator('[role="group"][aria-labelledby$="-rh"]')
  const reveal = page.getByRole('button', { name: /^Показать ответ/ })
  await expect(exercise.or(reveal)).toBeVisible()
  if (await exercise.isVisible()) {
    expect(await exercise.getAttribute('aria-labelledby')).toBe(`${EX_ID}-rh`)
    await expect(page.getByText('Задание, в котором была ошибка')).toBeVisible()
    if (EX.type !== 'choice') throw new Error('expected a choice exercise')
    const options = exercise.getByRole('radiogroup', { name: 'Варианты ответа' }).getByRole('radio')
    if (keyboard) {
      await expect(options.first()).toBeFocused() // fine pointer: the primary control on mount
      await page.keyboard.press(String(EX.correct + 1))
    } else await options.nth(EX.correct).click()
    await expect(exercise.getByRole('paragraph').filter({ hasText: /^Верно!$/ })).toBeVisible()
    const rate = page.getByRole('group', { name: 'Оцените, как далось задание' })
    await expect(rate.getByRole('button', { name: /^Хорошо/ })).toBeFocused() // suggested rating
    if (keyboard) await page.keyboard.press('3')
    else await rate.getByRole('button', { name: /^Хорошо/ }).click()
    return 'error'
  }
  await expect(page.getByText(SER.examples[0].ru)).toBeVisible()
  await expect(page.getByText(SER.examples[0].pt)).toHaveCount(0) // back hidden until revealed
  if (keyboard) {
    await expect(reveal).toBeFocused()
    await page.keyboard.press('Space')
  } else await reveal.click()
  await expect(page.getByText(SER.examples[0].pt).first()).toBeVisible()
  const rate = page.getByRole('group', { name: 'Насколько легко вы вспомнили?' })
  if (keyboard) await page.keyboard.press('4')
  else await rate.getByRole('button', { name: /^Легко/ }).click()
  return 'grammar'
}

test.describe('review with course cards', () => {
  test('session: grammar flashcard + error card as its exercise → summary → persisted, nothing due', async ({ app, page, seed, isMobile }) => {
    await page.clock.install({ time: NOW })
    await seed({ cards: [grammar, error] })
    await app.goto('/review')
    await expect(app.heading).toHaveText('Повторение')
    const session = page.getByRole('tab', { name: /Сессия/ })
    await expect(session).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Только повторение · ≈1 мин')).toBeVisible()
    await page.getByRole('button', { name: 'Начать' }).click()

    const kinds = [await reviewOne(page, !isMobile), await reviewOne(page, !isMobile)]
    expect(kinds.sort()).toEqual(['error', 'grammar'])

    const summary = page.getByRole('heading', { name: 'Сессия завершена' })
    await expect(summary).toBeVisible()
    await expect(summary).toBeFocused()
    await expect(page.getByText(/^Карточек: 2 · ответов: 2 · вспомнили 100%/)).toBeVisible()

    const stored = await app.storageJson<Record<string, { fsrs: { reps: number; due: number } }>>('ptpt:v1:cards')
    for (const c of [grammar, error]) {
      expect(stored?.[c.id]?.fsrs.reps).toBe(c.fsrs.reps + 1)
      expect(stored?.[c.id]?.fsrs.due).toBeGreaterThan(NOW)
    }

    await page.getByRole('button', { name: 'К карточкам' }).click()
    await expect(page).toHaveURL(/\/review\?tab=all$/)
    await expect(page.getByRole('tab', { name: /Все карточки/ })).toHaveAttribute('aria-selected', 'true')
    await page.reload()
    await page.getByRole('tab', { name: /Сессия/ }).click()
    await expect(page.getByText('На сегодня всё')).toBeVisible()
    await expect(app.nav.root.filter({ visible: true }).getByText('к повторению')).toHaveCount(0)
  })

  test('«Завершить» mid-session asks, «Отмена» returns focus; confirm ends with a partial summary', async ({ app, page, seed }) => {
    await page.clock.install({ time: NOW })
    await seed({ cards: [grammar, error] })
    await app.goto('/review')
    await page.getByRole('button', { name: 'Начать' }).click()
    const end = page.getByRole('button', { name: 'Завершить' })
    await end.click()
    const ask = page.getByRole('group', { name: 'Завершить сессию?' })
    await ask.getByRole('button', { name: 'Отмена' }).click()
    await expect(end).toBeFocused()
    await end.click()
    await ask.getByRole('button', { name: 'Завершить' }).click()
    await expect(page.getByRole('heading', { name: 'Сессия завершена' })).toBeVisible()
    await expect(page.getByText(/^Карточек: 0 · ответов: 0/)).toBeVisible()
  })

  test('no cards, errors in the log → «Создать из журнала ошибок» makes error cards', async ({ app, page, seed }) => {
    await seed({ errors: [errorEntry('e1', { exerciseId: EX_ID, topicId: SER.id }), errorEntry('e2', { exerciseId: 'a1-ser-estar-ex-01', topicId: SER.id })] })
    await app.goto('/review')
    await expect(app.review.emptyState).toBeVisible()
    await page.getByRole('button', { name: 'Создать из журнала ошибок (2)' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Добавлено' })).toHaveText('Добавлено карточек из журнала ошибок: 2')
    await expect(page.getByRole('button', { name: 'Начать' })).toBeVisible()
    const stored = await app.storageJson<Record<string, unknown>>('ptpt:v1:cards')
    expect(Object.keys(stored ?? {}).sort()).toEqual([`error:a1-ser-estar-ex-01`, `error:${EX_ID}`])
  })
})
