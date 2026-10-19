import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { configure } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getTopic, listTopics } from '@/content'
import { TOPIC_MODES, type TopicMode } from '@/features/tutor/modes'
import { TutorHubPage } from '@/features/tutor/TutorHubPage'
import { TutorPanel } from '@/features/tutor/TutorPanel'
import { SituationTutor, TopicTutor } from '@/features/tutor/panels'
import { getSituation } from '@/content'
import { NOW, DAY, progress, word, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'

// Whole-page renders (+ the lexicon chunk for «в словарь») are slow when the machine is busy.
vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 4000 })

const T = listTopics()[0]
const build = vi.fn((m: TopicMode) => `PROMPT[${m}] ${'x'.repeat(1200)}`)
const panel = (seed?: Seed, opts: { hideHubLink?: boolean } = {}) =>
  renderWithProviders(<TutorPanel modes={TOPIC_MODES} build={build} targetIds={[T.id]} hideHubLink={opts.hideHubLink} />, { seed })

let secure: PropertyDescriptor | undefined
beforeEach(() => {
  build.mockClear()
  secure = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
})
afterEach(() => {
  if (secure) Object.defineProperty(window, 'isSecureContext', secure)
  else delete (window as unknown as Record<string, unknown>).isSecureContext
  vi.restoreAllMocks()
})

describe('TutorPanel: mode and prompt', () => {
  test('mode radiogroup (click + arrows) rebuilds the prompt; show / hide the prompt with its length', async () => {
    const { user } = panel()
    const group = screen.getByRole('radiogroup', { name: 'Формат занятия' })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(TOPIC_MODES.length)
    expect(radios[0]).toBeChecked()
    expect(build).toHaveBeenLastCalledWith('explain')
    await user.click(radios[1])
    expect(radios[1]).toBeChecked()
    expect(build).toHaveBeenLastCalledWith('drill')
    await user.keyboard('{ArrowRight}')
    expect(radios[2]).toBeChecked()
    expect(radios[2]).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(radios[0]).toBeChecked()
    await user.keyboard('{End}')
    expect(radios[2]).toBeChecked()
    await user.keyboard('{Home}{ArrowLeft}')
    expect(radios[2]).toBeChecked()

    const show = screen.getByRole('button', { name: 'Показать промпт' })
    expect(show).toHaveAttribute('aria-expanded', 'false')
    await user.click(show)
    const pre = screen.getByLabelText('Текст промпта')
    expect(pre).toHaveTextContent('PROMPT[conversation]')
    expect(screen.getByText(/≈ 1\s221 символов/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Скрыть промпт' }))
    expect(screen.queryByLabelText('Текст промпта')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Открыть Claude/ })).toHaveAttribute('target', '_blank')
  })

  test('«Скопировать промпт» writes the current prompt to the clipboard and toasts', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const { user } = panel()
    await user.click(screen.getByRole('radio', { name: /Тренировка/ }))
    await user.click(screen.getByRole('button', { name: 'Скопировать промпт' }))
    expect(write).toHaveBeenCalledWith(build.mock.results.at(-1)!.value)
    expect(await screen.findByText('Скопировано')).toBeInTheDocument()
  })

  test('clipboard unavailable → legacy copy; when that fails too the prompt is shown and selected', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    const exec = vi.fn(() => false)
    ;(document as unknown as Record<string, unknown>).execCommand = exec
    const { user } = panel()
    await user.click(screen.getByRole('button', { name: 'Скопировать промпт' }))
    expect(exec).toHaveBeenCalledWith('copy')
    expect(await screen.findByText('Не удалось скопировать — текст выделен, скопируйте вручную')).toBeInTheDocument()
    expect(screen.getByLabelText('Текст промпта')).toBeInTheDocument()
    await waitFor(() => expect(window.getSelection()?.toString()).toContain('PROMPT[explain]'))
    // legacy path succeeds
    exec.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Скопировать промпт' }))
    expect(await screen.findByText('Скопировано')).toBeInTheDocument()
    delete (document as unknown as Record<string, unknown>).execCommand
  })
})

