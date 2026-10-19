/**
 * ReviewPage (/review): tabs «Сессия» / «Все карточки» (?tab=all), empty states, due counts and the
 * new-cards-per-day limit, the words-only deck (?deck=words), cards from the error log, the side «Колода» panel,
 * and a full session started from the page («Начать» → ratings → «К карточкам»).
 */
import { screen, within } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SrsCard, WordEntry } from '@/data/types.ts'
import { ReviewPage } from '@/features/srs/ReviewPage'
import { DAY, NOW, card, errorEntry, fsrs, fsrsNew, wordCard, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { casa, comer, flush, freezeDate, newSeenKey } from '../../helpers/B-srs-fixtures'

vi.mock('@/engine/audio', async (orig) => ({
  ...(await orig<typeof import('@/engine/audio')>()),
  speak: vi.fn(async () => ({ source: 'none' })),
  stopSpeaking: vi.fn(),
  hasAudioFile: vi.fn(async () => false),
  pickPtPtVoice: vi.fn(async () => null),
}))

function Loc() {
  const l = useLocation()
  return <output aria-label="location">{l.pathname + l.search}</output>
}
const location = () => screen.getByRole('status', { name: 'location' }).textContent

function renderPage(seed: Seed = {}, route = '/review') {
  return renderWithProviders(
    <>
      <ReviewPage />
      <Loc />
    </>,
    { seed, route },
  )
}

const tab = (name: RegExp) => screen.getByRole('tab', { name })
const deck = () => screen.getByRole('complementary', { name: 'Колода' })
const deckValue = (label: string) => within(deck()).getByText(label).nextElementSibling?.textContent?.replace(/\s+/g, ' ').trim()

const phrase = (id: string, patch: Partial<SrsCard> = {}) => card(id, { kind: 'phrase', front: `ru ${id}`, back: `pt ${id}`, ...patch })
const newPhrase = (id: string, i = 0) => phrase(id, { fsrs: fsrsNew(), createdAt: NOW - DAY + i })

beforeEach(() => freezeDate(NOW))
afterEach(() => vi.useRealTimers())

describe('ReviewPage · empty states', () => {
  test('no cards at all: «Карточек пока нет» with a link to the course', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Повторение', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Карточек пока нет')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Открыть курс' })).toHaveAttribute('href', '/syllabus')
    expect(screen.queryByRole('button', { name: /Создать из журнала ошибок/ })).not.toBeInTheDocument()
    expect(tab(/Сессия/)).toHaveAttribute('aria-selected', 'true')
    expect(tab(/Все карточки/)).toHaveTextContent('Все карточки0')
    expect(deckValue('К повторению сейчас')).toBe('0')
    expect(deckValue('Следующая карточка')).toBe('—')
  })

  test('no cards but logged errors: «Создать из журнала ошибок (N)» creates error cards (one per exercise)', async () => {
    const errors = [
      errorEntry('e1', { exerciseId: 'a1-artigos-genero-numero-ex-02', topicId: 'a1-artigos-genero-numero', expected: 'um' }),
      errorEntry('e2', { exerciseId: 'a1-artigos-genero-numero-ex-02', topicId: 'a1-artigos-genero-numero', expected: 'um', at: NOW - 2 * DAY }),
      errorEntry('e3', { exerciseId: 'gone-ex', topicId: 'a1-ser-estar', given: 'sou', expected: 'estou' }),
    ]
    const { user, store } = renderPage({ errors })
    await user.click(screen.getByRole('button', { name: 'Создать из журнала ошибок (2)' }))
    await flush()
    expect(screen.getByText('Добавлено карточек из журнала ошибок: 2')).toHaveAttribute('role', 'status')
    const ids = store.cardList().map((c) => c.id).sort()
    expect(ids).toEqual(['error:a1-artigos-genero-numero-ex-02', 'error:gone-ex'])
    expect(store.cardList().find((c) => c.id === 'error:gone-ex')?.front).toBe('Ошибка: «sou»')
    // New cards are due now: the session screen offers them.
    expect(screen.getByText('к повторению')).toBeInTheDocument()
    expect(screen.getByText(/Все карточки новые/)).toBeInTheDocument()
  })

  test('nothing due: «На сегодня всё» + when the next card comes', () => {
    renderPage({ cards: [phrase('later', { fsrs: fsrs({ due: NOW + 2 * DAY }) })] })
    expect(screen.getByText('На сегодня всё')).toBeInTheDocument()
    expect(screen.getByText(/Следующая карточка через 2 д\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Начать' })).not.toBeInTheDocument()
    expect(tab(/Сессия/)).toHaveTextContent(/^Сессия$/)
    expect(deckValue('Следующая карточка')).toBe('через 2 д')
  })

  test('nothing due and no review scheduled: «Нет запланированных карточек.»', () => {
    renderPage({ cards: [phrase('s', { suspended: true })] })
    expect(screen.getByText(/Нет запланированных карточек\./)).toBeInTheDocument()
    expect(within(deck()).getByText(/Всего 1 карточка, приостановлено 1\./)).toBeInTheDocument()
  })
})

describe('ReviewPage · due counts and the daily new-card limit', () => {
  const reviews = [phrase('r1', { fsrs: fsrs({ due: NOW - 2 * DAY }) }), phrase('r2'), phrase('future', { fsrs: fsrs({ due: NOW + 3 * DAY }) }), phrase('susp', { suspended: true })]

  test('due = overdue reviews (suspended / future excluded) + new cards; tab meta and deck agree', () => {
    renderPage({ cards: [...reviews, newPhrase('n1', 1), newPhrase('n2', 2)] })
    expect(screen.getByText('к повторению').parentElement).toHaveTextContent(/^4\s*к повторению$/)
    expect(screen.getByText(/Из них новых: 2 · ≈1 мин/)).toBeInTheDocument()
    expect(tab(/Сессия/)).toHaveTextContent('Сессия4')
    expect(tab(/Все карточки/)).toHaveTextContent('Все карточки6')
    expect(deckValue('К повторению сейчас')).toBe('4')
    expect(deckValue('Новых сегодня')).toBe('0 / 15')
    expect(deckValue('Следующая карточка')).toBe('через 3 д')
    expect(within(deck()).getByText(/Всего 6 карточек, приостановлено 1\. Новых в день — не больше 15/)).toBeInTheDocument()
  })

  test('only review cards: «Только повторение»; only new: «Все карточки новые»', () => {
    const first = renderPage({ cards: reviews })
    expect(screen.getByText(/Только повторение/)).toBeInTheDocument()
    first.unmount()
    localStorage.clear()
    renderPage({ cards: [newPhrase('n1')] })
    expect(screen.getByText(/Все карточки новые/)).toBeInTheDocument()
  })

  test('newCardsPerDay caps the new cards offered', () => {
    const fresh = Array.from({ length: 5 }, (_, i) => newPhrase(`n${i}`, i))
    renderPage({ cards: fresh, settings: { newCardsPerDay: 2 } })
    expect(tab(/Сессия/)).toHaveTextContent('Сессия2')
    expect(deckValue('Новых сегодня')).toBe('0 / 2')
  })

  test('new cards already introduced today count against the limit; at the limit the page says so', () => {
    localStorage.setItem(newSeenKey(), '2')
    const fresh = Array.from({ length: 5 }, (_, i) => newPhrase(`n${i}`, i))
    renderPage({ cards: fresh, settings: { newCardsPerDay: 2 } })
    expect(screen.getByText('На сегодня всё')).toBeInTheDocument()
    expect(screen.getByText(/Лимит новых карточек на сегодня исчерпан\./)).toBeInTheDocument()
    expect(deckValue('Новых сегодня')).toBe('2 / 2')
  })

  test('the time estimate is ≈ due × 15 s', () => {
    renderPage({ cards: Array.from({ length: 12 }, (_, i) => phrase(`r${i}`)) })
    expect(screen.getByText(/Только повторение · ≈3 мин/)).toBeInTheDocument()
  })

  test('errors in the log without cards: «Добавить в повторение» next to the due count', async () => {
    const { user, store } = renderPage({ cards: [phrase('r1')], errors: [errorEntry('e1', { exerciseId: 'a1-artigos-genero-numero-ex-02' })] })
    expect(screen.getByText(/Ошибок из журнала без карточек: 1\./)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Добавить в повторение' }))
    await flush()
    expect(store.cardList()).toHaveLength(2)
    expect(screen.queryByText(/Ошибок из журнала без карточек/)).not.toBeInTheDocument()
    expect(tab(/Сессия/)).toHaveTextContent('Сессия2')
  })

  test('levels table: cards counted by the level of their topic; cards without a level in «Без уровня»', () => {
    renderPage({ cards: [phrase('a', { topicId: 'a1-ser-estar' }), phrase('b', { topicId: 'aima-documentos', fsrs: fsrs({ due: NOW + DAY }) }), phrase('c')] })
    const row = (lvl: string) => within(deck()).getByText(lvl, { selector: 'td' }).closest('tr')!.textContent
    expect(row('A1')).toBe('A11 карточка1 сейчас')
    expect(row('B1')).toBe('B11 карточка—')
    expect(row('A2')).toBe('A20 карточек—')
    expect(row('Без уровня')).toBe('Без уровня1 карточка1 сейчас')
  })
})

describe('ReviewPage · tabs and the words-only deck', () => {
  test('«Все карточки» switches to the card list (?tab=all) and back', async () => {
    const { user } = renderPage({ cards: [phrase('r1')] })
    await user.click(tab(/Все карточки/))
    expect(location()).toBe('/review?tab=all')
    expect(tab(/Все карточки/)).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('group', { name: 'Тип карточек' })).toBeInTheDocument()
    expect(screen.getByText('ru r1')).toBeInTheDocument()
    await user.click(tab(/Сессия/))
    expect(location()).toBe('/review')
    expect(screen.queryByRole('group', { name: 'Тип карточек' })).not.toBeInTheDocument()
  })

  test('?tab=all opens the list directly', () => {
    renderPage({ cards: [phrase('r1')] }, '/review?tab=all')
    expect(tab(/Все карточки/)).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('searchbox', { name: 'Поиск по карточкам' })).toBeInTheDocument()
  })

  const words: WordEntry[] = [casa, comer]
  const wc = [wordCard(casa, 'recognize'), wordCard(comer, 'recognize', { fsrs: fsrs({ due: NOW + DAY }) })]

  test('deck switch appears with word cards; «Только слова» (?deck=words) counts only dictionary cards', async () => {
    const { user } = renderPage({ cards: [phrase('r1'), phrase('r2'), ...wc], words })
    const sw = screen.getByRole('radiogroup', { name: 'Какие карточки повторять' })
    expect(within(sw).getByRole('radio', { name: 'Все карточки · 3' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(sw).getByRole('radio', { name: 'Только слова · 1' }))
    expect(location()).toBe('/review?deck=words')
    expect(screen.getByText('слово')).toBeInTheDocument()
    expect(tab(/Сессия/)).toHaveTextContent('Сессия1')
  })

  test('words-only deck with nothing due: «Слов к повторению нет» + hint about «Учить новые»', () => {
    renderPage({ cards: [phrase('r1'), wc[1]], words: [comer] }, '/review?deck=words')
    expect(screen.getByText('Слов к повторению нет')).toBeInTheDocument()
    expect(screen.getByText(/Новые слова из «Моего словаря» можно выучить в «Учить новые»\./)).toBeInTheDocument()
  })

  test('no word cards: no deck switch', () => {
    renderPage({ cards: [phrase('r1')] })
    expect(screen.queryByRole('radiogroup', { name: 'Какие карточки повторять' })).not.toBeInTheDocument()
  })

  test('«Мой словарь» in the deck panel: statuses, words due, «Учить новые (N)» and «Повторить слова»', () => {
    const fresh = wordCard(comer, 'recognize', { fsrs: fsrsNew() })
    renderPage({ cards: [wordCard(casa, 'recognize'), fresh], words: [casa, comer] })
    expect(deckValue('Новое')).toBe('1')
    expect(deckValue('Учу')).toBe('1')
    expect(deckValue('Знаю')).toBe('0')
    expect(deckValue('Слов к повторению сейчас')).toBe('1')
    expect(deckValue('Новых слов ждут')).toBe('1')
    expect(within(deck()).getByRole('link', { name: /Учить новые \(1\)/ })).toHaveAttribute('href', '/words?learn=1')
    expect(within(deck()).getByRole('link', { name: 'Повторить слова' })).toHaveAttribute('href', '/review?deck=words')
    // ReviewTabs: the sub-navigation with the dictionary count.
    const nav = screen.getByRole('navigation', { name: 'Разделы повторения' })
    expect(within(nav).getByRole('link', { name: /Карточки/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /Мой словарь/ })).toHaveTextContent('Мой словарь2')
  })
})

describe('ReviewPage · a session from the page', () => {
  test('«Начать» → rate every card → «К карточкам» opens the full list with updated due labels', async () => {
    const { user, store } = renderPage({ cards: [phrase('r1'), newPhrase('n1')] })
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    expect(screen.getByRole('heading', { name: 'Повторение', level: 1 })).toHaveClass('sr-only')
    expect(screen.getByText('осталось 2')).toBeInTheDocument()
    // The deck panel stays beside the session, without the «Учить новые» actions.
    expect(deck()).toBeInTheDocument()
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
      await user.click(screen.getByRole('button', { name: /^Легко/ }))
    }
    await flush()
    expect(screen.getByRole('heading', { name: 'Сессия завершена' })).toBeInTheDocument()
    expect(localStorage.getItem(newSeenKey())).toBe('1')
    expect(store.cardList().every((c) => c.fsrs.due > NOW)).toBe(true)

    await user.click(screen.getByRole('button', { name: 'К карточкам' }))
    expect(location()).toBe('/review?tab=all')
    expect(tab(/Все карточки/)).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('к повторению')).not.toBeInTheDocument()
    const list = screen.getAllByRole('list').find((l) => l.closest('[role=tabpanel]'))!
    expect(within(list).getAllByText(/^через \d+ д$/)).toHaveLength(2)
    expect(tab(/Сессия/)).toHaveTextContent(/^Сессия$/)
  })

  test('a words-only session keeps ?deck=words after «К карточкам»', async () => {
    const { user } = renderPage({ cards: [phrase('r1'), wordCard(casa, 'recognize')], words: [casa] }, '/review?deck=words')
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    expect(screen.getByText('осталось 1')).toBeInTheDocument()
    expect(screen.getByText('Что это значит?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(screen.getByRole('button', { name: /^Хорошо/ }))
    await flush()
    await user.click(screen.getByRole('button', { name: 'К карточкам' }))
    const q = new URLSearchParams(location()!.split('?')[1])
    expect([q.get('tab'), q.get('deck')]).toEqual(['all', 'words'])
  })
})
