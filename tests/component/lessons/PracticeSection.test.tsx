import { screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getTopic, type Exercise } from '@/content'
import { PracticeSection } from '@/features/lessons/PracticeSection'
import { renderWithProviders } from '../../helpers/render'
import { choice, fillGap } from '../../helpers/B-ex-fixtures'

const TOPIC = getTopic('a1-ser-estar')!

function practice(exercises: Exercise[], opts: { source?: 'lesson' | 'mini-test'; miniTest?: boolean } = {}) {
  const onSaved = vi.fn()
  const onMiniTest = opts.miniTest === false ? undefined : vi.fn()
  const r = renderWithProviders(
    <PracticeSection
      topic={TOPIC}
      exercises={exercises}
      source={opts.source ?? 'lesson'}
      title="Упражнения"
      progressMap={new Map()}
      onSaved={onSaved}
      onMiniTest={onMiniTest}
    />,
  )
  return { ...r, onSaved, onMiniTest }
}

const next = () => screen.getByRole('button', { name: /^(Дальше|Завершить)$/ })

afterEach(() => vi.restoreAllMocks())

describe('PracticeSection', () => {
  test('no exercises → a note', () => {
    practice([])
    expect(screen.getByText('В этой теме пока нет заданий этого типа.')).toBeInTheDocument()
  })

  test('all right → saved (onSaved), result with «Мини-тест» as the primary step', async () => {
    const { user, onSaved, onMiniTest, store } = practice([choice, fillGap])
    await user.keyboard('2')
    await user.click(next())
    await user.type(screen.getByRole('textbox'), 'sou{Enter}')
    await user.click(next())
    expect(screen.getByRole('heading', { name: /Упражнения пройдены: 2 из 2/ })).toBeInTheDocument()
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(store.progressList()[0]).toMatchObject({ topicId: TOPIC.id, attempts: 1, lastPct: 1 })
    await user.click(screen.getByRole('button', { name: 'Мини-тест · 10 вопросов' }))
    expect(onMiniTest).toHaveBeenCalled()
  })

  test('mistakes → retry run over the mistakes; the retry does not count towards progress', async () => {
    const { user, store } = practice([choice, fillGap])
    await user.keyboard('1')
    await user.click(next())
    await user.type(screen.getByRole('textbox'), 'estou{Enter}')
    await user.click(next())
    await user.click(await screen.findByRole('button', { name: 'Повторить ошибки (2)' }))
    expect(screen.getAllByText('Упражнения: работа над ошибками').length).toBeGreaterThan(0)
    // The retry has its own persist key.
    await user.keyboard('2')
    expect(sessionStorage.getItem('ptpt:v1:run:topic:a1-ser-estar:lesson:retry')).not.toBeNull()
    await user.click(next())
    await user.type(screen.getByRole('textbox'), 'sou{Enter}')
    await user.click(next())
    expect(await screen.findByRole('heading', { name: /Ошибки повторены: 2 из 2/ })).toBeInTheDocument()
    await vi.waitFor(() => expect(screen.queryByText('Сохраняю…')).not.toBeInTheDocument())
    expect(store.progressList()).toHaveLength(1)
    expect(store.progressList()[0]).toMatchObject({ attempts: 1, lastPct: 0 })
  })

  test('mistakes that are «Не знаю» are not cards yet; ordinary mistakes are', async () => {
    const { user, store } = practice([fillGap, choice])
    await user.click(screen.getByRole('button', { name: 'Не знаю' }))
    await user.click(next())
    await user.keyboard('1')
    await user.click(next())
    await vi.waitFor(() => expect(store.errorList()).toHaveLength(2))
    expect(store.cardList().map((c) => c.id)).toEqual(['error:bx-choice'])
  })

  test('a failed save is reported on the result screen', async () => {
    const { user, store } = practice([choice])
    vi.spyOn(store, 'saveTopicResult').mockRejectedValue(new Error('нет места'))
    await user.keyboard('2')
    await user.click(next())
    expect(await screen.findByText('Не удалось сохранить: нет места')).toBeInTheDocument()
  })

  test('without a mini-test the good run points to the next topic', async () => {
    const { user } = practice([choice], { miniTest: false })
    await user.keyboard('2')
    await user.click(next())
    expect(await screen.findByRole('link', { name: /^Следующая тема: / })).toBeInTheDocument()
  })
})
