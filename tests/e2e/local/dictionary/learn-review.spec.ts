/**
 * «Учить новые» and the review of dictionary cards: the four modes (typed answers, accent-insensitive setting),
 * staged unlock (RU → PT after a good review, cloze / listening once PT → RU holds ≥ 4 days), switching a mode off in
 * Settings suspends cards and back on restores them, the words-only deck, a word deleted mid-session.
 * Time is fixed with page.clock at NOW (seed.ts); FSRS states are seeded.
 */
import { expect, test } from '../../../helpers/test'
import { comprar, saude, xaroposo } from '../../../fixtures/d-words'
import { NOW, DAY, card, fsrs, type Seed } from '../../../fixtures/seed'
import { cardTitle, clickWord, wordBox, dictCard, fakeSpeech, fsrsNewAt, fsrsReview, lookupCard, storedCards, toastBox } from '../../../helpers/d-dict'
import type { Page } from '@playwright/test'

const ratingGroup = (page: Page) => page.getByRole('group', { name: /Насколько легко вы вспомнили\?|Оцените, как далось задание/ })
const rating = (page: Page, label: string) => ratingGroup(page).getByRole('button', { name: new RegExp(`^${label}`) })
const answerField = (page: Page) => page.getByRole('textbox', { name: /Слово по-португальски|Пропущенное слово/ })

async function startReview(page: Page, app: { goto(p: string): Promise<void> }, path = '/review') {
  await app.goto(path)
  await page.getByRole('button', { name: 'Начать' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW })
  await page.clock.resume() // fixed start, then real time flows (debounces, animations, lazy chunks)
  await fakeSpeech(page, { ptVoice: true })
})

test.describe('«Учить новые»', () => {
  const seedNew: Seed = {
    words: [saude, xaroposo],
    cards: [dictCard(saude, 'recognize', { fsrs: fsrsNewAt() }), dictCard(xaroposo, 'recognize', { fsrs: fsrsNewAt() })],
    settings: { newCardsPerDay: 50 },
  }

  test('full session with the keyboard: study → check (digits) → done; cards rated, produce unlocked', async ({ app, page, seed, isMobile }) => {
    test.skip(isMobile, 'keyboard path; the touch path is below')
    await seed(seedNew)
    await app.goto('/words')
    await page.getByRole('button', { name: 'Учить новые (2)' }).click()
    await expect(page).toHaveURL(/learn=1/)
    await expect(app.heading).toHaveText('Учить новые')
    const step = page.getByRole('heading', { level: 2 }).first()
    await expect(page.getByText('слово 1 из 2')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Дальше/ })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByText('слово 2 из 2')).toBeVisible()
    await expect(page.getByRole('button', { name: /^К проверке/ })).toBeFocused()
    await page.keyboard.press(' ')
    const meaning: Record<string, string> = { 'a saúde': 'здоровье', xaroposo: 'приторный' }
    for (let i = 1; i <= 2; i++) {
      await expect(page.getByText(`проверка ${i} из 2`)).toBeVisible()
      const pt = (await page.locator('#learn-step').textContent())!.trim()
      const options = page.getByRole('radiogroup', { name: 'Варианты перевода' }).getByRole('radio')
      await expect(options.first()).toBeFocused()
      const texts = await options.allTextContents()
      const n = texts.findIndex((t) => t.includes(meaning[pt]))
      expect(n).toBeGreaterThanOrEqual(0)
      await page.keyboard.press(String(n + 1))
      await expect(page.getByText('Верно! Слово ушло в повторение.')).toBeVisible()
      await expect(page.getByRole('button', { name: i < 2 ? /^Дальше/ : /^Готово/ })).toBeFocused()
      await page.keyboard.press('Enter')
    }
    await expect(step).toHaveText('2 слова в повторении')
    await expect(page.getByText('Сразу вспомнили 2 из 2.')).toBeVisible()
    const cards = await storedCards(page)
    expect(cards[`lex:${saude.id}:recognize`].fsrs.state).not.toBe(0)
    expect(cards[`lex:${xaroposo.id}:recognize`].fsrs.state).not.toBe(0)
    // A good first answer opens RU → PT.
    await expect.poll(async () => !!(await storedCards(page))[`lex:${saude.id}:produce`]).toBe(true)
    await page.getByRole('link', { name: 'Повторить слова' }).click()
    await expect(page).toHaveURL(/\/review\?deck=words/)
  })

  test('touch: «Знаю уже», a wrong answer → «Снова»; the daily limit caps the batch', async ({ app, page, seed }) => {
    await seed({ ...seedNew, settings: { newCardsPerDay: 1 } })
    await app.goto('/words?learn=1')
    await expect(page.getByText('слово 1 из 1')).toBeVisible()
    await page.getByRole('button', { name: /^К проверке/ }).click()
    const options = page.getByRole('radiogroup', { name: 'Варианты перевода' }).getByRole('radio')
    const pt = (await page.locator('#learn-step').textContent())!.trim()
    const right = pt === 'a saúde' ? 'здоровье' : 'приторный'
    await options.filter({ hasNotText: right }).first().click()
    await expect(page.getByText(/^Неверно: /)).toBeVisible()
    await page.getByRole('button', { name: /^Готово/ }).click()
    await expect(page.getByText('Сразу вспомнили 0 из 1.')).toBeVisible()
    await page.getByRole('button', { name: 'К словарю' }).click()
    // Limit used up: no «Учить новые», an explanation instead.
    await expect(page.getByRole('button', { name: /Учить новые/ })).toHaveCount(0)
    await expect(page.getByText(/Лимит новых карточек на сегодня исчерпан \(1\)/)).toBeVisible()
    await app.goto('/words?learn=1')
    await expect(page.getByText('Лимит новых на сегодня исчерпан')).toBeVisible()
  })

  test('«Знаю уже» marks the word known and skips it in the check', async ({ app, page, seed }) => {
    await seed(seedNew)
    await app.goto('/words?learn=1')
    await page.getByRole('button', { name: 'Знаю уже' }).click()
    await expect(toastBox(page)).toContainText('Отмечено как известное')
    await expect(page.getByText('слово 2 из 2')).toBeVisible()
    await page.getByRole('button', { name: /^К проверке/ }).click()
    await expect(page.getByText('проверка 1 из 1')).toBeVisible()
  })

  test('the check is lookup-locked until answered', async ({ app, page, seed, isMobile }) => {
    test.skip(isMobile, 'pointer lookup on desktop')
    await seed(seedNew)
    await app.goto('/words?learn=1')
    await page.getByRole('button', { name: /^Дальше/ }).click()
    await page.getByRole('button', { name: /^К проверке/ }).click()
    const word = page.locator('#learn-step')
    const pt = (await word.textContent())!.trim()
    const token = pt.replace(/^a /, '')
    await clickWord(page, word, token)
    await expect(lookupCard(page)).toHaveCount(0)
    await page.keyboard.press('1')
    await expect(page.getByText(/^(Верно!|Неверно: )/)).toBeVisible()
    await clickWord(page, word, token)
    await cardTitle(page)
  })
})

