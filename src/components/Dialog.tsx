import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { cx } from './cx'

/**
 * Modal dialog on the native <dialog> (showModal): the page behind is inert, Esc closes, focus moves in
 * (`initialFocusRef`, else the first control) and returns to the opener on close. Tab is also kept
 * inside explicitly. Labelled by its title, described by `description`.
 * `role="alertdialog"` for destructive confirmations.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  role = 'dialog',
  closeLabel = 'Закрыть',
  initialFocusRef,
  className,
}: {
  open: boolean
  onClose(): void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** Footer buttons (right-aligned from sm, stacked full-width on phones). */
  actions?: ReactNode
  role?: 'dialog' | 'alertdialog'
  closeLabel?: string
  /** Element to focus on open (default: the first focusable — the close button). */
  initialFocusRef?: RefObject<HTMLElement | null>
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d || !open) return
    const active = document.activeElement
    // StrictMode re-runs this while focus is already inside: keep the original opener then.
    if (active instanceof HTMLElement && !d.contains(active)) opener.current = active
    if (!d.open) d.showModal()
    ;(initialFocusRef?.current ?? focusables(d)[0])?.focus()
    return () => {
      if (d.open) d.close()
      const el = opener.current
      // Return focus to the opener on close / unmount, unless the dialog was reopened meanwhile
      // (StrictMode), the opener is gone (e.g. navigated away) or the owner already moved focus elsewhere
      // (e.g. to a result line that replaced the opener). Safari doesn't focus clicked buttons, so the
      // «opener» there may be an unrelated element (<main>) — it must not steal focus back.
      setTimeout(() => {
        if (d.open || !el?.isConnected) return
        const a = document.activeElement
        if (a && a !== document.body && a.isConnected && !d.contains(a)) return
        el.focus()
      }, 0)
    }
  }, [open, initialFocusRef])

  function onKeyDown(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== 'Tab') return
    const items = focusables(e.currentTarget)
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <dialog
      ref={ref}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault() // Esc: let the owner decide (keeps `open` the single source of truth)
        onClose()
      }}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose() // click on the backdrop
      }}
      className={cx(
        'top-(--safe-top) bottom-(--safe-bottom) m-auto max-h-[calc(100dvh-var(--safe-top)-var(--safe-bottom)-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-card bg-surface p-0 text-ink',
        'backdrop:bg-black/55 open:animate-enter',
        className,
      )}
    >
      {/* Centred inside the safe area (top/bottom = insets): never under the Dynamic Island or the home indicator. */}
      {open && (
        <div className="space-y-5 p-5 lg:p-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <h2 id={titleId}>{title}</h2>
              {description && (
                <p id={descId} className="text-sm text-ink-muted">
                  {description}
                </p>
              )}
            </div>
            <button type="button" className="btn-ghost btn-sm btn-icon -mt-1 -mr-2 shrink-0" aria-label={closeLabel} onClick={onClose}>
              <X aria-hidden />
            </button>
          </div>
          {children}
          {actions && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>}
        </div>
      )}
    </dialog>
  )
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => !el.closest('[hidden]') && el.offsetParent !== null)
}
