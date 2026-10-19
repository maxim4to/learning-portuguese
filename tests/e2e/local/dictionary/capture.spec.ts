/**
 * Word capture: click / tap / double-click / selection / keyboard open the lookup card on pt text; controls inside
 * text are never hijacked; the card is a popover on desktop and a bottom sheet on phones (Esc, swipe, backdrop,
 * focus return). Settings → «Перевод по нажатию на слово» (lookupOnTap) switches the single tap off.
 * Surface: the «Открыть счёт в банке» dialogue (/practice/situations/banco-conta).
 */
import { expect, test } from '../../../helpers/test'
import {
  BASE_SETTINGS,
  cardTitle,
  clickWord,
  dblclickWord,
  highlightTexts,
  lookupCard,
  lookupSheet,
  searchDialog,
  selectText,
  tapWord,
  wordBox,
} from '../../../helpers/d-dict'

const DIALOGUE = '/practice/situations/banco-conta'
// «Bom dia. Queria abrir uma conta à ordem, se faz favor.»
const line1 = (page: import('@playwright/test').Page) => page.locator('#dlg-line-1')
const line2 = (page: import('@playwright/test').Page) => page.locator('#dlg-line-2')

test.describe('desktop pointer and keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop gestures (popover); phones are covered below')

  test('click on a word opens the popover with the word highlighted and announced', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    await clickWord(page, line2(page), 'documento')
    await expect(await cardTitle(page)).toHaveText(/o documento/)
    const card = lookupCard(page)
    await expect(card).toHaveAttribute('role', 'dialog')
    // Not the modal sheet: the page stays interactive.
    await expect(lookupSheet(page)).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'Выбрано слово «documento»' })).toBeAttached()
    expect(await highlightTexts(page, 'lookup-active')).toEqual(['documento'])

    // Placed next to the word, not over it.
    const w = await wordBox(line2(page), 'documento')
    const c = (await card.boundingBox())!
    expect(c.y >= w.bottom || c.y + c.height <= w.top || c.x >= w.right || c.x + c.width <= w.left).toBe(true)

    // Click outside closes; the highlight goes away.
    await page.mouse.click(5, 300)
    await expect(card).toHaveCount(0)
    expect(await highlightTexts(page, 'lookup-active')).toEqual([])
  })

  test('clicking another word switches the card; the same word keeps it open', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    await clickWord(page, line2(page), 'documento')
    await expect(await cardTitle(page)).toHaveText(/documento/)
    await clickWord(page, line2(page), 'documento')
    await expect(await cardTitle(page)).toHaveText(/documento/)
    // A word on the line above (the popover sits below «documento» and may cover the rest of its line).
    await clickWord(page, line1(page), 'ordem')
    await expect(await cardTitle(page)).toHaveText(/ordem/)
  })

  test('lookupOnTap off: a single click does nothing, double-click still opens the card', async ({ app, page, seed }) => {
    await seed({ settings: { ...BASE_SETTINGS, lookupOnTap: false } })
    await app.goto(DIALOGUE)
    await clickWord(page, line1(page), 'ordem')
    await expect(page.getByRole('status').filter({ hasText: 'Выбрано слово' })).toHaveCount(0)
    await expect(lookupCard(page)).toHaveCount(0)
    await dblclickWord(page, line1(page), 'ordem')
    await expect(await cardTitle(page)).toHaveText(/ordem/)
  })

  test('lookupOnTap switched in Settings applies live', async ({ app, page }) => {
    await app.goto('/settings')
    const sw = page.getByRole('switch', { name: 'Перевод по нажатию на слово' })
    await expect(sw).toBeChecked()
    await sw.click()
    await expect(sw).not.toBeChecked()
    // The write is debounced (400 ms): wait for it before leaving the page.
    await expect.poll(async () => (await app.storageJson<{ lookupOnTap?: boolean }>('ptpt:v1:settings'))?.lookupOnTap).toBe(false)
    await app.goto(DIALOGUE)
    await clickWord(page, line1(page), 'favor')
    await dblclickWord(page, line1(page), 'favor')
    await expect(await cardTitle(page)).toHaveText(/favor/)
  })

  test('double-click opens the card at once (no chip)', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    await dblclickWord(page, line2(page), 'identificação')
    await expect(await cardTitle(page)).toContainText('identificação')
    await expect(page.getByRole('button', { name: /Перевести и добавить в словарь/ })).toHaveCount(0)
  })

  test('selecting a phrase offers the chip; the card shows the expression', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    await selectText(line1(page), 'abrir uma conta')
    const chip = page.getByRole('button', { name: 'Перевести и добавить в словарь: abrir uma conta' })
    await expect(chip).toBeVisible()
    // The selection is not disturbed until the chip is pressed (copying still works).
    expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('abrir uma conta')
    await chip.click()
    await expect(await cardTitle(page)).toHaveText('abrir uma conta')
    await expect(lookupCard(page)).toContainText('открыть счёт')
    await expect(lookupCard(page)).toContainText('B1')
  })

  test('no chip for more than 6 words, for Cyrillic, or for a collapsed selection', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    await selectText(line1(page), 'Queria abrir uma conta à ordem, se faz')
    // A valid selection right after proves the timer ran for the previous one.
    await expect(page.getByRole('button', { name: /Перевести и добавить в словарь/ })).toHaveCount(0)
    const toggle = page.getByRole('button', { name: 'Перевод реплики 2' })
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    const ru = page.locator('#dlg-ru-1')
    await expect(ru).toBeVisible()
    await selectText(ru, 'открыть')
    await expect(page.getByRole('button', { name: /Перевести и добавить в словарь/ })).toHaveCount(0)
    await selectText(line1(page), 'conta à ordem')
    await expect(page.getByRole('button', { name: 'Перевести и добавить в словарь: conta à ordem' })).toBeVisible()
    await page.evaluate(() => document.getSelection()?.removeAllRanges())
    await expect(page.getByRole('button', { name: /Перевести и добавить в словарь/ })).toHaveCount(0)
  })

  test('keyboard: Enter on a focused line opens «Все слова фразы», picking a word, Esc returns focus to the line', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    // Warm the lexicon (first-use focus is BUG D-02, below).
    await clickWord(page, line2(page), 'documento')
    await cardTitle(page)
    await page.keyboard.press('Escape')
    await line1(page).focus()
    await page.keyboard.press('Enter')
    const card = lookupCard(page)
    await cardTitle(page)
    const words = card.getByRole('list', { name: 'Слова фразы' })
    await expect(words).toBeVisible()
    await expect(card.getByRole('button', { name: 'Все слова фразы' })).toHaveAttribute('aria-expanded', 'true')
    // Focus moved into the card (its first control other than «Закрыть»).
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-lookup-ui]'))).toBe(true)
    await words.getByRole('button', { name: 'conta', exact: true }).click()
    await expect(await cardTitle(page)).toContainText('conta')
    await page.keyboard.press('Escape')
    await expect(card).toHaveCount(0)
    await expect(line1(page)).toBeFocused()
  })

  test('keyboard: the first lookup of the session moves focus into the card', async ({ app, page }) => {
    test.fail(true, 'BUG D-02: opened from the keyboard before the lexicon chunk loaded, focus stays on the line')
    await app.goto(DIALOGUE)
    await line1(page).focus()
    await page.keyboard.press('Enter')
    await cardTitle(page)
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-lookup-ui]')), { timeout: 3000 }).toBe(true)
  })

  test('keyboard: Alt+L looks up the selection', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    await selectText(line2(page), 'comprovativo de morada')
    await page.keyboard.press('Alt+KeyL')
    await expect(await cardTitle(page)).toContainText('comprovativo de morada')
  })

  test('«/» and Ctrl/⌘+K open the word search; not while typing', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    await page.keyboard.press('/')
    const dlg = searchDialog(page)
    await expect(dlg).toBeVisible()
    await expect(dlg.getByRole('searchbox', { name: 'Слово на португальском или русском' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dlg).toBeHidden()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(dlg).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dlg).toBeHidden()

    // Typing «/» in a field types it.
    await app.goto('/words')
    await page.getByRole('button', { name: 'Добавить слово' }).first().click()
    const q = searchDialog(page).getByRole('searchbox')
    await q.fill('a/b')
    await expect(q).toHaveValue('a/b')
  })

  test('«Найти слово» button in the header opens the search', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    const btn = page.getByRole('button', { name: 'Найти слово' })
    test.skip((await btn.count()) === 0, 'no header search button on this layout')
    await btn.first().click()
    await expect(searchDialog(page)).toBeVisible()
  })

  test('controls inside or next to pt text are never hijacked', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    // Translation toggle of a line: shows the translation, no card.
    const toggle = page.getByRole('button', { name: 'Перевод реплики 3' })
    const was = await toggle.getAttribute('aria-expanded')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', was === 'true' ? 'false' : 'true')
    await expect(lookupCard(page)).toHaveCount(0)
    // pt titles inside links navigate instead of opening a card.
    await app.goto('/practice/situations')
    const link = app.main.getByRole('link', { name: /Открыть счёт|банк/i }).first()
    await link.click()
    await expect(page).toHaveURL(/banco-conta/)
    await expect(lookupCard(page)).toHaveCount(0)
    // A click on non-pt (Russian) text does nothing.
    await app.goto(DIALOGUE)
    await clickWord(page, page.getByText('Нажмите на слово — перевод'), 'перевод')
    await expect(lookupCard(page)).toHaveCount(0)
  })

  test('card closes on navigation', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    await clickWord(page, line2(page), 'documento')
    await cardTitle(page)
    await page.goBack().catch(() => {})
    await app.goto('/words')
    await expect(lookupCard(page)).toHaveCount(0)
  })
})

