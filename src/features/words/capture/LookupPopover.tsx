import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const GAP = 8
const MARGIN = 8

/**
 * Desktop lookup card: a non-modal labelled dialog next to the word (positioning and closing as in the
 * glossary popover: Esc returns focus, click outside, scroll, resize, Tab out). Opened from the keyboard,
 * focus moves to its first control.
 */
export function LookupPopover({
  rect,
  anchorEl,
  isOnAnchor,
  viaKey,
  titleId,
  onClose,
  children,
}: {
  rect: DOMRect
  anchorEl: HTMLElement
  /** Pointer on the looked-up word itself (not «outside»: the click re-opens the same card). */
  isOnAnchor(x: number, y: number): boolean
  viaKey: boolean
  titleId: string
  onClose(opts?: { restoreFocus?: boolean }): void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const focused = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const place = () => {
      const { width, height } = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const clampX = (x: number) => Math.min(Math.max(MARGIN, x), vw - width - MARGIN)
      const clampY = (y: number) => Math.min(Math.max(MARGIN, y), vh - height - MARGIN)
      let left = clampX(rect.left + rect.width / 2 - width / 2)
      let top: number
      if (rect.bottom + GAP + height <= vh - MARGIN) top = rect.bottom + GAP
      else if (rect.top - GAP - height >= MARGIN) top = rect.top - GAP - height
      else {
        // Taller than the room above and below: beside the word, never over it.
        top = clampY(rect.top - 24)
        if (vw - rect.right - GAP - MARGIN >= width) left = rect.right + GAP
        else if (rect.left - GAP - MARGIN >= width) left = rect.left - GAP - width
        else top = clampY(rect.bottom + GAP)
      }
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }))
    }
    place()
    // The card grows when the lexicon arrives / «Все слова фразы» opens: keep it on screen.
    const ro = new ResizeObserver(place)
    ro.observe(el)
    return () => ro.disconnect()
  }, [rect])

  useEffect(() => {
    if (!pos || !viaKey || focused.current) return
    focused.current = true
    ref.current?.querySelector<HTMLElement>('button:not([aria-label="Закрыть"]), a[href], input')?.focus()
  }, [pos, viaKey])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      if (isOnAnchor(e.clientX, e.clientY)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      e.stopPropagation()
      onClose({ restoreFocus: true })
    }
    const onScroll = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return
      onClose()
    }
    const onResize = () => onClose()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onResize)
    }
  }, [anchorEl, isOnAnchor, onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      data-lookup-ui=""
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null
        if (to && !ref.current?.contains(to) && !anchorEl.contains(to)) onClose()
      }}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className="fixed z-30 max-h-[calc(100dvh-16px)] w-[min(24rem,calc(100vw-16px))] animate-fade overflow-y-auto overscroll-contain rounded-card border-[1.5px] border-ink bg-surface p-5"
    >
      {children}
    </div>
  )
}
