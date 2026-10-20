/** «Практика · С агентом»: daily prompt copy (clipboard), preview, «Отметить пройденным» → history; topic list links. */
import { expect, test } from '../../../helpers/test'
import { topic as loadTopic } from '../../../helpers/C-content'

test.describe('tutor hub', () => {
  test('copy the prompt: clipboard gets exactly the previewed prompt; toast «Скопировано»', async ({ app, page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions can only be granted in Chromium')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await app.goto('/practice/tutor')
    await expect(page.getByRole('heading', { name: 'Беседа дня' })).toBeVisible()
    await page.getByRole('button', { name: 'Показать промпт' }).click()
    const pre = page.getByRole('region', { name: 'Текст промпта' }).or(page.getByLabel('Текст промпта'))
    await expect(pre).toBeVisible()
    const shown = (await pre.textContent()) ?? ''
    expect(shown.length).toBeGreaterThan(200)
    await page.getByRole('button', { name: 'Скопировать промпт' }).click()
    await expect(page.getByText('Скопировано')).toBeVisible()
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toBe(shown)
    await page.getByRole('button', { name: 'Скрыть промпт' }).click()
    await expect(pre).toBeHidden()
  })

  test('copy without clipboard access: never crashes, falls back to a selected prompt (or copies)', async ({ app, page }) => {
    await app.goto('/practice/tutor')
    await page.getByRole('button', { name: 'Скопировать промпт' }).click()
    await expect(page.getByText(/^(Скопировано|Не удалось скопировать — текст выделен, скопируйте вручную)$/)).toBeVisible()
    if (await page.getByText(/^Не удалось скопировать/).isVisible()) {
      await expect(page.getByLabel('Текст промпта')).toBeVisible()
      expect(await page.evaluate(() => window.getSelection()?.toString().length ?? 0)).toBeGreaterThan(200)
    }
  })

  test('«Отметить пройденным» with a self-assessment → status line and «История занятий»; topic links open topics', async ({ app, page }) => {
    await app.goto('/practice/tutor')
    const done = page.getByRole('region', { name: 'Отметить пройденным' })
    await done.getByRole('radio', { name: /Легко/ }).click()
    await done.getByRole('button', { name: 'Отметить пройденным' }).click()
    await expect(page.getByText(/Свободная беседа дня · 10\/10/).first()).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'История занятий' })).toBeVisible()
    const entry = app.main.getByRole('listitem').filter({ hasText: /Свободная беседа дня\s*10\/10/ })
    await expect(entry).toBeVisible()
    // The situation of the day rotates with the date: follow whichever one the entry links to.
    await entry.getByRole('link').filter({ has: page.locator('xpath=self::*[contains(@href, "/practice/situations/")]') }).first().click()
    await expect(page).toHaveURL(/\/practice\/situations\/[^/?]+\?tab=tutor$/)
    await expect(page.getByRole('tab', { name: /С агентом/ })).toHaveAttribute('aria-selected', 'true')
    await page.goBack()

    const topicLink = app.main.getByRole('list').getByRole('link', { name: /^A1 / }).first()
    const id = ((await topicLink.getAttribute('href')) ?? '').split('/topic/')[1]?.split(/[?#]/)[0] ?? ''
    await topicLink.click()
    await expect(page).toHaveURL(new RegExp(`/topic/${id}`))
    await expect(app.heading).toHaveText(loadTopic(id).title)
  })

  test('hub: «Отметить пройденным» keeps the confirmation and focus [C-03]', async ({ app, page }) => {
    await app.goto('/practice/tutor')
    const done = page.getByRole('region', { name: 'Отметить пройденным' })
    await done.getByRole('radio', { name: /Нормально/ }).click()
    await done.getByRole('button', { name: 'Отметить пройденным' }).click()
    await expect(page.getByText(/Свободная беседа дня · 7\/10/).first()).toBeVisible()
    const line = page.getByRole('status').filter({ hasText: /^Занятие засчитано: 7\/10/ })
    await expect(line).toBeVisible({ timeout: 2000 })
    await expect(line).toBeFocused()
  })
})
