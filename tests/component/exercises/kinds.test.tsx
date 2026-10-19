import { act, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Exercise } from '@/content'
import { ExerciseView } from '@/features/exercises/ExerciseRunner'
import type { AnswerRecord, Submission } from '@/features/exercises'
import { renderWithProviders } from '../../helpers/render'
import { choice, fillAccent, fillGap, fillGap2, listenChoice, listenType, match, noShuffle, orderWords, rec, shadow, transform, translate } from '../../helpers/B-ex-fixtures'

vi.mock('@/engine/audio', async (orig) => ({
  ...(await orig<typeof import('@/engine/audio')>()),
  speak: vi.fn(async () => ({ source: 'speech' })),
  stopSpeaking: vi.fn(),
}))

function view(exercise: Exercise, opts: { locked?: boolean; result?: AnswerRecord; hidden?: boolean } = {}) {
  const onSubmit = vi.fn<(s: Submission) => void>()
  const onSkip = vi.fn()
  const el = (
    <ExerciseView exercise={exercise} locked={!!opts.locked} result={opts.result} onSubmit={onSubmit} onSkip={onSkip} />
  )
  const r = renderWithProviders(opts.hidden ? <div hidden>{el}</div> : el)
  return { ...r, onSubmit, onSkip }
}

beforeEach(() => {
  vi.spyOn(Math, 'random').mockImplementation(noShuffle)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('Choice', () => {
  test('renders the prompt and a radio group with all options', () => {
    view(choice)
    expect(screen.getByText(choice.prompt)).toBeInTheDocument()
    const group = screen.getByRole('radiogroup', { name: 'Варианты ответа' })
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['1é', '2está', '3são'])
  })

  test('click on the correct option submits «correct» with the expected option', async () => {
    const { user, onSubmit } = view(choice)
    await user.click(screen.getByRole('radio', { name: /está/ }))
    expect(onSubmit).toHaveBeenCalledWith({ given: 'está', verdict: 'correct', expected: 'está' })
  })

  test('number keys 1–9 pick an option (wrong one → «wrong»)', async () => {
    const { user, onSubmit } = view(choice)
    await user.keyboard('1')
    expect(onSubmit).toHaveBeenCalledWith({ given: 'é', verdict: 'wrong', expected: 'está' })
  })

  test('digits beyond the option count and modified digits are ignored', async () => {
    const { user, onSubmit } = view(choice)
    await user.keyboard('7')
    await user.keyboard('{Control>}2{/Control}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('arrows move the roving focus between options; Enter answers', async () => {
    const { user, onSubmit } = view(choice)
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1])
    radios[0].focus()
    await user.keyboard('{ArrowDown}')
    expect(radios[1]).toHaveFocus()
    expect(radios[1].tabIndex).toBe(0)
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(radios[2]).toHaveFocus() // wraps around
    await user.keyboard('{Home}')
    expect(radios[0]).toHaveFocus()
    await user.keyboard('{End}')
    expect(radios[2]).toHaveFocus()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ given: 'é', verdict: 'wrong' }))
  })

  test('locked: options disabled, given marked as checked, verdict for screen readers', () => {
    view(choice, { locked: true, result: rec(choice, { given: 'é', verdict: 'wrong', ok: false }) })
    const radios = screen.getAllByRole('radio')
    radios.forEach((r) => expect(r).toBeDisabled())
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    expect(radios[1]).toHaveAttribute('aria-checked', 'false')
    expect(radios[0]).toHaveTextContent('ваш ответ, неверно')
    expect(radios[1]).toHaveTextContent('верный ответ')
  })

  test('locked with the correct answer: «ваш ответ, верно»', () => {
    view(choice, { locked: true, result: rec(choice, { given: 'está' }) })
    expect(screen.getAllByRole('radio')[1]).toHaveTextContent('ваш ответ, верно')
  })

  test('digits are ignored when locked or inside a hidden tab panel', async () => {
    const a = view(choice, { locked: true, result: rec(choice, { given: 'está' }) })
    await a.user.keyboard('1')
    expect(a.onSubmit).not.toHaveBeenCalled()
    a.unmount()
    const b = view(choice, { hidden: true })
    await b.user.keyboard('2')
    expect(b.onSubmit).not.toHaveBeenCalled()
  })
})