describe('TutorPanel: «Отметить пройденным»', () => {
  test('save is disabled until a self-assessment is chosen; «Нормально» → 7/10, status shown, history row', async () => {
    const { user, store } = panel()
    const save = screen.getByRole('button', { name: 'Отметить пройденным' })
    expect(save).toBeDisabled()
    expect(screen.getByText('Выберите самооценку')).toBeInTheDocument()
    const self = screen.getByRole('radiogroup', { name: 'Самооценка' })
    await user.click(within(self).getByRole('radio', { name: /Нормально/ }))
    expect(save).toBeEnabled()
    await user.click(save)
    const msg = await screen.findByText('Занятие засчитано: 7/10 · статус: Изучаю')
    expect(msg).toHaveFocus()
    const p = store.progressMap().get(T.id)!
    expect(p.history[0]).toMatchObject({ source: 'tutor', mode: 'explain', correct: 7, total: 10 })
    expect(screen.getByText('Прошлые занятия с агентом')).toBeInTheDocument()
    expect(screen.getByText(/· Разобрать тему · 7\/10/)).toBeInTheDocument()
    expect(save).toBeDisabled()
    expect(screen.getByRole('link', { name: /Все занятия с агентом и история/ })).toHaveAttribute('href', '/practice/tutor')
  })

  test('pasted «Итог: N/M» picks the matching band and is credited; a different band → self-assessment wins', async () => {
    const { user, store } = panel(undefined, { hideHubLink: true })
    const note = screen.getByRole('textbox', { name: /Что повторить/ })
    fireEvent.change(note, { target: { value: 'Итог: 9/10 · Оценка: уверенно. Повторить: por/para' } })
    const self = screen.getByRole('radiogroup', { name: 'Самооценка' })
    expect(within(self).getByRole('radio', { name: /Легко/ })).toBeChecked()
    expect(screen.getByText('Найден итог агента: 9/10 — он и будет засчитан.')).toBeInTheDocument()
    await user.click(within(self).getByRole('radio', { name: /Сложно/ }))
    expect(screen.getByText('Найден итог агента: 9/10 — не совпадает с выбранной оценкой, засчитается самооценка.')).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(within(self).getByRole('radio', { name: /Нормально/ })).toBeChecked()
    await user.keyboard('{End}')
    await user.click(screen.getByRole('button', { name: 'Отметить пройденным' }))
    expect(await screen.findByText(/^Занятие засчитано: 4\/10/)).toBeInTheDocument()
    expect(store.progressMap().get(T.id)!.history[0]).toMatchObject({ correct: 4, total: 10, note: 'Итог: 9/10 · Оценка: уверенно. Повторить: por/para' })
    expect(screen.queryByRole('link', { name: /Все занятия с агентом/ })).not.toBeInTheDocument()
    expect(note).toHaveValue('')

    // Matching band: the agent's score is credited.
    fireEvent.change(note, { target: { value: 'итог 9 из 10' } })
    await user.click(screen.getByRole('button', { name: 'Отметить пройденным' }))
    expect(await screen.findByText(/^Занятие засчитано: 9\/10/)).toBeInTheDocument()
  })

  test('a failing save shows the error', async () => {
    const { user, store } = panel()
    vi.spyOn(store, 'saveTopicResult').mockRejectedValue(new Error('offline'))
    await user.click(screen.getByRole('radio', { name: /Легко/ }))
    await user.click(screen.getByRole('button', { name: 'Отметить пройденным' }))
    expect(await screen.findByText('Не удалось сохранить: offline')).toBeInTheDocument()
  })
})

