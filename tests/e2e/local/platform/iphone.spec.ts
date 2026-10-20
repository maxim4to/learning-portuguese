/**
 * iPhone 14 Pro (393×852) and 14 Pro Max (430×932), WebKit — runs in the mobile-webkit project only.
 * The device viewport is Safari's (toolbars take the rest of the screen); «installed» checks use the full screen
 * height with the safe areas simulated (--safe-top 59px for the Dynamic Island, --safe-bottom 34px for the home
 * indicator: Playwright cannot emulate env(safe-area-inset-*)).
 *
 *   - every route: no horizontal page overflow, no text / control cut by the left or right screen edge;
 *   - the tab bar cells and the primary actions are ≥ 44px;
 *   - keyboard up (viewport 336px shorter): the answer field and «Проверить» stay on screen, nothing covers them;
 *   - installed: header, tab bar and a modal dialog clear the Dynamic Island and the home indicator.
 */
import { devices, type Page } from '@playwright/test'
import { NOW } from '../../../fixtures/seed'
import { ALL_KINDS_TOPIC } from '../../../helpers/C-content'
import { RICH_SEED, ROUTES } from '../../../helpers/e-routes'
import { expect, test } from '../../../helpers/test'

const KEYBOARD = 336
const INSETS = { top: 59, bottom: 34 }
/** Full screens in CSS px (the descriptors' `viewport` is Safari's, under its toolbars). */
const SCREENS = { 'iPhone 14 Pro': { width: 393, height: 852 }, 'iPhone 14 Pro Max': { width: 430, height: 932 } } as const

/** Text leaves and controls that stick out past the left / right screen edge (outside any scroller / clipper). */
function cutAtEdges(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const out: string[] = []
    const shown = (el: Element) => {
      const cs = getComputedStyle(el)
      return cs.visibility !== 'hidden' && !el.closest('[hidden], .sr-only, [aria-hidden="true"], details:not([open]) > :not(summary)')
    }
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || (r.left >= -1 && r.right <= vw + 1) || !shown(el)) continue
      const control = el.matches('a[href], button, input, select, textarea, [role="tab"]')
      const text = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
      if (!control && !text) continue
      // Inside a horizontal scroller (tabs, chips) or a clipping box: the page itself doesn't cut it.
      let contained = false
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') {
          contained = true
          break
        }
      }
      if (!contained) out.push(`${el.tagName.toLowerCase()} «${(el.textContent ?? '').trim().slice(0, 30)}» [${Math.round(r.left)}..${Math.round(r.right)}] vw=${vw}`)
      if (out.length >= 5) break
    }
    return { overflow: document.documentElement.scrollWidth - vw, out }
  })
}

