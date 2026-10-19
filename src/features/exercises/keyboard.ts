import { scrollBehavior } from '@/components/cx'

/**
 * Exercise shortcuts listen on `window`, but lesson/situation pages keep every tab panel mounted
 * (hidden) so runs survive tab switches. A runner inside a hidden panel must ignore the keys.
 */
export function isInHiddenPanel(el: Element | null): boolean {
  return !el || el.closest('[hidden]') !== null
}

/** Mouse / trackpad (not a phone): autofocusing a text field there doesn't pop up an on-screen keyboard. */
export function hasFinePointer(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches
}

/**
 * Enter that belongs to an IME (composition in progress, or Safari's keydown right after compositionend,
 * which reports keyCode 229) — never treat it as «submit».
 */
export function isImeEnter(e: KeyboardEvent | { nativeEvent: KeyboardEvent }): boolean {
  const ev = 'nativeEvent' in e ? e.nativeEvent : e
  return ev.isComposing || ev.keyCode === 229
}

/** Attribute that marks an exercise's primary control (or a wrapper whose first control is the primary one). */
export const FOCUS_ATTR = 'data-exercise-focus'
export const focusMark = { [FOCUS_ATTR]: '' } as const

const FOCUSABLE = '[tabindex="0"], input:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href]'

/**
 * Moves focus to the primary control of the task inside `root` (marked with `data-exercise-focus`): the text field,
 * the roving option of a choice, the word bank… Scrolls it into view only when it is off-screen.
 * Returns false when there is nothing to focus (the caller then falls back to the heading).
 */
export function focusPrimary(root: HTMLElement | null): boolean {
  const mark = root?.querySelector<HTMLElement>(`[${FOCUS_ATTR}]`)
  if (!mark) return false
  const target = mark.matches(FOCUSABLE) ? mark : mark.querySelector<HTMLElement>(FOCUSABLE)
  if (!target) return false
  target.focus({ preventScroll: true })
  if (document.activeElement !== target) return false
  revealIfOffscreen(target)
  return true
}

/** Smoothly (unless reduced motion) scrolls `el` into view when it is (partly) hidden under the sticky header or below the fold. */
export function revealIfOffscreen(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0
  if (r.top < header || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center', behavior: scrollBehavior() })
}

/**
 * Arrow-key movement in a 1-D list of buttons (roving tabindex): returns the index to move to, or null when
 * the key isn't a movement key. Skips nothing — callers pass only the enabled items.
 */
export function rovingIndex(key: string, current: number, length: number, { vertical = true, horizontal = true } = {}): number | null {
  if (!length) return null
  const fwd = (vertical && key === 'ArrowDown') || (horizontal && key === 'ArrowRight')
  const back = (vertical && key === 'ArrowUp') || (horizontal && key === 'ArrowLeft')
  if (fwd) return (current + 1) % length
  if (back) return (current - 1 + length) % length
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  return null
}

/** No Ctrl / ⌘ / Alt (Shift allowed). */
export const noMods = (e: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }) => !e.metaKey && !e.ctrlKey && !e.altKey