describe('TutorHubPage', () => {
  const hub = (seed?: Seed) => renderWithProviders(<TutorHubPage />, { route: '/practice/tutor', seed })

  test('fresh: daily session on the first topic, words empty note, topic and situation suggestions, empty history', () => {
    hub()
    expect(screen.getByRole('heading', { level: 1, name: 'Практика' })).toBeInTheDocument()
    const daily = screen.getByRole('heading', { name: 'Беседа дня' }).parentElement!
    expect(daily).toHaveTextContent(`Тема: ${T.title}`)
    expect(within(daily).getByRole('link', { name: T.title })).toHaveAttribute('href', `/topic/${T.id}`)
    expect(daily).toHaveTextContent('Ситуация:')
    expect(screen.getByRole('radiogroup', { name: 'Формат занятия' })).toBeInTheDocument()
    expect(screen.getByText(/Сейчас в словаре нет слов в работе/)).toBeInTheDocument()
    const topics = screen.getByRole('heading', { name: 'Темы для занятия' }).parentElement!
    const links = within(topics).getAllByRole('link')
    expect(links).toHaveLength(3)
    expect(links[0]).toHaveAttribute('href', `/topic/${T.id}?tab=tutor`)
    expect(links[0]).toHaveTextContent('следующая тема курса')
    const sits = screen.getByRole('heading', { name: 'Ситуации для сценок' }).parentElement!
    expect(within(sits).getAllByRole('link').filter((l) => l.getAttribute('href')?.endsWith('?tab=tutor'))).toHaveLength(4)
    expect(screen.getByText('Пока нет отмеченных занятий')).toBeInTheDocument()
  })

  test('weak topics first («последний результат N%»), history of tutor sessions with item links and note', () => {
    const at = NOW - DAY
    const weak = progress(T.id, 4, 10)
    const tutored = progress(listTopics()[1].id, 7, 10, { at, source: 'tutor' })
    tutored.history[0].mode = 'drill'
    tutored.history[0].note = 'Итог: 7/10'
    hub({ progress: [weak, tutored] })
    const topics = screen.getByRole('heading', { name: 'Темы для занятия' }).parentElement!
    expect(within(topics).getAllByRole('link')[0]).toHaveTextContent('последний результат 40%')
    expect(within(topics).getAllByRole('link')[0]).toHaveTextContent('Слабо')
    const hist = screen.getByRole('heading', { name: 'История занятий' }).parentElement!
    const item = within(hist).getByRole('listitem')
    expect(item).toHaveTextContent('Тренировка')
    expect(item).toHaveTextContent('7/10')
    expect(item).toHaveTextContent('Итог: 7/10')
    expect(within(item).getByRole('link', { name: getTopic(listTopics()[1].id)!.title })).toBeInTheDocument()
  })

  test('with dictionary words the «Мои слова» panel appears', () => {
    hub({ words: [word('casa', 'дом'), word('carro', 'машина', { level: 'A1' })] })
    expect(screen.queryByText(/Сейчас в словаре нет слов в работе/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('radiogroup', { name: 'Формат занятия' })).toHaveLength(2)
    expect(screen.getByRole('radio', { name: /Мои слова/ })).toBeChecked()
  })

  test('saving the daily session credits every daily item and keeps the same picks', async () => {
    const { user, store } = hub()
    const daily = screen.getByRole('heading', { name: 'Беседа дня' }).parentElement!
    const before = daily.textContent
    const dailyPanel = screen.getAllByRole('radiogroup', { name: 'Самооценка' })[0].closest('section')!
    await user.click(within(dailyPanel).getByRole('radio', { name: /Легко/ }))
    await user.click(within(dailyPanel).getByRole('button', { name: 'Отметить пройденным' }))
    await waitFor(() => expect(store.progressMap().size).toBe(2))
    const credited = [...store.progressMap().values()].filter((p) => p.history.some((r) => r.source === 'tutor' && r.mode === 'daily'))
    expect(credited).toHaveLength(2) // the topic + the day's situation
    expect(credited.map((p) => p.topicId)).toContain(T.id)
    const hist = screen.getByRole('heading', { name: 'История занятий' }).parentElement!
    expect(within(hist).getByRole('listitem')).toHaveTextContent('10/10')
    expect(daily.textContent).toBe(before) // frozen picks
  })

  // The picks are frozen in onSaved, but the store update re-renders the hub first (useSyncExternalStore is a sync
  // lane, flushed in a microtask before saveTutorSession's continuation): view.daily moves on, the TutorPanel key
  // changes and the panel remounts — then setFrozen remounts it again. The «засчитано» line and focus are lost.
  test.fails('daily session: «Занятие засчитано» stays visible after saving [BUG B-60]', async () => {
    const { user } = hub()
    const dailyPanel = screen.getAllByRole('radiogroup', { name: 'Самооценка' })[0].closest('section')!
    await user.click(within(dailyPanel).getByRole('radio', { name: /Легко/ }))
    await user.click(within(dailyPanel).getByRole('button', { name: 'Отметить пройденным' }))
    expect(await screen.findByText(/^Занятие засчитано: 10\/10/, {}, { timeout: 1500 })).toBeInTheDocument()
  })
})

describe('ready-made panels build real prompts per mode', () => {
  test('TopicTutor: every mode gives a prompt about the topic', async () => {
    const topic = getTopic('a1-ser-estar')!
    const { user } = renderWithProviders(<TopicTutor topic={topic} />)
    await user.click(screen.getByRole('button', { name: 'Показать промпт' }))
    for (const r of screen.getAllByRole('radio').filter((x) => x.closest('[aria-label="Формат занятия"]'))) {
      await user.click(r)
      expect(screen.getByLabelText('Текст промпта').textContent).toContain(topic.title)
    }
  })

  test('SituationTutor: role-play and dialogue modes mention the situation', async () => {
    const s = getSituation('no-cafe')!
    const { user } = renderWithProviders(<SituationTutor situation={s} />)
    await user.click(screen.getByRole('button', { name: 'Показать промпт' }))
    for (const r of within(screen.getByRole('radiogroup', { name: 'Формат занятия' })).getAllByRole('radio')) {
      await user.click(r)
      expect(screen.getByLabelText('Текст промпта').textContent).toContain(s.title)
    }
  })
})
