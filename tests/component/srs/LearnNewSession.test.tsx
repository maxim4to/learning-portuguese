/**
 * LearnNewSession («Учить новые», /words?learn=1): empty / limit states, batch size (≤ 5, ≤ today’s limit),
 * study cards, «Знаю уже» (+ undo toast), the quick check (pick a meaning by click / digits / arrows),
 * FSRS rating of the recognize card, the side panel and the done screen.
 */
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { WordEntry } from '@/data/types.ts'
import { LearnNewSession } from '@/features/words/LearnNewSession'
import { DAY, NOW, fsrsNew, word, wordCard, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { andar, beber, casa, comer, dormir, falar, flush, freezeDate, ler, newSeenKey } from '../../helpers/B-srs-fixtures'

vi.mock('@/engine/audio', async (orig) => ({
  ...(await orig<typeof import('@/engine/audio')>()),
  speak: vi.fn(async () => ({ source: 'none' })),
  stopSpeaking: vi.fn(),
  hasAudioFile: vi.fn(async () => false),
  pickPtPtVoice: vi.fn(async () => null),
}))
// No lexicon distractors: options come from the learner's own words (deterministic set, random order).
vi.mock('@/engine/lexicon/lookup', async (orig) => ({
  ...(await orig<typeof import('@/engine/lexicon/lookup')>()),
  loadLexicon: () => Promise.reject(new Error('no lexicon in tests')),
}))

/** Words seen at decreasing times: the first is the most recent (learnt first). */
function fresh(list: WordEntry[]): Seed {
  const words = list.map((w, i) => ({ ...w, createdAt: NOW - DAY - i * 1000, sources: w.sources.map((s) => ({ ...s, at: NOW - DAY - i * 1000 })) }))
  return { words, cards: words.map((w) => wordCard(w, 'recognize', { fsrs: fsrsNew(), front: w.lemma, back: w.ru })) }
}

function setup(seed: Seed) {
  const onClose = vi.fn()
  const r = renderWithProviders(<LearnNewSession onClose={onClose} />, { seed })
  return { ...r, onClose }
}

const panel = () => screen.getByRole('complementary', { name: 'Сессия' })
const panelRow = (pt: string) => within(panel()).getByText(pt).closest('li')!
const options = () => within(screen.getByRole('radiogroup', { name: 'Варианты перевода' })).getAllByRole('radio')
/** Option text without its aria-hidden number key. */
const optText = (o: HTMLElement) => o.textContent!.replace(/^\d/, '')
const stepWord = () => screen.getAllByRole('heading', { level: 2 }).filter((h) => !panel().contains(h))[0].textContent!
const firstMeaning = (w: WordEntry) => w.ru.split(';')[0].trim()

beforeEach(() => freezeDate(NOW))
afterEach(() => vi.useRealTimers())

describe('LearnNewSession · empty states and batch size', () => {
  test('no new words: «Новых слов нет»; «К словарю» closes', async () => {
    const { user, onClose } = setup({ words: [casa], cards: [wordCard(casa, 'recognize')] }) // already learning
    expect(screen.getByText('Новых слов нет')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'К словарю' }))
    expect(onClose).toHaveBeenCalled()
  })

  test('today’s new-card limit used up: «Лимит новых на сегодня исчерпан»', () => {
    localStorage.setItem(newSeenKey(), '3')
    setup({ ...fresh([beber, dormir]), settings: { newCardsPerDay: 3 } })
    expect(screen.getByText('Лимит новых на сегодня исчерпан')).toBeInTheDocument()
    expect(screen.getByText(/Сегодня уже 3 новые карточки из 3\./)).toBeInTheDocument()
  })

  test('at most 5 words per session, newest first; fewer when the daily limit leaves less room', () => {
    const first = setup(fresh([beber, dormir, falar, andar, ler, comer]))
    expect(screen.getByText('слово 1 из 5')).toBeInTheDocument()
    expect(within(panel()).getAllByRole('listitem').map((li) => li.querySelector('[lang]')!.textContent)).toEqual(['beber', 'dormir', 'falar', 'andar', 'ler'])
    first.unmount()

    localStorage.setItem(newSeenKey(), '13')
    setup(fresh([beber, dormir, falar, andar, ler, comer]))
    expect(screen.getByText('слово 1 из 2')).toBeInTheDocument()
  })

  test('suspended / known-marked words are not offered', () => {
    const seed = fresh([beber, dormir, falar])
    seed.cards![0] = { ...seed.cards![0], suspended: true }
    seed.words![1] = { ...seed.words![1], mark: 'known' }
    setup(seed)
    expect(screen.getByText('слово 1 из 1')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'falar', level: 2 })).toBeInTheDocument()
  })
})

