import { useEffect, type RefObject } from 'react'

/** Sub-pixel tolerance: scroll offsets are fractional on zoomed / HiDPI screens. */
const EPS = 1

/**
 * Marks a horizontal scroller with `data-fade-start` / `data-fade-end` while content is hidden
 * past that edge. Pair with the `scroll-fade-x` utility, which masks only the marked edges:
 * nothing fits-everything, right only at the start, left only at the end, both in between.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = 0
    const update = () => {
      frame = 0
      const max = el.scrollWidth - el.clientWidth
      // RTL scrollers report negative scrollLeft; the magnitude is what matters.
      const left = Math.abs(el.scrollLeft)
      el.toggleAttribute('data-fade-start', max > EPS && left > EPS)
      el.toggleAttribute('data-fade-end', max > EPS && left < max - EPS)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    // Watch the scroller and its items: a counter or label change can make the row overflow.
    const ro = new ResizeObserver(schedule)
    const observeAll = () => {
      ro.disconnect()
      ro.observe(el)
      for (const c of el.children) ro.observe(c)
      schedule()
    }
    const mo = new MutationObserver(observeAll)

    observeAll()
    mo.observe(el, { childList: true })
    el.addEventListener('scroll', schedule, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      mo.disconnect()
      el.removeEventListener('scroll', schedule)
      el.removeAttribute('data-fade-start')
      el.removeAttribute('data-fade-end')
    }
  }, [ref])
}
