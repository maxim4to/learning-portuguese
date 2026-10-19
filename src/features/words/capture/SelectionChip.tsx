import { useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { BookA } from 'lucide-react'

/**
 * Offer for a text selection (the card opens only on press, so copying is not disturbed):
 * - desktop: a small floating button under the end of the selection, «Перевести · В словарь»;
 * - phones: a bar above the tab bar, «Перевести «…»» (the system menu keeps the selection handles).
 */
export function SelectionChip({
  text,
  rect,
  bar,
  onOpen,
}: {
  text: string
  /** Last line box of the selection (desktop placement). */
  rect: DOMRect
  bar: boolean
  onOpen(): void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (bar || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    const left = Math.min(Math.max(8, rect.right - width / 2), window.innerWidth - width - 8)
    const below = rect.bottom + 8
    const top = below + height > window.innerHeight - 8 ? rect.top - height - 8 : below
    setPos({ left, top })
  }, [rect, bar])

  // Pressing the chip must not collapse the selection before it opens the card: preventDefault on pointerdown
  // (+ the compatibility mousedown) keeps it in every engine (Chromium clears it on a touch-down otherwise).
  // But WebKit (iOS Safari) treats preventDefault on a touch pointerdown like one on touchstart and then
  // synthesizes no click at all (D-03) — pointerup / touchend still arrive. So a touch opens the card on
  // pointerup (an activation-triggering event; a finger that moved to scroll ends in pointercancel instead),
  // and the click that may follow (Chromium) is swallowed — it would land on the sheet's backdrop and close it. Mouse / pen / keyboard open on click as before.
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => e.preventDefault(),
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType !== 'touch' || e.button !== 0) return
      const r = e.currentTarget.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
      swallowNextClick()
      onOpen()
    },
    onMouseDown: (e: MouseEvent<HTMLButtonElement>) => e.preventDefault(),
    onClick: onOpen,
  }
  const short = text.length > 28 ? `${text.slice(0, 27)}…` : text

  if (bar) {
    return (
      <div data-lookup-ui="" className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 transition-[bottom] duration-200" style={{ bottom: 'calc(var(--bottom-chrome) + 0.75rem + var(--toast-offset, 0px))' }}>
        <button
          ref={ref}
          type="button"
          {...handlers}
          className="btn-primary pointer-events-auto max-w-full animate-toast"
        >
          <BookA aria-hidden className="size-4.5 shrink-0" />
          <span className="min-w-0 truncate">
            Перевести «<span lang="pt-PT">{short}</span>»
          </span>
        </button>
      </div>
    )
  }
  return (
    <button
      ref={ref}
      type="button"
      data-lookup-ui=""
      {...handlers}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className="btn-primary btn-sm fixed z-30 animate-fade"
      aria-label={`Перевести и добавить в словарь: ${text}`}
    >
      <BookA aria-hidden className="size-4" /> Перевести · В словарь
    </button>
  )
}

/** Drops the click synthesized after a touch that already acted (if the engine sends one at all). */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    done()
  }
  const done = () => {
    clearTimeout(timer)
    window.removeEventListener('click', stop, true)
  }
  const timer = setTimeout(done, 600)
  window.addEventListener('click', stop, true)
}