describe('LearnNewSession · full flow', () => {
  test('study card: pt with article, gender, hint, meanings, example from its source', () => {
    setup(fresh([casa, comer]))
    expect(screen.getByText('Новое слово')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'a casa', level: 2 })).toHaveAttribute('lang', 'pt-PT')
    expect(screen.getByText('сущ., ж. р.')).toBeInTheDocument()
    expect(screen.getByText('дом')).toBeInTheDocument()
    expect(screen.getByText('жилище')).toBeInTheDocument()
    expect(screen.getByText('Пример · Добавлено вручную')).toBeInTheDocument()
    expect(screen.getByText('casa', { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByText('Мой дом рядом с рекой.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Прослушать пример' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Дальше/ })).toHaveFocus()
    expect(panelRow('a casa')).toHaveTextContent('сейчас')
    expect(panelRow('comer')).toHaveTextContent('впереди')
  })

  test('study → check → done: right and wrong answers rate the recognize card through FSRS', async () => {
    const words = [beber, dormir, falar, andar]
    const { user, store, onClose } = setup(fresh(words))
    // Study 4 words: «Дальше» ×3, then «К проверке».
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: /^Дальше/ }))
    expect(panelRow('beber')).toHaveTextContent('изучено')
    await user.click(screen.getByRole('button', { name: /^К проверке/ }))

    expect(screen.getByText('Проверка')).toBeInTheDocument()
    expect(screen.getByText('проверка 1 из 4')).toBeInTheDocument()
    const answered: Record<string, boolean> = {}
    for (let i = 0; i < 4; i++) {
      const pt = stepWord()
      const w = words.find((x) => x.lemma === pt)!
      const opts = options()
      expect(opts).toHaveLength(4)
      expect(opts[0]).toHaveFocus()
      expect(opts.map(optText)).toContain(firstMeaning(w))
      // First two right, the rest wrong.
      const right = i < 2
      const target = opts.find((o) => (optText(o) === firstMeaning(w)) === right)!
      await user.click(target)
      answered[w.id] = right
      expect(target).toHaveAttribute('aria-checked', 'true')
      for (const o of options()) expect(o).toBeDisabled()
      expect(screen.getByText(right ? 'Верно! Слово ушло в повторение.' : `Неверно: ${pt} — ${w.ru}. Слово вернётся в повторении скоро.`)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: i < 3 ? /^Дальше/ : /^Готово/ }))
    }
    await flush()

    // Done screen.
    expect(screen.getByRole('heading', { name: '4 слова в повторении' })).toHaveFocus()
    expect(screen.getByText(/Сразу вспомнили 2 из 4\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Повторить слова' })).toHaveAttribute('href', '/review?deck=words')
    expect(screen.queryByRole('button', { name: /Завершить/ })).not.toBeInTheDocument()
    expect(within(panel()).getAllByLabelText('верно')).toHaveLength(2)
    expect(within(panel()).getAllByLabelText('ошибка')).toHaveLength(2)

    // Every recognize card got its first rating (Хорошо → Review/Learning, Снова → Learning); the limit counter grew.
    for (const w of words) {
      const c = store.cardList().find((x) => x.id === `lex:${w.id}:recognize`)!
      expect(c.fsrs.reps).toBe(1)
      expect(c.fsrs.last_review).toBe(NOW)
      expect(c.fsrs.state).not.toBe(0)
      if (!answered[w.id]) expect(c.fsrs.due - NOW).toBeLessThan(10 * 60_000)
    }
    expect(localStorage.getItem(newSeenKey())).toBe('4')
    await user.click(screen.getByRole('button', { name: 'К словарю' }))
    expect(onClose).toHaveBeenCalled()
  })

  test('«Знаю уже» marks the word known (no card rated), skips it in the check; «Отменить» undoes', async () => {
    const { user, store } = setup(fresh([beber, dormir, falar, andar]))
    await user.click(screen.getByRole('button', { name: 'Знаю уже' }))
    await flush()
    expect(store.wordList().find((w) => w.id === beber.id)?.mark).toBe('known')
    expect(screen.getByText('Отмечено как известное: beber')).toBeInTheDocument()
    expect(panelRow('beber')).toHaveTextContent('знаю')
    expect(screen.getByRole('heading', { name: 'dormir', level: 2 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Отменить' }))
    await flush()
    expect(store.wordList().find((w) => w.id === beber.id)?.mark).toBeUndefined()

    for (let i = 0; i < 2; i++) await user.click(screen.getByRole('button', { name: /^Дальше/ }))
    await user.click(screen.getByRole('button', { name: /^К проверке/ }))
    expect(screen.getByText('проверка 1 из 3')).toBeInTheDocument()
    const checked = new Set<string>()
    for (let i = 0; i < 3; i++) {
      checked.add(stepWord())
      await user.click(options()[0])
      await user.click(screen.getByRole('button', { name: i < 2 ? /^Дальше/ : /^Готово/ }))
    }
    expect(checked.has('beber')).toBe(false)
    expect(screen.getByText(/Отмечено как известное: 1\./)).toBeInTheDocument()
    expect(store.cardList().find((c) => c.id === `lex:${beber.id}:recognize`)?.fsrs.reps).toBe(0)
  })

  // markKnown() awaits the write and then calls the `next` captured before setKnownIds: on the last study word,
  // startCheck() still sees the old `studied` list, so the word just marked known is quizzed (and its card rated).
  test.fails('«Знаю уже» on the last study word keeps it out of the check [BUG B-21]', async () => {
    const { user, store } = setup(fresh([beber, dormir]))
    await user.click(screen.getByRole('button', { name: /^Дальше/ }))
    await user.click(screen.getByRole('button', { name: 'Знаю уже' }))
    await flush()
    expect(screen.getByText('проверка 1 из 1')).toBeInTheDocument()
    expect(stepWord()).toBe('beber')
    expect(store.wordList().find((w) => w.id === dormir.id)?.mark).toBe('known')
  })

  test.fails('all words marked known → straight to «Готово» [BUG B-21]', async () => {
    const { user } = setup(fresh([beber]))
    await user.click(screen.getByRole('button', { name: 'Знаю уже' }))
    await flush()
    expect(screen.getByRole('heading', { name: 'Готово' })).toBeInTheDocument()
  })

  test('keyboard: Enter / Space → «Дальше»; digits pick an option; arrows move focus', async () => {
    const words = [beber, dormir, falar, andar]
    const { user, store } = setup(fresh(words))
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('{Enter}')
    expect(screen.getByText('слово 2 из 4')).toBeInTheDocument()
    await user.keyboard(' ') // on the focused «Дальше»
    expect(screen.getByText('слово 3 из 4')).toBeInTheDocument()
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('{Shift>}{Enter}{/Shift}') // with a modifier (not on a button): ignored
    expect(screen.getByText('слово 3 из 4')).toBeInTheDocument()
    await user.keyboard('{Enter}{Enter}')
    expect(screen.getByText('проверка 1 из 4')).toBeInTheDocument()

    expect(options()[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(options()[1]).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(options()[3]).toHaveFocus() // wraps
    await user.keyboard('{Enter}') // Enter on a focused option = pick it
    expect(options()[3]).toHaveAttribute('aria-checked', 'true')
    await user.keyboard('2') // after answering, digits do nothing
    expect(options()[1]).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: /^Дальше/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByText('проверка 2 из 4')).toBeInTheDocument()

    const pt = stepWord()
    await user.keyboard('9') // out of range
    expect(options().every((o) => o.getAttribute('aria-checked') === 'false')).toBe(true)
    await user.keyboard('1')
    expect(options()[0]).toHaveAttribute('aria-checked', 'true')
    await flush()
    expect(store.cardList().find((c) => c.id === `lex:u:${pt}:recognize`)?.fsrs.reps).toBe(1)
  })

  test('«Завершить» closes the session at any step', async () => {
    const { user, onClose } = setup(fresh([beber]))
    await user.click(screen.getByRole('button', { name: /Завершить/ }))
    expect(onClose).toHaveBeenCalled()
  })

  test('a failed rating save shows a danger toast', async () => {
    const { user, store } = setup(fresh([word('beber', 'пить', { pos: 'verb' })]))
    await user.click(screen.getByRole('button', { name: /^К проверке/ }))
    vi.spyOn(store, 'saveWordBundle').mockRejectedValue(new Error('offline'))
    await user.click(options()[0])
    await flush()
    expect(screen.getByText('Не удалось сохранить: offline')).toBeInTheDocument()
  })
})