describe('Listen-choice (via Choice options)', () => {
  test('play buttons call the speech engine; prompt shown; text hidden until answered', async () => {
    const audio = await import('@/engine/audio')
    const { user } = view(listenChoice)
    expect(screen.getByText('Что вы услышали?')).toBeInTheDocument()
    expect(screen.queryByText('Bom dia', { selector: 'p' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Слушать/ }))
    expect(audio.speak).toHaveBeenCalledWith('Bom dia', expect.objectContaining({ rate: 1 }))
    await user.click(screen.getByRole('button', { name: /Медленно/ }))
    expect(audio.speak).toHaveBeenLastCalledWith('Bom dia', expect.objectContaining({ rate: 0.75 }))
  })

  test('answering by digit; locked shows the spoken text', async () => {
    const { user, onSubmit, unmount } = view(listenChoice)
    await user.keyboard('2')
    expect(onSubmit).toHaveBeenCalledWith({ given: 'Bom dia', verdict: 'correct', expected: 'Bom dia' })
    unmount()
    view(listenChoice, { locked: true, result: rec(listenChoice, { given: 'Bom dia' }) })
    expect(screen.getByText('Bom dia', { selector: 'p' })).toBeInTheDocument()
  })
})

describe('FillGap', () => {
  test('renders the gap (announced), translation and hint; field described by them', () => {
    view(fillGap)
    expect(screen.getByText('[пропуск]')).toBeInTheDocument()
    expect(screen.getByText('Я из Лиссабона.')).toBeInTheDocument()
    expect(screen.getByText('Подсказка: ser')).toBeInTheDocument()
    const field = screen.getByRole('textbox', { name: 'Ваш ответ' })
    expect(field).toHaveAccessibleDescription(/Я из Лиссабона\..*Подсказка: ser/)
  })

  test('typing the answer + Enter → «correct»', async () => {
    const { user, onSubmit } = view(fillGap)
    await user.type(screen.getByRole('textbox', { name: 'Ваш ответ' }), ' sou {Enter}')
    expect(onSubmit).toHaveBeenCalledWith({ given: 'sou', verdict: 'correct', expected: 'sou' })
  })

  test('wrong answer → «wrong»; accent-only mistake → «accents»', async () => {
    const a = view(fillGap)
    await a.user.type(screen.getByRole('textbox'), 'estou{Enter}')
    expect(a.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ given: 'estou', verdict: 'wrong' }))
    a.unmount()
    const b = view(fillAccent)
    await b.user.type(screen.getByRole('textbox'), 'esta{Enter}')
    expect(b.onSubmit).toHaveBeenCalledWith({ given: 'esta', verdict: 'accents', expected: 'está' })
  })

  test('several gaps: one field per gap, Enter moves to the next empty gap, answer joined with « / »', async () => {
    const { user, onSubmit } = view(fillGap2)
    expect(screen.getByText('[пропуск 1]')).toBeInTheDocument()
    const g1 = screen.getByRole('textbox', { name: 'Пропуск 1 из 2' })
    const g2 = screen.getByRole('textbox', { name: 'Пропуск 2 из 2' })
    await user.type(g1, 'é{Enter}')
    expect(g2).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
    await user.type(g2, 'está{Enter}')
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ given: 'é / está', verdict: 'correct' }))
  })

  test('locked: the sentence shows the expected filling, field disabled, no buttons', () => {
    view(fillGap, { locked: true, result: rec(fillGap, { given: 'é', expected: 'sou', ok: false, verdict: 'wrong' }) })
    expect(screen.getByText('sou', { selector: 'mark' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('button', { name: 'Проверить' })).not.toBeInTheDocument()
  })

  test('«Не знаю» button and Shift+Enter call onSkip', async () => {
    const { user, onSkip, onSubmit } = view(fillGap)
    await user.click(screen.getByRole('button', { name: 'Не знаю' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
    await user.type(screen.getByRole('textbox'), '{Shift>}{Enter}{/Shift}')
    expect(onSkip).toHaveBeenCalledTimes(2)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe.each([
  ['Transform', transform, 'Новое предложение', 'Somos altos.', 'Somos altos.'],
  ['TranslateRuPt', translate, 'Перевод на португальский', 'estou cansado', 'Estou cansado.'],
  ['ListenType', listenType, 'Что вы услышали', 'obrigado', 'Obrigado'],
] as const)('%s', (_name, ex, label, typed, expected) => {
  test('labelled multiline field; typed answer graded against the accepted variants', async () => {
    const { user, onSubmit } = view(ex)
    const field = screen.getByRole('textbox', { name: label })
    expect(field.tagName).toBe('TEXTAREA')
    await user.type(field, `${typed}{Enter}`)
    expect(onSubmit).toHaveBeenCalledWith({ given: typed, verdict: 'correct', expected })
  })

  test('wrong answer → «wrong»; Shift+Enter → «Не знаю»', async () => {
    const { user, onSubmit, onSkip } = view(ex)
    await user.type(screen.getByRole('textbox', { name: label }), 'xyz{Enter}')
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ given: 'xyz', verdict: 'wrong' }))
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSkip).toHaveBeenCalled()
  })
})

describe('Transform / Translate / ListenType specifics', () => {
  test('transform shows the source sentence; translate shows the Russian text', () => {
    const a = view(transform)
    expect(screen.getByText('Eu sou alto.')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Eu sou alto.')
    a.unmount()
    view(translate)
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Я устал.')
  })

  test('listen-type: play buttons; the text appears only after answering', async () => {
    const audio = await import('@/engine/audio')
    const a = view(listenType)
    expect(screen.queryByText('Obrigado')).not.toBeInTheDocument()
    await a.user.click(screen.getByRole('button', { name: /Слушать/ }))
    expect(audio.speak).toHaveBeenCalledWith('Obrigado', expect.anything())
    a.unmount()
    view(listenType, { locked: true, result: rec(listenType, { given: 'Obrigado' }) })
    expect(screen.getByText('Obrigado', { selector: 'p' })).toBeInTheDocument()
  })
})

describe('OrderWords', () => {
  const bank = () => screen.getByRole('group', { name: 'Слова' })
  const answer = () => screen.getByRole('group', { name: 'Ваше предложение' })

  test('renders the translation, an empty answer row and the word bank', () => {
    view(orderWords)
    expect(screen.getByText('Я учитель.')).toBeInTheDocument()
    expect(within(answer()).getByText('Нажимайте на слова ниже…')).toBeInTheDocument()
    expect(within(bank()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Eu', 'sou', 'professor'])
    expect(screen.getByRole('button', { name: 'Проверить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Сбросить' })).toBeDisabled()
  })

  test('tapping words builds the sentence (announced); «Проверить» grades it', async () => {
    const { user, onSubmit } = view(orderWords)
    for (const w of ['Eu', 'sou', 'professor']) await user.click(within(bank()).getByRole('button', { name: w }))
    expect(within(answer()).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Eu — убрать',
      'sou — убрать',
      'professor — убрать',
    ])
    expect(screen.getByText('Собрано: Eu sou professor')).toBeInTheDocument()
    // Bank empty → focus goes to «Проверить».
    expect(screen.getByRole('button', { name: 'Проверить' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Проверить' }))
    expect(onSubmit).toHaveBeenCalledWith({ given: 'Eu sou professor', verdict: 'correct', expected: 'Eu sou professor' })
  })

  test('tapping an answer chip returns it to the bank; «Сбросить» clears the answer', async () => {
    const { user } = view(orderWords)
    await user.click(within(bank()).getByRole('button', { name: 'Eu' }))
    await user.click(within(bank()).getByRole('button', { name: 'sou' }))
    await user.click(within(answer()).getByRole('button', { name: 'Eu — убрать' }))
    expect(within(answer()).getAllByRole('button')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Сбросить' }))
    expect(within(answer()).queryAllByRole('button')).toHaveLength(0)
  })

  test('Ctrl+Enter checks a wrong order', async () => {
    const { user, onSubmit } = view(orderWords)
    await user.click(within(bank()).getByRole('button', { name: 'sou' }))
    await user.click(within(bank()).getByRole('button', { name: 'Eu' }))
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ given: 'sou Eu', verdict: 'wrong' }))
  })

  test('Backspace removes the last word; Enter off a chip checks', async () => {
    const { user, onSubmit } = view(orderWords)
    await user.click(within(bank()).getByRole('button', { name: 'Eu' }))
    await user.click(within(bank()).getByRole('button', { name: 'sou' }))
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('{Backspace}')
    expect(screen.getByText('Собрано: Eu')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ given: 'Eu', verdict: 'wrong' }))
  })

  test('keyboard: ←/→ move in the bank, Enter moves the word, ↑ goes to the answer row', async () => {
    const { user } = view(orderWords)
    const chips = within(bank()).getAllByRole('button')
    chips[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(chips[1]).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(within(answer()).getByRole('button', { name: 'sou — убрать' })).toBeInTheDocument()
    // Focus stays in the bank on the next word.
    expect(within(bank()).getByRole('button', { name: 'professor' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(within(answer()).getByRole('button', { name: 'sou — убрать' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(within(bank()).getByRole('button', { name: 'professor' })).toHaveFocus()
  })

  test('Shift+Enter → «Не знаю»', async () => {
    const { user, onSkip } = view(orderWords)
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSkip).toHaveBeenCalled()
  })

  test('locked: bank hidden, no action buttons, chips disabled', () => {
    view(orderWords, { locked: true, result: rec(orderWords, { ok: false, verdict: 'wrong' }) })
    expect(screen.queryByRole('button', { name: 'Проверить' })).not.toBeInTheDocument()
    // The bank is hidden with a CSS class (no stylesheet in jsdom): check its chips are disabled instead.
    within(bank()).getAllByRole('button').forEach((b) => expect(b).toBeDisabled())
    expect(screen.queryByRole('button', { name: 'Не знаю' })).not.toBeInTheDocument()
  })
})

describe('Match', () => {
  const L = () => screen.getByRole('list', { name: 'Левый столбец' })
  const R = () => screen.getByRole('list', { name: 'Правый столбец' })

  test('renders two columns and the counter', () => {
    view(match)
    expect(within(L()).getAllByRole('button').map((b) => b.textContent)).toEqual(['ser', 'estar'])
    expect(within(R()).getAllByRole('button')).toHaveLength(2)
    expect(screen.getByText('Ошибок: 0 · осталось пар: 2')).toBeInTheDocument()
  })

  test('selecting toggles aria-pressed; a wrong pair counts a mistake and is announced', async () => {
    const { user } = view(match)
    const ser = within(L()).getByRole('button', { name: 'ser' })
    await user.click(ser)
    expect(ser).toHaveAttribute('aria-pressed', 'true')
    await user.click(ser)
    expect(ser).toHaveAttribute('aria-pressed', 'false')
    await user.click(ser)
    await user.click(within(R()).getByRole('button', { name: 'быть (временно)' }))
    expect(screen.getByText('Ошибок: 1 · осталось пар: 2')).toBeInTheDocument()
    expect(screen.getByText('Пара неверна: ser — быть (временно)')).toBeInTheDocument()
  })

  test('all pairs right → «correct»; matched items get disabled', async () => {
    const { user, onSubmit } = view(match)
    await user.click(within(L()).getByRole('button', { name: 'ser' }))
    await user.click(within(R()).getByRole('button', { name: 'быть (постоянно)' }))
    expect(within(L()).getByRole('button', { name: /^ser.*сопоставлено/ })).toBeDisabled()
    expect(screen.getByText('Верно: ser — быть (постоянно). Осталось пар: 1')).toBeInTheDocument()
    // Start from the right column this time.
    await user.click(within(R()).getByRole('button', { name: 'быть (временно)' }))
    await user.click(within(L()).getByRole('button', { name: 'estar' }))
    expect(onSubmit).toHaveBeenCalledWith({ given: 'ser — быть (постоянно); estar — быть (временно)', verdict: 'correct' })
  })

  test('with mistakes → «wrong» listing the wrong pairs', async () => {
    const { user, onSubmit } = view(match)
    await user.click(within(L()).getByRole('button', { name: 'ser' }))
    await user.click(within(R()).getByRole('button', { name: 'быть (временно)' }))
    await user.click(within(L()).getByRole('button', { name: 'ser' }))
    await user.click(within(R()).getByRole('button', { name: 'быть (постоянно)' }))
    await user.click(within(L()).getByRole('button', { name: 'estar' }))
    await user.click(within(R()).getByRole('button', { name: 'быть (временно)' }))
    expect(onSubmit).toHaveBeenCalledWith({ given: 'ошибки: ser — быть (временно)', verdict: 'wrong' })
  })

  test('keyboard: roving grid with arrows, Enter selects and pairs', async () => {
    const { user, onSubmit } = view(match)
    const ser = within(L()).getByRole('button', { name: 'ser' })
    expect(ser.tabIndex).toBe(0)
    ser.focus()
    await user.keyboard('{ArrowDown}')
    expect(within(L()).getByRole('button', { name: 'estar' })).toHaveFocus()
    await user.keyboard('{ArrowUp}{Enter}{ArrowRight}')
    expect(within(R()).getByRole('button', { name: 'быть (постоянно)' })).toHaveFocus()
    await user.keyboard('{Enter}')
    // Pair done: focus returns to the next open item of the column it started from.
    expect(within(L()).getByRole('button', { name: 'estar' })).toHaveFocus()
    await user.keyboard('{Enter}{ArrowRight}{End}{Enter}')
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'correct' }))
  })

  test('locked: all items disabled and the counter hidden', () => {
    view(match, { locked: true, result: rec(match) })
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled())
    expect(screen.queryByText(/Ошибок:/)).not.toBeInTheDocument()
  })
})

describe('SpeakShadow', () => {
  test('renders text + translation; self-grading buttons submit correct / wrong', async () => {
    const a = view(shadow)
    expect(screen.getByText('Muito prazer')).toBeInTheDocument()
    expect(screen.getByText('Очень приятно')).toBeInTheDocument()
    await a.user.click(screen.getByRole('button', { name: 'Получилось' }))
    expect(a.onSubmit).toHaveBeenCalledWith({ given: 'получилось', verdict: 'correct' })
    await a.user.click(screen.getByRole('button', { name: 'Ещё потренироваться' }))
    expect(a.onSubmit).toHaveBeenLastCalledWith({ given: 'ещё раз', verdict: 'wrong' })
  })

  test('no MediaRecorder (jsdom): a note instead of the recorder', () => {
    view(shadow)
    expect(screen.getByText('Запись в этом браузере недоступна — повторите вслух.')).toBeInTheDocument()
  })

  describe('with a stubbed MediaRecorder', () => {
    const stop = vi.fn()
    class FakeRecorder {
      state = 'inactive'
      mimeType = 'audio/webm'
      ondataavailable: ((e: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      start() {
        this.state = 'recording'
      }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['x']) })
        this.onstop?.()
      }
    }
    let getUserMedia: ReturnType<typeof vi.fn>
    beforeEach(() => {
      vi.stubGlobal('MediaRecorder', FakeRecorder)
      getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }] }))
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
      URL.createObjectURL = vi.fn(() => 'blob:rec')
      URL.revokeObjectURL = vi.fn()
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      Reflect.deleteProperty(navigator, 'mediaDevices')
    })

    test('record → stop → playback, then «Записать заново»', async () => {
      const { user, container } = view(shadow)
      await user.click(screen.getByRole('button', { name: 'Записать себя' }))
      await user.click(await screen.findByRole('button', { name: /Остановить запись/ }))
      expect(await screen.findByRole('button', { name: 'Записать заново' })).toBeInTheDocument()
      expect(container.querySelector('audio')).toHaveAttribute('src', 'blob:rec')
      expect(stop).toHaveBeenCalled()
    })

    test('denied microphone → «Нет доступа к микрофону»', async () => {
      getUserMedia.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }))
      const { user } = view(shadow)
      await user.click(screen.getByRole('button', { name: 'Записать себя' }))
      expect(await screen.findByText('Нет доступа к микрофону')).toBeInTheDocument()
    })

    test('other failure → «Не удалось начать запись»', async () => {
      getUserMedia.mockRejectedValueOnce(new Error('boom'))
      const { user } = view(shadow)
      await act(() => user.click(screen.getByRole('button', { name: 'Записать себя' })))
      expect(await screen.findByText('Не удалось начать запись')).toBeInTheDocument()
    })
  })

  test('locked: self-grading buttons are gone', () => {
    view(shadow, { locked: true, result: rec(shadow) })
    expect(screen.queryByRole('button', { name: 'Получилось' })).not.toBeInTheDocument()
  })
})
