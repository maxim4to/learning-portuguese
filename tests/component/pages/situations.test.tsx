import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { configure } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getSituation } from '@/content'
import { SituationPage } from '@/features/situations/SituationPage'
import { WritingSection } from '@/features/situations/WritingSection'
import { renderWithProviders } from '../../helpers/render'
import { skipThroughRunner } from '../../helpers/B-ui-runner'

// Whole-page renders (+ the lexicon chunk for «в словарь») are slow when the machine is busy.
vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 4000 })

const audio = vi.hoisted(() => {
  const calls: { text: string; voice?: string; resolve: (r: { source: 'file' | 'none' }) => void }[] = []
  return { calls, speak: null as unknown as ReturnType<typeof import('vitest').vi.fn> }
})
vi.mock('@/engine/audio', async (orig) => {
  const real = await orig<typeof import('@/engine/audio')>()
  const { vi: v } = await import('vitest')
  audio.speak = v.fn((text: string, opts?: { voice?: string }) => new Promise((resolve) => audio.calls.push({ text, voice: opts?.voice, resolve })))
  return { ...real, speak: audio.speak, stopSpeaking: v.fn(), getPtPtVoices: v.fn(async () => []), pickPtPtVoice: v.fn(async () => null) }
})

const S = getSituation('no-cafe')!
const PATH = '/practice/situations/:id'
const open = (tab?: string, hash = '') =>
  renderWithProviders(<SituationPage />, { route: `/practice/situations/no-cafe${tab ? `?tab=${tab}` : ''}${hash}`, path: PATH })

beforeEach(() => {
  audio.calls.length = 0
})
afterEach(() => {
  for (const c of audio.calls) c.resolve({ source: 'file' })
})

