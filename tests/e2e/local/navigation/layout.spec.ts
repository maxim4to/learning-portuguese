/**
 * Layout invariants: no horizontal page scroll at 360 / 390 / 768 / 1280 on every route (empty and seeded), and the
 * second-level rows (practice SubNav, topic / situation / review tabs) fade an edge only when they overflow.
 */
import { expect, test } from '../../../helpers/test'
import type { Page } from '@playwright/test'
import { card, errorEntry, progress } from '../../../fixtures/seed'
import { overflowingElements, pageOverflowX } from '../../../helpers/C-dom'

const ROUTES = [
  '/',
  '/syllabus',
  '/topic/a1-ser-estar',
  '/topic/a1-ser-estar?tab=examples',
  '/topic/a1-presente-indicativo-regulares?tab=exercises',
  '/topic/a1-ser-estar?tab=mini-test',
  '/topic/a1-ser-estar?tab=tutor',
  '/topic/nope',
  '/diagnostic',
  '/review',
  '/review?tab=all',
  '/words',
  '/settings',
  '/practice/situations',
  '/practice/situations/arrendar-casa',
  '/practice/situations/arrendar-casa?tab=phrases',
  '/practice/situations/arrendar-casa?tab=vocab',
  '/practice/situations/arrendar-casa?tab=exercises',
  '/practice/situations/arrendar-casa?tab=writing',
  '/practice/cheatsheets',
  '/practice/cheatsheets/verbos-irregulares',
  '/practice/vocab',
  '/practice/vocab/trabalho-e-escritorio',
  '/practice/reading',
  '/practice/reading/b2-opiniao-habitacao',
  '/practice/tutor',
  '/does-not-exist',
]

async function assertNoOverflow(page: Page, route: string, width: number) {
  const px = await pageOverflowX(page)
  expect(px, `${route} @${width}px overflows by ${px}px: ${(await overflowingElements(page)).join('; ')}`).toBeLessThanOrEqual(0)
}

for (const width of [360, 390, 768, 1280]) {
  test(`no horizontal page scroll on any route @${width}px (empty profile)`, async ({ app, page, isMobile }) => {
    test.skip(isMobile && width > 390, 'phone projects cover the phone widths; tablet / desktop run on desktop-chromium')
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 900 })
    for (const route of ROUTES) {
      await app.goto(route)
      await expect(app.main.locator('h1, [role="heading"]').first().or(app.main.getByText(/не найден/))).toBeVisible()
      await assertNoOverflow(page, route, width)
    }
  })
}

// Regression C-04: «Темы для занятия» cards used to widen the implicit grid track past 360px.
test('tutor hub: no horizontal page scroll @360px [C-04]', async ({ app, page }) => {
  await page.setViewportSize({ width: 360, height: 900 })
  await app.goto('/practice/tutor')
  await expect(page.getByRole('heading', { name: 'Темы для занятия' })).toBeVisible()
  await assertNoOverflow(page, '/practice/tutor', 360)
})

test('no horizontal page scroll with seeded data (dashboard, course, review) @360 and @1280', async ({ app, page, seed }) => {
  await seed({
    progress: [progress('a1-artigos-genero-numero', 9, 10), progress('a1-ser-estar', 4, 10), progress('a1-pronomes-pessoais-tratamento', 7, 10)],
    cards: [card('error:a1-ser-estar-ex-08', { exerciseId: 'a1-ser-estar-ex-08', topicId: 'a1-ser-estar' }), card('c2')],
    errors: [errorEntry('e1', { exerciseId: 'a1-ser-estar-ex-08', given: 'uma resposta extremamente comprida sem espaços-'.repeat(3) })],
  })
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of ['/', '/syllabus', '/review', '/review?tab=all', '/topic/a1-ser-estar']) {
      await app.goto(route)
      await expect(app.heading).toBeVisible()
      await assertNoOverflow(page, route, width)
    }
  }
})

/** Fade marks of a horizontal scroller vs. its real overflow. */
async function fades(scroller: import('@playwright/test').Locator) {
  return scroller.evaluate((el) => ({
    overflow: el.scrollWidth - el.clientWidth > 1,
    start: el.hasAttribute('data-fade-start'),
    end: el.hasAttribute('data-fade-end'),
    atEnd: Math.abs(el.scrollLeft) >= el.scrollWidth - el.clientWidth - 1,
  }))
}

test('second-level rows fade only where content is hidden', async ({ app, page }) => {
  const rows: [string, (p: Page) => import('@playwright/test').Locator][] = [
    ['/practice/situations', (p) => p.getByRole('navigation', { name: 'Разделы практики' }).locator('> div')],
    ['/topic/a1-ser-estar', (p) => p.getByRole('tablist', { name: 'Разделы темы' })],
    ['/practice/situations/arrendar-casa', (p) => p.getByRole('tablist', { name: 'Разделы ситуации' })],
    ['/review', (p) => p.getByRole('tablist', { name: 'Повторение' })],
  ]
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    for (const [route, find] of rows) {
      // A goto right after resizing an emulated phone was once aborted under heavy parallel load (ERR_ABORTED):
      // retry that one navigation instead of failing the layout check.
      await app.goto(route).catch(async (e: Error) => {
        if (!/ERR_ABORTED|frame was detached/.test(e.message)) throw e
        await app.goto(route)
      })
      const row = find(page)
      await expect(row).toBeVisible()
      // Fades are set on the next animation frame.
      await expect.poll(async () => {
        const f = await fades(row)
        return f.end === (f.overflow && !f.atEnd) && f.start === (f.overflow && Math.abs(await row.evaluate((e) => e.scrollLeft)) > 1)
      }, { message: `${route} @${width}: fades match overflow` }).toBe(true)
      const f = await fades(row)
      if (!f.overflow) continue
      // Scrolled to the end: only the start edge fades.
      await row.evaluate((e) => e.scrollTo({ left: e.scrollWidth }))
      await expect.poll(async () => fades(row)).toMatchObject({ start: true, end: false })
    }
  }
})
