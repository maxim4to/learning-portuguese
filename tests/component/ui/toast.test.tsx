import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '@/components/Toast'
import { useToast, type ToastOptions } from '@/components/toastContext'

let show: (t: ToastOptions) => void = () => {}
function Grab() {
  const toast = useToast()
  useEffect(() => {
    show = toast
  }, [toast])
  return null
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // Fake timers + user-event's internal delays deadlock here; clicks use fireEvent.
  const setup = () =>
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    )

  test('a polite live region is always mounted; show() puts the text in it; auto-dismiss after 5 s', () => {
    setup()
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toBeEmptyDOMElement()
    act(() => show({ text: 'Сохранено' }))
    expect(region).toHaveTextContent('Сохранено')
    expect(document.documentElement.style.getPropertyValue('--toast-offset')).toMatch(/px$/)
    act(() => vi.advanceTimersByTime(4999))
    expect(region).toHaveTextContent('Сохранено')
    act(() => vi.advanceTimersByTime(1))
    expect(region).toBeEmptyDOMElement()
    expect(document.documentElement.style.getPropertyValue('--toast-offset')).toBe('')
  })

  test('custom duration; a newer toast replaces the previous one and restarts the timer', () => {
    setup()
    act(() => show({ text: 'Первый', duration: 1000 }))
    act(() => vi.advanceTimersByTime(800))
    act(() => show({ text: 'Второй', duration: 1000, tone: 'danger' }))
    expect(screen.getByRole('status')).toHaveTextContent('Второй')
    expect(screen.queryByText('Первый')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(500)) // the first timer would have fired here
    expect(screen.getByRole('status')).toHaveTextContent('Второй')
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  test('action (undo) runs its handler and dismisses; the close button dismisses', () => {
    setup()
    const undo = vi.fn()
    act(() => show({ text: 'Слово удалено', action: { label: 'Отменить', onClick: undo }, tone: 'success' }))
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }))
    expect(undo).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    act(() => show({ text: 'Ещё' }))
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  test('useToast outside a provider is a harmless no-op', () => {
    render(<Grab />)
    expect(() => show({ text: 'x' })).not.toThrow()
  })
})
