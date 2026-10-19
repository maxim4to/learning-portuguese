/**
 * Phone tab bar: five items, labels fit (shrink 12 → 11 → 10 px together) at 320 / 340 / 360 / 390, the active item,
 * hides while scrolling down and comes back on scroll up / at the end; desktop shows the top bar instead.
 */
import { expect, test } from '../../../helpers/test'
import type { Page } from '@playwright/test'

const LABELS = ['Главная', 'Курс', 'Карточки', 'Практика', 'Настройки']
const tabBar = (page: Page) => page.getByRole('navigation', { name: 'Основные разделы' }).filter({ has: page.getByRole('list') })

async function labelMetrics(page: Page) {
  return tabBar(page).evaluate((nav) => {
    const ul = nav.querySelector('ul')!
    return {
      fit: ul.getAttribute('data-fit'),
      labels: [...ul.querySelectorAll<HTMLElement>('[data-fit-label]')].map((l) => {
        const cell = l.parentElement!.getBoundingClientRect()
        const box = l.getBoundingClientRect()
        return {
          text: l.textContent ?? '',
          fontPx: parseFloat(getComputedStyle(l).fontSize),
          overflow: l.scrollWidth - l.clientWidth,
          inside: box.left >= cell.left - 0.5 && box.right <= cell.right + 0.5,
        }
      }),
    }
  })
}

const barTop = (page: Page) => tabBar(page).evaluate((n) => n.getBoundingClientRect().top)

test.describe('phone tab bar', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, 'the tab bar is the phone / tablet navigation (desktop: see the last test)')
  })

  test('five items with short labels; the active one follows the route', async ({ app, page }) => {
    await app.goto('/')
    const links = tabBar(page).getByRole('link')
    await expect(links).toHaveCount(5)
    for (let i = 0; i < 5; i++) await expect(links.nth(i)).toHaveText(LABELS[i])
    await links.nth(3).click()
    await expect(page).toHaveURL(/\/practice\/situations$/)
    await expect(tabBar(page).locator('[aria-current="page"]')).toHaveText('Практика')
    await links.nth(2).click()
    await expect(tabBar(page).locator('[aria-current="page"]')).toHaveText('Карточки')
  })

  test('labels fit their cells at 320 / 340 / 360 / 390 and shrink together', async ({ app, page }) => {
    const sizes: number[] = []
    for (const width of [320, 340, 360, 390]) {
      await page.setViewportSize({ width, height: 760 })
      await app.goto('/')
      await expect.poll(async () => (await labelMetrics(page)).fit, { message: `fit computed @${width}` }).not.toBeNull()
      const m = await labelMetrics(page)
      if (m.fit === 'hidden') continue // icons only: labels stay as accessible names
      const fs = new Set(m.labels.map((l) => l.fontPx))
      expect(fs.size, `one shared label size @${width}`).toBe(1)
      sizes.push([...fs][0])
      for (const l of m.labels) {
        expect(l.overflow, `«${l.text}» clipped @${width}`).toBeLessThanOrEqual(0)
        expect(l.inside, `«${l.text}» inside its cell @${width}`).toBe(true)
      }
    }
    expect(sizes.length).toBe(4)
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes) // never larger on a narrower screen
    expect(sizes.at(-1)).toBe(12) // 390: the regular 12px label
    expect(sizes[0]).toBeGreaterThanOrEqual(10)
  })

  test('hides while scrolling down, returns on scroll up and at the end of the page', async ({ app, page }) => {
    await app.goto('/syllabus') // a long page
    const vh = page.viewportSize()!.height
    const scroll = (y: number) => page.evaluate((to) => window.scrollTo(0, to), y)
    await expect.poll(() => barTop(page)).toBeLessThan(vh)
    await scroll(300)
    await scroll(700)
    await expect.poll(() => barTop(page), { message: 'hidden after scrolling down' }).toBeGreaterThanOrEqual(vh - 1)
    await scroll(600)
    await expect.poll(() => barTop(page), { message: 'back after scrolling up' }).toBeLessThan(vh - 10)
    await scroll(900)
    await scroll(1300)
    await expect.poll(() => barTop(page)).toBeGreaterThanOrEqual(vh - 1)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect.poll(() => barTop(page), { message: 'shown at the very end' }).toBeLessThan(vh - 10)
    await scroll(0)
    await expect.poll(() => barTop(page)).toBeLessThan(vh - 10)
  })
})

test('desktop: top bar with full labels, no tab bar; tablet width: the tab bar', async ({ app, page, isMobile }) => {
  test.skip(isMobile, 'desktop viewport')
  await app.goto('/')
  const visible = page.getByRole('navigation', { name: 'Основные разделы' }).filter({ visible: true })
  await expect(visible).toHaveCount(1)
  await expect(visible.getByRole('link', { name: /^Повторение/ })).toBeVisible()
  await expect(tabBar(page)).toBeHidden()
  await page.setViewportSize({ width: 768, height: 1000 })
  await expect(tabBar(page)).toBeVisible()
  await expect(tabBar(page).getByRole('link', { name: 'Карточки' })).toBeVisible()
})
