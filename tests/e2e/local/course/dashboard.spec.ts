/** «Сегодня» (home): onboarding on the first visit; with seeded progress — due cards, streak, levels, errors, next step. */
import { expect, test } from '../../../helpers/test'
import { card, DAY, errorEntry, NOW, progress } from '../../../fixtures/seed'
import { topic as loadTopic } from '../../../helpers/C-content'

const SER = loadTopic('a1-ser-estar')
const FIRST = loadTopic('a1-artigos-genero-numero')

test.describe('dashboard', () => {
  test('empty: onboarding with diagnostic and first topic, no streak / widgets', async ({ app, page }) => {
    await app.goto('/')
    await expect(app.heading).toHaveText('Сегодня')
    await expect(page.getByText('Начните с диагностики: около 20 минут, и курс подскажет, с чего начать.')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Начнём с главного/ })).toBeVisible()
    await expect(page.getByText(/дней подряд|Начните серию/)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Последние ошибки' })).toHaveCount(0)
    await expect(app.main.getByRole('link', { name: /Карта курса/ })).toContainText(/\d+ тем/)

    await app.main.getByRole('link', { name: 'Открыть первую тему' }).click()
    await expect(app.heading).toHaveText(FIRST.title)
    await page.goBack()
    await app.main.getByRole('link', { name: 'Пройти диагностику' }).click()
    await expect(page).toHaveURL(/\/diagnostic$/)
    await expect(app.heading).toHaveText('Диагностика уровня')
  })

  test('seeded: due cards first, streak, levels, recent errors, stale diagnostic', async ({ app, page, seed }) => {
    await page.clock.setFixedTime(NOW)
    await seed({
      progress: [
        progress(FIRST.id, 9, 10, { at: NOW - 60_000 }),
        progress('a1-pronomes-pessoais-tratamento', 7, 10, { at: NOW - 2 * DAY }),
        progress(SER.id, 4, 10, { at: NOW - DAY }),
      ],
      cards: [card('error:a1-ser-estar-ex-01', { exerciseId: 'a1-ser-estar-ex-01', topicId: SER.id }), card('c2'), card('c3')],
      errors: [errorEntry('e1', { exerciseId: 'a1-ser-estar-ex-01', given: 'és', expected: 'sou' }), errorEntry('e2', { at: NOW - 3 * DAY })],
      settings: { lastDiagnosticAt: NOW - 50 * DAY },
    })
    await app.goto('/')
    await expect(page.getByText(`Сначала повторение — около 1 мин, затем тема «${SER.title}».`)).toBeVisible()
    // Active today, yesterday (error), −2 (lesson), −3 (error), −4 (cards' last review) → 5 days.
    await expect(page.getByText('5 дней подряд')).toBeVisible()
    await expect(page.getByText('карточки к повторению', { exact: true })).toBeVisible()
    await expect(page.getByText('Только повторение · ≈1 мин')).toBeVisible()

    // Levels: A1 has one confident topic out of the A1 total.
    await expect(page.getByRole('img', { name: /^Уровень A1, тем 14; не начато 11\. Уверенно: 1, Изучаю: 1, Слабо: 1/ })).toBeVisible()
    await expect(page.getByText('1 из 14 уверенно')).toBeVisible()

    // Recent errors: newest first, with the expected answer.
    const errors = page.getByRole('region', { name: 'Последние ошибки' })
    await expect(errors.getByRole('listitem')).toHaveCount(2)
    await expect(errors.getByRole('listitem').first()).toContainText('sou')

    // Stale diagnostic (> 6 weeks): «Пора сверить уровень».
    await expect(app.main.getByRole('link', { name: /Пора сверить уровень/ })).toBeVisible()

    // Nav badge on «Повторение» / «Карточки».
    await expect(app.nav.root.filter({ visible: true }).getByText('к повторению')).toHaveCount(1)

    await app.main.getByRole('link', { name: 'Начать повторение' }).click()
    await expect(page).toHaveURL(/\/review$/)
  })

  test('seeded, nothing due: «Продолжим курс» → the weak topic first; levels link filters the course', async ({ app, page, seed }) => {
    await page.clock.setFixedTime(NOW)
    await seed({ progress: [progress(SER.id, 4, 10, { at: NOW - DAY })], settings: { lastDiagnosticAt: NOW - DAY } })
    await app.goto('/')
    await expect(page.getByText(`Повторение готово. Дальше по курсу: ${SER.title}.`)).toBeVisible()
    await expect(page.getByText('Продолжим курс')).toBeVisible()
    await expect(page.getByText(`Подтянуть: ${SER.title}`)).toBeVisible()
    await expect(page.getByText('1 день подряд')).toBeVisible() // yesterday counts while today is still open
    await expect(app.main.getByRole('link', { name: /Ситуации/ })).toBeVisible() // fresh diagnostic → situations entry
    await app.main.getByRole('link', { name: 'Повторить тему' }).click()
    await expect(app.heading).toHaveText(SER.title)
    await page.goBack()
    await app.main.getByRole('link', { name: 'Уровень B1' }).click()
    await expect(page).toHaveURL(/\/syllabus\?level=B1$/)
    await expect(page.getByRole('button', { name: 'B1' })).toHaveAttribute('aria-pressed', 'true')
  })
})