test.describe('phones: tap → bottom sheet', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch gestures')

  test('tap opens a modal sheet; Esc closes it', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    await tapWord(page, line2(page), 'documento')
    await expect(await cardTitle(page)).toHaveText(/documento/)
    const sheet = lookupSheet(page)
    await expect(sheet).toHaveAttribute('open', '')
    expect(await sheet.evaluate((d) => d.matches(':modal'))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
  })

  test('closing the sheet returns focus to the tapped line', async ({ app, page }) => {
    test.fail(true, 'BUG D-01: the native <dialog> restores focus to <body> after the app moved it back to the line')
    await app.goto(DIALOGUE)
    await tapWord(page, line2(page), 'documento')
    await cardTitle(page)
    await page.keyboard.press('Escape')
    await expect(lookupSheet(page)).toHaveCount(0)
    await expect(line2(page)).toBeFocused({ timeout: 2000 })
  })

  test('dragging the handle down closes the sheet; a short drag snaps back', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    await tapWord(page, line2(page), 'morada')
    await cardTitle(page)
    const handle = lookupSheet(page).locator('.lookup-sheet-panel > div').first()
    const h = (await handle.boundingBox())!
    const x = h.x + h.width / 2
    const y = h.y + h.height / 2
    // Short drag (< 80 px): snaps back, stays open.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 30, { steps: 3 })
    await page.mouse.up()
    await expect(lookupSheet(page)).toHaveAttribute('open', '')
    await expect(lookupSheet(page).locator('.lookup-sheet-panel')).not.toHaveAttribute('style', /translateY/)
    // Long drag: closes.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 160, { steps: 5 })
    await page.mouse.up()
    await expect(lookupSheet(page)).toHaveCount(0)
  })

  test('tapping the backdrop closes the sheet; the close button too', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    await tapWord(page, line2(page), 'morada')
    await cardTitle(page)
    await page.touchscreen.tap(10, 10)
    await expect(lookupSheet(page)).toHaveCount(0)
    await tapWord(page, line2(page), 'morada')
    await cardTitle(page)
    await lookupCard(page).getByRole('button', { name: 'Закрыть' }).first().tap()
    await expect(lookupSheet(page)).toHaveCount(0)
  })

  test('lookupOnTap off: a tap does nothing; the selection bar still works', async ({ app, page, seed, browserName }) => {
    test.fail(browserName === 'webkit', 'BUG D-03: a tap on the selection bar «Перевести «…»» fires no click in WebKit (pointerdown preventDefault)')
    await seed({ settings: { ...BASE_SETTINGS, lookupOnTap: false } })
    await app.goto(DIALOGUE)
    await tapWord(page, line1(page), 'ordem')
    await expect(lookupCard(page)).toHaveCount(0)
    await selectText(line1(page), 'conta à ordem')
    const bar = page.getByRole('button', { name: /Перевести «conta à ordem»/ })
    await expect(bar).toBeVisible()
    await bar.tap()
    await expect(await cardTitle(page)).toContainText('conta à ordem')
    await expect(lookupSheet(page)).toHaveAttribute('open', '')
  })

  test('the sheet sits above the tab bar and inside the viewport', async ({ app, page }) => {
    await app.goto(DIALOGUE)
    await tapWord(page, line2(page), 'documento')
    await cardTitle(page)
    const panel = lookupSheet(page).locator('.lookup-sheet-panel')
    const b = (await panel.boundingBox())!
    const vp = page.viewportSize()!
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 1)
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 1)
  })
})
