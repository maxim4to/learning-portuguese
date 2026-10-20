import { useEffect, type RefObject } from 'react'

/** How much of the top of the visible area to keep clear (sticky tab rows sit there on phones). */
const TOP_CLEAR = 64
const GAP = 12

/**
 * Touch screens: while a text field inside `container` has focus, the on-screen keyboard covers the lower part of
 * the screen. Keeps `actions` (the field's «Проверить» row) inside the visible area — the visual viewport — by
 * scrolling the page up just enough, never so far that the focused field itself leaves the top.
 * Re-checks when the visible area changes (the keyboard slides in after focus).
 */
export function useKeyboardInView(container: RefObject<HTMLElement | null>, actions: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const root = container.current
    if (!root || !window.matchMedia?.('(pointer: coarse)').matches) return
    const vv = window.visualViewport
    let timer = 0

    const fit = () => {
      const field = document.activeElement
      const row = actions.current
      if (!row || !(field instanceof HTMLElement) || !root.contains(field) || !field.matches('input, textarea')) return
      const top = vv?.offsetTop ?? 0
      const bottom = top + (vv?.height ?? window.innerHeight)
      const over = row.getBoundingClientRect().bottom + GAP - bottom
      if (over <= 0) return
      const room = field.getBoundingClientRect().top - (top + TOP_CLEAR)
      const by = Math.min(over, room)
      if (by > 0) window.scrollBy({ top: by })
    }
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(fit, 150)
    }

    root.addEventListener('focusin', schedule)
    vv?.addEventListener('resize', schedule)
    window.addEventListener('resize', schedule)
    return () => {
      window.clearTimeout(timer)
      root.removeEventListener('focusin', schedule)
      vv?.removeEventListener('resize', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [container, actions, enabled])
}