test.describe('review of dictionary cards', () => {
  test('a lookup opened right after the reveal stays open', async ({ app, page, seed, isMobile }) => {
    test.skip(isMobile, 'pointer lookup on desktop')
    test.fail(true, 'BUG D-07: the post-reveal auto-scroll (260 ms) closes a popover opened before it')
    await seed({ words: [comprar], cards: [dictCard(comprar, 'recognize', { fsrs: fsrsReview(3, -DAY) })] })
    await page.setViewportSize({ width: 1280, height: 600 })
    await startReview(page, app, '/review?deck=words')
    await page.getByRole('button', { name: /^Показать ответ/ }).click()
    const example = page.getByText('Ontem comprei pão na padaria.')
    const b = await wordBox(example, 'padaria')
    await page.mouse.click(b.x, b.y)
    await cardTitle(page)
    await page.waitForTimeout(600)
    await expect(lookupCard(page)).toBeVisible({ timeout: 100 })
  })

  test('PT → RU flashcard: locked front, reveal, lookup on the back, keys blocked while the card is open', async ({ app, page, seed, isMobile }) => {
    test.skip(isMobile, 'keyboard + pointer lookup on desktop')
    await seed({ words: [comprar], cards: [dictCard(comprar, 'recognize', { fsrs: fsrsReview(3, -DAY) })] })
    await startReview(page, app, '/review?deck=words')
    const front = page.getByText('comprar', { exact: true }).first()
    await expect(front).toBeVisible()
    await expect(page.getByText('Слово · PT → RU')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Показать ответ/ })).toBeFocused()
    await clickWord(page, front, 'comprar')
    await expect(lookupCard(page)).toHaveCount(0)
    await page.getByRole('button', { name: /^Показать ответ/ }).focus()
    await page.keyboard.press(' ')
    await expect(page.getByText('покупать').first()).toBeVisible()
    // Back side: example sentence is lookup-enabled.
    const example = page.getByText('Ontem comprei pão na padaria.')
    // The session scrolls the answer into view 260 ms after the reveal (ReviewSession.tsx), and any page scroll
    // closes the popover (BUG D-07 when the learner is quicker): let that documented timer pass.
    await page.waitForTimeout(400)
    await clickWord(page, example, 'padaria')
    await cardTitle(page)
    await page.keyboard.press('3') // belongs to the word card, not the session
    await expect(lookupCard(page)).toBeVisible()
    await expect(ratingGroup(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(lookupCard(page)).toHaveCount(0)
    await page.keyboard.press('3')
    await expect(page.getByRole('heading', { name: 'Сессия завершена' })).toBeVisible()
    await expect.poll(async () => (await storedCards(page))[`lex:${comprar.id}:recognize`].fsrs.reps).toBe(4)
    const c = (await storedCards(page))[`lex:${comprar.id}:recognize`]
    expect(c.fsrs.reps).toBe(4)
  })

  test('RU → PT typed: right answer suggests «Хорошо»; accents only → «Трудно»; Shift+Enter = «Не знаю»', async ({ app, page, seed }) => {
    await seed({
      words: [comprar, saude],
      cards: [
        dictCard(comprar, 'produce', { fsrs: fsrsReview(3, -2 * DAY) }),
        dictCard(saude, 'produce', { fsrs: fsrsReview(3, -DAY) }),
        dictCard(xaroposo, 'produce', { wordId: undefined, mode: undefined, id: 'x-unrelated', kind: 'phrase', fsrs: fsrsReview(3, 10 * DAY) }),
      ],
    })
    await startReview(page, app, '/review?deck=words')
    const ruFront = page.getByText(/^(покупать|здоровье)$/).first()
    const first = (await ruFront.textContent())!
    const answers: Record<string, [string, string]> = { покупать: ['comprar', 'Верно!'], здоровье: ['saude', 'Почти: ошибка только в акцентах'] }
    for (const ru of first === 'покупать' ? ['покупать', 'здоровье'] : ['здоровье', 'покупать']) {
      await expect(page.getByText(ru, { exact: true }).first()).toBeVisible()
      await expect(page.getByText('Напишите по-португальски')).toBeVisible()
      await answerField(page).fill(answers[ru][0])
      await answerField(page).press('Enter')
      await expect(page.getByText(answers[ru][1])).toBeVisible()
      const suggested = ratingGroup(page).getByRole('button', { name: /предложено по ответу/ })
      await expect(suggested).toHaveAccessibleName(new RegExp(ru === 'покупать' ? '^Хорошо' : '^Трудно'))
      await suggested.click()
    }
    await expect(page.getByRole('heading', { name: 'Сессия завершена' })).toBeVisible()
  })

  test('accent-insensitive setting: accents-only answer counts as right and suggests «Хорошо»', async ({ app, page, seed }) => {
    await seed({ words: [saude], cards: [dictCard(saude, 'produce', { fsrs: fsrsReview(3, -DAY) })], settings: { lenientAccents: true } })
    await startReview(page, app, '/review?deck=words')
    await answerField(page).fill('a saude')
    await answerField(page).press('Enter')
    await expect(page.getByText('Верно, но проверьте акценты')).toBeVisible()
    await expect(ratingGroup(page).getByRole('button', { name: /предложено по ответу/ })).toHaveAccessibleName(/^Хорошо/)
  })

  test('cloze and listening typed; «Не знаю» → «Снова»', async ({ app, page, seed }) => {
    await seed({
      words: [comprar],
      cards: [dictCard(comprar, 'cloze', { fsrs: fsrsReview(5, -2 * DAY) }), dictCard(comprar, 'listen', { fsrs: fsrsReview(5, -DAY) })],
    })
    await startReview(page, app, '/review?deck=words')
    // Siblings are buried: one card of the word per session.
    await expect(page.getByText('осталось 1')).toBeVisible()
    await expect(page.getByText('Слово · Пропуск в предложении')).toBeVisible()
    await expect(page.getByText('Впишите пропущенное слово')).toBeVisible()
    await expect(page.getByRole('img', { name: 'пропуск' })).toBeVisible()
    await answerField(page).fill('comprei')
    await answerField(page).press('Enter')
    await expect(page.getByText('Верно!')).toBeVisible()
    await rating(page, 'Хорошо').click()
    await expect(page.getByRole('heading', { name: 'Сессия завершена' })).toBeVisible()

    // Next day: the listening card.
    await page.clock.setSystemTime(NOW + DAY)
    await startReview(page, app, '/review?deck=words')
    await expect(page.getByText('Прослушайте и напишите слово')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Прослушать слово' })).toBeVisible()
    await answerField(page).press('Shift+Enter')
    await expect(page.getByText('Ничего страшного — вот ответ')).toBeVisible()
    await expect(ratingGroup(page).getByRole('button', { name: /предложено по ответу/ })).toHaveAccessibleName(/^Снова/)
  })

  test('typing off: RU → PT is a flashcard («Показать ответ»)', async ({ app, page, seed }) => {
    await seed({ words: [comprar], cards: [dictCard(comprar, 'produce', { fsrs: fsrsReview(3, -DAY) })], settings: { typeWordAnswers: false } })
    await startReview(page, app, '/review?deck=words')
    await expect(answerField(page)).toHaveCount(0)
    await page.getByRole('button', { name: /^Показать ответ/ }).click()
    await expect(page.getByText('comprar', { exact: true }).first()).toBeVisible()
    await rating(page, 'Легко').click()
    await expect(page.getByRole('heading', { name: 'Сессия завершена' })).toBeVisible()
  })
})

test.describe('staged unlock', () => {
  test('a good first review of PT → RU creates RU → PT', async ({ app, page, seed }) => {
    await seed({ words: [saude], cards: [dictCard(saude, 'recognize', { fsrs: fsrsNewAt() })] })
    await startReview(page, app, '/review?deck=words')
    await page.getByRole('button', { name: /^Показать ответ/ }).click()
    await rating(page, 'Хорошо').click()
    await expect.poll(async () => Object.keys(await storedCards(page)).sort()).toEqual([`lex:${saude.id}:produce`, `lex:${saude.id}:recognize`])
    // «Снова» on another new word does not.
  })

  test('«Снова» on a new PT → RU does not open RU → PT', async ({ app, page, seed }) => {
    await seed({ words: [saude], cards: [dictCard(saude, 'recognize', { fsrs: fsrsNewAt() })] })
    await startReview(page, app, '/review?deck=words')
    await page.getByRole('button', { name: /^Показать ответ/ }).click()
    await rating(page, 'Снова').click()
    await expect.poll(async () => (await storedCards(page))[`lex:${saude.id}:recognize`].fsrs.reps).toBe(1)
    expect((await storedCards(page))[`lex:${saude.id}:produce`]).toBeUndefined()
  })

  test('PT → RU reaching ≥ 4 days opens cloze and listening (word page shows them)', async ({ app, page, seed }) => {
    // Review card, stability 3.5 d, due: «Хорошо» pushes stability over 4 days.
    await seed({ words: [comprar], cards: [dictCard(comprar, 'recognize', { fsrs: fsrsReview(3.5, -DAY) }), dictCard(comprar, 'produce', { fsrs: fsrsReview(2, 3 * DAY) })] })
    await app.goto(`/words/${encodeURIComponent(comprar.id)}`)
    await expect(page.getByRole('region', { name: 'Карточки' })).toContainText('2 из 4')
    await startReview(page, app, '/review?deck=words')
    await page.getByRole('button', { name: /^Показать ответ/ }).click()
    await rating(page, 'Хорошо').click()
    await expect.poll(async () => Object.keys(await storedCards(page)).sort()).toEqual(
      ['cloze', 'listen', 'produce', 'recognize'].map((m) => `lex:${comprar.id}:${m}`),
    )
    expect((await storedCards(page))[`lex:${comprar.id}:recognize`].fsrs.stability).toBeGreaterThanOrEqual(4)
    await app.goto(`/words/${encodeURIComponent(comprar.id)}`)
    await expect(page.getByRole('region', { name: 'Карточки' })).toContainText('4 из 4')
  })

  test('no listening card without audio or a pt-PT voice', async ({ app, page, seed }) => {
    await fakeSpeech(page, { ptVoice: false })
    await page.route('**/audio/**', (r) => r.fulfill({ status: 404, body: '' }))
    await seed({ words: [comprar], cards: [dictCard(comprar, 'recognize', { fsrs: fsrsReview(3.5, -DAY) }), dictCard(comprar, 'produce', { fsrs: fsrsReview(2, 3 * DAY) })] })
    await startReview(page, app, '/review?deck=words')
    await page.getByRole('button', { name: /^Показать ответ/ }).click()
    await rating(page, 'Хорошо').click()
    await expect.poll(async () => !!(await storedCards(page))[`lex:${comprar.id}:cloze`]).toBe(true)
    expect((await storedCards(page))[`lex:${comprar.id}:listen`]).toBeUndefined()
  })
})

test.describe('settings: card modes', () => {
  test('switching RU → PT off suspends its cards (progress kept); on again restores them', async ({ app, page, seed }) => {
    const produce = dictCard(comprar, 'produce', { fsrs: fsrsReview(6, -DAY) })
    await seed({ words: [comprar], cards: [dictCard(comprar, 'recognize', { fsrs: fsrsReview(8, 5 * DAY) }), produce] })
    await app.goto('/settings')
    const box = page.getByRole('group', { name: 'Виды карточек слова' }).getByRole('checkbox', { name: /RU → PT/ })
    await box.uncheck()
    await expect(toastBox(page)).toContainText('Карточки «RU → PT» приостановлены, прогресс сохранён')
    await expect.poll(async () => (await storedCards(page))[produce.id].suspended).toBe(true)
    expect((await storedCards(page))[produce.id].fsrs.stability).toBe(6)
    // The setting itself is written debounced (400 ms): wait for it before leaving.
    await expect.poll(async () => (await app.storageJson<{ wordModes?: string[] }>('ptpt:v1:settings'))?.wordModes).toEqual(['recognize', 'cloze', 'listen'])
    // Not in the review any more.
    await app.goto('/review?deck=words')
    await expect(page.getByText('Слов к повторению нет')).toBeVisible()
    await app.goto('/settings')
    await box.check()
    await expect(toastBox(page)).toContainText('Карточки «RU → PT» снова в повторении')
    await expect.poll(async () => (await storedCards(page))[produce.id].suspended).toBeUndefined()
    // The last enabled mode cannot be switched off.
    const group = page.getByRole('group', { name: 'Виды карточек слова' })
    for (const m of [/RU → PT/, /Пропуск в предложении/, /На слух/]) await group.getByRole('checkbox', { name: m }).uncheck()
    await expect(group.getByRole('checkbox', { name: /PT → RU/ }).first()).toBeDisabled()
  })
})

test.describe('deck and edge cases', () => {
  test('words-only deck skips other cards', async ({ app, page, seed }) => {
    await seed({
      words: [comprar],
      cards: [dictCard(comprar, 'recognize', { fsrs: fsrsReview(3, -DAY) }), card('error:x', { kind: 'error', fsrs: fsrs({ due: NOW - DAY }) })],
    })
    await app.goto('/review')
    const deck = page.getByRole('radiogroup', { name: 'Какие карточки повторять' })
    await expect(deck.getByRole('radio', { name: 'Все карточки · 2' })).toBeChecked()
    await deck.getByRole('radio', { name: 'Только слова · 1' }).click()
    await expect(page).toHaveURL(/deck=words/)
    await page.getByRole('button', { name: 'Начать' }).click()
    await expect(page.getByText('осталось 1')).toBeVisible()
    await expect(page.getByText('Слово · PT → RU')).toBeVisible()
  })

  test('a word deleted in another tab during the session is not resurrected by rating its card', async ({ app, page, seed, context }) => {
    await seed({ words: [comprar], cards: [dictCard(comprar, 'recognize', { fsrs: fsrsReview(3, -DAY) })] })
    await startReview(page, app, '/review?deck=words')
    await expect(page.getByText('Слово · PT → RU')).toBeVisible()
    const other = await context.newPage()
    await other.goto(`words/${encodeURIComponent(comprar.id)}`)
    await other.getByRole('button', { name: 'Удалить из словаря' }).click()
    await expect(other).toHaveURL(/\/words$/)
    await expect.poll(async () => Object.keys(await storedCards(page))).toEqual([])
    await page.getByRole('button', { name: /^Показать ответ/ }).click()
    await rating(page, 'Хорошо').click()
    await expect(page.getByRole('heading', { name: 'Сессия завершена' })).toBeVisible()
    test.fail(true, 'BUG D-06: the session writes the rated card back — an orphan lex: card without its word')
    await expect.poll(async () => Object.keys(await storedCards(page)), { timeout: 3000 }).toEqual([])
  })
})
