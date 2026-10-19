/**
 * Lookup card content for the main kinds of forms (probe paragraphs with pt text injected into the page, so each
 * case has a known sentence): a noun, an inflected verb, clitics (enclisis, mesoclisis), contractions, expressions,
 * a capitalised homograph, an unknown word (own form + external dictionaries), long / apostrophe words.
 */
import { expect, test } from '../../../helpers/test'
import { cardTitle, injectPt, lookupCard, pressWord, selectText } from '../../../helpers/d-dict'

interface Case {
  sentence: string
  word: string
  title: RegExp | string
  has: string[]
}

const CASES: Record<string, Case> = {
  'regular noun': { sentence: 'Abri a janela da sala.', word: 'janela', title: 'a janela', has: ['существительное', 'ж · a', 'окно', 'A1'] },
  'inflected verb': { sentence: 'Ontem comprei pão.', word: 'comprei', title: /comprei.*comprar/, has: ['глагол', 'pretérito perfeito (eu) от «comprar»', 'покупать'] },
  'enclitic reflexive': { sentence: 'A senhora sentou-se à mesa.', word: 'sentou-se', title: /sentou-se.*sentar-se/, has: ['sentou-se = sentou + se', 'садиться', 'Другие разборы:'] },
  'enclitic after infinitive': { sentence: 'Tenho de fazê-lo amanhã.', word: 'fazê-lo', title: /fazê-lo.*fazer/, has: ['fazê-lo = fazê + lo', 'делать'] },
  mesoclisis: { sentence: 'Amanhã dir-lhe-ei tudo.', word: 'dir-lhe-ei', title: /dir-lhe-ei.*dizer/, has: ['(мезоклиза)', 'futuro (eu)', 'говорить, сказать'] },
  'contraction do': { sentence: 'É a casa do Rui.', word: 'do', title: /do.*de/, has: ['стяжение: do = de + o', 'предлог'] },
  'contraction na': { sentence: 'Estou na rua.', word: 'na', title: /na.*em/, has: ['стяжение: na = em + a'] },
  'contraction ao': { sentence: 'Vou ao cinema.', word: 'ao', title: /ao.*a/, has: ['стяжение: ao = a + o'] },
  'contraction pelo': { sentence: 'Passei pelo parque.', word: 'pelo', title: /pelo.*por/, has: ['стяжение: pelo = por + o'] },
  'expression by one of its words': { sentence: 'Ela, no entanto, ficou em casa.', word: 'entanto', title: 'no entanto', has: ['союз', 'однако', 'выражение со словом «entanto»'] },
  'capitalised homograph (city)': { sentence: 'Vivo no Porto há dois anos.', word: 'Porto', title: 'o Porto', has: ['Порту (город)'] },
  'lower-case noun next to it': { sentence: 'Fecha a porta, por favor.', word: 'porta', title: 'a porta', has: ['дверь'] },
}

