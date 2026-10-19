import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { Dialog } from '@/components/Dialog'
import { stubLayoutVisibility } from '../../helpers/B-ui-layout'

// Dialog's focusables() drops elements with offsetParent === null (hidden). jsdom has no layout, so every element
// reports null: make connected elements "visible" for this file.
let restore: () => void
beforeAll(() => {
  restore = stubLayoutVisibility()
})
afterAll(() => restore())

function Harness({ withInput = false, onClose: spy }: { withInput?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть
      </button>
      <Dialog
        open={open}
        onClose={() => {
          spy?.()
          setOpen(false)
        }}
        title="Заголовок"
        description="Описание диалога"
        initialFocusRef={withInput ? inputRef : undefined}
        actions={
          <>
            <button type="button">Отмена</button>
            <button type="button">Готово</button>
          </>
        }
      >
        <input ref={inputRef} aria-label="Поле" />
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  test('renders nothing inside while closed; opens labelled + described, focus on the first control', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.queryByText('Заголовок')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Открыть' }))
    const dlg = screen.getByRole('dialog', { name: 'Заголовок' })
    expect(dlg).toHaveAttribute('open')
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(dlg).toHaveAccessibleDescription('Описание диалога')
    // Default initial focus: the first focusable = the close button.
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus()
  })

  test('initialFocusRef wins over the first control', async () => {
    const user = userEvent.setup()
    render(<Harness withInput />)
    await user.click(screen.getByRole('button', { name: 'Открыть' }))
    expect(screen.getByRole('textbox', { name: 'Поле' })).toHaveFocus()
  })

  test('Tab / Shift+Tab are trapped inside (wrap last→first and first→last)', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Открыть' }))
    const close = screen.getByRole('button', { name: 'Закрыть' })
    const done = screen.getByRole('button', { name: 'Готово' })
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(done).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Поле' })).toHaveFocus()
  })

  test('Esc (cancel event) closes via onClose and focus returns to the opener', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Открыть' })
    await user.click(opener)
    const dlg = screen.getByRole('dialog')
    // jsdom does not turn Escape into the native `cancel` event of a modal <dialog>: dispatch it directly.
    const ev = new Event('cancel', { cancelable: true })
    act(() => {
      dlg.dispatchEvent(ev)
    })
    expect(ev.defaultPrevented).toBe(true) // the owner decides; the native close is prevented
    expect(onClose).toHaveBeenCalledOnce()
    expect(dlg).not.toHaveAttribute('open')
    await waitFor(() => expect(opener).toHaveFocus())
  })

  test('close button and a click on the backdrop close; a click inside does not', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Открыть' }))
    await user.click(screen.getByRole('textbox', { name: 'Поле' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Открыть' }))
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  test('role="alertdialog" and a custom close label', () => {
    render(
      <Dialog open onClose={() => {}} role="alertdialog" title="Удалить?" closeLabel="Отмена удаления">
        <p>Текст</p>
      </Dialog>,
    )
    expect(screen.getByRole('alertdialog', { name: 'Удалить?' })).not.toHaveAttribute('aria-describedby')
    expect(screen.getByRole('button', { name: 'Отмена удаления' })).toBeInTheDocument()
  })
})
