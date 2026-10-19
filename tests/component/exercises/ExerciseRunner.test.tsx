import { act, fireEvent, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Exercise } from '@/content'
import { ExerciseRunner, type RunSummary } from '@/features/exercises'
import { NOW } from '../../fixtures/seed'
import type { Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { choice, fillAccent, fillGap, listenChoice, match, noShuffle, orderWords, rec, shadow } from '../../helpers/B-ex-fixtures'

vi.mock('@/engine/audio', async (orig) => ({
  ...(await orig<typeof import('@/engine/audio')>()),
  speak: vi.fn(async () => ({ source: 'speech' })),
  stopSpeaking: vi.fn(),
}))

const RUN_KEY = 'ptpt:v1:run:t'

function run(
  exercises: Exercise[],
  opts: { seed?: Seed; persistKey?: string; focusOnMount?: boolean; panel?: boolean; title?: string } = {},
) {
  const onFinish = vi.fn<(s: RunSummary) => void>()
  const r = renderWithProviders(
    <ExerciseRunner
      exercises={exercises}
      onFinish={onFinish}
      title={opts.title ?? 'Упражнения'}
      persistKey={opts.persistKey}
      focusOnMount={opts.focusOnMount}
      panel={opts.panel}
    />,
    { seed: opts.seed },
  )
  return { ...r, onFinish }
}

const section = () => screen.getByRole('region', { name: /Вставьте|Выберите|Составьте|Послушайте|Соедините/ })
/** The runner's own live region (a direct child of its root, next to the column holding the task section). */
const live = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('div[aria-live="polite"].sr-only')].find((el) =>
    el.parentElement?.querySelector(':scope > div > section'),
  )!
const nextBtn = () => screen.getByRole('button', { name: /^(Дальше|Завершить)$/ })
/** The «Дальше» Enter listener is attached on the next tick after answering. */
const tick = () => act(() => new Promise((r) => setTimeout(r, 0)))