test.describe('lookup card content', () => {
  for (const [name, c] of Object.entries(CASES)) {
    test(`${name}: «${c.word}»`, async ({ app, page, isMobile }) => {
      await app.goto('/words')
      const p = await injectPt(page, c.sentence)
      await pressWord(page, p, c.word, { touch: isMobile })
      await expect(await cardTitle(page)).toHaveText(c.title)
      const card = lookupCard(page)
      for (const t of c.has) await expect(card).toContainText(t)
      // The sentence with the word in bold.
      await expect(card.locator('b', { hasText: c.word })).toBeVisible()
      await expect(card.getByRole('button', { name: 'В словарь' })).toBeVisible()
      await expect(card.getByRole('button', { name: 'Знаю' })).toBeVisible()
    })
  }

  test('clitic with a body-part verb: «dói-me» resolves to doer (or the stored expression)', async ({ app, page, isMobile }) => {
    await app.goto('/words')
    const p = await injectPt(page, 'Hoje dói-me muito a cabeça.')
    await pressWord(page, p, 'dói-me', { touch: isMobile })
    const title = await cardTitle(page)
    await expect(title).toHaveText(/dói-me.*doer/)
    await expect(lookupCard(page)).toContainText('болеть')
    await expect(lookupCard(page)).toContainText('dói-me = dói + me')
  })

  test('ambiguous parse can be switched («Другие разборы»)', async ({ app, page, isMobile }) => {
    await app.goto('/words')
    const p = await injectPt(page, 'A senhora sentou-se à mesa.')
    await pressWord(page, p, 'sentou-se', { touch: isMobile })
    await cardTitle(page)
    const card = lookupCard(page)
    await card.getByRole('button', { name: /^sentar глагол/ }).click()
    await expect(card.getByRole('button', { name: /^sentar глагол/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(card.getByRole('heading', { level: 2 })).toHaveText(/sentar$/)
  })

  test('a selected expression of several words', async ({ app, page, isMobile }) => {
    await app.goto('/words')
    const p = await injectPt(page, 'Queria abrir uma conta no banco.')
    await selectText(p, 'abrir uma conta')
    const chip = isMobile
      ? page.getByRole('button', { name: /Перевести «abrir uma conta»/ })
      : page.getByRole('button', { name: 'Перевести и добавить в словарь: abrir uma conta' })
    await expect(chip).toBeVisible()
    test.fail(test.info().project.name === 'mobile-webkit', 'BUG D-03: the selection bar does not react to a tap in WebKit')
    if (isMobile) await chip.tap()
    else await chip.click()
    await expect(await cardTitle(page)).toHaveText('abrir uma conta')
    await expect(lookupCard(page)).toContainText('открыть счёт')
  })

  test('unknown word: «Нет в словаре приложения», external dictionaries, own translation', async ({ app, page, isMobile }) => {
    await app.goto('/words')
    const p = await injectPt(page, 'Isto é um xptozorro enorme.', { ru: 'Это огромный кстозорро.' })
    await pressWord(page, p, 'xptozorro', { touch: isMobile })
    await expect(await cardTitle(page)).toHaveText('xptozorro')
    const card = lookupCard(page)
    await expect(card).toContainText('Нет в словаре приложения')
    const info = card.getByRole('link', { name: /Infopédia PT–RU/ })
    await expect(info).toHaveAttribute('href', 'https://www.infopedia.pt/dicionarios/portugues-russo/xptozorro')
    await expect(info).toHaveAttribute('target', '_blank')
    await expect(info).toHaveAttribute('rel', /noreferrer/)
    await expect(card.getByRole('link', { name: /Priberam/ })).toHaveAttribute('href', 'https://dicionario.priberam.org/xptozorro')

    await card.getByRole('button', { name: 'В словарь' }).click()
    await expect(card.getByLabel('Слово (начальная форма)')).toHaveValue('xptozorro')
    // The sentence translation is a hint, not a prefilled value.
    await expect(card.getByText('Подсказка — перевод фразы: Это огромный кстозорро.')).toBeVisible()
    await card.getByRole('button', { name: 'Сохранить' }).click()
    await expect(card.getByRole('alert')).toHaveText('Введите перевод')
    await card.getByLabel('Перевод').fill('кстозорро')
    await card.getByRole('button', { name: 'Сохранить' }).click()
    await expect(card).toContainText('в вашем словаре: кстозорро')
    await expect(card.getByRole('link', { name: 'Открыть в словаре' })).toHaveAttribute('href', /\/words\/u%3Axptozorro$/)
    const words = await app.storageJson<Record<string, { lemma: string; ru: string; lexId?: string; sources: { sentence?: string; sentenceRu?: string }[] }>>('ptpt:v1:words')
    expect(words?.['u:xptozorro']).toMatchObject({ lemma: 'xptozorro', ru: 'кстозорро', sources: [{ sentence: 'Isto é um xptozorro enorme.', sentenceRu: 'Это огромный кстозорро.' }] })
    expect(words?.['u:xptozorro'].lexId).toBeUndefined()
  })

  test('words with an apostrophe and very long words stay one token and fit the card', async ({ app, page, isMobile }) => {
    await app.goto('/words')
    const long = 'pneumoultramicroscopicossilicovulcanoconiótico'
    const p = await injectPt(page, `Bebi um copo d'água e li ${long} no jornal.`)
    await pressWord(page, p, "d'água", { touch: isMobile })
    await expect(await cardTitle(page)).toContainText("d'água")
    await page.keyboard.press('Escape')
    await expect(lookupCard(page)).toHaveCount(0)
    test.fail(test.info().project.name === 'mobile-chromium', 'BUG D-04: a very long word widens the phone sheet past the viewport (Chromium)')
    await pressWord(page, p, long.slice(0, 12), { touch: isMobile })
    const title = await cardTitle(page)
    await expect(title).toContainText(long)
    const vw = page.viewportSize()!.width
    const box = (await lookupCard(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(vw + 1)
    // The title wraps inside the card instead of overflowing it.
    expect(await title.evaluate((h) => h.scrollWidth <= h.clientWidth + 1)).toBe(true)
  })
})
