import { useEffect, useRef, type ReactNode } from 'react'

const CLOSE_DRAG = 80

/**
 * Phone lookup card: a bottom sheet on the native <dialog> (showModal — the page is inert, focus stays inside,
 * Esc closes). Docked to the bottom edge above the tab bar and the home indicator (safe-area padding),
 * a grab handle; dragging it down or tapping the backdrop closes.
 */
export function LookupSheet({ titleId, onClose, children }: { titleId: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (!d.open) d.showModal()
    // Focus the sheet itself (not its first button): no stray focus ring, the reader starts at the title.
    panel.current?.focus({ preventScroll: true })
    return () => {
      if (d.open) d.close()
    }
  }, [])

  const setY = (y: number) => {
    if (panel.current) panel.current.style.transform = y ? `translateY(${y}px)` : ''
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-modal="true"
      data-lookup-ui=""
      className="lookup-sheet"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={panel} tabIndex={-1} className="lookup-sheet-panel outline-none">
        <div
          className="flex h-6 cursor-grab touch-none items-center justify-center"
          aria-hidden
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, dy: 0 }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!drag.current) return
            drag.current.dy = Math.max(0, e.clientY - drag.current.y)
            setY(drag.current.dy)
          }}
          onPointerUp={() => {
            const dy = drag.current?.dy ?? 0
            drag.current = null
            if (dy > CLOSE_DRAG) onClose()
            else setY(0)
          }}
          onPointerCancel={() => {
            drag.current = null
            setY(0)
          }}
        >
          <span className="h-1 w-10 rounded-pill bg-line-strong" />
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </dialog>
  )
}
