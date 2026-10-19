/**
 * Source anchors: a saved word links back to where it was met (`sourceHref` → `/situation/x#dlg-line-3`,
 * `/library/reading/y#p-2`…). On such a navigation the target element is scrolled into view and briefly
 * flashed (`.anchor-flash` in index.css). Content can render late (lazy routes, tab panels), so the element is
 * polled for a few seconds. Elements rendered twice (phone list + desktop table) carry `data-anchor` instead
 * of an `id`; the visible one wins.
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { scrollBehavior } from '@/components/cx'

const FLASH_MS = 2400
const POLL_MS = 100
const POLL_MAX = 40

/** Hashes written by `sourceHref` (other in-page anchors, e.g. `#tutor`, keep the browser's plain jump). */
const SOURCE_ANCHOR = /^(?:(?:dlg-line|p|ph|voc|ex|w|gl)-\d+|writing-sample|questions)$/

const visible = (el: Element) => el.getClientRects().length > 0

export function findAnchor(name: string): HTMLElement | null {
  if (!name) return null
  const byId = document.getElementById(name)
  if (byId && visible(byId)) return byId
  const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(name) : name.replace(/"/g, '\\"')
  for (const el of document.querySelectorAll<HTMLElement>(`[data-anchor="${esc}"]`)) if (visible(el)) return el
  return null
}

export function flashAnchor(el: HTMLElement): void {
  el.classList.remove('anchor-flash')
  void el.offsetWidth // restart the animation
  el.classList.add('anchor-flash')
  setTimeout(() => el.classList.remove('anchor-flash'), FLASH_MS)
}

/** Scroll to and flash the element named by the URL hash after each navigation. */
export function useSourceAnchor(): void {
  const { hash, key } = useLocation()
  useEffect(() => {
    let name = ''
    try {
      name = decodeURIComponent(hash.slice(1))
    } catch {
      name = hash.slice(1)
    }
    if (!SOURCE_ANCHOR.test(name)) return
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const el = findAnchor(name)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: scrollBehavior() })
        flashAnchor(el)
        return
      }
      if (++tries < POLL_MAX) timer = setTimeout(tick, POLL_MS)
    }
    // After the layout's «new page starts at the top» scroll.
    timer = setTimeout(tick, 50)
    return () => clearTimeout(timer)
  }, [hash, key])
}
