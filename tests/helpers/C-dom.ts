/** Workstream C: small DOM measurements for e2e specs (word positions, page overflow). */
import type { Locator, Page } from '@playwright/test'

/** Centre (viewport px) of the first occurrence of `word` inside `el`'s text — for tapping / double-clicking one word. */
export async function wordPoint(el: Locator, word: string): Promise<{ x: number; y: number }> {
  await el.scrollIntoViewIfNeeded()
  const p = await el.evaluate((root, w) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf(w)
      if (i < 0) continue
      const r = document.createRange()
      r.setStart(n, i)
      r.setEnd(n, i + w.length)
      const b = r.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    }
    return null
  }, word)
  if (!p) throw new Error(`word «${word}» not found`)
  return p
}

/** How many px the document is wider than the viewport (0 = no horizontal page scroll). */
export function pageOverflowX(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth)
}

/** Elements sticking out past the right edge of the viewport (for a readable failure message). */
export function overflowingElements(page: Page, limit = 5): Promise<string[]> {
  return page.evaluate((max) => {
    const vw = document.documentElement.clientWidth
    const out: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.right <= vw + 1) continue
      // Skip descendants of horizontally scrolling / clipping containers (their overflow is contained).
      let p = el.parentElement
      let contained = false
      while (p && p !== document.body) {
        const cs = getComputedStyle(p)
        if (cs.overflowX !== 'visible' && p.getBoundingClientRect().right <= vw + 1) {
          contained = true
          break
        }
        p = p.parentElement
      }
      if (contained) continue
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(r.right)} vw=${vw}`)
      if (out.length >= max) break
    }
    return out
  }, limit)
}
