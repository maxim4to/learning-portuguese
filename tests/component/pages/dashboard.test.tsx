import { screen, within } from '@testing-library/react'
import { configure } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getTopic, listSituations, listTopics } from '@/content'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { card, DAY, errorEntry, fsrs, fsrsNew, NOW, progress, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'

// Whole-page renders (+ the lexicon chunk for «в словарь») are slow when the machine is busy.
vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 4000 })

const HOUR = 3_600_000
const topics = listTopics()
const T0 = topics[0]
const T1 = topics[1]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

const renderDash = (seed?: Seed) => renderWithProviders(<DashboardPage />, { seed })
const goal = () => screen.getByRole('progressbar', { name: /Повторено|Сегодня/ })
const goalBox = () => goal().parentElement as HTMLElement

/** A card reviewed today (`ago` ms before NOW), next due in the future. */
const reviewedToday = (id: string, ago = HOUR) => card(id, { fsrs: fsrs({ last_review: NOW - ago, due: NOW + 3 * DAY }) })
const dueCard = (id: string) => card(id) // review card, due yesterday, last review 4 days ago
const newCard = (id: string) => card(id, { fsrs: fsrsNew(NOW - DAY) })

describe('Dashboard: first visit (onboarding)', () => {
  test('no data → diagnostic first, first topic, course map, no streak, no widgets', () => {
    renderDash()
    expect(screen.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeInTheDocument()
    expect(screen.getByText('Начните с диагностики: около 20 минут, и курс подскажет, с чего начать.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Пройти диагностику/ })).toHaveAttribute('href', '/diagnostic')
    expect(screen.getByRole('link', { name: 'Открыть первую тему' })).toHaveAttribute('href', `/topic/${T0.id}`)
    const more = screen.getByRole('region', { name: 'Ещё в приложении' })
    expect(within(more).getByRole('link', { name: /Карта курса/ })).toHaveTextContent(/\d+ тем(а|ы)? от A1 до B2/)
    expect(within(more).getByRole('link', { name: /Беседа дня с агентом/ })).toHaveAttribute('href', '/practice/tutor')
    expect(screen.queryByText(/подряд|Начните серию/)).not.toBeInTheDocument()
    expect(screen.queryByText('Последние ошибки')).not.toBeInTheDocument()
  })

  test('a diagnostic alone (settings.lastDiagnosticAt) ends onboarding', () => {
    renderDash({ settings: { lastDiagnosticAt: NOW - DAY } })
    expect(screen.queryByRole('link', { name: /Пройти диагностику/ })).not.toBeInTheDocument()
    expect(screen.getByText('Начните серию сегодня')).toBeInTheDocument()
  })
})

describe('Dashboard: with progress', () => {
  test('weak topic, no cards: «Продолжим курс · Подтянуть», next topic row, empty goal, streak from yesterday', () => {
    renderDash({ progress: [progress(T1.id, 4, 10, { at: NOW - DAY })] })
    expect(screen.getByText(`Повторение готово. Дальше по курсу: ${T1.title}.`)).toBeInTheDocument()
    expect(screen.getByText('Продолжим курс')).toBeInTheDocument()
    expect(screen.getByText(`Подтянуть: ${T1.title}`)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Повторить тему/ })).toHaveAttribute('href', `/topic/${T1.id}`)
    const next = screen.getByRole('heading', { name: 'Дальше по курсу' }).parentElement!
    expect(within(next).getByRole('link')).toHaveAttribute('href', `/topic/${T0.id}`)
    expect(within(next).getByRole('link')).toHaveTextContent('Следующая тема')
    expect(goal()).toHaveAccessibleName('Сегодня карточек нет')
    expect(goalBox()).toHaveTextContent('откройте тему — карточки появятся')
    const streak = screen.getByText('1 день подряд').closest('[title]')!
    expect(streak).toHaveAttribute('title', 'Позанимайтесь сегодня, чтобы не прервать серию')
    // A lesson only yesterday: the week shows 1 activity.
    expect(screen.getByRole('img', { name: 'Всего за неделю: 1' })).toBeInTheDocument()
  })

  test('learning topic with a «было N%» row, next topic as the primary action', () => {
    renderDash({ progress: [progress(T0.id, 7, 10)], cards: [reviewedToday('r1')] })
    // nothing due: primary = the shaky topic; with cards → «Повторение на сегодня готово»
    expect(screen.getByText('Повторение на сегодня готово')).toBeInTheDocument()
    expect(screen.getByText(`Подтянуть: ${T0.title}`)).toBeInTheDocument()
    const rows = screen.getByRole('heading', { name: 'Дальше по курсу' }).parentElement!
    expect(rows).toHaveTextContent('Следующая тема')
    expect(goal()).toHaveAccessibleName('Повторено 1 из 1 карточки')
    expect(goalBox()).toHaveTextContent('всё на сегодня повторено')
  })

  test('due cards: count with plural, minutes, «Начать повторение», goal ring «1 из 4 карточек», streak active today', () => {
    renderDash({
      progress: [progress(T0.id, 9, 10)],
      cards: [dueCard('d1'), dueCard('d2'), dueCard('d3'), reviewedToday('r1')],
    })
    expect(screen.getByText(`Сначала повторение — около 1 мин, затем тема «${T1.title}».`)).toBeInTheDocument()
    const hero = screen.getByRole('heading', { name: 'План на сегодня' }).parentElement!
    expect(hero).toHaveTextContent('3карточки к повторению')
    expect(hero).toHaveTextContent('Только повторение · ≈1 мин')
    expect(within(hero).getByRole('link', { name: /Начать повторение/ })).toHaveAttribute('href', '/review')
    expect(goal()).toHaveAccessibleName('Повторено 1 из 4 карточек')
    expect(goal()).toHaveAttribute('aria-valuenow', '25')
    expect(goalBox()).toHaveTextContent('повторено, осталось 3')
    expect(goalBox()).toHaveTextContent('25%')
    expect(screen.getByText('2 дня подряд').closest('[title]')).toHaveAttribute('title', 'Сегодня занятие засчитано')
  })

  test('new cards: «Все новые», limited by the daily new-card setting; mixed → «Из них новых»', () => {
    const { unmount } = renderDash({
      progress: [progress(T0.id, 9, 10)],
      cards: [newCard('n1'), newCard('n2'), newCard('n3')],
      settings: { newCardsPerDay: 2 },
    })
    let hero = screen.getByRole('heading', { name: 'План на сегодня' }).parentElement!
    expect(hero).toHaveTextContent('2карточки к повторению')
    expect(hero).toHaveTextContent('Все новые')
    unmount()
    renderDash({ progress: [progress(T0.id, 9, 10)], cards: [newCard('n1'), dueCard('d1'), dueCard('d2'), dueCard('d3'), dueCard('d4')] })
    hero = screen.getByRole('heading', { name: 'План на сегодня' }).parentElement!
    expect(hero).toHaveTextContent('5карточек к повторению')
    expect(hero).toHaveTextContent('Из них новых: 1 · ≈1 мин')
    expect(goal()).toHaveAccessibleName('Повторено 0 из 5 карточек')
  })

  test.each([
    [1, '1карточка к повторению', 'Повторено 0 из 1 карточки'],
    [21, '21карточка к повторению', 'Повторено 0 из 21 карточки'],
    [12, '12карточек к повторению', 'Повторено 0 из 12 карточек'],
  ])('Russian plurals for %i due cards', (n, heroText, ring) => {
    renderDash({ progress: [progress(T0.id, 9, 10)], cards: Array.from({ length: n }, (_, i) => dueCard(`d${i}`)) })
    expect(screen.getByRole('heading', { name: 'План на сегодня' }).parentElement).toHaveTextContent(heroText)
    expect(goal()).toHaveAccessibleName(ring)
  })

  test('exercises today without cards: «Сделано N упражнений» (plural)', () => {
    const today = NOW - HOUR
    const p = progress(T0.id, 9, 10, { at: today })
    p.history.push({ topicId: T0.id, correct: 8, total: 10, at: today - 1000, source: 'lesson' })
    renderDash({ progress: [p, progress(T1.id, 9, 10, { at: today })] })
    expect(goal()).toHaveAccessibleName('Сегодня сделано 3 упражнения')
    expect(goalBox()).toHaveTextContent('карточек на сегодня нет')
    expect(goal()).toHaveAttribute('aria-valuenow', '100')
  })

  test('cards and exercises today: «и сделано 1 упражнение»', () => {
    renderDash({ progress: [progress(T0.id, 9, 10, { at: NOW - HOUR })], cards: [reviewedToday('r1'), reviewedToday('r2')] })
    expect(goal()).toHaveAccessibleName('Повторено 2 из 2 карточек, сделано 1 упражнение')
    expect(goalBox()).toHaveTextContent('и сделано 1 упражнение')
  })

  test('everything confident and nothing due → «На сегодня всё сделано» / parabéns', () => {
    renderDash({ progress: topics.map((t) => progress(t.id, 10, 10)), settings: { lastDiagnosticAt: NOW - DAY } })
    expect(screen.getByText('На сегодня всё сделано.')).toBeInTheDocument()
    expect(screen.getByText('На сегодня всё — parabéns!')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Начать повторение|Открыть тему|Повторить тему/ })).not.toBeInTheDocument()
  })

  test('streak of several days', () => {
    const p = progress(T0.id, 9, 10, { at: NOW - HOUR })
    for (let d = 1; d <= 4; d++) p.history.push({ topicId: T0.id, correct: 9, total: 10, at: NOW - d * DAY, source: 'lesson' })
    renderDash({ progress: [p] })
    expect(screen.getByText('5 дней подряд')).toBeInTheDocument()
  })
})

