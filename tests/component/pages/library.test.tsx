import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { configure } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getReadingText, getVocabTheme } from '@/content'
import { parseCheatsheet } from '@/features/library/cheatsheets'
import { CheatsheetPage } from '@/features/library/CheatsheetPage'
import { ReadingPage } from '@/features/library/ReadingPage'
import { VocabQuiz, type QuizItem } from '@/features/library/VocabQuiz'
import { VocabThemePage } from '@/features/library/VocabThemePage'
import { getCheatsheet, listCheatsheets } from '@/content'
import { renderWithProviders } from '../../helpers/render'
import { skipThroughRunner } from '../../helpers/B-ui-runner'

// Whole-page renders (+ the lexicon chunk for «в словарь») are slow when the machine is busy.
vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 4000 })

const audio = vi.hoisted(() => {
  const calls: { text: string; resolve: (r: { source: 'file' | 'none' }) => void }[] = []
  return { calls, speak: null as unknown as ReturnType<typeof import('vitest').vi.fn>, stop: null as unknown as ReturnType<typeof import('vitest').vi.fn> }
})
vi.mock('@/engine/audio', async (orig) => {
  const real = await orig<typeof import('@/engine/audio')>()
  const { vi: v } = await import('vitest')
  audio.speak = v.fn((text: string) => new Promise((resolve) => audio.calls.push({ text, resolve })))
  audio.stop = v.fn()
  return { ...real, speak: audio.speak, stopSpeaking: audio.stop, getPtPtVoices: v.fn(async () => []), pickPtPtVoice: v.fn(async () => null) }
})

beforeEach(() => {
  audio.calls.length = 0
  audio.speak.mockClear()
})
afterEach(() => {
  for (const c of audio.calls) c.resolve({ source: 'file' })
})

describe('CheatsheetPage', () => {
  const id = 'conectores'
  const sheet = parseCheatsheet(getCheatsheet(id)!)

  test('title, back link, table of contents that jumps to numbered headings', async () => {
    const replace = vi.spyOn(history, 'replaceState')
    const { user } = renderWithProviders(<CheatsheetPage />, { route: `/practice/cheatsheets/${id}`, path: '/practice/cheatsheets/:id' })
    expect(screen.getByRole('heading', { level: 1, name: sheet.title })).toBeInTheDocument()
    expect(document.title).toBe(`${sheet.title} — Learning Portuguese`)
    expect(screen.getAllByRole('link', { name: 'Практика · Шпаргалки' })[0]).toHaveAttribute('href', '/practice/cheatsheets')
    const toc = screen.getByRole('navigation', { name: 'Содержание' })
    const links = within(toc).getAllByRole('link')
    expect(links).toHaveLength(sheet.toc.length)
    // Headings in the body get cs-<i> ids in document order.
    const target = document.getElementById('cs-1')!
    expect(target.textContent).toBe(sheet.toc[1].text)
    const scroll = vi.spyOn(target, 'scrollIntoView')
    await user.click(links[1])
    expect(scroll).toHaveBeenCalled()
    expect(replace.mock.calls.at(-1)?.[2]).toBe('#cs-1')
    // body is a pt lookup source
    expect(document.querySelector('[data-lookup="select"]')).not.toBeNull()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await user.click(screen.getByRole('button', { name: 'Печать' }))
    expect(print).toHaveBeenCalled()
  })

  test.each(listCheatsheets().map((c) => c.id))('%s: every TOC entry lands on the matching rendered heading', (sid) => {
    const parsed = parseCheatsheet(getCheatsheet(sid)!)
    renderWithProviders(<CheatsheetPage />, { route: `/practice/cheatsheets/${sid}`, path: '/practice/cheatsheets/:id' })
    parsed.toc.forEach((t, i) => {
      const h = document.getElementById(`cs-${i}`)
      expect(h, `cs-${i}`).not.toBeNull()
      expect(h!.tagName).toBe(t.level === 3 ? 'H3' : 'H2')
      expect(h!.textContent!.replace(/\s+/g, ' ').trim()).toBe(t.text)
    })
    expect(document.getElementById(`cs-${parsed.toc.length}`)).toBeNull()
  })

  test('unknown sheet → «Лист не найден»', () => {
    renderWithProviders(<CheatsheetPage />, { route: '/practice/cheatsheets/nope', path: '/practice/cheatsheets/:id' })
    expect(screen.getByText('Лист не найден')).toBeInTheDocument()
  })
})

