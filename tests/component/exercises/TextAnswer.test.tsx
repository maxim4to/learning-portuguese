import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { TextAnswer } from '@/features/exercises/TextAnswer'
import { setLookupOpen } from '@/features/words/capture/store'
import { fillGap, rec } from '../../helpers/B-ex-fixtures'

function setup(props: Partial<Parameters<typeof TextAnswer>[0]> = {}) {
  const onSubmit = vi.fn()
  const onSkip = vi.fn()
  const user = userEvent.setup()
  const r = render(<TextAnswer locked={false} onSubmit={onSubmit} onSkip={onSkip} {...props} />)
  return { ...r, user, onSubmit, onSkip }
}

afterEach(() => setLookupOpen(false))

describe('TextAnswer', () => {
  test('default label, accent keys group, «Проверить» disabled until something is typed', async () => {
    const { user } = setup()
    const field = screen.getByRole('textbox', { name: 'Ваш ответ' })
    expect(field).toHaveAttribute('lang', 'pt-PT')
    expect(field).toHaveAttribute('data-exercise-focus')
    expect(screen.getByRole('group', { name: 'Буквы с диакритикой' })).toBeInTheDocument()
    const check = screen.getByRole('button', { name: 'Проверить' })
    expect(check).toBeDisabled()
    await user.type(field, '   ')
    expect(check).toBeDisabled()
    await user.type(field, 'a')
    expect(check).toBeEnabled()
  })

  test('submit trims the value; Enter on an empty field does nothing', async () => {
    const { user, onSubmit } = setup()
    const field = screen.getByRole('textbox')
    await user.type(field, '{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    await user.type(field, '  olá  ')
    await user.click(screen.getByRole('button', { name: 'Проверить' }))
    expect(onSubmit).toHaveBeenCalledWith('olá')
  })

  test('accent keys insert at the caret and keep focus in the field', async () => {
    const { user } = setup()
    const field = screen.getByRole('textbox') as HTMLInputElement
    await user.type(field, 'esta')
    field.setSelectionRange(3, 3)
    await user.click(screen.getByRole('button', { name: 'Вставить á' }))
    expect(field).toHaveValue('estáa')
    await vi.waitFor(() => expect(field).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Вставить á' })).toHaveAttribute('tabindex', '-1')
  })

  test('IME composition Enter (keyCode 229) never submits', () => {
    const { onSubmit } = setup()
    const field = screen.getByRole('textbox')
    fireEvent.change(field, { target: { value: 'sou' } })
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 })
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // Implicit form submission: TextAnswer returns early without preventDefault while the lookup card is open,
  // so the browser (and user-event) still submits the <form> on Enter.
  test.fails('Enter is ignored while the word lookup card is open [BUG B-01]', async () => {
    const { user, onSubmit } = setup()
    const field = screen.getByRole('textbox')
    await user.type(field, 'sou')
    setLookupOpen(true)
    await user.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test('Enter after the lookup card closed submits', async () => {
    const { user, onSubmit } = setup()
    await user.type(screen.getByRole('textbox'), 'sou')
    setLookupOpen(true)
    setLookupOpen(false)
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('sou')
  })

  test('without onSkip there is no «Не знаю»', () => {
    render(<TextAnswer locked={false} onSubmit={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Не знаю' })).not.toBeInTheDocument()
  })

  test('«Не знаю» advertises its shortcut', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Не знаю' })).toHaveAttribute('aria-keyshortcuts', 'Shift+Enter')
  })

  test('multiline renders a textarea with a custom label and placeholder', () => {
    setup({ multiline: true, label: 'Перевод', placeholder: 'Пишите тут' })
    const ta = screen.getByRole('textbox', { name: 'Перевод' })
    expect(ta.tagName).toBe('TEXTAREA')
    expect(ta).toHaveAttribute('placeholder', 'Пишите тут')
  })

  test('locked: inputs disabled; wrong result → aria-invalid; right result → valid', () => {
    const a = setup({ locked: true, result: rec(fillGap, { ok: false, verdict: 'wrong' }) })
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('button', { name: 'Проверить' })).not.toBeInTheDocument()
    a.unmount()
    setup({ locked: true, result: rec(fillGap) })
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid')
  })

  test('several fields: Enter in a gap whose next gap is filled submits', async () => {
    const { user, onSubmit } = setup({ fields: 2 })
    const [a, b] = screen.getAllByRole('textbox')
    await user.type(b, 'está')
    await user.type(a, 'é{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('é / está')
    expect(a).toHaveAttribute('placeholder', 'пропуск 1')
  })
})