describe('SituationPage: shell and tabs', () => {
  test('header, tabs with counts, dialogue panel by default, «next» buttons walk the tabs', async () => {
    const { user } = open()
    expect(screen.getByRole('heading', { level: 1, name: S.title })).toBeInTheDocument()
    expect(screen.getByText(S.titlePt)).toHaveAttribute('lang', 'pt-PT')
    expect(screen.getByRole('link', { name: 'Ситуации' })).toHaveAttribute('href', '/practice/situations')
    const tabs = within(screen.getByRole('tablist', { name: 'Разделы ситуации' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([
      `Диалог${S.dialogue.length}`,
      `Фразы${S.phrases.length}`,
      `Лексика${S.vocab.length}`,
      `Упражнения${S.exercises.length}`,
      'Письмо',
      'С агентом',
    ])
    expect(screen.getByRole('tab', { name: /Диалог/ })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('button', { name: /^Фразы/ }))
    expect(screen.getByRole('tab', { name: /Фразы/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText(S.titlePt)).not.toBeInTheDocument() // pt subtitle only on the dialogue tab
    await user.click(screen.getByRole('tab', { name: /С агентом/ }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Практика с агентом')
  })

  test('?tab=writing opens the writing panel; unknown tab → dialogue', () => {
    const { unmount } = open('writing')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Задание')
    unmount()
    open('nope')
    expect(screen.getByRole('tab', { name: /Диалог/ })).toHaveAttribute('aria-selected', 'true')
  })

  test('unknown situation → empty state with a link back', () => {
    renderWithProviders(<SituationPage />, { route: '/practice/situations/zzz', path: PATH })
    expect(screen.getByText('Ситуация не найдена')).toBeInTheDocument()
    expect(screen.getByText(/«zzz»/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'К ситуациям' })).toHaveAttribute('href', '/practice/situations')
  })
})

describe('Dialogue', () => {
  test('translations: global toggle is remembered per device; per-line override', async () => {
    const { user, unmount } = open()
    const first = S.dialogue[0]
    expect(screen.getByText(first.ru)).toBeInTheDocument()
    const global = screen.getByRole('button', { name: 'Показывать переводы' })
    expect(global).toHaveAttribute('aria-pressed', 'true')
    await user.click(global)
    expect(screen.queryByText(first.ru)).not.toBeInTheDocument()
    expect(localStorage.getItem('ptpt:v1:dialogue-show-ru')).toBe('0')
    const line1 = screen.getByRole('button', { name: 'Перевод реплики 1' })
    expect(line1).toHaveAttribute('aria-expanded', 'false')
    await user.click(line1)
    expect(screen.getByText(first.ru)).toBeInTheDocument()
    expect(line1).toHaveAttribute('aria-expanded', 'true')
    unmount()
    open()
    expect(screen.getByRole('button', { name: 'Показывать переводы' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText(first.ru)).not.toBeInTheDocument()
  })

  // WCAG 2.5.3 Label in Name (A): the visible «Роль B» is part of the accessible name.
  test('role-play toggle: accessible name contains its visible label «Роль B» [B-61]', () => {
    open()
    const btn = screen.getByRole('button', { name: 'Роль B: ролевая игра, вы — B' })
    expect(btn).toHaveTextContent('Роль B')
    expect(btn).toHaveAccessibleName(expect.stringContaining('Роль B'))
  })

  test('play one line with the speaker’s voice; the same button stops it', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Прослушать реплику 2' }))
    expect(audio.calls[0]).toMatchObject({ text: S.dialogue[1].pt, voice: 'male' })
    await user.click(screen.getByRole('button', { name: 'Остановить' }))
    expect(screen.getByRole('button', { name: 'Прослушать реплику 2' })).toBeInTheDocument()
  })

  test('role-play: B lines hidden with the Russian prompt; «Показать» reveals one; «Показать все мои реплики»', async () => {
    const { user } = open()
    const bCount = S.dialogue.filter((l) => l.speaker === 'B').length
    await user.click(screen.getByRole('button', { name: 'Роль B: ролевая игра, вы — B' }))
    expect(screen.getAllByRole('button', { name: 'Показать' })).toHaveLength(bCount)
    expect(screen.queryByText(S.dialogue[1].pt)).not.toBeInTheDocument()
    expect(screen.getAllByText('Ваша реплика:')).toHaveLength(bCount)
    await user.click(screen.getAllByRole('button', { name: 'Показать' })[0])
    expect(screen.getByText(S.dialogue[1].pt)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Показать все мои реплики (${bCount - 1})` }))
    expect(screen.queryByRole('button', { name: 'Показать' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Роль B: ролевая игра, вы — B' }))
    expect(screen.getByText(/Нажмите на слово — перевод/)).toBeInTheDocument()
  })

  test('«Весь диалог» in role-play waits on the learner’s line, Enter reveals and continues', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Роль B: ролевая игра, вы — B' }))
    await user.click(screen.getByRole('button', { name: 'Весь диалог' }))
    expect(screen.getByRole('button', { name: 'Стоп' })).toHaveAttribute('aria-pressed', 'true')
    expect(audio.calls.map((c) => c.text)).toEqual([S.dialogue[0].pt])
    await act(async () => audio.calls[0].resolve({ source: 'file' }))
    // 450 ms pause between lines, then the learner's turn
    expect(await screen.findByText('Ваша очередь — скажите вслух:', {}, { timeout: 8000 })).toBeInTheDocument()
    expect(audio.calls).toHaveLength(1)
    ;(document.activeElement as HTMLElement | null)?.blur()
    fireEvent.keyDown(window, { key: 'Enter' })
    await waitFor(() => expect(audio.calls).toHaveLength(2), { timeout: 5000 })
    expect(audio.calls[1]).toMatchObject({ text: S.dialogue[1].pt, voice: 'male' })
    expect(screen.getByText(S.dialogue[1].pt)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Стоп' }))
    expect(screen.getByRole('button', { name: 'Весь диалог' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('no pt-PT voice → warning and the sequence stops', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Весь диалог' }))
    await act(async () => audio.calls[0].resolve({ source: 'none' }))
    expect(await screen.findByText('На этом устройстве нет голоса pt-PT — аудио недоступно.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Весь диалог' })).toBeInTheDocument()
    expect(audio.calls).toHaveLength(1)
  })
})

describe('Phrases and vocabulary', () => {
  test('phrases: add one to review (card ph:<id>:0), toast with undo; counter line', async () => {
    const { user, store } = open('phrases')
    const name = S.phrases[0].pt
    expect(await screen.findByText('Добавляйте в повторение только то, что ещё не знаете')).toBeInTheDocument()
    const add = screen.getAllByRole('button', { name: `Добавить в повторение: «${name}»` })[0]
    await waitFor(() => expect(add).toBeEnabled())
    await user.click(add)
    await waitFor(() => expect(store.cardList().map((c) => c.id)).toContain('ph:no-cafe:0'))
    expect(await screen.findByText(/В повторении:/)).toHaveTextContent(`В повторении: 1 из ${S.phrases.length} фраз`)
    await user.click(screen.getByRole('button', { name: 'Отменить' }))
    await waitFor(() => expect(store.cardList()).toHaveLength(0))
  })

  test('vocab: add a word to the dictionary, then all', async () => {
    const { user, store } = open('vocab')
    const w0 = S.vocab[0].pt
    const add = screen.getAllByRole('button', { name: `Добавить «${w0}» в словарь` })[0]
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 10_000 })
    await user.click(add)
    await waitFor(() => expect(store.wordList()).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: `Добавить все в словарь (${S.vocab.length - 1})` }))
    expect(await screen.findByRole('button', { name: `Все слова в словаре (${S.vocab.length})` })).toBeDisabled()
    expect(store.wordList()).toHaveLength(S.vocab.length)
  })
})

describe('Exercises (SituationPractice)', () => {
  test('resumed run finishes → result screen, progress saved with source «situation»; «Письмо» next', async () => {
    // Resume at the last task (a typed one): the earlier kinds (match, order-words…) are covered by the exercise suites.
    const ids = S.exercises.map((e) => e.id)
    const answers = ids.slice(0, 9).map((id, i) => ({ exerciseId: id, topicId: 'no-cafe', given: 'x', expected: 'y', verdict: i < 6 ? 'correct' : 'wrong', ok: i < 6 }))
    sessionStorage.setItem('ptpt:v1:run:situation:no-cafe', JSON.stringify({ ids, index: 9, answers, current: null }))
    const { user, store } = open('exercises')
    expect(screen.getByText('Продолжаем с задания 10 из 10.')).toBeInTheDocument()
    await skipThroughRunner(user)
    expect(await screen.findByText(/Статус ситуации:/)).toBeInTheDocument()
    await waitFor(() => expect(store.progressMap().get('no-cafe')?.history[0]).toMatchObject({ source: 'situation', correct: 6, total: 10 }))
    await user.click(screen.getByRole('button', { name: /Письмо/ }))
    expect(screen.getByRole('tab', { name: 'Письмо' })).toHaveAttribute('aria-selected', 'true')
  })

  test('result → «Повторить ошибки» runs only the wrong ones and does not count progress; «Пройти заново» restarts', async () => {
    const ids = S.exercises.map((e) => e.id)
    const answers = ids.slice(0, 9).map((id, i) => ({ exerciseId: id, topicId: 'no-cafe', given: 'x', expected: 'y', verdict: i < 6 ? 'correct' : 'wrong', ok: i < 6 }))
    sessionStorage.setItem('ptpt:v1:run:situation:no-cafe', JSON.stringify({ ids, index: 9, answers, current: null }))
    const { user, store } = open('exercises')
    await skipThroughRunner(user)
    await waitFor(() => expect(store.progressMap().get('no-cafe')?.attempts).toBe(1))
    await user.click(screen.getAllByRole('button', { name: /Повторить ошибки \(4\)/ })[0])
    expect(screen.getByRole('progressbar', { name: 'Прогресс: 0 из 4' })).toBeInTheDocument()
    expect(screen.getAllByText('Упражнения: работа над ошибками').length).toBeGreaterThan(0)
    expect(await skipThroughRunner(user)).toBe(4)
    expect(await screen.findByText('Повтор ошибок не меняет статус.')).toBeInTheDocument()
    expect(store.progressMap().get('no-cafe')?.attempts).toBe(1)
    await user.click(screen.getByRole('button', { name: 'Пройти заново' }))
    expect(screen.getByRole('progressbar', { name: 'Прогресс: 0 из 10' })).toBeInTheDocument()
  })

  test('«Начать заново» restarts at task 1', async () => {
    const ids = S.exercises.map((e) => e.id)
    sessionStorage.setItem('ptpt:v1:run:situation:no-cafe', JSON.stringify({ ids, index: 3, answers: [], current: null }))
    const { user } = open('exercises')
    await user.click(screen.getByRole('button', { name: 'Начать заново' }))
    expect(screen.getByRole('progressbar', { name: 'Прогресс: 0 из 10' })).toBeInTheDocument()
  })
})

describe('Writing', () => {
  test('draft autosaves to ptpt:v1:writing:<id> after 400 ms, word count, restored on reopen', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { unmount } = open('writing')
      const box = screen.getByRole('textbox', { name: 'Ваш текст' })
      expect(screen.getByText('Черновик сохраняется автоматически')).toBeInTheDocument()
      fireEvent.change(box, { target: { value: 'Boa tarde. Queria uma bica.' } })
      expect(screen.getByText('Сохраняю…')).toBeInTheDocument()
      expect(screen.getByText('слов: 5')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(400))
      expect(screen.getByText('Черновик сохранён на этом устройстве')).toBeInTheDocument()
      expect(localStorage.getItem('ptpt:v1:writing:no-cafe')).toBe('Boa tarde. Queria uma bica.')
      unmount()
      open('writing')
      expect(screen.getByRole('textbox', { name: 'Ваш текст' })).toHaveValue('Boa tarde. Queria uma bica.')
      fireEvent.change(screen.getByRole('textbox', { name: 'Ваш текст' }), { target: { value: '' } })
      act(() => vi.advanceTimersByTime(400))
      expect(localStorage.getItem('ptpt:v1:writing:no-cafe')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  test('checklist «Все пункты проверены»; sample show/hide; #writing-sample opens it', async () => {
    const { user, unmount } = open('writing')
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(S.writingTask!.checklist.length)
    for (const b of boxes) await user.click(b)
    expect(screen.getByText('Все пункты проверены')).toBeInTheDocument()
    await user.click(boxes[0])
    expect(screen.queryByText('Все пункты проверены')).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Показать образец' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByRole('heading', { name: 'Образец' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Скрыть образец' }))
    expect(screen.queryByRole('heading', { name: 'Образец' })).not.toBeInTheDocument()
    unmount()
    open('writing', '#writing-sample')
    expect(screen.getByRole('heading', { name: 'Образец' })).toBeInTheDocument()
  })

  test('a situation without a writing task: no tab; the section explains', () => {
    const noTask = { ...S, writingTask: undefined }
    renderWithProviders(<WritingSection situation={noTask} />)
    expect(screen.getByText('Для этой ситуации нет задания на письмо.')).toBeInTheDocument()
  })
})
