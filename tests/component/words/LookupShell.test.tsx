import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { LookupPopover } from '@/features/words/capture/LookupPopover'
import { LookupSheet } from '@/features/words/capture/LookupSheet'
import { SelectionChip } from '@/features/words/capture/SelectionChip'

/** A real page scroll: the root's offset changes, then the event fires (an event alone no longer closes the card). */
function scrollPage(by = 120) {
  Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, value: by })
  fireEvent.scroll(document)
  delete (document.documentElement as { scrollTop?: number }).scrollTop
}


afterEach(() => vi.restoreAllMocks())

const rect = { left: 10, top: 10, right: 60, bottom: 30, width: 50, height: 20, x: 10, y: 10 } as DOMRect

function popover(viaKey = false) {
  const anchor = document.createElement('p')
  anchor.textContent = 'âncora'
  document.body.appendChild(anchor)
  const onClose = vi.fn()
  const isOnAnchor = vi.fn((x: number) => x < 50)
  render(
    <>
      <LookupPopover rect={rect} anchorEl={anchor} isOnAnchor={isOnAnchor} viaKey={viaKey} titleId="pt" onClose={onClose}>
        <h2 id="pt">palavra</h2>
        <button type="button" aria-label="Закрыть">x</button>
        <button type="button">В словарь</button>
      </LookupPopover>
      <button type="button">outside</button>
    </>,
  )
  return { onClose, anchor, dialog: screen.getByRole('dialog', { name: 'palavra' }) }
}

describe('LookupPopover', () => {
  test('labelled non-modal dialog, placed and visible', () => {
    const { dialog } = popover()
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(dialog).toHaveAttribute('data-lookup-ui')
    expect(dialog.style.visibility).toBe('visible')
  })

  test('opened from the keyboard: focus goes to the first control that is not «Закрыть»', () => {
    popover(true)
    expect(screen.getByRole('button', { name: 'В словарь' })).toHaveFocus()
  })

  test('opened with the mouse: focus stays where it was', () => {
    popover(false)
    expect(screen.getByRole('button', { name: 'В словарь' })).not.toHaveFocus()
  })

  test('Esc closes with focus restore', () => {
    const { onClose } = popover()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledWith({ restoreFocus: true })
  })

  test('pointerdown: inside or on the word keeps it, elsewhere closes', () => {
    const { onClose, dialog } = popover()
    fireEvent.pointerDown(dialog, { clientX: 500 })
    fireEvent.pointerDown(document.body, { clientX: 20 })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(document.body, { clientX: 500 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('scrolling inside the card keeps it; page scroll and resize close', () => {
    const { onClose, dialog } = popover()
    fireEvent.scroll(dialog)
    expect(onClose).not.toHaveBeenCalled()
    // D-07: a scroll event that moved nothing (late event of an earlier scroll, an animating container) keeps it
    fireEvent.scroll(document)
    expect(onClose).not.toHaveBeenCalled()
    scrollPage()
    fireEvent(window, new Event('resize'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  test('Tab out of the card closes it; moving focus to the anchor does not', async () => {
    const { onClose, anchor } = popover(true)
    anchor.tabIndex = -1
    fireEvent.blur(screen.getByRole('button', { name: 'В словарь' }), { relatedTarget: anchor })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.blur(screen.getByRole('button', { name: 'В словарь' }), { relatedTarget: screen.getByRole('button', { name: 'outside' }) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('LookupSheet', () => {
  function sheet() {
    const onClose = vi.fn()
    const r = render(
      <LookupSheet titleId="st" onClose={onClose}>
        <h2 id="st">folha</h2>
      </LookupSheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'folha' })
    const handle = dialog.querySelector('[aria-hidden="true"]') as HTMLElement
    return { onClose, dialog, handle, ...r }
  }

  test('modal <dialog>, open, focus on the panel', () => {
    const { dialog } = sheet()
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.activeElement).toBe(dialog.firstElementChild)
  })

  test('cancel (Esc) and a backdrop click close; a click inside does not', () => {
    const { dialog, onClose } = sheet()
    fireEvent.click(screen.getByRole('heading'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(dialog)
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  test('dragging the handle down more than 80 px closes; a short drag snaps back', () => {
    const { handle, onClose, dialog } = sheet()
    handle.setPointerCapture = vi.fn()
    const panel = dialog.firstElementChild as HTMLElement
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 140 })
    expect(panel.style.transform).toBe('translateY(40px)')
    fireEvent.pointerUp(handle)
    expect(panel.style.transform).toBe('')
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 300 })
    fireEvent.pointerUp(handle)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 300 })
    fireEvent.pointerCancel(handle)
    expect(panel.style.transform).toBe('')
    // moves without a press are ignored
    fireEvent.pointerMove(handle, { clientY: 500 })
    expect(panel.style.transform).toBe('')
  })

  test('unmount closes the dialog', () => {
    const { dialog, unmount } = sheet()
    const close = vi.spyOn(dialog as HTMLDialogElement, 'close')
    unmount()
    expect(close).toHaveBeenCalled()
  })
})

describe('SelectionChip', () => {
  test('desktop: floating button with a full label; pressing keeps the selection and opens', async () => {
    const onOpen = vi.fn()
    render(<SelectionChip text="levanto-me" rect={rect} bar={false} onOpen={onOpen} />)
    const chip = screen.getByRole('button', { name: 'Перевести и добавить в словарь: levanto-me' })
    expect(chip).toHaveTextContent('Перевести · В словарь')
    expect(chip.style.visibility).toBe('visible')
    // mousedown is prevented (the selection must survive)
    expect(fireEvent.mouseDown(chip)).toBe(false)
    expect(fireEvent.pointerDown(chip)).toBe(false)
    await userEvent.click(chip)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  test('phones: a bar «Перевести «…»», long text truncated to 28 characters', () => {
    const long = 'uma frase bastante comprida demais'
    render(<SelectionChip text={long} rect={rect} bar onOpen={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent(`Перевести «${long.slice(0, 27)}…»`)
  })
})