async function open(page: Page, path: string) {
  await page.goto(path.replace(/^\//, ''))
  await expect(page.locator('main h1').first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

/** Simulated safe areas of an installed web app (the app reads env() through these variables). */
async function installed(page: Page) {
  await page.addStyleTag({ content: `:root{--safe-top:${INSETS.top}px !important;--safe-bottom:${INSETS.bottom}px !important}` })
}

for (const name of ['iPhone 14 Pro', 'iPhone 14 Pro Max'] as const) {
  const device = devices[name]
  const screen = SCREENS[name]
  test.describe(name, () => {
    test.skip(({ browserName, isMobile }) => browserName !== 'webkit' || !isMobile, 'iPhone checks: mobile-webkit project')
    test.use({ viewport: device.viewport, screen, deviceScaleFactor: device.deviceScaleFactor, userAgent: device.userAgent })

    test.beforeEach(async ({ page, seed }) => {
      await page.clock.setFixedTime(NOW)
      await seed(RICH_SEED)
    })

    test('every route: no horizontal overflow, nothing cut by the screen edges', async ({ page }) => {
      test.setTimeout(120_000)
      const bad: string[] = []
      for (const r of ROUTES) {
        await open(page, r.path)
        const res = await cutAtEdges(page)
        if (res.overflow > 1 || res.out.length) bad.push(`${r.path}: overflow ${res.overflow}px; ${res.out.join(', ')}`)
      }
      expect(bad).toEqual([])
    })

    test('tab bar cells and primary actions are at least 44px', async ({ page }) => {
      await open(page, '/')
      const cells = page.getByRole('navigation', { name: 'Основные разделы' }).filter({ has: page.getByRole('list') }).getByRole('link')
      await expect(cells).toHaveCount(5)
      for (const b of await cells.all()) {
        const box = (await b.boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.width).toBeGreaterThanOrEqual(44)
      }
      const small: string[] = []
      for (const path of ['/', `/topic/${ALL_KINDS_TOPIC}?tab=exercises`, '/review', '/diagnostic', '/practice/situations/no-cafe', '/words']) {
        await open(page, path)
        const sizes = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('main .btn-primary:not(.btn-sm)')]
            .filter((el) => el.getBoundingClientRect().width > 0)
            .map((el) => ({ text: (el.textContent ?? '').trim().slice(0, 30), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })),
        )
        for (const s of sizes) if (s.h < 44 || s.w < 44) small.push(`${path}: «${s.text}» ${Math.round(s.w)}×${Math.round(s.h)}`)
      }
      const logo = (await page.getByRole('link', { name: /главная$/ }).first().boundingBox())!
      expect(logo.height, 'logo link (home)').toBeGreaterThanOrEqual(44)
      expect(small).toEqual([])
    })

    test('keyboard up: the answer field and «Проверить» stay visible and uncovered', async ({ page }) => {
      await page.setViewportSize({ width: screen.width, height: screen.height - KEYBOARD })
      await open(page, `/topic/${ALL_KINDS_TOPIC}?tab=exercises`)
      const task = page.locator('section[aria-labelledby$="-h"]').filter({ visible: true }).first()
      const field = task.getByRole('textbox').first()
      await field.tap()
      await expect(field).toBeFocused()
      await field.fill('fal')
      const check = task.getByRole('button', { name: 'Проверить' })
      await expect
        .poll(
          async () =>
            page.evaluate(
              ([f, c]) => {
                const vh = window.visualViewport?.height ?? window.innerHeight
                const inView = (el: Element) => {
                  const r = el.getBoundingClientRect()
                  return r.top >= 0 && r.bottom <= vh
                }
                const r = c!.getBoundingClientRect()
                const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
                return inView(f!) && inView(c!) && !!hit && c!.contains(hit)
              },
              [await field.elementHandle(), await check.elementHandle()] as const,
            ),
          { message: 'field and «Проверить» inside the visible area, not under the tab bar' },
        )
        .toBe(true)
    })

    test('installed (safe areas): header, tab bar and dialogs clear the Dynamic Island and the home indicator', async ({ page }) => {
      await page.setViewportSize(screen)
      await open(page, '/settings')
      await installed(page)
      const vh = screen.height
      const logo = (await page.getByRole('link', { name: /главная$/ }).first().boundingBox())!
      expect(logo.y).toBeGreaterThanOrEqual(INSETS.top)
      for (const b of await page.getByRole('navigation', { name: 'Основные разделы' }).filter({ has: page.getByRole('list') }).getByRole('link').all()) {
        const box = (await b.boundingBox())!
        expect(box.y + box.height).toBeLessThanOrEqual(vh - INSETS.bottom + 1)
      }
      await page.getByRole('button', { name: 'Сбросить…' }).click()
      const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog')).first()
      await expect(dialog).toBeVisible()
      const d = (await dialog.boundingBox())!
      expect(d.y, 'dialog top below the Dynamic Island').toBeGreaterThanOrEqual(INSETS.top)
      expect(d.y + d.height, 'dialog bottom above the home indicator').toBeLessThanOrEqual(vh - INSETS.bottom + 1)
    })
  })
}
