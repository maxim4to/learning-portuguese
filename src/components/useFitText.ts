import { useEffect, type RefObject } from 'react'

/**
 * Label sizes tried in order, largest first (custom properties from index.css). 12px is the xs token; 11px and
 * 10px are tab-bar-only steps outside the five-size type scale (documented next to --text-tabbar-min).
 */
const STEPS = ['var(--text-xs)', 'var(--text-tabbar-mid)', 'var(--text-tabbar-min)']
/** Room kept between a label and its cell edge, so neighbours never touch (px, total: 1px each side). */
const GAP = 2

/**
 * Auto-fits one-line labels inside equal cells (the phone tab bar). Labels are `[data-fit-label]`, each one's cell is
 * its parent element. If ANY label is wider than its cell, the shared size steps down for all of them together
 * (12 → 11 → 10px) via `--fit-label-fs` on the container; if even the smallest step does not fit, the container gets
 * `data-fit="hidden"` and the labels are hidden visually (still the accessible name). Measured with every label bold
 * (`data-fit-measuring`), so the size does not jump when the active (bold) item changes. Re-checks on container /
 * cell resize (viewport, zoom, root font size), web-font loads and label changes (`deps`).
 */
export function useFitText(ref: RefObject<HTMLElement | null>, deps: readonly unknown[] = []) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = 0
    const fits = () =>
      [...el.querySelectorAll<HTMLElement>('[data-fit-label]')].every((label) => {
        const cell = label.parentElement
        if (!cell) return true
        const cs = getComputedStyle(cell)
        const room = cell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - GAP
        return label.scrollWidth <= room
      })
    const update = () => {
      frame = 0
      el.setAttribute('data-fit-measuring', '')
      el.removeAttribute('data-fit')
      let step = STEPS.findIndex((size) => {
        el.style.setProperty('--fit-label-fs', size)
        return fits()
      })
      if (step < 0) {
        step = STEPS.length - 1
        el.style.setProperty('--fit-label-fs', STEPS[step])
        el.setAttribute('data-fit', 'hidden')
      } else {
        el.setAttribute('data-fit', String(step))
      }
      el.removeAttribute('data-fit-measuring')
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    // Cells, not labels: the labels resize on every step we try, the cells only when the layout really changes.
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    for (const label of el.querySelectorAll('[data-fit-label]')) if (label.parentElement) ro.observe(label.parentElement)
    let alive = true
    document.fonts?.ready.then(() => alive && schedule())
    document.fonts?.addEventListener('loadingdone', schedule)
    update()
    return () => {
      alive = false
      ro.disconnect()
      document.fonts?.removeEventListener('loadingdone', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-provided deps (label texts)
  }, [ref, ...deps])
}
