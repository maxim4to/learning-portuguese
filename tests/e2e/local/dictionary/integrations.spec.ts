/**
 * Dictionary integrations: the tutor «Мои слова» prompt (content and priority), the dashboard widget, per-theme
 * counts on /practice/vocab, the theme page «в словарь», Settings → legacy word cards cleanup.
 */
import { expect, test } from '../../../helpers/test'
import { DICT_SEED, saude } from '../../../fixtures/d-words'
import { card, fsrs } from '../../../fixtures/seed'
import { dictCard, fsrsNewAt, storedCards, storedWords, toastBox } from '../../../helpers/d-dict'

test('tutor «Мои слова»: due → learning → newest new; known / paused skipped; examples', async ({ app, page, seed }) => {
  await seed(DICT_SEED)
  await app.goto('/words')
  const tutor = page.locator('#tutor')
  await tutor.scrollIntoViewIfNeeded()
  await tutor.getByRole('button', { name: 'Показать промпт' }).click()
  const pre = tutor.getByRole('region', { name: 'Текст промпта' }).or(tutor.getByLabel('Текст промпта'))
  await expect(pre).toBeVisible()
  const prompt = (await pre.textContent())!
  const list = prompt.split('МОИ СЛОВА (pt-PT — ru')[1].split('\n\n')[0]
  const lines = list.split('\n').filter((l) => /^\d+\. /.test(l))
  expect(lines.map((l) => l.replace(/^\d+\. /, '').split(' ')[0])).toEqual(['comprar', 'xaroposo', 'a', "d'água"])
  expect(lines[0]).toContain('— покупать; пример: «Ontem comprei pão na padaria.» (Вчера я купил хлеб в булочной.)')
  expect(lines[2]).toMatch(/^3\. a saúde \(.+\) — здоровье; пример: «A saúde está em primeiro lugar.»/)
  expect(lines[1]).toContain('пример: нет — придумай сам')
  expect(prompt).not.toContain('janela')
  expect(prompt).not.toContain('o pão')
  expect(prompt).toContain('Слов: 4.')
  expect(prompt).toContain('СЛОВА:')
})

test('tutor «Мои слова»: copy puts the prompt in the clipboard (Chromium)', async ({ app, page, seed, browserName, context }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await seed(DICT_SEED)
  await app.goto('/words')
  await page.locator('#tutor').getByRole('button', { name: 'Скопировать промпт' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('МОИ СЛОВА')
})

test('dashboard widget: totals, statuses, «Учить новые», recent words', async ({ app, page, seed }) => {
  await seed(DICT_SEED)
  await app.goto('/')
  const w = page.getByRole('region', { name: 'Мой словарь' })
  await expect(w).toContainText('6')
  await expect(w).toContainText('слов')
  const statuses = w.getByRole('list', { name: 'Слова по статусам' })
  await expect(statuses).toContainText('Новое3')
  await expect(statuses).toContainText('Учу1')
  await expect(statuses).toContainText('Знаю1')
  await expect(statuses).toContainText('На паузе1')
  await expect(w).toContainText('Сегодня к повторению: 1 слово')
  await expect(w.getByRole('link', { name: 'Учить новые (2)' })).toHaveAttribute('href', /\/words\?learn=1$/)
  await expect(w.getByRole('link', { name: /Повторить слова \(1\)/ })).toHaveAttribute('href', /\/review\?deck=words$/)
  await w.getByRole('link', { name: /xaroposo/ }).click()
  await expect(page).toHaveURL(/\/words\/u%3Axaroposo$/)
})

test('dashboard widget: empty state', async ({ app, page, seed }) => {
  const { progress } = await import('../../../fixtures/seed')
  await seed({ progress: [progress('a1-ser-estar', 8)] })
  await app.goto('/')
  await expect(page.getByRole('region', { name: 'Мой словарь пока пуст' })).toBeVisible()
})

test('/practice/vocab: per-theme «в словаре N»; theme page «в словарь» updates it', async ({ app, page, seed }) => {
  await seed({ words: [saude], cards: [dictCard(saude, 'recognize', { fsrs: fsrsNewAt() })] })
  await app.goto('/practice/vocab')
  const tile = app.main.getByRole('link', { name: /Здоровье и медицина/ })
  await expect(tile).toContainText('в словаре 1')
  await tile.click()
  await expect(page.getByRole('button', { name: '«a saúde» уже в словаре' })).toBeDisabled()
  const add = page.getByRole('region', { name: 'Слова темы' }).getByRole('button', { name: /^Добавить «.+» в словарь$/ }).first()
  await add.click()
  await expect.poll(async () => Object.keys(await storedWords(page)).length).toBe(2)
  await app.goto('/practice/vocab')
  await expect(app.main.getByRole('link', { name: /Здоровье и медицина/ })).toContainText('в словаре 2')
})

test('Settings: legacy word cards (w:*, g:*) are removed; phrases and dictionary cards stay', async ({ app, page, seed, browserName }) => {
  const lex = dictCard(saude, 'recognize', { fsrs: fsrsNewAt() })
  await seed({
    words: [saude],
    cards: [
      lex,
      card('w:saude:3', { kind: 'word', fsrs: fsrs() }),
      card('g:b2-cronica-cafe:1', { kind: 'word', fsrs: fsrs() }),
      card('ph:banco-conta:0', { kind: 'phrase', fsrs: fsrs() }),
    ],
  })
  await app.goto('/settings')
  await expect(page.getByText('Удалить старые карточки слов', { exact: true })).toBeVisible()
  await expect(page.getByText(/^2 карточки слов из тем/)).toBeVisible()
  await page.getByRole('button', { name: 'Удалить…' }).click()
  const dlg = page.getByRole('alertdialog', { name: 'Удалить старые карточки слов?' })
  await expect(dlg.getByRole('button', { name: 'Отмена' })).toBeFocused()
  await dlg.getByRole('button', { name: 'Удалить 2' }).click()
  await expect(dlg).toBeHidden()
  const done = page.getByText('Старые карточки слов удалены: 2.', { exact: false })
  await expect(done).toBeVisible()
  if (browserName === 'webkit') test.fail(true, 'BUG D-09: WebKit — focus is not moved to the result line after the cleanup dialog closes')
  await expect(done).toBeFocused()
  await expect(toastBox(page)).toContainText('Удалено старых карточек слов: 2')
  expect(Object.keys(await storedCards(page)).sort()).toEqual([lex.id, 'ph:banco-conta:0'].sort())
  await page.reload()
  await expect(page.getByRole('button', { name: 'Удалить…' })).toHaveCount(0)
})
