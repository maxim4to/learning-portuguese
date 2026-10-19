import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SpeakButton } from '@/features/exercises'
import { AddCardButton } from './ui'

export interface PopoverAnchor {
  gi: number
  rect: DOMRect
  /** The highlighted word element (clicks on it are not "outside"). */
  el: HTMLElement
}

interface Props {
  anchor: PopoverAnchor
  word: string
  ru: string
  added: boolean
  busy: boolean
  onAdd(): void
  onClose(): void
  /** Called before the popover's own audio starts (to cancel «read all»). */
  onSpeak?(): void
}

const GAP = 6
const MARGIN = 8

/** Small fixed-position card under a glossary word: pt (with audio), ru, «в повторение». Tap-friendly. */
export function GlossaryPopover({ anchor, word, ru, added, busy, onAdd, onClose, onSpeak }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const r = anchor.rect
    const left = Math.min(Math.max(MARGIN, r.left + r.width / 2 - width / 2), window.innerWidth - width - MARGIN)
    const below = r.bottom + GAP
    // Leave room for the mobile tab bar at the bottom.
    const top = below + height > window.innerHeight - 72 && r.top - GAP - height > MARGIN ? r.top - GAP - height : below
    setPos({ left, top })
  }, [anchor])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.el.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onMove = () => onClose()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, { passive: true, capture: true })
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, { capture: true })
      window.removeEventListener('resize', onMove)
    }
  }, [anchor, onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Перевод: ${word}`}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className="fixed z-30 w-max max-w-[min(18rem,calc(100vw-16px))] rounded-xl border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-900"
    >
      <div className="flex items-start gap-2">
        <span onClickCapture={onSpeak}>
          <SpeakButton text={word} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="leading-tight font-semibold" lang="pt-PT">
            {word}
          </p>
          <p className="text-[15px] leading-snug text-stone-700 dark:text-stone-300">{ru}</p>
        </div>
        <AddCardButton added={added} disabled={busy} onClick={onAdd} />
      </div>
    </div>
  )
}