describe('ReadingPage', () => {
  const id = 'a2-um-dia-em-lisboa'
  const text = getReadingText(id)!
  const route = { route: `/practice/reading/${id}`, path: '/practice/reading/:id' }

  test('header, paragraphs with play buttons, glossary, questions entry and tutor section', () => {
    renderWithProviders(<ReadingPage />, route)
    expect(screen.getByRole('heading', { level: 1, name: text.title })).toHaveAttribute('lang', 'pt-PT')
    expect(screen.getByText(`Чтение · ${text.paragraphs.length} абзацев`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Практика · Чтение' })).toHaveAttribute('href', '/practice/reading')
    expect(screen.getAllByRole('button', { name: /^Прослушать абзац \d+$/ })).toHaveLength(text.paragraphs.length)
    const gloss = screen.getByRole('heading', { name: 'Словарик' }).closest('section')!
    expect(within(gloss).getAllByRole('listitem')).toHaveLength(text.glossary.length)
    expect(within(gloss).getByText(text.glossary[0].ru)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${text.questions.length} вопросов на понимание`))).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Практика с агентом' })).toBeInTheDocument()
  })

  test('«Прочитать весь текст» plays paragraphs in order; «Остановить» stops', async () => {
    const { user } = renderWithProviders(<ReadingPage />, route)
    await user.click(screen.getByRole('button', { name: 'Прочитать весь текст' }))
    expect(audio.calls.map((c) => c.text)).toEqual([text.paragraphs[0]])
    await act(async () => audio.calls[0].resolve({ source: 'file' }))
    await waitFor(() => expect(audio.calls).toHaveLength(2))
    expect(audio.calls[1].text).toBe(text.paragraphs[1])
    await user.click(screen.getByRole('button', { name: 'Остановить' }))
    expect(audio.stop).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Прочитать весь текст' })).toBeInTheDocument()
    await act(async () => audio.calls[1].resolve({ source: 'file' }))
    expect(audio.calls).toHaveLength(2) // the loop exits after a stop
  })

  test('glossary words go to the dictionary one by one and all at once', async () => {
    const { user, store } = renderWithProviders(<ReadingPage />, route)
    const g0 = text.glossary[0].word
    const add = await screen.findByRole('button', { name: `Добавить «${g0}» в словарь` })
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 10_000 })
    await user.click(add)
    expect(await screen.findByRole('button', { name: `«${g0}» уже в словаре` })).toBeDisabled()
    expect(store.wordList().length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Добавить все в словарь' }))
    expect(await screen.findByRole('button', { name: 'Все в словаре' })).toBeDisabled()
  })

  test('questions: run to the end → result screen; progress saved under the reading id', async () => {
    const { user, store } = renderWithProviders(<ReadingPage />, route)
    await user.click(screen.getByRole('button', { name: 'Ответить на вопросы' }))
    const n = await skipThroughRunner(user)
    expect(n).toBe(text.questions.length)
    expect(await screen.findByText('Статус текста:', { exact: false })).toBeInTheDocument()
    await waitFor(() => expect(store.progressMap().get(id)?.attempts).toBe(1))
    expect(store.errorList().length).toBeGreaterThan(0)
    // Restart from the result screen
    await user.click(screen.getByRole('button', { name: 'Пройти заново' }))
    expect(screen.getByRole('progressbar', { name: `Прогресс: 0 из ${text.questions.length}` })).toBeInTheDocument()
  })

  test('unknown text → «Текст не найден» with a back link', () => {
    renderWithProviders(<ReadingPage />, { route: '/practice/reading/x', path: '/practice/reading/:id' })
    expect(screen.getByText('Текст не найден')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Практика · Чтение' })).toBeInTheDocument()
  })
})

describe('VocabThemePage', () => {
  const theme = getVocabTheme('saude')!
  const route = { route: '/practice/vocab/saude', path: '/practice/vocab/:id' }

  test('header with level and count; word rows; add one and all to the dictionary', async () => {
    const { user, store } = renderWithProviders(<VocabThemePage />, route)
    expect(screen.getByRole('heading', { level: 1, name: theme.title })).toBeInTheDocument()
    expect(screen.getByText(`Словарь · ${theme.words.length} слов`)).toBeInTheDocument()
    const list = screen.getByRole('region', { name: 'Слова темы' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(theme.words.length)
    const w0 = theme.words[0].pt
    const add = within(list).getByRole('button', { name: `Добавить «${w0}» в словарь` })
    await waitFor(() => expect(add).toBeEnabled(), { timeout: 10_000 })
    await user.click(add)
    expect(await within(list).findByRole('button', { name: `«${w0}» уже в словаре` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Добавить все в словарь (${theme.words.length - 1})` })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /Добавить все в словарь/ }))
    expect(await screen.findByRole('button', { name: 'Все слова в словаре' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Открыть «Мой словарь»' })).toHaveAttribute('href', '/words')
    expect(store.wordList()).toHaveLength(theme.words.length)
  })

  test('«Проверить себя» opens the quiz; «Закрыть самопроверку» closes it', async () => {
    const { user } = renderWithProviders(<VocabThemePage />, route)
    await user.click(screen.getByRole('button', { name: 'Проверить себя' }))
    expect(screen.getByRole('region', { name: 'Самопроверка' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Закрыть самопроверку' }))
    expect(screen.queryByRole('region', { name: 'Самопроверка' })).not.toBeInTheDocument()
  })

  test('«Не знаю» in the quiz quietly saves the word to the dictionary', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    const { user, store } = renderWithProviders(<VocabThemePage />, route)
    await waitFor(() => expect(screen.getByRole('button', { name: /Добавить все в словарь/ })).toBeEnabled(), { timeout: 10_000 })
    await user.click(screen.getByRole('button', { name: 'Проверить себя' }))
    await user.click(screen.getByRole('button', { name: 'Показать ответ' }))
    await user.click(screen.getByRole('button', { name: /^Не знаю/ }))
    await waitFor(() => expect(store.wordList().map((w) => w.lemma)).toEqual([expect.stringContaining('saúde')]))
    vi.restoreAllMocks()
  })

  test('unknown theme → «Словарь не найден»', () => {
    renderWithProviders(<VocabThemePage />, { route: '/practice/vocab/x', path: '/practice/vocab/:id' })
    expect(screen.getByText('Словарь не найден')).toBeInTheDocument()
  })
})

describe('VocabQuiz', () => {
  const items: QuizItem[] = [
    { key: '0', pt: 'a casa', ru: 'дом', gender: 'f', example: 'A casa é grande.' },
    { key: '1', pt: 'o carro', ru: 'машина', gender: 'm' },
    { key: '2', pt: 'o mar', ru: 'море' },
  ]
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999) // no shuffle: course order
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('flip, «Не знаю»/«Знаю» by buttons and keys 1/2, summary, repeat unknown, restart, close', async () => {
    const onUnknown = vi.fn()
    const onClose = vi.fn()
    const { user } = renderWithProviders(<VocabQuiz items={items} onUnknown={onUnknown} onClose={onClose} source={{ kind: 'vocab', id: 'saude' }} />)
    const quiz = screen.getByRole('region', { name: 'Самопроверка' })
    expect(within(quiz).getByText('1 / 3')).toBeInTheDocument()
    const cardBtn = within(quiz).getByRole('button', { name: /a casa/ })
    expect(cardBtn).toHaveFocus()
    expect(cardBtn).toHaveAttribute('aria-expanded', 'false')
    expect(within(quiz).getByText('ж · a', { exact: false })).toBeInTheDocument()
    // keys 1/2 do nothing before the flip
    await user.keyboard('2')
    expect(within(quiz).getByText('1 / 3')).toBeInTheDocument()
    await user.click(within(quiz).getByRole('button', { name: 'Показать ответ' }))
    expect(cardBtn).toHaveAttribute('aria-expanded', 'true')
    expect(cardBtn).toHaveTextContent('дом')
    expect(within(quiz).getByText('A casa é grande.')).toBeInTheDocument()
    await user.click(within(quiz).getByRole('button', { name: /^Не знаю/ }))
    expect(onUnknown).toHaveBeenCalledWith(0)

    // 2nd: Space flips (native button activation), key 2 = «Знаю»
    expect(within(quiz).getByRole('button', { name: /o carro/ })).toHaveFocus()
    await user.keyboard(' ')
    expect(within(quiz).getByRole('button', { name: /o carro/ })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(document.body, { key: '2' })
    expect(within(quiz).getByText(/3 \/ 3/)).toBeInTheDocument()

    // 3rd: Enter on the body flips, «Знаю» button
    fireEvent.keyDown(document.body, { key: 'Enter' })
    await user.click(within(quiz).getByRole('button', { name: /^Знаю/ }))

    expect(within(quiz).getByText('2 / 3')).toBeInTheDocument()
    expect(within(quiz).getByText(/Незнакомых слов: 1 — они добавлены в повторение\./)).toBeInTheDocument()
    expect(within(quiz).getByRole('progressbar', { name: 'Пройдено 3 из 3' })).toBeInTheDocument()
    await user.click(within(quiz).getByRole('button', { name: /Повторить незнакомые \(1\)/ }))
    expect(within(quiz).getByText('1 / 1')).toBeInTheDocument()
    await user.click(within(quiz).getByRole('button', { name: 'Показать ответ' }))
    await user.click(within(quiz).getByRole('button', { name: /^Знаю/ }))
    expect(within(quiz).getByText('Все слова знакомы!')).toBeInTheDocument()
    await user.click(within(quiz).getByRole('button', { name: 'Пройти заново' }))
    expect(within(quiz).getByText('1 / 3')).toBeInTheDocument()
    await user.click(within(quiz).getByRole('button', { name: 'Показать ответ' }))
    await user.keyboard('1')
    await user.keyboard(' ')
    await user.keyboard('1')
    await user.keyboard(' ')
    await user.keyboard('1')
    await user.click(within(quiz).getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalled()
  })

  // The finished round replaces the card and the answer buttons: focus falls to <body> (elsewhere the app moves focus
  // to the result when the focused control unmounts, e.g. LegacyWordCards, TutorPanel, DialogueSection).
  test.fails('after the last answer, keyboard focus lands on the summary, not on <body> [BUG B-62]', async () => {
    const { user } = renderWithProviders(<VocabQuiz items={items.slice(0, 1)} onUnknown={() => {}} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Показать ответ' }))
    await user.click(screen.getByRole('button', { name: /^Знаю/ }))
    expect(screen.getByText('Все слова знакомы!')).toBeInTheDocument()
    expect(document.activeElement).not.toBe(document.body)
  })

  test('RU → PT direction restarts the round and shows Russian on the front', async () => {
    const { user } = renderWithProviders(<VocabQuiz items={items} onUnknown={() => {}} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Показать ответ' }))
    await user.click(screen.getByRole('button', { name: /^Знаю/ }))
    await user.click(screen.getByRole('radio', { name: 'RU → PT' }))
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    const cardBtn = screen.getByRole('button', { name: /дом/ })
    expect(cardBtn).not.toHaveTextContent('a casa')
    // no pronunciation before the flip in RU → PT (it would give the answer away)
    expect(screen.queryByRole('button', { name: 'Произношение' })).not.toBeInTheDocument()
    await user.click(cardBtn)
    expect(cardBtn).toHaveTextContent('a casa')
    expect(screen.getByRole('button', { name: 'Произношение' })).toBeInTheDocument()
  })
})
