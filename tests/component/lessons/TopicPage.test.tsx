import { screen, within } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getTopic, listTopics, type Exercise } from '@/content'
import type { AnswerRecord } from '@/features/exercises'
import { plural } from '@/features/library/format'
import { TopicPage } from '@/features/lessons/TopicPage'
import { progress, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'

vi.mock('@/engine/audio', async (orig) => ({
  ...(await orig<typeof import('@/engine/audio')>()),
  speak: vi.fn(async () => ({ source: 'speech' })),
  stopSpeaking: vi.fn(),
}))

const TOPIC = getTopic('a1-ser-estar')!

function Probe() {
  const loc = useLocation()
  return <output data-testid="loc">{loc.pathname + loc.search}</output>
}

function open(path: string, seed?: Seed) {
  return renderWithProviders(
    <>
      <TopicPage />
      <Probe />
    </>,
    { route: path, path: '/topic/:id', seed },
  )
}

const loc = () => screen.getByTestId('loc').textContent
const tab = (name: RegExp | string) => screen.getByRole('tab', { name })
const panel = () => screen.getByRole('tabpanel')

const answer = (e: Exercise, ok: boolean, patch: Partial<AnswerRecord> = {}): AnswerRecord => ({
  exerciseId: e.id,
  topicId: e.topicId,
  given: ok ? 'ok' : 'nope',
  expected: 'exp',
  verdict: ok ? 'correct' : 'wrong',
  ok,
  ...patch,
})

/** Pre-seeds a run that is one click from the end («Завершить» on the last, already answered task). */
function seedAlmostDone(topicId: string, source: 'lesson' | 'mini-test', list: Exercise[], okUpTo: number) {
  const answers = list.slice(0, -1).map((e, i) => answer(e, i < okUpTo))
  const last = list[list.length - 1]
  sessionStorage.setItem(
    `ptpt:v1:run:topic:${topicId}:${source}`,
    JSON.stringify({ ids: list.map((e) => e.id), index: list.length - 1, answers, current: answer(last, okUpTo >= list.length) }),
  )
}

afterEach(() => vi.restoreAllMocks())

describe('TopicPage: tabs and theory', () => {
  test('theory is the default tab: header, theory, collapsibles, plan', () => {
    open('/topic/a1-ser-estar')
    expect(screen.getByRole('heading', { level: 1, name: TOPIC.title })).toBeInTheDocument()
    expect(screen.getByText(TOPIC.titlePt)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Курс' })).toHaveAttribute('href', '/syllabus')
    expect(tab('Теория')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('PT vs BR')).toBeInTheDocument()
    expect(screen.getByText('Частые ошибки')).toBeInTheDocument()
    const plan = screen.getByRole('complementary', { name: 'План темы' })
    expect(within(plan).getByText('Тема ещё не начата')).toBeInTheDocument()
    expect(within(plan).getByText('5 примеров')).toBeInTheDocument()
    expect(within(plan).getByText(plural(TOPIC.exercises.length, "задание", "задания", "заданий"))).toBeInTheDocument()
    expect(within(plan).getByText('10 вопросов')).toBeInTheDocument()
  })

  test('tab counters for exercises and mini-test', () => {
    open('/topic/a1-ser-estar')
    expect(tab(/Упражнения/)).toHaveTextContent(String(TOPIC.exercises.length))
    expect(tab(/Мини-тест/)).toHaveTextContent(String(TOPIC.miniTest.length))
  })

  test('plan shows the last result when there is progress', () => {
    open('/topic/a1-ser-estar', { progress: [progress('a1-ser-estar', 9, 10)] })
    expect(screen.getByText('Последний результат 90% · попыток 1')).toBeInTheDocument()
  })

  test('prerequisites with their status are listed on the theory tab', () => {
    open('/topic/a1-ter-haver', { progress: [progress('a1-ser-estar', 9, 10)] })
    const link = screen.getByRole('link', { name: /Ser и estar/ })
    expect(link).toHaveAttribute('href', '/topic/a1-ser-estar')
    expect(link).toHaveTextContent('(Уверенно)')
    expect(screen.getByRole('link', { name: /\(Не начато\)/ })).toBeInTheDocument()
  })

  test('?tab= opens that tab; an unknown value falls back to theory', () => {
    const a = open('/topic/a1-ser-estar?tab=examples')
    expect(tab('Примеры')).toHaveAttribute('aria-selected', 'true')
    // Prerequisite details line only on the theory tab.
    expect(screen.queryByText(TOPIC.titlePt)).not.toBeInTheDocument()
    a.unmount()
    open('/topic/a1-ser-estar?tab=bogus')
    expect(tab('Теория')).toHaveAttribute('aria-selected', 'true')
  })

  test('switching tabs writes ?tab= (theory clears it); plan buttons navigate', async () => {
    const { user } = open('/topic/a1-ser-estar')
    await user.click(tab(/Мини-тест/))
    expect(loc()).toBe('/topic/a1-ser-estar?tab=mini-test')
    await user.click(tab('Теория'))
    expect(loc()).toBe('/topic/a1-ser-estar')
    await user.click(screen.getByRole('button', { name: 'К упражнениям' }))
    expect(loc()).toBe('/topic/a1-ser-estar?tab=exercises')
    await user.click(tab('Теория'))
    await user.click(within(panel()).getByRole('button', { name: 'Примеры' }))
    expect(loc()).toBe('/topic/a1-ser-estar?tab=examples')
  })

  test('arrow keys move between tabs', async () => {
    const { user } = open('/topic/a1-ser-estar')
    tab('Теория').focus()
    await user.keyboard('{ArrowRight}')
    expect(tab('Примеры')).toHaveFocus()
    expect(loc()).toBe('/topic/a1-ser-estar?tab=examples')
  })

  test('tutor tab renders the agent panel', () => {
    open('/topic/a1-ser-estar?tab=tutor')
    expect(tab(/С агентом/)).toHaveAttribute('aria-selected', 'true')
    expect(within(panel()).getByRole('heading', { name: 'Практика с агентом' })).toBeInTheDocument()
  })
})

describe('TopicPage: examples', () => {
  test('lists every example with audio and a review toggle; «К упражнениям» switches tabs', async () => {
    const audio = await import('@/engine/audio')
    const { user } = open('/topic/a1-ser-estar?tab=examples')
    const p = panel()
    for (const ex of TOPIC.examples) {
      expect(within(p).getByText(ex.pt)).toBeInTheDocument()
      expect(within(p).getByText(ex.ru)).toBeInTheDocument()
    }
    const first = within(p).getByText(TOPIC.examples[0].pt)
    expect(first).toHaveAttribute('lang', 'pt-PT')
    expect(first).toHaveAttribute('data-pt-src', 'topic:a1-ser-estar:examples:0')
    await user.click(within(p).getAllByRole('button', { name: 'Прослушать' })[0])
    expect(audio.speak).toHaveBeenCalledWith(TOPIC.examples[0].pt, expect.anything())
    await user.click(within(p).getByRole('button', { name: /К упражнениям/ }))
    expect(loc()).toBe('/topic/a1-ser-estar?tab=exercises')
  })
})

describe('TopicPage: practice (PracticeSection + ResultScreen)', () => {
  test('exercises tab shows a runner over the topic exercises', () => {
    open('/topic/a1-ser-estar?tab=exercises')
    const p = panel()
    expect(within(p).getAllByText((_, el) => el?.textContent === `Задание 1 / ${TOPIC.exercises.length}`).length).toBeGreaterThan(0)
    expect(within(p).getByRole('heading', { name: 'Вставьте пропущенное' })).toBeInTheDocument()
  })

  test('good lesson run → saved progress, primary «Мини-тест · 10 вопросов» opens the mini-test tab', async () => {
    seedAlmostDone('a1-ser-estar', 'lesson', TOPIC.exercises, TOPIC.exercises.length)
    const { user, store } = open('/topic/a1-ser-estar?tab=exercises')
    expect(within(panel()).getByText(`Продолжаем с задания ${TOPIC.exercises.length} из ${TOPIC.exercises.length}.`)).toBeInTheDocument()
    await user.click(within(panel()).getByRole('button', { name: 'Завершить' }))
    const heading = await within(panel()).findByRole('heading', { name: /Упражнения пройдены: 21 из 21/ })
    expect(heading).toBeInTheDocument()
    expect(await within(panel()).findByText('Статус темы:')).toBeInTheDocument()
    expect(store.progressList().find((x) => x.topicId === 'a1-ser-estar')).toMatchObject({ status: 'confident', lastPct: 1 })
    expect(store.errorList()).toHaveLength(0)
    const primary = within(panel()).getByRole('button', { name: /Мини-тест · 10 вопросов/ })
    expect(primary).toHaveFocus()
    await user.click(primary)
    expect(loc()).toBe('/topic/a1-ser-estar?tab=mini-test')
    expect(sessionStorage.getItem('ptpt:v1:run:topic:a1-ser-estar:lesson')).toBeNull()
  })

  test('low lesson run → «Повторить ошибки (n)» starts a retry run over the mistakes; errors are logged', async () => {
    seedAlmostDone('a1-ser-estar', 'lesson', TOPIC.exercises, 5)
    const wrong = TOPIC.exercises.length - 5
    const { user, store } = open('/topic/a1-ser-estar?tab=exercises')
    await user.click(within(panel()).getByRole('button', { name: 'Завершить' }))
    const primary = await within(panel()).findByRole('button', { name: `Повторить ошибки (${wrong})` })
    expect(await within(panel()).findByRole('heading', { name: `Работа над ошибками · ${wrong}` })).toBeInTheDocument()
    await vi.waitFor(() => expect(store.errorList()).toHaveLength(wrong))
    expect(store.progressList().find((x) => x.topicId === 'a1-ser-estar')).toMatchObject({ status: 'weak', attempts: 1 })
    await user.click(primary)
    expect(within(panel()).getAllByText((_, el) => el?.textContent === `Задание 1 / ${wrong}`).length).toBeGreaterThan(0)
    expect(within(panel()).getAllByText('Упражнения: работа над ошибками').length).toBeGreaterThan(0)
  })

  test('mini-test after the lesson, good score → «Следующая тема: …» link', async () => {
    const next = listTopics()[listTopics().findIndex((t) => t.id === TOPIC.id) + 1]
    seedAlmostDone('a1-ser-estar', 'mini-test', TOPIC.miniTest, TOPIC.miniTest.length)
    const { user } = open('/topic/a1-ser-estar?tab=mini-test')
    await user.click(within(panel()).getByRole('button', { name: 'Завершить' }))
    expect(await within(panel()).findByRole('heading', { name: /Мини-тест: 10 из 10/ })).toBeInTheDocument()
    const link = await within(panel()).findByRole('link', { name: `Следующая тема: ${next.title}` })
    expect(link).toHaveAttribute('href', `/topic/${next.id}`)
    expect(within(panel()).getByRole('complementary', { name: 'Что дальше' })).toBeInTheDocument()
  })

  test('low score on a topic with weak prerequisites → «Подтянуть: <prerequisite>»', async () => {
    const t = getTopic('a1-ter-haver')!
    seedAlmostDone(t.id, 'mini-test', t.miniTest, 2)
    const { user } = open(`/topic/${t.id}?tab=mini-test`)
    await user.click(within(panel()).getByRole('button', { name: 'Завершить' }))
    const link = await within(panel()).findByRole('link', { name: /^Подтянуть: / })
    expect(t.requires.map((id) => `/topic/${id}`)).toContain(link.getAttribute('href'))
  })

  test('«Пройти заново» on the result screen restarts the full run', async () => {
    seedAlmostDone('a1-ser-estar', 'mini-test', TOPIC.miniTest, TOPIC.miniTest.length)
    const { user } = open('/topic/a1-ser-estar?tab=mini-test')
    await user.click(within(panel()).getByRole('button', { name: 'Завершить' }))
    await user.click(await within(panel()).findByRole('button', { name: 'Пройти заново' }))
    expect(within(panel()).getAllByText((_, el) => el?.textContent === 'Задание 1 / 10').length).toBeGreaterThan(0)
    expect(within(panel()).queryByText(/Продолжаем с задания/)).not.toBeInTheDocument()
  })
})

describe('TopicPage: unknown topic', () => {
  test('an id outside the syllabus → «Тема не найдена» with a link to the course', () => {
    open('/topic/zz-nope')
    expect(screen.getByText('Тема не найдена')).toBeInTheDocument()
    expect(screen.getByText('zz-nope')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'К курсу' })).toHaveAttribute('href', '/syllabus')
  })
})
