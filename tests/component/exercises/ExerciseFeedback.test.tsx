import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ExerciseFeedback } from '@/features/exercises/ExerciseFeedback'
import { choice, fillAccent, match, rec, shadow, transform } from '../../helpers/B-ex-fixtures'

const term = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling

describe('ExerciseFeedback', () => {
  test('correct typed answer: «Верно!», alternatives listed as «Также принимается»', () => {
    render(<ExerciseFeedback ex={transform} rec={rec(transform, { given: 'Somos altos.', expected: 'Somos altos.' })} lenient={false} />)
    expect(screen.getByText('Верно!')).toBeInTheDocument()
    expect(screen.queryByText('Верно', { selector: 'dt' })).not.toBeInTheDocument()
    expect(term('Также принимается')).toHaveTextContent('Nós somos altos.')
  })

  test('wrong typed answer: your answer struck through + the right one', () => {
    render(<ExerciseFeedback ex={transform} rec={rec(transform, { given: 'Eu somos', expected: 'Nós somos altos.', verdict: 'wrong', ok: false })} lenient={false} />)
    expect(screen.getByText('Неверно')).toBeInTheDocument()
    expect(term('Ваш ответ')).toHaveTextContent('Eu somos')
    expect(term('Верно')).toHaveTextContent('Nós somos altos.')
  })

  test('empty wrong answer shows a dash', () => {
    render(<ExerciseFeedback ex={transform} rec={rec(transform, { given: '', expected: 'Somos altos.', verdict: 'wrong', ok: false })} lenient={false} />)
    expect(term('Ваш ответ')).toHaveTextContent('—')
  })

  test('accent-only mistake: strict vs soft accents wording', () => {
    const r = rec(fillAccent, { given: 'esta', expected: 'está', verdict: 'accents', ok: false })
    const { rerender } = render(<ExerciseFeedback ex={fillAccent} rec={r} lenient={false} />)
    expect(screen.getByText('Почти: ошибка только в акцентах')).toBeInTheDocument()
    expect(term('Ваш ответ')).toHaveTextContent('esta')
    rerender(<ExerciseFeedback ex={fillAccent} rec={{ ...r, ok: true }} lenient />)
    expect(screen.getByText('Верно, но проверьте акценты')).toBeInTheDocument()
  })

  test('skipped («Не знаю»): neutral heading and the answer', () => {
    render(<ExerciseFeedback ex={choice} rec={rec(choice, { given: '', expected: 'está', verdict: 'wrong', ok: false, skipped: true })} lenient={false} />)
    expect(screen.getByText('Ничего страшного — вот ответ')).toBeInTheDocument()
    expect(term('Верно')).toHaveTextContent('está')
    // Choice is not a typed kind: no «Ваш ответ».
    expect(screen.queryByText('Ваш ответ')).not.toBeInTheDocument()
  })

  test('explanation is rendered as markdown', () => {
    render(<ExerciseFeedback ex={choice} rec={rec(choice, { given: 'está', expected: 'está' })} lenient={false} />)
    expect(screen.getByText(/Состояние — estar\./)).toBeInTheDocument()
  })

  test('match: wrong pairs line and all pairs listed', () => {
    render(<ExerciseFeedback ex={match} rec={rec(match, { given: 'ошибки: ser — быть (временно)', verdict: 'wrong', ok: false })} lenient={false} />)
    expect(screen.getByText('Ошибочные пары: ser — быть (временно)')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  test('speak-shadow: «Отлично!» / «Потренируйтесь ещё», no answer rows', () => {
    const { rerender } = render(<ExerciseFeedback ex={shadow} rec={rec(shadow)} lenient={false} />)
    expect(screen.getByText('Отлично!')).toBeInTheDocument()
    rerender(<ExerciseFeedback ex={shadow} rec={rec(shadow, { ok: false, verdict: 'wrong' })} lenient={false} />)
    expect(screen.getByText('Потренируйтесь ещё')).toBeInTheDocument()
    expect(screen.queryByText('Верно')).not.toBeInTheDocument()
  })
})
