/**
 * ReviewSession: flashcards (show → reveal → rate), keyboard (Space / Enter / 1–4, guards), requeue of learning
 * steps, persisted FSRS updates, end of session, «Завершить» confirm, error cards reviewed as their exercise,
 * typed dictionary cards (Settings.typeWordAnswers) and the suggested rating.
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings, type SrsCard } from '@/data/types.ts'
import { ReviewSession } from '@/features/srs/ReviewSession'
import { DAY, NOW, card, fsrsNew, wordCard } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { casa, flush, freezeDate, newSeenKey, saude, setNow, storedCards } from '../../helpers/B-srs-fixtures'

vi.mock('@/engine/audio', async (orig) => ({
  ...(await orig<typeof import('@/engine/audio')>()),
  speak: vi.fn(async () => ({ source: 'none' })),
  stopSpeaking: vi.fn(),
  hasAudioFile: vi.fn(async () => false),
  pickPtPtVoice: vi.fn(async () => null),
}))

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch })

function setup(initial: SrsCard[], opts: { settings?: Settings; seedCards?: SrsCard[]; words?: typeof casa[] } = {}) {
  const onCardUpdated = vi.fn()
  const onFinish = vi.fn()
  const r = renderWithProviders(
    <ReviewSession initial={initial} settings={opts.settings ?? settings()} onCardUpdated={onCardUpdated} onFinish={onFinish} />,
    { seed: { cards: opts.seedCards ?? initial, words: opts.words } },
  )
  return { ...r, onCardUpdated, onFinish }
}

const ratingGroup = () => screen.getByRole('group', { name: /Насколько легко вы вспомнили|Оцените, как далось задание/ })
const ratingBtn = (name: RegExp) => within(ratingGroup()).getByRole('button', { name })

beforeEach(() => freezeDate(NOW))
afterEach(() => vi.useRealTimers())

describe('ReviewSession · flashcards', () => {
  const a = card('ph:a', { kind: 'phrase', front: 'Добрый день', back: 'Bom dia' })
  const b = card('ph:b', { kind: 'phrase', front: 'Спасибо', back: 'Obrigado' })

  test('shows the front, «Показать ответ» reveals the back and the 4 ratings with intervals', async () => {
    const { user } = setup([a, b])
    expect(screen.getByText('Переведите на португальский:')).toBeInTheDocument()
    expect(screen.getByText('Добрый день')).toBeInTheDocument()
    expect(screen.queryByText('Bom dia')).not.toBeInTheDocument()
    expect(screen.getByText('осталось 2')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Пройдено карточек: 0' })).toBeInTheDocument()
    const reveal = screen.getByRole('button', { name: /Показать ответ/ })
    expect(reveal).toHaveFocus()

    await user.click(reveal)
    expect(screen.getByText('Bom dia')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Показать ответ/ })).not.toBeInTheDocument()
    const group = ratingGroup()
    const names = within(group).getAllByRole('button').map((b) => b.textContent)
    expect(names.map((n) => n?.match(/^(Снова|Трудно|Хорошо|Легко)/)?.[1])).toEqual(['Снова', 'Трудно', 'Хорошо', 'Легко'])
    // Each button tells the next interval.
    for (const btn of within(group).getAllByRole('button')) expect(btn).toHaveTextContent(/следующий показ через\s*(<1 мин|\d+ (мин|ч|д|мес))/)
    // «Хорошо» is the default (focused) choice for a flashcard.
    expect(ratingBtn(/Хорошо/)).toHaveFocus()
  })

  test('a rating persists the FSRS update, calls onCardUpdated and moves to the next card', async () => {
    const { user, onCardUpdated, store } = setup([a, b])
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(ratingBtn(/Хорошо/))
    await flush()

    expect(screen.getByText('Спасибо')).toBeInTheDocument()
    expect(screen.getByText('осталось 1')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Пройдено карточек: 1' })).toBeInTheDocument()
    expect(onCardUpdated).toHaveBeenCalledTimes(1)
    const [updated, rating] = onCardUpdated.mock.calls[0]
    expect(rating).toBe('good')
    expect(updated.id).toBe('ph:a')
    expect(updated.fsrs.reps).toBe(a.fsrs.reps + 1)
    expect(updated.fsrs.due).toBeGreaterThan(NOW + DAY)
    expect(updated.fsrs.last_review).toBe(NOW)
    // In the store and in localStorage (local backend).
    expect(store.cardList().find((c) => c.id === 'ph:a')?.fsrs.reps).toBe(a.fsrs.reps + 1)
    expect(storedCards()['ph:a'].fsrs.due).toBe(updated.fsrs.due)
    // The next card starts unrevealed, focus back on «Показать ответ».
    expect(screen.getByRole('button', { name: /Показать ответ/ })).toHaveFocus()
  })

  test('keyboard: Space reveals, 1–4 rate; keys before reveal do not rate', async () => {
    const { user, onCardUpdated } = setup([a, b])
    await user.keyboard('3') // not revealed yet → ignored
    expect(onCardUpdated).not.toHaveBeenCalled()
    expect(screen.getByText('Добрый день')).toBeInTheDocument()

    // Space on the focused «Показать ответ» button activates it (button semantics).
    await user.keyboard(' ')
    expect(screen.getByText('Bom dia')).toBeInTheDocument()
    await user.keyboard('4')
    await flush()
    expect(onCardUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'ph:a' }), 'easy')

    // Space / Enter from the page body (not on a control) reveal too.
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(screen.getByText('Obrigado')).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: '2' })
    await flush()
    expect(onCardUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'ph:b' }), 'hard')
  })

  test('Enter right after the reveal is ignored (key guard); later it confirms the suggested «Хорошо»', async () => {
    const { onCardUpdated } = setup([a])
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(screen.getByText('Bom dia')).toBeInTheDocument()
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'Enter' }) // < 350 ms after the reveal
    await flush()
    expect(onCardUpdated).not.toHaveBeenCalled()
    setNow(NOW + 1000)
    fireEvent.keyDown(document.body, { key: 'Enter', repeat: true }) // held key → ignored
    await flush()
    expect(onCardUpdated).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'Enter' })
    await flush()
    expect(onCardUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: 'ph:a' }), 'good')
  })

  test('modifier keys and keys typed in a field are ignored', async () => {
    const { onCardUpdated } = setup([a])
    fireEvent.keyDown(document.body, { key: ' ', ctrlKey: true })
    expect(screen.queryByText('Bom dia')).not.toBeInTheDocument()
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: ' ' })
    expect(screen.queryByText('Bom dia')).not.toBeInTheDocument()
    input.remove()
    expect(onCardUpdated).not.toHaveBeenCalled()
  })

  test('a keyboard-activated rating click within 350 ms of the reveal is ignored', async () => {
    const { user, onCardUpdated } = setup([a])
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    fireEvent.click(ratingBtn(/Снова/), { detail: 0 })
    await flush()
    expect(onCardUpdated).not.toHaveBeenCalled()
    fireEvent.click(ratingBtn(/Снова/), { detail: 1 }) // a real pointer click counts
    await flush()
    expect(onCardUpdated).toHaveBeenCalledWith(expect.anything(), 'again')
  })

  test('«Снова» on a review card requeues it (learning step within 20 min) — the session goes on', async () => {
    const { user, onCardUpdated } = setup([a])
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(ratingBtn(/Снова/))
    await flush()
    expect(onCardUpdated.mock.calls[0][0].fsrs.state).toBe(3) // Relearning
    expect(onCardUpdated.mock.calls[0][0].fsrs.lapses).toBe(1)
    // Same card again, the session is not finished.
    expect(screen.getByText('Добрый день')).toBeInTheDocument()
    expect(screen.getByText('осталось 1')).toBeInTheDocument()
    expect(screen.queryByText('Сессия завершена')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(ratingBtn(/Хорошо/))
    await flush()
    expect(screen.getByRole('heading', { name: 'Сессия завершена' })).toBeInTheDocument()
    // 1 card, 2 answers, 1 of 2 recalled.
    expect(screen.getByText(/Карточек: 1 · ответов: 2 · вспомнили 50% · ~1 мин/)).toBeInTheDocument()
  })

  test('end of session: summary with counts per rating; «К карточкам» calls onFinish; «На главную» links home', async () => {
    const { user, onFinish } = setup([a, b])
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(ratingBtn(/Легко/))
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(ratingBtn(/Трудно/))
    await flush()
    const heading = screen.getByRole('heading', { name: 'Сессия завершена' })
    expect(heading).toHaveFocus()
    expect(screen.getByText(/Карточек: 2 · ответов: 2 · вспомнили 100%/)).toBeInTheDocument()
    const tile = (label: string) => screen.getByText(label, { selector: 'div' }).textContent
    expect(tile('Легко')).toBe('1Легко')
    expect(tile('Трудно')).toBe('1Трудно')
    expect(tile('Снова')).toBe('0Снова')
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/')
    await user.click(screen.getByRole('button', { name: 'К карточкам' }))
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  test('«Завершить» asks for confirmation; «Отмена» returns focus, «Завершить» ends the session early', async () => {
    const { user, onCardUpdated } = setup([a, b])
    await user.click(screen.getByRole('button', { name: /Завершить/ }))
    const confirm = screen.getByRole('group', { name: 'Завершить сессию?' })
    expect(within(confirm).getByRole('button', { name: 'Отмена' })).toHaveFocus()
    await user.click(within(confirm).getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('group', { name: 'Завершить сессию?' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Завершить/ })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: /Завершить/ }))
    await user.click(within(screen.getByRole('group', { name: 'Завершить сессию?' })).getByRole('button', { name: 'Завершить' }))
    expect(screen.getByRole('heading', { name: 'Сессия завершена' })).toBeInTheDocument()
    expect(screen.getByText(/Карточек: 0 · ответов: 0 · вспомнили 0%/)).toBeInTheDocument()
    expect(onCardUpdated).not.toHaveBeenCalled()
  })

  test('rating a new card bumps today’s new-card counter; a review card does not', async () => {
    const fresh = card('ph:new', { kind: 'phrase', front: 'Привет', back: 'Olá', fsrs: fsrsNew() })
    const { user } = setup([fresh, a])
    expect(localStorage.getItem(newSeenKey())).toBeNull()
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(ratingBtn(/Хорошо/))
    expect(localStorage.getItem(newSeenKey())).toBe('1')
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(ratingBtn(/Хорошо/))
    expect(localStorage.getItem(newSeenKey())).toBe('1')
  })

  test('a failed save shows the error (during the session and on the summary)', async () => {
    const { user, store, onCardUpdated } = setup([a, b])
    vi.spyOn(store, 'upsertCards').mockRejectedValue(new Error('квота'))
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(ratingBtn(/Хорошо/))
    await flush()
    expect(screen.getByText('Ошибка сохранения: квота')).toBeInTheDocument()
    expect(onCardUpdated).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(ratingBtn(/Хорошо/))
    await flush()
    expect(screen.getByText('Не всё сохранилось: квота')).toBeInTheDocument()
  })

  test('an empty initial queue renders the summary at once', () => {
    setup([])
    expect(screen.getByRole('heading', { name: 'Сессия завершена' })).toBeInTheDocument()
  })
})

describe('ReviewSession · error cards as their exercise', () => {
  // Real content: a1-artigos-genero-numero-ex-02 «Queria ___ café, por favor.» → um
  const err = card('error:a1-artigos-genero-numero-ex-02', {
    kind: 'error',
    exerciseId: 'a1-artigos-genero-numero-ex-02',
    topicId: 'a1-artigos-genero-numero',
    front: 'Queria ___ café, por favor.',
    back: 'um',
  })

  test('right answer → ratings with «Хорошо» suggested; Enter confirms it', async () => {
    const { user, onCardUpdated } = setup([err])
    expect(screen.getByText('Задание, в котором была ошибка')).toBeInTheDocument()
    expect(screen.getByText('Работа над ошибкой')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Показать ответ/ })).not.toBeInTheDocument()
    // Before answering, 1–4 / Space belong to the exercise: no rating happens.
    fireEvent.keyDown(document.body, { key: '3' })
    expect(screen.queryByRole('group', { name: 'Оцените, как далось задание' })).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox'), 'um{Enter}')
    const group = screen.getByRole('group', { name: 'Оцените, как далось задание' })
    expect(within(group).getByRole('button', { name: /Хорошо.*предложено по ответу/ })).toHaveFocus()
    expect(screen.getByText('Оценка предложена по ответу — можно выбрать другую.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Повторить тему/ })).toHaveAttribute('href', '/topic/a1-artigos-genero-numero')

    setNow(NOW + 1000)
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'Enter' })
    await flush()
    expect(onCardUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: err.id }), 'good')
  })

  test('wrong answer → «Снова» suggested', async () => {
    const { user } = setup([err])
    await user.type(screen.getByRole('textbox'), 'uma{Enter}')
    expect(screen.getByRole('button', { name: /Снова.*предложено по ответу/ })).toHaveFocus()
  })

  test('orphaned error card (exercise gone) falls back to a flashcard with the past answer', async () => {
    const orphan = card('error:gone', { kind: 'error', exerciseId: 'gone-ex-1', topicId: 'a1-ser-estar', front: 'Ошибка: «sou»', back: 'estou' })
    const { user } = setup([orphan])
    expect(screen.getByText('Исходное задание недоступно')).toBeInTheDocument()
    expect(screen.getByText('«sou»')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    expect(screen.getByText('estou')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Повторить тему «Ser и estar/ })).toHaveAttribute('href', '/topic/a1-ser-estar')
  })
})

describe('ReviewSession · typed dictionary cards', () => {
  const produce = wordCard(casa, 'produce', { front: 'дом; жилище', back: 'a casa' })

  test('typeWordAnswers on (default): RU → PT is typed; right answer → «Верно!», «Хорошо» suggested; persisted', async () => {
    const { user, onCardUpdated } = setup([produce], { words: [casa] })
    expect(screen.getByText('Напишите по-португальски')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Показать ответ/ })).not.toBeInTheDocument()
    const field = screen.getByRole('textbox', { name: 'Слово по-португальски' })
    await user.type(field, 'casa{Enter}')
    expect(screen.getByText('Верно!')).toBeInTheDocument()
    const good = screen.getByRole('button', { name: /Хорошо.*предложено по ответу/ })
    expect(good).toHaveFocus()
    await user.click(good)
    await flush()
    expect(onCardUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: produce.id }), 'good')
    expect(screen.getByRole('heading', { name: 'Сессия завершена' })).toBeInTheDocument()
  })

  test('wrong answer → «Неверно» with «Ваш ответ» / «Верно», «Снова» suggested', async () => {
    const { user } = setup([produce], { words: [casa] })
    await user.type(screen.getByRole('textbox', { name: 'Слово по-португальски' }), 'caso{Enter}')
    expect(screen.getByText('Неверно')).toBeInTheDocument()
    expect(screen.getByText('Ваш ответ')).toBeInTheDocument()
    expect(screen.getAllByText('a casa').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Снова.*предложено по ответу/ })).toHaveFocus()
  })

  test('«Не знаю» (Shift+Enter) → the answer is shown, «Снова» suggested', async () => {
    const { user } = setup([produce], { words: [casa] })
    await user.type(screen.getByRole('textbox', { name: 'Слово по-португальски' }), '{Shift>}{Enter}{/Shift}')
    expect(screen.getByText('Ничего страшного — вот ответ')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Снова.*предложено по ответу/ })).toBeInTheDocument()
  })

  test('accent-only mistake → «Трудно» suggested; with lenientAccents → «Хорошо»', async () => {
    const card1 = wordCard(saude, 'produce', { front: 'здоровье', back: 'a saúde' })
    const strict = setup([card1], { words: [saude] })
    await strict.user.type(screen.getByRole('textbox', { name: 'Слово по-португальски' }), 'saude{Enter}')
    expect(screen.getByText('Почти: ошибка только в акцентах')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Трудно.*предложено по ответу/ })).toBeInTheDocument()
    strict.unmount()

    const lenient = setup([card1], { words: [saude], settings: settings({ lenientAccents: true }) })
    await lenient.user.type(screen.getByRole('textbox', { name: 'Слово по-португальски' }), 'saude{Enter}')
    expect(screen.getByText('Верно, но проверьте акценты')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Хорошо.*предложено по ответу/ })).toBeInTheDocument()
  })

  test('typeWordAnswers off: the same card is a flip card («Показать ответ», no field)', async () => {
    const { user } = setup([produce], { words: [casa], settings: settings({ typeWordAnswers: false }) })
    expect(screen.getByText('Как это по-португальски?')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    expect(screen.getByRole('group', { name: 'Насколько легко вы вспомнили?' })).toBeInTheDocument()
    expect(screen.queryByText(/предложено по ответу/)).not.toBeInTheDocument()
  })

  // Regression D-06: the word (and its cards) deleted elsewhere during the session must not come back on rating.
  test('rating a dictionary card whose word was deleted meanwhile does not write it back [D-06]', async () => {
    const c = wordCard(casa, 'recognize')
    const { user, store, onCardUpdated } = setup([c], { words: [casa] })
    await act(() => store.saveWordBundle({ deleteWordIds: [casa.id], deleteCardIds: [c.id] }))
    await user.click(screen.getByRole('button', { name: /Показать ответ/ }))
    await user.click(ratingBtn(/^Хорошо/))
    await flush()
    expect(store.cardList().some((x) => x.id === c.id)).toBe(false)
    expect(onCardUpdated).not.toHaveBeenCalled()
  })

  test('recognize cards are never typed (flip card even with typeWordAnswers on)', () => {
    setup([wordCard(casa, 'recognize')], { words: [casa] })
    expect(screen.getByText('Что это значит?')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Показать ответ/ })).toBeInTheDocument()
  })
})
