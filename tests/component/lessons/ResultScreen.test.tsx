import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getTopic, type Exercise } from '@/content'
import type { AnswerRecord } from '@/features/exercises'
import { ResultScreen, type ResultScreenProps } from '@/features/lessons/ResultScreen'
import type { SaveOutcome } from '@/features/lessons/persist'
import { card, NOW, progress, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { summary } from '../../helpers/B-ex-fixtures'

const topic = getTopic('a1-ser-estar')!
const exs: Exercise[] = topic.exercises.slice(0, 10)
const ok = (e: Exercise): AnswerRecord => ({ exerciseId: e.id, topicId: e.topicId, given: 'g', expected: `exp-${e.id}`, verdict: 'correct', ok: true })
const bad = (e: Exercise, patch: Partial<AnswerRecord> = {}): AnswerRecord => ({ ...ok(e), given: `given-${e.id}`, verdict: 'wrong', ok: false, ...patch })

function show(p: Partial<ResultScreenProps> & Pick<ResultScreenProps, 'summary'>, seed?: Seed) {
  const onRetryWrong = vi.fn()
  const onRestart = vi.fn()
  const r = renderWithProviders(
    <ResultScreen exercises={exs} retry={false} before="not-started" saving={false} onRetryWrong={onRetryWrong} onRestart={onRestart} {...p} />,
    { seed, route: '/topic/a1-ser-estar' },
  )
  return { ...r, onRetryWrong, onRestart }
}

const heading = () => screen.getByRole('heading', { level: 2, name: /из/ })

afterEach(() => {
  vi.useRealTimers()
})

describe('ResultScreen: heading and verdict', () => {
  test.each([
    [10, 'Материал усвоен уверенно.'],
    [7, 'Почти: ещё немного практики — и будет уверенно.'],
    [3, 'Пока трудно — стоит закрепить.'],
    [0, 'Начало положено.'],
  ])('%i/10 → «%s»', (n, text) => {
    show({ runTitle: 'Упражнения пройдены', summary: summary(exs.map((e, i) => (i < n ? ok(e) : bad(e)))) })
    expect(heading()).toHaveTextContent(`Упражнения пройдены: ${n} из 10`)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  test('default title «Результат»; retry title and note', () => {
    const a = show({ summary: summary([ok(exs[0])]) })
    expect(heading()).toHaveTextContent('Результат: 1 из 1')
    a.unmount()
    show({ summary: summary([ok(exs[0]), bad(exs[1])]), retry: true })
    expect(heading()).toHaveTextContent('Ошибки повторены: 1 из 2')
    expect(screen.getByText('Повтор ошибок не меняет статус.')).toBeInTheDocument()
  })

  test('status change before → after; unchanged status shows one badge', () => {
    const outcome: SaveOutcome = { progress: progress(topic.id, 9, 10), errorsLogged: 0, cardsAdded: 0, pendingCards: [] }
    const a = show({ summary: summary([ok(exs[0])]), outcome, before: 'weak' })
    const line = screen.getByText('Статус темы:').parentElement!
    expect(within(line).getByLabelText('стал')).toBeInTheDocument()
    a.unmount()
    show({ summary: summary([ok(exs[0])]), outcome, before: 'confident', statusLabel: 'Статус ситуации:' })
    const line2 = screen.getByText('Статус ситуации:').parentElement!
    expect(within(line2).queryByLabelText('стал')).not.toBeInTheDocument()
  })

  test('saving and error lines', () => {
    const a = show({ summary: summary([ok(exs[0])]), saving: true })
    expect(screen.getByText('Сохраняю…')).toBeInTheDocument()
    a.unmount()
    show({ summary: summary([ok(exs[0])]), error: 'quota' })
    expect(screen.getByText('Не удалось сохранить: quota')).toBeInTheDocument()
  })
})

describe('ResultScreen: primary action', () => {
  test('low score with mistakes → «Повторить ошибки (n)» is primary and focused', async () => {
    const { user, onRetryWrong } = show({ summary: summary(exs.map((e, i) => (i < 3 ? ok(e) : bad(e)))) })
    const primary = screen.getByRole('button', { name: 'Повторить ошибки (7)' })
    expect(primary).toHaveFocus()
    // Not duplicated among the quiet actions.
    expect(screen.getAllByRole('button', { name: /Повторить ошибки/ })).toHaveLength(1)
    await user.click(primary)
    expect(onRetryWrong).toHaveBeenCalled()
  })

  test('good score with an in-page next step → that step is primary; retry is a quiet action', async () => {
    const next = vi.fn()
    const { user, onRetryWrong } = show({
      summary: summary(exs.map((e, i) => (i < 8 ? ok(e) : bad(e)))),
      next: { label: 'К диалогу', onClick: next },
    })
    expect(screen.getByRole('button', { name: 'К диалогу' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'К диалогу' }))
    expect(next).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Повторить ошибки \(2\)/ }))
    expect(onRetryWrong).toHaveBeenCalled()
  })

  test('no mistakes, no next → «К курсу» link is primary (no duplicate back link)', () => {
    show({ summary: summary([ok(exs[0])]) })
    const links = screen.getAllByRole('link', { name: 'К курсу' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/syllabus')
    expect(links[0]).toHaveFocus()
    expect(screen.queryByRole('region', { name: /Работа над ошибками/ })).not.toBeInTheDocument()
  })

  test('explicit primary route (after a mini-test: next topic) + custom back link', () => {
    show({
      summary: summary([ok(exs[0])]),
      primary: { label: 'Следующая тема: X', to: '/topic/a1-possessivos' },
      back: { to: '/situations', label: 'К ситуациям' },
    })
    expect(screen.getByRole('link', { name: 'Следующая тема: X' })).toHaveAttribute('href', '/topic/a1-possessivos')
    expect(screen.getByRole('link', { name: 'К ситуациям' })).toHaveAttribute('href', '/situations')
  })

  test('«Пройти заново» calls onRestart', async () => {
    const { user, onRestart } = show({ summary: summary([ok(exs[0])]) })
    await user.click(screen.getByRole('button', { name: 'Пройти заново' }))
    expect(onRestart).toHaveBeenCalled()
  })

  test('Enter outside a control triggers the primary; a keyboard click within 450 ms is ignored', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const { onRetryWrong } = show({ summary: summary([bad(exs[0])]) })
    const primary = screen.getByRole('button', { name: 'Повторить ошибки (1)' })
    fireEvent.click(primary, { detail: 0 })
    expect(onRetryWrong).not.toHaveBeenCalled()
    vi.setSystemTime(NOW + 500)
    await act(() => new Promise((r) => setTimeout(r, 0))) // listener attached on the next tick
    primary.blur()
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(onRetryWrong).toHaveBeenCalledTimes(1)
    // Enter on a button is left to the button itself.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Пройти заново' }), { key: 'Enter' })
    expect(onRetryWrong).toHaveBeenCalledTimes(1)
  })
})

describe('ResultScreen: «Что дальше»', () => {
  test('recommended topics as links with reasons', () => {
    const t2 = getTopic('a1-possessivos')!
    const t3 = getTopic('a1-artigos-genero-numero')!
    show({
      summary: summary([ok(exs[0])]),
      recs: [
        { topic: t2, reason: 'next' },
        { topic: t3, reason: 'prereq', progress: progress(t3.id, 4, 10) },
      ],
    })
    const aside = screen.getByRole('complementary', { name: 'Что дальше' })
    const links = within(aside).getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', `/topic/${t2.id}`)
    expect(links[0]).toHaveTextContent('Следующая по курсу')
    expect(links[1]).toHaveTextContent('Основа этой темы · было 40%')
  })
})

describe('ResultScreen: mistakes («Работа над ошибками»)', () => {
  const region = () => screen.getByRole('region', { name: /Работа над ошибками/ })

  test('lists each mistake with the task, right answer, your answer / «не знаю» / accents', () => {
    show({
      summary: summary([ok(exs[0]), bad(exs[1]), bad(exs[2], { skipped: true, given: '' }), bad(exs[3], { verdict: 'accents', given: 'esta' })]),
    })
    const r = region()
    expect(within(r).getByRole('heading', { name: 'Работа над ошибками · 3' })).toBeInTheDocument()
    const items = within(r).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent(`Верно: exp-${exs[1].id}`)
    expect(items[0]).toHaveTextContent(`Ваш ответ: given-${exs[1].id}`)
    expect(items[1]).toHaveTextContent('не знаю')
    expect(items[2]).toHaveTextContent('(акценты)')
    expect(items[0]).toHaveAttribute('data-pt-src', `exercise:${exs[1].id}:feedback`)
  })

  test('more than 6 mistakes → «Показать все (n)»', async () => {
    const { user } = show({ summary: summary(exs.map((e) => bad(e))) })
    expect(within(region()).getAllByRole('listitem')).toHaveLength(6)
    await user.click(screen.getByRole('button', { name: 'Показать все (10)' }))
    expect(within(region()).getAllByRole('listitem')).toHaveLength(10)
  })

  test('mistakes already in review are marked; missing ones can be added one by one or all at once', async () => {
    const answers = [bad(exs[0]), bad(exs[1], { skipped: true, given: '' }), bad(exs[2], { skipped: true, given: '' })]
    const { user, store } = show(
      { summary: summary(answers), outcome: { errorsLogged: 3, cardsAdded: 1, pendingCards: [] } },
      { cards: [card(`error:${exs[0].id}`)] },
    )
    const r = region()
    expect(await within(r).findByText('Ошибки уже в повторении, «Не знаю» — добавьте сами.')).toBeInTheDocument()
    expect(within(r).getByRole('button', { name: `«exp-${exs[0].id}» уже в повторении` })).toBeDisabled()
    await user.click(within(r).getByRole('button', { name: `Добавить «exp-${exs[1].id}» в повторение` }))
    expect(await within(r).findByText('Добавлено в повторение')).toBeInTheDocument()
    expect(store.cardList().some((c) => c.id === `error:${exs[1].id}`)).toBe(true)
    // Only one left → no «Добавить все».
    expect(within(r).queryByRole('button', { name: /Добавить все/ })).not.toBeInTheDocument()
  })

  test('«Добавить все (n)» adds every missing card; then «Все ошибки в повторении.»', async () => {
    const answers = [bad(exs[0], { skipped: true, given: '' }), bad(exs[1], { skipped: true, given: '' })]
    const { user } = show({ summary: summary(answers), outcome: { errorsLogged: 2, cardsAdded: 0, pendingCards: [] } })
    await user.click(await screen.findByRole('button', { name: 'Добавить все (2)' }))
    expect(await screen.findByText('Добавлено в повторение: 2')).toBeInTheDocument()
    expect(await screen.findByText('Все ошибки в повторении.')).toBeInTheDocument()
  })

  test('while saving, add buttons are disabled', () => {
    show({ summary: summary([bad(exs[0])]), saving: true })
    expect(within(region()).getByRole('button', { name: /в повторение/ })).toBeDisabled()
  })
})
