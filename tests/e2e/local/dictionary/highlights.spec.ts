/**
 * Saved-word highlights (CSS Custom Highlight API, 'lex-learning'): words being learned are marked in dialogues,
 * reading texts and (after the answer) exercises, including inflected forms; known words are not; Settings switch;
 * none on /words; the looked-up word gets 'lookup-active' and the CSS rule actually paints.
 */
import { expect, test } from '../../../helpers/test'
import { DAY } from '../../../fixtures/seed'
import { cardTitle, clickWord, dictCard, fsrsNewAt, fsrsReview, highlightTexts, highlightTextsIn, lexWord, pressWord } from '../../../helpers/d-dict'

const conta = lexWord('conta', 'noun', 'счёт', { gender: 'f' })
const trazer = lexWord('trazer', 'verb', 'приносить')
const ordem = lexWord('ordem', 'noun', 'порядок', { gender: 'f', mark: 'known' })
const russo = lexWord('russo', 'adj', 'русский')
const cafe = lexWord('café', 'noun', 'кофе', { gender: 'm' })
const seedAll = (settings = {}) => ({
  words: [conta, trazer, ordem, russo, cafe],
  cards: [
    dictCard(conta, 'recognize', { fsrs: fsrsNewAt() }),
    dictCard(trazer, 'recognize', { fsrs: fsrsReview(3, DAY) }),
    dictCard(russo, 'recognize', { fsrs: fsrsReview(3, DAY) }),
    dictCard(cafe, 'recognize', { fsrs: fsrsNewAt() }),
  ],
  settings,
})

test('dialogue: learning words and their forms are marked, known ones are not', async ({ app, page, seed }) => {
  await seed(seedAll())
  await app.goto('/practice/situations/banco-conta')
  await expect(page.locator('#dlg-line-1')).toBeVisible()
  await expect.poll(async () => (await highlightTexts(page, 'lex-learning')) ?? []).toEqual(expect.arrayContaining(['conta', 'Trouxe']))
  const marked = (await highlightTexts(page, 'lex-learning'))!
  expect(marked).not.toContain('ordem')
  // Only inside <main> pt text, never in controls.
  expect(marked.every((t) => /^[\p{L}'’-]+$/u.test(t))).toBe(true)
  // The ::highlight rule is in the CSS (Lightning CSS warns about it at build time).
  const hasRule = await page.evaluate(() =>
    [...document.styleSheets].some((s) => {
      try {
        return [...s.cssRules].some((r) => r.cssText.includes('::highlight(lex-learning)'))
      } catch {
        return false
      }
    }),
  )
  expect(hasRule).toBe(true)
})

test('reading text is marked too; the lookup card adds «lookup-active» above it', async ({ app, page, seed, isMobile }) => {
  await seed(seedAll())
  await app.goto('/practice/reading/b2-cronica-cafe')
  await expect.poll(async () => (await highlightTexts(page, 'lex-learning')) ?? []).toEqual(expect.arrayContaining([expect.stringMatching(/^café$/i)]))
  const para = page.locator('main p').filter({ hasText: / café[ ,.]/ }).first()
  await pressWord(page, para, ' café', { touch: isMobile })
  await cardTitle(page)
  expect(await highlightTexts(page, 'lookup-active')).toEqual(['café'])
})

test('Settings switch turns the marks off (live) and on again', async ({ app, page, seed }) => {
  await seed(seedAll())
  await app.goto('/settings')
  const sw = page.getByRole('switch', { name: 'Подсвечивать мои слова в текстах' })
  await sw.click()
  await expect(sw).not.toBeChecked()
  await expect.poll(async () => (await app.storageJson<{ highlightSavedWords?: boolean }>('ptpt:v1:settings'))?.highlightSavedWords).toBe(false)
  await app.goto('/practice/situations/banco-conta')
  await expect(page.locator('#dlg-line-1')).toBeVisible()
  // Give the (debounced, lexicon-loading) highlighter a chance: the lookup chunk loads on first use.
  await clickWord(page, page.locator('#dlg-line-1'), 'favor').catch(() => {})
  await expect.poll(async () => highlightTexts(page, 'lex-learning')).toEqual([])
})

test('no marks on /words; exercise marks only after the answer', async ({ app, page, seed }) => {
  await seed(seedAll())
  await app.goto('/words')
  await expect(page.getByRole('list', { name: 'Слова' })).toBeVisible()
  expect(await highlightTexts(page, 'lex-learning')).toEqual([])

  await app.goto('/topic/a1-ser-estar?tab=exercises')
  await expect(app.exercise.task).toContainText('russo, mas vivo em Portugal.')
  // The highlighter runs (other pt text of the page is marked) but skips the locked task.
  await expect.poll(async () => (await highlightTexts(page, 'lex-learning')) ?? []).toContain('russo')
  const task = app.exercise.panel.locator('[data-pt-src^="exercise:"]').first()
  expect(await highlightTextsIn(task, 'lex-learning')).toEqual([])
  await app.exercise.typeAnswer('sou')
  await expect(app.exercise.task.getByText('Верно!')).toBeVisible()
  await expect.poll(() => highlightTextsIn(task, 'lex-learning')).toContain('russo')
})
