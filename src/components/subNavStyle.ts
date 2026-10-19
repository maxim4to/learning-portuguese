import { useEffect, type RefObject } from 'react'
import { cx, scrollBehavior } from './cx'

/**
 * Second-level navigation style, shared by route sub-sections (`SubNav`: «Практика», «Повторение») and
 * in-page panels (`Tabs`: topic, situation, review). Deliberately quieter than the main nav (ink pills):
 * plain 14px text on a 1px baseline, the current item ink with a 2px ink underline, no fills.
 * One row that scrolls sideways on phones (edges fade only where items are hidden).
 */
export const subRowOuter = 'relative before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-ink/12'
export const subRowScroller = 'scroll-fade-x relative flex gap-5 overflow-x-auto lg:gap-6'
export function subItemClass(on: boolean) {
  return cx(
    'relative inline-flex h-11 shrink-0 items-center gap-1.5 px-0.5 text-sm font-semibold whitespace-nowrap no-underline transition-colors duration-150 focus-visible:-outline-offset-3',
    'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors after:duration-150',
    on ? 'text-ink after:bg-ink' : 'text-ink-muted after:bg-transparent hover:text-ink hover:after:bg-line-strong',
  )
}
export const subMetaClass = 'text-xs font-semibold text-ink-muted tabular-nums'

/** Keeps the current item visible inside a horizontally scrolling row (on mount and when it changes). */
export function useActiveInView(ref: RefObject<HTMLElement | null>, selector: string, key: unknown) {
  useEffect(() => {
    const bar = ref.current
    const el = bar?.querySelector<HTMLElement>(selector)
    if (!bar || !el) return
    const l = el.offsetLeft - bar.offsetLeft
    if (l < bar.scrollLeft + 24 || l + el.offsetWidth > bar.scrollLeft + bar.clientWidth - 24)
      bar.scrollTo({ left: l - 24, behavior: scrollBehavior() })
  }, [ref, selector, key])
}
