/** «Курс»: levels, modules, topic rows with statuses and percentages, segmented progress bars, level filter. */
import { expect, test } from '../../../helpers/test'
import { DAY, NOW, progress } from '../../../fixtures/seed'
import { syllabus, topic as loadTopic } from '../../../helpers/C-content'

const S = syllabus()
const ids = (level: string) => S.levels.find((l) => l.level === level)!.modules.flatMap((m) => m.topics)
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (page: import('@playwright/test').Page, id: string) =>
  page.getByRole('main').getByRole('link', { name: new RegExp(`^${esc(loadTopic(id).title)}`) })

test.describe('syllabus', () => {
  test('empty: every level and module, all rows «Не начато», next = the first topic', async ({ app, page }) => {
    await app.goto('/syllabus')
    await expect(app.heading).toHaveText('Курс')
    for (const lvl of S.levels) {
      const section = page.getByRole('region', { name: `Уровень ${lvl.level}` })
      await expect(section.getByRole('heading', { level: 2, name: lvl.level })).toBeVisible()
      await expect(section.getByText(`0/${ids(lvl.level).length}`, { exact: true })).toBeVisible()
      for (const m of lvl.modules) {
        await expect(section.getByRole('heading', { level: 3, name: m.title })).toBeVisible()
        const same = lvl.modules.filter((x) => x.topics.length === m.topics.length).length
        await expect(section.getByText(`0/${m.topics.length} начато`)).toHaveCount(same)
      }
    }
    const total = S.levels.reduce((n, l) => n + ids(l.level).length, 0)
    await expect(page.getByRole('main').getByRole('link', { name: /Статус: Не начато/ })).toHaveCount(total)
    const first = loadTopic(ids('A1')[0])
    await expect(page.getByRole('link', { name: new RegExp(`Продолжить курс ${esc(first.title)}`) })).toBeVisible()
  })

  test('seeded: statuses, percentages, prerequisites hint, segmented bars, «Подтянуть слабую тему»', async ({ app, page, seed }) => {
    await page.clock.setFixedTime(NOW)
    const [t1, t2, t3] = ids('A1')
    await seed({ progress: [progress(t1, 10, 10), progress(t2, 7, 10), progress(t3, 3, 10, { at: NOW - 2 * DAY })] })
    await app.goto('/syllabus')
    await expect(row(page, t1)).toContainText('100%')
    await expect(row(page, t1)).toContainText('Статус: Уверенно')
    await expect(row(page, t2)).toContainText('70%')
    await expect(row(page, t2)).toContainText('Статус: Изучаю')
    await expect(row(page, t3)).toContainText('30%')
    await expect(row(page, t3)).toContainText('Статус: Слабо')

    const a1 = page.getByRole('region', { name: 'Уровень A1' })
    await expect(a1.getByRole('img', { name: `Уровень A1, тем ${ids('A1').length}; не начато ${ids('A1').length - 3}. Уверенно: 1, Изучаю: 1, Слабо: 1` })).toBeVisible()
    await expect(a1.getByText(`1/${ids('A1').length}`, { exact: true })).toBeVisible()
    // Segments: one per non-empty status, widths proportional (flush, inside one rounded track).
    const bar = a1.getByRole('img', { name: /^Уровень A1/ })
    const widths = await bar.locator('> div').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))
    expect(widths).toHaveLength(3)
    const track = (await bar.boundingBox())!.width
    for (const w of widths) expect(Math.abs(w - track / ids('A1').length)).toBeLessThan(2)

    // A not-started topic with unmet prerequisites shows «Лучше сначала: …».
    const withPrereq = ids('A1').find((id) => loadTopic(id).requires.some((r) => ![t1, t2].includes(r)) && ![t1, t2, t3].includes(id))
    if (withPrereq) await expect(row(page, withPrereq)).toContainText('Лучше сначала:')
  })

  test('«Продолжить / Подтянуть» card suggests the weak topic like the dashboard does [BUG C-02]', async ({ app, page, seed }) => {
    test.fail(true, 'BUG C-02: docs/testing-bugs/C.md#c-02 — suggestTopics(progress, 1) always drops the weak topic')
    await page.clock.setFixedTime(NOW)
    const weak = ids('A1')[2]
    await seed({ progress: [progress(weak, 3, 10)] })
    await app.goto('/')
    // Dashboard: the weak topic is the day's primary («Подтянуть: …»).
    await expect(page.getByText(`Подтянуть: ${loadTopic(weak).title}`)).toBeVisible()
    await app.nav.open('Курс')
    await expect(page.getByRole('link', { name: new RegExp(`Подтянуть слабую тему ${esc(loadTopic(weak).title)}`) })).toBeVisible({ timeout: 2000 })
  })

  test('level chips filter by ?level= (replace) and survive reload', async ({ app, page }) => {
    await app.goto('/syllabus')
    const chips = page.getByRole('group', { name: 'Уровень' })
    await chips.getByRole('button', { name: 'A2' }).click()
    await expect(page).toHaveURL(/\/syllabus\?level=A2$/)
    await expect(page.getByRole('region', { name: /^Уровень / })).toHaveCount(1)
    await expect(page.getByRole('region', { name: 'Уровень A2' })).toBeVisible()
    await page.reload()
    await expect(chips.getByRole('button', { name: 'A2' })).toHaveAttribute('aria-pressed', 'true')
    await chips.getByRole('button', { name: 'Все уровни' }).click()
    await expect(page).toHaveURL(/\/syllabus$/)
    await expect(page.getByRole('region', { name: /^Уровень / })).toHaveCount(S.levels.length)
    // Garbage level → all levels.
    await app.goto('/syllabus?level=Z9')
    await expect(page.getByRole('region', { name: /^Уровень / })).toHaveCount(S.levels.length)
  })

  test('row → topic page; «Диагностика» button', async ({ app, page }) => {
    await app.goto('/syllabus')
    const id = ids('A2')[0]
    await row(page, id).click()
    await expect(page).toHaveURL(new RegExp(`/topic/${id}$`))
    await expect(app.heading).toHaveText(loadTopic(id).title)
    await page.goBack()
    await page.getByRole('link', { name: 'Диагностика' }).click()
    await expect(page).toHaveURL(/\/diagnostic$/)
  })
})
