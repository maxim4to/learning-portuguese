/**
 * Layout sanity (workstream E): no horizontal overflow on any route at 360 / 390 / 768 / 1280 / 1440, nothing
 * hidden under the phone tab bar (page end, the exercise «Дальше»), the header wordmark fits at 320.
 * Widths are set explicitly, so the width matrix runs in desktop-chromium; the phone projects check their own
 * viewport (Safari / Android font metrics).
 */
import type { Page } from '@playwright/test'
import { NOW } from '../../../fixtures/seed'
import { ROUTES, RICH_SEED } from '../../../helpers/e-routes'
import { expect, test } from '../../../helpers/test'

const WIDTHS = [360, 390, 768, 1280, 1440]
/** Known overflow (filed): path → bug id and the widths it shows at. Checked by its own expected-failure test. */
// (E-07 /practice/tutor @360: fixed — it is in the matrix again.)
const KNOWN_OVERFLOW: Record<string, { bug: string; widths: number[] }> = {}

/** Elements sticking out of the viewport horizontally (first few), and the document's scroll width. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const offenders: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right > vw + 1 || r.left < -1) {
        // Ignore content inside a horizontal scroller or a clipping ancestor (it doesn't widen the page).
        let p = el.parentElement
        let clipped = false
        while (p && p !== document.body) {
          const cs = getComputedStyle(p)
          if (cs.overflowX !== 'visible' && p.getBoundingClientRect().right <= vw + 1) {
            clipped = true
            break
          }
          p = p.parentElement
        }
        if (!clipped && getComputedStyle(el).position !== 'fixed') offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} [${Math.round(r.left)}..${Math.round(r.right)}]`)
      }
      if (offenders.length >= 5) break
    }
    return { scrollWidth: document.documentElement.scrollWidth, vw, offenders }
  })
}

async function open(page: Page, path: string) {
  await page.goto(path.replace(/^\//, ''))
  await expect(page.locator('main h1').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

test.describe('no horizontal overflow', () => {
  test.beforeEach(async ({ page, seed }) => {
    await page.clock.setFixedTime(NOW)
    await seed(RICH_SEED)
  })

  for (const width of WIDTHS) {
    test(`all routes at ${width}px`, async ({ page, isMobile, browserName }) => {
      test.skip(isMobile || browserName !== 'chromium', 'width matrix: desktop-chromium')
      test.setTimeout(90_000)
      await page.setViewportSize({ width, height: 800 })
      const bad: string[] = []
      for (const r of ROUTES) {
        if (KNOWN_OVERFLOW[r.path]?.widths.includes(width)) continue
        await open(page, r.path)
        const o = await overflow(page)
        if (o.scrollWidth > o.vw + 1 || o.offenders.length) bad.push(`${r.path}: scrollWidth ${o.scrollWidth} > ${o.vw}; ${o.offenders.join(', ')}`)
      }
      expect(bad).toEqual([])
    })
  }

  for (const [path, { bug, widths }] of Object.entries(KNOWN_OVERFLOW)) {
    for (const width of widths) {
      test(`${path} at ${width}px [${bug}]`, async ({ page, isMobile, browserName }) => {
        test.skip(isMobile || browserName !== 'chromium', 'width matrix: desktop-chromium')
        test.fail(true, `BUG ${bug}: docs/testing-bugs/E.md#${bug.toLowerCase()}`)
        await page.setViewportSize({ width, height: 800 })
        await open(page, path)
        const o = await overflow(page)
        expect(o.scrollWidth, o.offenders.join(', ')).toBeLessThanOrEqual(o.vw)
      })
    }
  }

  test('all routes at the device’s own viewport', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phones only (desktop: the width matrix)')
    test.setTimeout(90_000)
    const bad: string[] = []
    for (const r of ROUTES) {
      await open(page, r.path)
      const o = await overflow(page)
      if (o.scrollWidth > o.vw + 1 || o.offenders.length) bad.push(`${r.path}: scrollWidth ${o.scrollWidth} > ${o.vw}; ${o.offenders.join(', ')}`)
    }
    expect(bad).toEqual([])
  })
})

test.describe('bottom tab bar', () => {
  test.beforeEach(async ({ page, seed, isMobile }) => {
    await page.clock.setFixedTime(NOW)
    await seed(RICH_SEED)
    if (!isMobile) await page.setViewportSize({ width: 390, height: 700 })
  })

  test('at the end of every page the last content sits above the tab bar', async ({ page }) => {
    test.setTimeout(90_000)
    const bad: string[] = []
    for (const r of ROUTES) {
      await open(page, r.path)
      const res = await page.evaluate(async () => {
        window.scrollTo(0, document.documentElement.scrollHeight)
        await new Promise((ok) => setTimeout(ok, 350)) // tab bar slide (200 ms transition) settles
        const bar = [...document.querySelectorAll('nav[aria-label="Основные разделы"]')].find((n) => n.getBoundingClientRect().height > 0 && getComputedStyle(n).position === 'fixed')
        if (!bar) return 'no tab bar'
        const top = bar.getBoundingClientRect().top
        // The lowest visible, non-fixed element inside <main>.
        let lowest = 0
        let what = ''
        /** Bottom edge actually painted: clipped by every overflow-hiding ancestor (collapsed panels, scrollers). */
        const paintedBottom = (el: HTMLElement) => {
          const r = el.getBoundingClientRect()
          let top = r.top
          let bottom = r.bottom
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            if (getComputedStyle(p).overflowY !== 'visible') {
              const pr = p.getBoundingClientRect()
              top = Math.max(top, pr.top)
              bottom = Math.min(bottom, pr.bottom)
            }
          }
          return bottom > top ? bottom : 0
        }
        for (const el of document.querySelectorAll<HTMLElement>('main *')) {
          const rect = el.getBoundingClientRect()
          if (!rect.height || getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden], [aria-hidden="true"], [inert]')) continue
          // Content of a closed <details> keeps a layout box in some engines but is not rendered.
          const closed = el.closest('details:not([open])')
          if (closed && !el.closest('summary')) continue
          const b = paintedBottom(el)
          if (b > lowest) {
            lowest = b
            what = `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`
          }
        }
        return lowest <= top + 1 ? null : `${what} bottom ${Math.round(lowest)} > tab bar top ${Math.round(top)}`
      })
      if (res) bad.push(`${r.path}: ${res}`)
    }
    expect(bad).toEqual([])
  })

  test('the exercise «Дальше» is not covered by the tab bar', async ({ app }) => {
    await app.goto('/topic/a1-ser-estar?tab=exercises')
    await app.exercise.dontKnowButton.click()
    // trial click = actionability incl. «receives pointer events» (not obscured by the fixed bar).
    await app.exercise.nextButton.scrollIntoViewIfNeeded()
    await app.exercise.nextButton.click({ trial: true, timeout: 3000 })
    const covered = await app.exercise.nextButton.evaluate((b) => {
      const r = b.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !b.contains(hit)
    })
    expect(covered).toBe(false)
  })
})

test('the header wordmark fits at 320px', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== 'chromium', 'explicit width: desktop-chromium')
  await page.setViewportSize({ width: 320, height: 640 })
  await open(page, '/')
  const r = await page.evaluate(() => {
    const logo = [...document.querySelectorAll<HTMLAnchorElement>('a[aria-label="Learning Portuguese — главная"]')].find((a) => a.getBoundingClientRect().width > 0)!
    const text = logo.querySelector('span')!
    const search = logo.closest('div')!.querySelector('button')
    const t = text.getBoundingClientRect()
    return {
      right: t.right,
      vw: document.documentElement.clientWidth,
      clipped: text.scrollWidth > text.clientWidth + 1,
      searchLeft: search?.getBoundingClientRect().left ?? Infinity,
      lines: Math.round(t.height / parseFloat(getComputedStyle(text).lineHeight || '0')) || 1,
    }
  })
  expect(r.clipped, 'wordmark text clipped').toBe(false)
  expect(r.right, 'wordmark inside the viewport').toBeLessThanOrEqual(r.vw)
  expect(r.right, 'wordmark does not run under the search button').toBeLessThanOrEqual(r.searchLeft)
  expect((await overflow(page)).scrollWidth).toBeLessThanOrEqual(320)
})