beforeEach(() => {
  vi.spyOn(Math, 'random').mockImplementation(noShuffle)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ExerciseRunner: flow', () => {
  test('empty list → a note', () => {
    run([])
    expect(screen.getByText('Упражнений пока нет.')).toBeInTheDocument()
  })

  test('progress, heading, answer → feedback + live verdict + focus on «Дальше»', async () => {
    const { user, container } = run([choice, fillGap])
    expect(screen.getAllByText((_, el) => el?.textContent === 'Задание 1 / 2').length).toBeGreaterThan(0)
    expect(screen.getByRole('progressbar', { name: 'Прогресс: 0 из 2' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Выберите правильный вариант' })).toBeInTheDocument()
    expect(live(container)).toBeEmptyDOMElement()

    await user.click(screen.getByRole('radio', { name: /está/ }))
    expect(screen.getByText('Верно!', { selector: 'p' })).toBeInTheDocument()
    expect(live(container)).toHaveTextContent('Верно!')
    expect(screen.getByRole('progressbar', { name: 'Прогресс: 1 из 2' })).toBeInTheDocument()
    expect(screen.getAllByText('верно', { exact: false }).length).toBeGreaterThan(0)
    expect(nextBtn()).toHaveTextContent('Дальше')
    expect(nextBtn()).toHaveFocus()
  })

  test('word lookup is locked before the answer and unlocked after it', async () => {
    const { user } = run([choice])
    const s = section()
    expect(s).toHaveAttribute('data-lookup', 'off')
    expect(s).toHaveAttribute('data-pt-src', 'exercise:bx-choice')
    await user.keyboard('2')
    expect(s).toHaveAttribute('data-lookup', 'on')
  })

  test('«Дальше» → next task; its primary control (text field) gets focus; live region cleared', async () => {
    const { user, container } = run([choice, fillGap])
    await user.keyboard('1')
    expect(live(container)).toHaveTextContent('Неверно. Правильно: está')
    await user.click(nextBtn())
    expect(screen.getByRole('heading', { name: 'Вставьте пропущенное' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Ваш ответ' })).toHaveFocus()
    expect(live(container)).toBeEmptyDOMElement()
  })

  test('after «Дальше» to a choice task the option group gets focus', async () => {
    const { user } = run([fillGap, choice])
    await user.type(screen.getByRole('textbox'), 'sou{Enter}')
    await user.click(nextBtn())
    expect(screen.getAllByRole('radio')[0]).toHaveFocus()
  })

  test.each([
    ['listen-choice', listenChoice, () => screen.getByRole('button', { name: /Слушать/ })],
    ['speak-shadow', shadow, () => screen.getByRole('button', { name: /Слушать/ })],
    ['match', match, () => within(screen.getByRole('list', { name: 'Левый столбец' })).getByRole('button', { name: 'ser' })],
    ['order-words', orderWords, () => within(screen.getByRole('group', { name: 'Слова' })).getByRole('button', { name: 'Eu' })],
  ] as const)('after «Дальше» a %s task gets focus on its primary control', async (_k, ex, target) => {
    const { user } = run([choice, ex])
    await user.keyboard('2')
    await user.click(nextBtn())
    expect(target()).toHaveFocus()
  })

  test('Enter anywhere outside buttons advances after answering (not the same Enter)', async () => {
    const { user } = run([fillGap, choice])
    await user.type(screen.getByRole('textbox'), 'sou{Enter}')
    // The submitting Enter didn't advance.
    expect(screen.getByRole('heading', { name: 'Вставьте пропущенное' })).toBeInTheDocument()
    await tick()
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: 'Выберите правильный вариант' })).toBeInTheDocument()
  })

  test('Shift+Enter in a typed task = «Не знаю»: skipped record, neutral feedback', async () => {
    const { user, container, onFinish } = run([fillGap])
    await user.type(screen.getByRole('textbox'), '{Shift>}{Enter}{/Shift}')
    expect(screen.getByText('Ничего страшного — вот ответ')).toBeInTheDocument()
    expect(live(container)).toHaveTextContent('Ответ: Правильно: sou')
    await user.click(nextBtn())
    expect(onFinish).toHaveBeenCalledWith({
      correct: 0,
      total: 1,
      answers: [{ exerciseId: 'bx-fill', topicId: 'a1-ser-estar', given: '', expected: 'sou', verdict: 'wrong', ok: false, skipped: true }],
    })
  })

  test('«Завершить» on the last task → onFinish with the summary', async () => {
    const { user, onFinish } = run([choice, fillGap])
    await user.keyboard('2')
    await user.click(nextBtn())
    await user.type(screen.getByRole('textbox'), 'estou{Enter}')
    expect(nextBtn()).toHaveTextContent('Завершить')
    await user.click(nextBtn())
    expect(onFinish).toHaveBeenCalledTimes(1)
    const s = onFinish.mock.calls[0][0]
    expect(s.correct).toBe(1)
    expect(s.total).toBe(2)
    expect(s.answers.map((a) => [a.exerciseId, a.ok])).toEqual([
      ['bx-choice', true],
      ['bx-fill', false],
    ])
  })

  test('a second answer to the same task is ignored', async () => {
    const { user, onFinish } = run([choice])
    await user.keyboard('2')
    fireEvent.click(screen.getAllByRole('radio')[0]) // disabled now, but force a click
    await user.click(nextBtn())
    expect(onFinish.mock.calls[0][0].answers).toHaveLength(1)
    expect(onFinish.mock.calls[0][0].correct).toBe(1)
  })
})

describe('ExerciseRunner: accents setting', () => {
  test('strict (default): accent-only mistake is wrong, «Почти: ошибка в акцентах»', async () => {
    const { user, container, onFinish } = run([fillAccent])
    await user.type(screen.getByRole('textbox'), 'esta{Enter}')
    expect(screen.getByText('Почти: ошибка только в акцентах')).toBeInTheDocument()
    expect(live(container)).toHaveTextContent('Почти: ошибка в акцентах. Правильно: está')
    await user.click(nextBtn())
    expect(onFinish.mock.calls[0][0]).toMatchObject({ correct: 0, answers: [{ verdict: 'accents', ok: false }] })
  })

  test('soft accents: accent-only mistake counts as correct', async () => {
    const { user, container, onFinish } = run([fillAccent], { seed: { settings: { lenientAccents: true } } })
    await user.type(screen.getByRole('textbox'), 'esta{Enter}')
    expect(screen.getByText('Верно, но проверьте акценты')).toBeInTheDocument()
    expect(live(container)).toHaveTextContent('Верно, но проверьте акценты.')
    await user.click(nextBtn())
    expect(onFinish.mock.calls[0][0]).toMatchObject({ correct: 1, answers: [{ verdict: 'accents', ok: true }] })
  })
})

describe('ExerciseRunner: «Дальше» bounce guard (250 ms)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  test('keyboard activation within 250 ms of answering is ignored, later it works', async () => {
    const { user } = run([choice, fillGap])
    await user.keyboard('2')
    fireEvent.click(nextBtn(), { detail: 0 })
    expect(screen.getByRole('heading', { name: 'Выберите правильный вариант' })).toBeInTheDocument()
    vi.setSystemTime(NOW + 249)
    fireEvent.click(nextBtn(), { detail: 0 })
    expect(screen.getByRole('heading', { name: 'Выберите правильный вариант' })).toBeInTheDocument()
    vi.setSystemTime(NOW + 250)
    fireEvent.click(nextBtn(), { detail: 0 })
    expect(screen.getByRole('heading', { name: 'Вставьте пропущенное' })).toBeInTheDocument()
  })

  test('a mouse click (detail ≥ 1) is never ignored', async () => {
    const { user } = run([choice, fillGap])
    await user.keyboard('2')
    fireEvent.click(nextBtn(), { detail: 1 })
    expect(screen.getByRole('heading', { name: 'Вставьте пропущенное' })).toBeInTheDocument()
  })
})

