/**
 * @a11y (workstream E): axe (WCAG 2.1 A/AA) on every route in light and dark themes, in all three projects
 * (desktop + two phones); open dialogs; keyboard-only navigation of the main nav / tab bar; visible focus;
 * prefers-reduced-motion. Known violations are listed in KNOWN with their bug ids (docs/testing-bugs/E.md).
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { NOW } from '../../../fixtures/seed'
import { ROUTES, RICH_SEED } from '../../../helpers/e-routes'
import { expect, test } from '../../../helpers/test'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function axe(page: Page, include?: string) {
  const b = new AxeBuilder({ page }).withTags(TAGS)
  if (include) b.include(include)
  const { violations } = await b.analyze()
  return violations.map((v) => `${v.id}: ${v.nodes.length} × ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
}

/** Known, filed violations: route name → bug id, when it applies (viewport width). Everything else must be clean. */
const KNOWN: Record<string, { bug: string; when: (width: number) => boolean }> = {
  // «Роль B» is shown from 420px; the accessible name «Ролевая игра: вы — B» doesn't contain it (WCAG 2.5.3).
  situation: { bug: 'E-06', when: (w) => w >= 420 },
}

/** Waits until entrance animations / transitions have finished (axe reads mid-fade colours otherwise). */
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity))
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    for (const r of ROUTES) {
      test(`${r.name} (${r.path}) has no axe violations @a11y`, async ({ app, page, seed }) => {
        const known = KNOWN[r.name]
        if (known?.when(page.viewportSize()!.width)) test.fail(true, `BUG ${known.bug}: docs/testing-bugs/E.md#${known.bug.toLowerCase()}`)
        await page.clock.setFixedTime(NOW)
        await seed({ ...RICH_SEED, theme })
        await page.emulateMedia({ reducedMotion: 'reduce' }) // entrance animations finished at once (stable colours)
        await app.goto(r.path)
        await expect(page.locator('main h1').first()).toBeVisible()
        await expect(page.getByRole('status', { name: 'Загрузка' })).toHaveCount(0)
        await settle(page)
        expect(await axe(page)).toEqual([])
      })
    }
  })
}

test.describe('dialogs and overlays', () => {
  test('reset dialog, import confirm and the word lookup card have no axe violations @a11y', async ({ app, page, seed, isMobile }) => {
    await seed(RICH_SEED)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await app.goto('/settings')
    await page.getByRole('button', { name: 'Сбросить…' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await settle(page)
    expect(await axe(page), 'reset dialog').toEqual([])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)

    await page.locator('input[type="file"]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await settle(page)
    expect(await axe(page), 'import confirm').toEqual([])

    await app.goto('/practice/situations/no-cafe')
    await app.lookup.searchButton.first().click()
    await expect(app.lookup.root).toBeVisible()
    await settle(page)
    expect(await axe(page), `lookup ${isMobile ? 'sheet' : 'popover'}`).toEqual([])
  })
})

test.describe('keyboard', () => {
  test('skip link, then every main section is reachable with Tab and opens with Enter @a11y', async ({ app, page, isMobile }) => {
    test.skip(isMobile, 'keyboard-only navigation: desktop (phones use the touch tab bar, covered by the tab-bar test below)')
    await app.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'К содержанию' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#main$/)

    await app.goto('/')
    const nav = app.nav.root
    for (const [label, path] of [
      ['Курс', '/syllabus'],
      ['Повторение', '/review'],
      ['Практика', '/practice/situations'],
      ['Настройки', '/settings'],
      ['Главная', '/'],
    ] as const) {
      const link = nav.getByRole('link', { name: label })
      for (let i = 0; i < 30 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
      await expect(link, `${label} reachable by Tab`).toBeFocused()
      await expectFocusVisible(page)
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`/learning-portuguese${path.replace(/\//g, '\\/')}$`))
      await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
    }
  })

  test('the phone tab bar is a keyboard-operable nav with aria-current @a11y', async ({ app, page, isMobile }) => {
    test.skip(!isMobile, 'tab bar: phones')
    await app.goto('/')
    const links = app.nav.root.getByRole('link')
    await expect(links).toHaveCount(5)
    await links.nth(1).focus()
    await expectFocusVisible(page)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/syllabus$/)
    await expect(links.nth(1)).toHaveAttribute('aria-current', 'page')
    for (let i = 0; i < 5; i++) {
      const box = await links.nth(i).boundingBox()
      expect(box!.height, 'touch target ≥ 44px').toBeGreaterThanOrEqual(44)
    }
  })

  test('focus is visible on every interactive element of Settings (Tab walk) @a11y', async ({ app, page, isMobile }) => {
    test.skip(isMobile, 'keyboard: desktop')
    await app.goto('/settings')
    const missing: string[] = []
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press('Tab')
      const info = await focusInfo(page)
      if (!info) continue
      if (!info.visible) missing.push(info.label)
    }
    expect(missing, 'elements without a visible focus indicator').toEqual([])
  })
})

test('prefers-reduced-motion: no running animations or long transitions @a11y', async ({ app, page, seed }) => {
  await seed(RICH_SEED)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const path of ['/', '/syllabus', '/review', '/settings']) {
    await app.goto(path)
    await expect(page.locator('main h1').first()).toBeVisible()
    const moving = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .flatMap((el) => {
          const cs = getComputedStyle(el)
          const anim = cs.animationName !== 'none' && cs.animationPlayState === 'running' && parseFloat(cs.animationDuration) > 0.01 && cs.animationIterationCount !== '1'
          const trans = cs.transitionProperty !== 'none' && Math.max(...cs.transitionDuration.split(',').map((d) => parseFloat(d))) > 0.25
          const pulse = anim && /pulse|spin|ping|bounce/.test(cs.animationName)
          return (anim && !pulse) || trans ? [`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${anim ? cs.animationName : cs.transitionDuration}`] : []
        })
        .slice(0, 10),
    )
    expect(moving, `${path}: infinite animations / long transitions under reduced motion`).toEqual([])
  }
})

async function focusInfo(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return null
    const cs = getComputedStyle(el)
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
    const ring = /(rgb|#)/.test(cs.boxShadow) && cs.boxShadow !== 'none'
    // A visible focus indicator: outline, box-shadow ring, or a focus-within/peer style on the parent (custom controls).
    const parent = el.parentElement ? getComputedStyle(el.parentElement) : null
    const parentRing = !!parent && ((parent.outlineStyle !== 'none' && parseFloat(parent.outlineWidth) > 0) || (parent.boxShadow !== 'none' && /(rgb|#)/.test(parent.boxShadow)))
    const label = `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} «${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}»`
    return { visible: outline || ring || parentRing || el.matches('.sr-only:not(:focus)'), label }
  })
}

async function expectFocusVisible(page: Page) {
  const info = await focusInfo(page)
  expect(info?.visible, `focus indicator on ${info?.label}`).toBe(true)
}
