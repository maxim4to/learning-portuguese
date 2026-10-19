/** «Практика · Шпаргалки»: index → every sheet renders (h1, tables, TOC anchors), print, phones without page overflow. */
import { expect, test } from '../../../helpers/test'
import { cheatsheetIds } from '../../../helpers/C-content'
import { overflowingElements, pageOverflowX } from '../../../helpers/C-dom'

const IDS = cheatsheetIds()

test.describe('cheatsheets', () => {
  test('index lists every sheet; each detail page renders with a back link', async ({ app, page }) => {
    await app.goto('/practice/cheatsheets')
    const links = app.main.getByRole('list').getByRole('link')
    await expect(links).toHaveCount(IDS.length)
    for (const id of IDS) {
      await app.goto(`/practice/cheatsheets/${id}`)
      await expect(app.heading).toBeVisible()
      await expect(app.main.getByRole('table').first()).toBeVisible()
    }
    await app.main.getByRole('link', { name: 'Практика · Шпаргалки' }).first().click()
    await expect(page).toHaveURL(/\/practice\/cheatsheets$/)
  })

  test('table of contents jumps to the section (hash) and the hash survives reload', async ({ app, page, isMobile }) => {
    await app.goto('/practice/cheatsheets/conectores')
    const toc = page.getByRole('navigation', { name: 'Содержание' })
    if (isMobile && !(await toc.getByRole('link').first().isVisible())) await toc.getByText('Содержание').click()
    await toc.getByRole('link', { name: 'Причина' }).click()
    await expect(page).toHaveURL(/#cs-3$/)
    const h = page.getByRole('heading', { level: 2, name: 'Причина' })
    await expect(h).toBeInViewport()
    await page.reload()
    await expect(h).toBeInViewport()
  })

  test('«Печать» calls window.print (desktop)', async ({ app, page, isMobile }) => {
    test.skip(isMobile, 'the print button is hidden below md')
    await page.addInitScript(() => {
      ;(window as unknown as { __printed: number }).__printed = 0
      window.print = () => void (window as unknown as { __printed: number }).__printed++
    })
    await app.goto('/practice/cheatsheets/tempos-verbais')
    await page.getByRole('button', { name: 'Печать' }).click()
    expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1)
  })

  test('phones: tables become stacked records; no horizontal page scroll on any sheet', async ({ app, page }) => {
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 800 })
      for (const id of IDS) {
        await app.goto(`/practice/cheatsheets/${id}`)
        await expect(app.main.getByRole('table').first()).toBeVisible()
        expect(await pageOverflowX(page), `${id} @${width}: ${(await overflowingElements(page)).join('; ')}`).toBeLessThanOrEqual(0)
        // Every table fits the viewport (stacked on phones).
        const widest = await app.main.getByRole('table').evaluateAll((ts) => Math.max(...ts.map((t) => t.getBoundingClientRect().right)))
        expect(widest, `${id} table right edge @${width}`).toBeLessThanOrEqual(width)
      }
    }
  })
})
