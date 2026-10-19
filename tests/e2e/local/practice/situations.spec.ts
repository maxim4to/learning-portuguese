/**
 * «Практика · Ситуации»: index with level filter, detail page tabs, dialogue (play without audio, translations
 * remembered across reloads, role B), phrases, writing draft, the situation's exercise run.
 */
import { expect, test } from '../../../helpers/test'
import { situation as loadSituation, situationIds } from '../../../helpers/C-content'
import { CRunner } from '../../../helpers/C-runner'

const ID = 'no-cafe'
const S = loadSituation(ID)
const B = S.dialogue.filter((l) => l.speaker === 'B').length
const all = situationIds().map(loadSituation)

test.describe('situations', () => {
  test('index: every situation listed; level filter via ?level= (replace); back from detail', async ({ app, page }) => {
    await app.goto('/practice/situations')
    await expect(app.heading).toHaveText('Практика')
    const sub = page.getByRole('navigation', { name: 'Разделы практики' })
    await expect(sub.getByRole('link', { name: /Ситуации/ })).toHaveAttribute('aria-current', 'page')
    await expect(app.main.getByRole('link', { name: / реплик/ })).toHaveCount(all.length)

    const filter = page.getByRole('group', { name: 'Фильтр по уровню' })
    const a2 = all.filter((s) => s.level === 'A2').length
    await filter.getByRole('button', { name: new RegExp(`^A2 ${a2}$`) }).click()
    await expect(page).toHaveURL(/\/practice\/situations\?level=A2$/)
    await expect(app.main.getByRole('link', { name: / реплик/ })).toHaveCount(a2)
    await page.reload()
    await expect(app.main.getByRole('link', { name: / реплик/ })).toHaveCount(a2)

    await app.main.getByRole('link', { name: new RegExp(`^${S.title} `) }).click()
    await expect(page).toHaveURL(new RegExp(`/practice/situations/${ID}$`))
    await expect(app.heading).toHaveText(S.title)
    await app.main.getByRole('link', { name: 'Ситуации' }).click()
    await expect(page).toHaveURL(/\/practice\/situations$/)
  })

  test('dialogue: play buttons work without audio; translations toggle is remembered after reload', async ({ app, page }) => {
    await app.goto(`/practice/situations/${ID}`)
    const toolbar = page.getByRole('toolbar', { name: 'Диалог' })
    // Play a line and the whole dialogue: no crash (no pt-PT voice / mp3 in headless browsers is fine).
    await page.getByRole('button', { name: 'Прослушать реплику 1', exact: true }).click()
    await toolbar.getByRole('button', { name: /Весь диалог|Стоп/ }).click()
    await expect(toolbar.getByRole('button', { name: /Весь диалог|Стоп/ })).toBeVisible()
    if (await toolbar.getByRole('button', { name: 'Стоп' }).isVisible()) await toolbar.getByRole('button', { name: 'Стоп' }).click()
    await expect(toolbar.getByRole('button', { name: 'Весь диалог' })).toBeVisible()

    const ru0 = page.getByText(S.dialogue[0].ru, { exact: true })
    const showRu = toolbar.getByRole('button', { name: 'Показывать переводы' })
    await expect(showRu).toHaveAttribute('aria-pressed', 'true')
    await expect(ru0).toBeVisible()
    await showRu.click()
    await expect(showRu).toHaveAttribute('aria-pressed', 'false')
    await expect(ru0).toBeHidden()
    // Per-line override.
    await page.getByRole('button', { name: 'Перевод реплики 1', exact: true }).click()
    await expect(ru0).toBeVisible()
    await expect(page.getByRole('button', { name: 'Перевод реплики 1', exact: true })).toHaveAttribute('aria-expanded', 'true')

    await page.reload()
    await expect(showRu).toHaveAttribute('aria-pressed', 'false')
    await expect(ru0).toBeHidden()
    expect(await page.evaluate(() => localStorage.getItem('ptpt:v1:dialogue-show-ru'))).toBe('0')
    await showRu.click()
    await page.reload()
    await expect(showRu).toHaveAttribute('aria-pressed', 'true')
  })

  test('dialogue: role B hides my lines; «Показать» one, then all', async ({ app, page }) => {
    await app.goto(`/practice/situations/${ID}`)
    const role = page.getByRole('button', { name: 'Роль B: ролевая игра, вы — B' })
    await role.click()
    await expect(role).toHaveAttribute('aria-pressed', 'true')
    const reveal = page.getByRole('button', { name: 'Показать', exact: true })
    await expect(reveal).toHaveCount(B)
    const firstB = S.dialogue.findIndex((l) => l.speaker === 'B')
    await expect(page.getByText(S.dialogue[firstB].pt, { exact: true })).toHaveCount(0)
    await reveal.first().click()
    await expect(page.getByText(S.dialogue[firstB].pt, { exact: true })).toBeVisible()
    await expect(page.locator(`#dlg-line-${firstB}`)).toBeFocused()
    await expect(reveal).toHaveCount(B - 1)
    await page.getByRole('button', { name: `Показать все мои реплики (${B - 1})` }).click()
    await expect(reveal).toHaveCount(0)
    // Whole dialogue in role-play: stops at my turn or plays through — never crashes.
    await role.click()
    await expect(role).toHaveAttribute('aria-pressed', 'false')
  })

  test('tabs: phrases / vocab / writing draft persists / agent; deep link ?tab= on reload', async ({ app, page }) => {
    await app.goto(`/practice/situations/${ID}?tab=writing`)
    await expect(page.getByRole('tab', { name: 'Письмо' })).toHaveAttribute('aria-selected', 'true')
    const text = page.getByRole('textbox', { name: 'Ваш текст' })
    await text.fill('Bom dia, queria um café, por favor.')
    await expect(page.getByText('Черновик сохранён на этом устройстве')).toBeVisible()
    await expect(page.getByText('слов: 7')).toBeVisible()
    await page.reload()
    await expect(text).toHaveValue('Bom dia, queria um café, por favor.')

    await page.getByRole('tab', { name: /Фразы/ }).click()
    await expect(page).toHaveURL(/tab=phrases/)
    await expect(page.getByRole('tabpanel').getByText(S.phrases[0].pt).first()).toBeVisible()
    await page.getByRole('tab', { name: /Лексика/ }).click()
    await expect(page.getByRole('tabpanel').getByText(S.vocab[0].pt, { exact: true }).filter({ visible: true }).first()).toBeVisible()
    await page.getByRole('tab', { name: /С агентом/ }).click()
    await expect(page.getByRole('button', { name: 'Скопировать промпт' })).toBeVisible()
  })

  test('exercises: full run → result «Статус ситуации», next step to the next tab', async ({ app, page, isMobile }) => {
    test.setTimeout(60_000)
    const run = new CRunner(page)
    await app.goto(`/practice/situations/${ID}?tab=exercises`)
    if (!isMobile) await page.keyboard.press('Enter')
    const wrong = [S.exercises[0].id]
    const done = await run.runAll({ mode: isMobile ? 'mouse' : 'keyboard', wrong })
    expect(done.map((e) => e.id)).toEqual(S.exercises.map((e) => e.id))
    const n = S.exercises.length
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^Упражнения пройдены: ${n - 1} из ${n}`) })).toBeVisible()
    await expect(page.getByText('Статус ситуации:')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Письмо' })).toBeFocused()
    await page.getByRole('button', { name: 'Письмо' }).click()
    await expect(page.getByRole('tab', { name: 'Письмо' })).toHaveAttribute('aria-selected', 'true')
    const stored = await app.storageJson<Record<string, { status: string }>>('ptpt:v1:progress')
    expect(stored?.[ID]?.status).toBe('confident')
  })

  test('unknown situation id shows a not-found state with a way back', async ({ app, page }) => {
    await app.goto('/practice/situations/nope')
    await expect(app.main.getByText('Ситуация не найдена')).toBeVisible()
    await app.main.getByRole('link', { name: 'К ситуациям' }).click()
    await expect(page).toHaveURL(/\/practice\/situations$/)
  })
})