describe('Dashboard: secondary blocks', () => {
  test('errors: empty state, then the last three with prompt, given/expected, relative day and topic link', () => {
    const { unmount } = renderDash({ progress: [progress(T0.id, 9, 10)] })
    expect(screen.getByText('Ошибок пока нет')).toBeInTheDocument()
    unmount()
    const sit = listSituations().find((s) => s.id === 'no-cafe')!
    renderDash({
      progress: [progress(T0.id, 9, 10)],
      errors: [
        errorEntry('e1', { exerciseId: 'no-cafe-ex-01', topicId: 'no-cafe', given: 'um cafezinho', expected: 'uma bica', at: NOW - DAY }),
        errorEntry('e2', { topicId: T0.id, given: '', expected: 'sou', at: NOW - HOUR }),
        errorEntry('e3', { at: NOW - 2 * DAY }),
        errorEntry('e4', { at: NOW - 30 * DAY }),
      ],
    })
    const sec = screen.getByRole('heading', { name: 'Последние ошибки' }).closest('section')!
    const items = within(sec).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Вы:—Верно:sou')
    expect(items[0]).toHaveTextContent('сегодня')
    expect(within(items[0]).getByRole('link', { name: T0.title })).toHaveAttribute('href', `/topic/${T0.id}`)
    expect(items[1]).toHaveTextContent('Queria')
    expect(items[1]).toHaveTextContent('Вы:um cafezinhoВерно:uma bica')
    expect(items[1]).toHaveTextContent('вчера')
    expect(within(items[1]).getByRole('link', { name: sit.title })).toHaveAttribute('href', '/practice/situations/no-cafe')
    expect(items[2]).toHaveTextContent('позавчера')
  })

  test('diagnostic entry: missing → «Пройдите диагностику»; stale (>6 weeks) → «Пора сверить уровень»; fresh → situations', () => {
    const base = { progress: [progress(T0.id, 9, 10)] }
    const { unmount } = renderDash(base)
    const more = () => screen.getByRole('region', { name: 'Ещё на сегодня' })
    expect(within(more()).getByRole('link', { name: /Пройдите диагностику/ })).toHaveAttribute('href', '/diagnostic')
    unmount()
    const stale = NOW - 50 * DAY
    const r2 = renderDash({ ...base, settings: { lastDiagnosticAt: stale } })
    expect(within(more()).getByRole('link', { name: /Пора сверить уровень/ })).toHaveTextContent(
      `Последняя диагностика ${new Date(stale).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}.`,
    )
    r2.unmount()
    renderDash({ ...base, settings: { lastDiagnosticAt: NOW - 10 * DAY } })
    expect(within(more()).getByRole('link', { name: /Ситуации/ })).toHaveTextContent(`${listSituations().length} бытовых сцен`)
  })

  test('level bars link to the filtered course map and count confident topics', () => {
    renderDash({ progress: [progress(T0.id, 9, 10), progress(T1.id, 5, 10)] })
    const a1 = screen.getByRole('link', { name: /Уровень A1/ })
    expect(a1).toHaveAttribute('href', '/syllabus?level=A1')
    const row = a1.parentElement!
    expect(row).toHaveTextContent(/1 из \d+ уверенно/)
    expect(screen.getByRole('img', { name: /^Уровень A1, тем \d+; не начато \d+\. Уверенно: 1, Изучаю: 0, Слабо: 1$/ })).toBeInTheDocument()
  })

  test('tutor card lists the day’s topics', () => {
    renderDash({ progress: [progress(T1.id, 4, 10)] })
    const link = screen.getByRole('link', { name: /Беседа дня с агентом/ })
    expect(link).toHaveTextContent(getTopic(T1.id)!.title)
  })
})
