import { screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Exercise } from '@/content'
import { ReviewExercise, type AnswerRecord } from '@/features/exercises'
import type { Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { choice, fillAccent, fillGap } from '../../helpers/B-ex-fixtures'

function review(exercise: Exercise, opts: { note?: string; focusControl?: boolean; seed?: Seed } = {}) {
  const onAnswered = vi.fn<(r: AnswerRecord) => void>()
  const r = renderWithProviders(
    <ReviewExercise exercise={exercise} onAnswered={onAnswered} note={opts.note} focusControl={opts.focusControl} />,
    { seed: opts.seed },
  )
  return { ...r, onAnswered }
}

afterEach(() => vi.restoreAllMocks())

describe('ReviewExercise', () => {
  test('group labelled by the task heading; note above; lookup locked until answered', async () => {
    const { user } = review(choice, { note: 'Задание, в котором была ошибка' })
    const group = screen.getByRole('group', { name: 'Выберите правильный вариант' })
    expect(screen.getByText('Задание, в котором была ошибка')).toBeInTheDocument()
    expect(group).toHaveAttribute('data-lookup', 'off')
    await user.keyboard('2')
    expect(group).toHaveAttribute('data-lookup', 'on')
  })

  test('touch, no focusControl → heading is focused', () => {
    review(fillGap)
    expect(screen.getByRole('heading', { name: 'Вставьте пропущенное' })).toHaveFocus()
  })

  test('focusControl → the text field is focused', () => {
    review(fillGap, { focusControl: true })
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  test('answer → onAnswered once, feedback and live summary; no «Дальше»', async () => {
    const { user, onAnswered, container } = review(fillGap, { focusControl: true })
    await user.keyboard('estou{Enter}')
    expect(onAnswered).toHaveBeenCalledTimes(1)
    expect(onAnswered).toHaveBeenCalledWith({
      exerciseId: 'bx-fill',
      topicId: 'a1-ser-estar',
      given: 'estou',
      expected: 'sou',
      verdict: 'wrong',
      ok: false,
    })
    expect(screen.getByText('Неверно')).toBeInTheDocument()
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Неверно. Правильно: sou')
    expect(screen.queryByRole('button', { name: /Дальше|Завершить/ })).not.toBeInTheDocument()
  })

  test('«Не знаю» → skipped record', async () => {
    const { user, onAnswered } = review(fillGap)
    await user.click(screen.getByRole('button', { name: 'Не знаю' }))
    expect(onAnswered).toHaveBeenCalledWith(expect.objectContaining({ given: '', skipped: true, ok: false }))
    expect(screen.getByText('Ничего страшного — вот ответ')).toBeInTheDocument()
  })

  test('soft accents setting makes an accent-only answer ok', async () => {
    const { user, onAnswered } = review(fillAccent, { focusControl: true, seed: { settings: { lenientAccents: true } } })
    await user.keyboard('esta{Enter}')
    expect(onAnswered).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'accents', ok: true }))
  })
})
