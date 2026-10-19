/**
 * Routing: every main section, the active item on nested paths, old URLs redirect (with query and hash, replacing the
 * history entry), 404, «К содержанию», browser back / forward, deep links on reload.
 */
import { expect, test } from '../../../helpers/test'
import type { Page } from '@playwright/test'

/** Main sections: [desktop label, phone label, path, h1]. */
const SECTIONS = [
  ['Главная', 'Главная', '/', 'Сегодня'],
  ['Курс', 'Курс', '/syllabus', 'Курс'],
  ['Повторение', 'Карточки', '/review', 'Повторение'],
  ['Практика', 'Практика', '/practice/situations', 'Практика'],
  ['Настройки', 'Настройки', '/settings', 'Настройки'],
] as const

const navLabel = (isMobile: boolean, i: number) => SECTIONS[i][isMobile ? 1 : 0]
const visibleNav = (page: Page) => page.getByRole('navigation', { name: 'Основные разделы' }).filter({ visible: true })
const path = (page: Page) => new URL(page.url()).pathname.replace(/^\/learning-portuguese/, '') || '/'

test.describe('routes', () => {
  test('every main nav item opens its section and becomes the only active item', async ({ app, page, isMobile }) => {
    await app.goto('/')
    for (let i = 0; i < SECTIONS.length; i++) {
      await visibleNav(page).getByRole('link', { name: new RegExp(`^${navLabel(isMobile, i)}`) }).click()
      await expect(page).toHaveURL(new RegExp(`/learning-portuguese${SECTIONS[i][2].replace(/\//g, '\\/')}$`))
      await expect(app.heading).toHaveText(SECTIONS[i][3])
      const active = visibleNav(page).locator('[aria-current="page"]')
      await expect(active).toHaveCount(1)
      await expect(active).toContainText(navLabel(isMobile, i))
    }
  })

  test('active item on nested and old paths', async ({ app, page, isMobile }) => {
    const cases: [string, number][] = [
      ['/topic/a1-ser-estar', 1],
      ['/diagnostic', 1],
      ['/words', 2],
      ['/practice/reading/a2-a-minha-rotina', 3],
      ['/practice/tutor', 3],
      ['/situation/no-cafe', 3], // redirects, stays «Практика»
    ]
    for (const [p, i] of cases) {
      await app.goto(p)
      await expect(visibleNav(page).locator('[aria-current="page"]'), p).toContainText(navLabel(isMobile, i))
    }
    // Home is exact-only.
    await app.goto('/nope')
    await expect(visibleNav(page).locator('[aria-current="page"]')).toHaveCount(0)
  })

  const REDIRECTS: [string, string][] = [
    ['/situations', '/practice/situations'],
    ['/situations?level=A2', '/practice/situations?level=A2'],
    ['/situation/no-cafe', '/practice/situations/no-cafe'],
    ['/situation/no-cafe?tab=vocab#voc-3', '/practice/situations/no-cafe?tab=vocab#voc-3'],
    ['/library', '/practice/cheatsheets'],
    ['/library/cheatsheet/conectores#cs-3', '/practice/cheatsheets/conectores#cs-3'],
    ['/library/vocab/saude?x=1', '/practice/vocab/saude?x=1'],
    ['/library/reading/a2-a-minha-rotina#p-2', '/practice/reading/a2-a-minha-rotina#p-2'],
    ['/tutor', '/practice/tutor'],
    ['/tutor?mode=daily#tutor', '/practice/tutor?mode=daily#tutor'],
    ['/practice', '/practice/situations'],
  ]
  for (const [from, to] of REDIRECTS) {
    test(`redirect ${from} → ${to}`, async ({ app, page }) => {
      await app.goto('/syllabus')
      await app.goto(from)
      await expect.poll(() => {
        const u = new URL(page.url())
        return `${path(page)}${u.search}${u.hash}`
      }).toBe(to)
      await expect(app.heading).toBeVisible()
      // Replace, not push: Back returns to the page before the old URL.
      await page.goBack()
      await expect(page).toHaveURL(/\/syllabus$/)
    })
  }

  test('404: message, links home / course and to every section', async ({ app, page }) => {
    await app.goto('/definitely/not/here?x=1#y')
    await expect(app.heading).toHaveText('Такой страницы нет')
    const sections = page.getByRole('navigation', { name: 'Разделы', exact: true })
    await expect(sections.getByRole('link')).toHaveCount(5)
    await app.main.getByRole('link', { name: 'К курсу' }).click()
    await expect(page).toHaveURL(/\/syllabus$/)
    await page.goBack()
    await app.main.getByRole('link', { name: 'На главную' }).click()
    await expect(app.heading).toHaveText('Сегодня')
  })

  test('«К содержанию» skip link focuses <main>', async ({ app, page, isMobile }) => {
    test.skip(isMobile, 'keyboard')
    await app.goto('/syllabus')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'К содержанию' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(app.main).toBeFocused()
  })

  test('browser back / forward across sections, topic and practice pages (in-app links)', async ({ app, page }) => {
    await app.goto('/')
    const nav = visibleNav(page)
    await nav.getByRole('link', { name: /^Курс/ }).click()
    await expect(app.heading).toHaveText('Курс')
    await app.main.getByRole('link', { name: /^Ser и estar/ }).click()
    await expect(app.heading).toHaveText('Ser и estar: два глагола «быть»')
    await nav.getByRole('link', { name: /^Практика/ }).click()
    await app.main.getByRole('link', { name: /^В кафе / }).click()
    await expect(app.heading).toHaveText('В кафе')
    await nav.getByRole('link', { name: /^Практика/ }).click()
    await page.getByRole('navigation', { name: 'Разделы практики' }).getByRole('link', { name: /Чтение/ }).click()
    await app.main.getByRole('link', { name: /^A minha rotina/ }).click()
    await expect(app.heading).toHaveText('A minha rotina')

    const back = ['Чтение', 'Практика', 'В кафе', 'Практика', 'Ser и estar: два глагола «быть»', 'Курс', 'Сегодня']
    for (const h of back) {
      await page.goBack()
      if (h === 'Чтение') await expect(page).toHaveURL(/\/practice\/reading$/)
      else await expect(app.heading).toHaveText(h)
    }
    await page.goForward()
    await page.goForward()
    await expect(app.heading).toHaveText('Ser и estar: два глагола «быть»')
  })

  for (const deep of ['/topic/a1-ser-estar?tab=mini-test', '/practice/situations/no-cafe?tab=phrases', '/review?tab=all', '/syllabus?level=B1', '/practice/vocab?level=A2']) {
    test(`deep link survives reload: ${deep}`, async ({ app, page }) => {
      await app.goto(deep)
      await expect(app.heading).toBeVisible()
      const before = await app.heading.textContent()
      await page.reload()
      await expect(app.heading).toHaveText(before ?? '')
      await expect.poll(() => `${path(page)}${new URL(page.url()).search}`).toBe(deep)
    })
  }
})