describe('ExerciseRunner: focus on start and first key', () => {
  test('focusOnMount without a fine pointer → the task heading', () => {
    run([fillGap], { focusOnMount: true })
    expect(screen.getByRole('heading', { name: 'Вставьте пропущенное' })).toHaveFocus()
  })

  test('focusOnMount with a fine pointer → the text field', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((q) => ({ matches: q === '(pointer: fine)' }) as MediaQueryList)
    run([fillGap], { focusOnMount: true })
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  test('without focusOnMount nothing is focused; the first typed letter lands in the field', async () => {
    const { user } = run([fillGap])
    expect(document.body).toHaveFocus()
    await user.keyboard('s')
    expect(screen.getByRole('textbox')).toHaveFocus()
    await user.keyboard('ou')
    expect(screen.getByRole('textbox')).toHaveValue('sou')
  })

  test('Enter with nothing focused focuses the primary control (choice options)', async () => {
    const { user, onFinish } = run([choice])
    await user.keyboard('{Enter}')
    expect(screen.getAllByRole('radio')[0]).toHaveFocus()
    expect(onFinish).not.toHaveBeenCalled()
  })

  test('letters do nothing for a kind without a text field', async () => {
    const { user } = run([choice])
    await user.keyboard('a')
    expect(document.body).toHaveFocus()
  })
})

describe('ExerciseRunner: persistence (sessionStorage)', () => {
  test('the run is snapshotted after each answer and cleared on finish', async () => {
    const { user } = run([choice, fillGap], { persistKey: 't' })
    expect(sessionStorage.getItem(RUN_KEY)).toBeNull()
    await user.keyboard('2')
    const snap = JSON.parse(sessionStorage.getItem(RUN_KEY)!)
    expect(snap).toMatchObject({ ids: ['bx-choice', 'bx-fill'], index: 0, answers: [], current: { exerciseId: 'bx-choice', ok: true } })
    await user.click(nextBtn())
    expect(JSON.parse(sessionStorage.getItem(RUN_KEY)!)).toMatchObject({ index: 1, current: null })
    await user.type(screen.getByRole('textbox'), 'sou{Enter}')
    await user.click(nextBtn())
    expect(sessionStorage.getItem(RUN_KEY)).toBeNull()
  })

  test('resume: restored index, answers and the note; «Начать заново» resets', async () => {
    sessionStorage.setItem(
      RUN_KEY,
      JSON.stringify({ ids: ['bx-choice', 'bx-fill', 'bx-order'], index: 1, answers: [rec(choice, { given: 'está', expected: 'está' })], current: null }),
    )
    const { user } = run([choice, fillGap, orderWords], { persistKey: 't' })
    expect(screen.getByText('Продолжаем с задания 2 из 3.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Вставьте пропущенное' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Прогресс: 1 из 3' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Начать заново' }))
    expect(screen.queryByText(/Продолжаем с задания/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Выберите правильный вариант' })).toBeInTheDocument()
    expect(sessionStorage.getItem(RUN_KEY)).toBeNull()
  })

  test('resume with an answered current task shows its feedback; the note hides after answering', async () => {
    sessionStorage.setItem(
      RUN_KEY,
      JSON.stringify({ ids: ['bx-choice', 'bx-fill'], index: 0, answers: [], current: rec(choice, { given: 'é', expected: 'está', verdict: 'wrong', ok: false }) }),
    )
    run([choice, fillGap], { persistKey: 't' })
    expect(screen.getByText('Неверно')).toBeInTheDocument()
    expect(nextBtn()).toBeInTheDocument()
  })

  test('a snapshot for a different list is ignored', () => {
    sessionStorage.setItem(RUN_KEY, JSON.stringify({ ids: ['other', 'bx-fill'], index: 1, answers: [], current: null }))
    run([choice, fillGap], { persistKey: 't' })
    expect(screen.queryByText(/Продолжаем с задания/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Выберите правильный вариант' })).toBeInTheDocument()
  })

  test('a corrupt snapshot is ignored', () => {
    sessionStorage.setItem(RUN_KEY, '{oops')
    run([choice, fillGap], { persistKey: 't' })
    expect(screen.queryByText(/Продолжаем с задания/)).not.toBeInTheDocument()
  })
})

describe('ExerciseRunner: side panel', () => {
  const panel = () => screen.getByRole('complementary', { name: 'Ход упражнений' })
  const count = (label: string) => within(panel()).getByText(label).closest('div')!.querySelector('dd')!

  test('counts, step list, kinds and keys follow the run', async () => {
    const { user } = run([choice, choice, fillGap], { title: 'Тест' })
    const p = panel()
    expect(within(p).getByRole('heading', { name: 'Тест' })).toBeInTheDocument()
    const steps = within(p).getByRole('list', { name: 'Пройдено 0 из 3' })
    expect(within(steps).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1: сейчас', '2: впереди', '3: впереди'])
    expect(count('Верно')).toHaveTextContent('0')
    expect(count('Осталось')).toHaveTextContent('3')
    // «Что тренируем»: kinds with counts, the current one emphasised.
    const kinds = within(p).getByText('Выбрать вариант').closest('li')!
    expect(kinds).toHaveTextContent('Выбрать вариант2')
    expect(within(p).getByText('Вставить пропущенное').closest('li')).toHaveTextContent('1')
    // Keys for a choice task.
    expect(within(p).getByText('выбрать вариант')).toBeInTheDocument()

    await user.keyboard('1')
    expect(within(p).getByRole('list', { name: 'Пройдено 1 из 3' })).toBeInTheDocument()
    expect(count('Ошибок')).toHaveTextContent('1')
    expect(count('Осталось')).toHaveTextContent('2')
    await user.click(nextBtn())
    await user.keyboard('2')
    expect(count('Верно')).toHaveTextContent('1')
    expect(within(p).getAllByRole('listitem').slice(0, 3).map((li) => li.textContent)).toEqual(['1: ошибка', '2: верно', '3: впереди'])
    await user.click(nextBtn())
    expect(within(p).getByText('«Не знаю»')).toBeInTheDocument()
    expect(within(p).getByText('после ответа — дальше')).toBeInTheDocument()
  })

  test('panel={false} renders no side panel; default title «Упражнения»', () => {
    run([choice], { panel: false })
    expect(screen.queryByRole('complementary', { name: 'Ход упражнений' })).not.toBeInTheDocument()
  })
})

describe('ExerciseRunner: other kinds in a run', () => {
  test('match → «Соединить пары» heading; live summary without «Правильно:»', async () => {
    const { user, container } = run([match])
    expect(screen.getByRole('heading', { name: 'Соедините глагол и перевод' })).toBeInTheDocument()
    const L = screen.getByRole('list', { name: 'Левый столбец' })
    const R = screen.getByRole('list', { name: 'Правый столбец' })
    await user.click(within(L).getByRole('button', { name: 'ser' }))
    await user.click(within(R).getByRole('button', { name: 'быть (временно)' }))
    await user.click(within(L).getByRole('button', { name: 'ser' }))
    await user.click(within(R).getByRole('button', { name: 'быть (постоянно)' }))
    await user.click(within(L).getByRole('button', { name: 'estar' }))
    await user.click(within(R).getByRole('button', { name: 'быть (временно)' }))
    expect(live(container)).toHaveTextContent(/^Неверно\.$/)
    expect(screen.getByText('Ошибочные пары: ser — быть (временно)')).toBeInTheDocument()
  })

  test('speak-shadow → «Отлично!» / «Потренируйтесь ещё.» in the live region', async () => {
    const { user, container } = run([shadow])
    await user.click(screen.getByRole('button', { name: 'Ещё потренироваться' }))
    expect(live(container)).toHaveTextContent('Потренируйтесь ещё.')
  })

  test('listen-choice heading and digit answer', async () => {
    const { user, container } = run([listenChoice])
    expect(screen.getByRole('heading', { name: 'Послушайте и выберите' })).toBeInTheDocument()
    await user.keyboard('2')
    expect(live(container)).toHaveTextContent('Верно!')
  })

  test('order-words: Ctrl+Enter checks; Enter afterwards advances', async () => {
    const { user, onFinish } = run([orderWords])
    const bank = screen.getByRole('group', { name: 'Слова' })
    for (const w of ['Eu', 'sou', 'professor']) await user.click(within(bank).getByRole('button', { name: w }))
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(screen.getByText('Верно!', { selector: 'p' })).toBeInTheDocument()
    expect(nextBtn()).toHaveFocus()
    await user.click(nextBtn())
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ correct: 1, total: 1 }))
  })
})

describe('ExerciseRunner: hidden tab panel', () => {
  test('Enter after answering is ignored when the runner sits in a hidden panel', async () => {
    const onFinish = vi.fn()
    function Host() {
      const [hidden, setHidden] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setHidden(true)}>
            hide
          </button>
          <div hidden={hidden}>
            <ExerciseRunner exercises={[fillGap]} onFinish={onFinish} />
          </div>
        </>
      )
    }
    const { user } = renderWithProviders(<Host />)
    await user.type(screen.getByRole('textbox'), 'sou{Enter}')
    await user.click(screen.getByRole('button', { name: 'hide' }))
    await tick()
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('{Enter}')
    expect(onFinish).not.toHaveBeenCalled()
  })
})
