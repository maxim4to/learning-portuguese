import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useNavigate } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { loadLexicon } from '@/engine/lexicon/lookup'
import { isLookupOpen, useWordCapture, WordSearchButton } from '@/features/words/capture'
import { Pt } from '@/features/words/Pt'
import { word, wordCard, fsrsNew, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { installRangeGeometry, pointAt, selectText, setWideScreen, stubAudioFetch, textNode } from '../../helpers/B-words-dom'

/** A real page scroll: the root's offset changes, then the event fires (an event alone no longer closes the card). */
function scrollPage(by = 120) {
  Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, value: by })
  fireEvent.scroll(document)
  delete (document.documentElement as { scrollTop?: number }).scrollTop
}


beforeAll(async () => {
  installRangeGeometry()
  await loadLexicon()
  // warm the lazy chunks the provider loads on first use
  await import('@/features/words/capture/LookupCard')
  await import('@/features/words/WordSearchDialog')
})
beforeEach(() => {
  stubAudioFetch()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.getSelection()?.removeAllRanges()
  ;(CSS as unknown as { highlights: Map<string, unknown> }).highlights.clear()
})

const SENTENCE = 'Eu como pão.'
const PAO = SENTENCE.indexOf('pão') + 1 // a caret inside «pão»

function Probe() {
  const capture = useWordCapture()
  const navigate = useNavigate()
  return (
    <div>
      <button type="button" onClick={() => capture?.openForElement(document.getElementById('line')!)}>
        probe-open-line
      </button>
      <button type="button" onClick={() => capture?.closeLookup()}>
        probe-close
      </button>
      <button type="button" onClick={() => navigate('/elsewhere')}>
        probe-nav
      </button>
    </div>
  )
}

function page(opts: { seed?: Seed; route?: string; extra?: React.ReactNode } = {}) {
  const r = renderWithProviders(
    <>
      <main id="main">
        <Pt as="p" id="line" tabIndex={0} src={{ kind: 'situation', id: 'centro-de-saude', part: 'dialogue', index: 1 }} ru="Я ем хлеб.">
          {SENTENCE}
        </Pt>
        <div data-lookup="off">
          <Pt as="p">Locked texto aqui.</Pt>
        </div>
        <Pt as="p" locked>
          Bloqueado também.
        </Pt>
        <p lang="pt-PT">
          <button type="button">Botão pão</button>
        </p>
        <p lang="ru">Русский текст</p>
        {opts.extra}
      </main>
      <WordSearchButton />
      <Probe />
    </>,
    { capture: true, seed: opts.seed, route: opts.route },
  )
  return r
}

function tap(el: HTMLElement, offset: number, pointerType = 'mouse') {
  pointAt(textNode(el), offset)
  fireEvent.pointerDown(el, { clientX: 10, clientY: 10, pointerType })
  fireEvent.pointerUp(el, { clientX: 10, clientY: 10, pointerType })
  fireEvent.click(el, { clientX: 10, clientY: 10, button: 0, detail: 1 })
}

const live = () => screen.getAllByRole('status').find((s) => s.classList.contains('sr-only'))!

describe('WordCaptureProvider · tap', () => {
  test('tap on a pt word opens the bottom sheet (narrow screen) with the card; the live region names the word', async () => {
    page()
    tap(screen.getByText(SENTENCE), PAO)
    const sheet = await screen.findByRole('dialog')
    expect(sheet.tagName).toBe('DIALOG')
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(await within(sheet).findByRole('heading', { name: /pão/ })).toBeInTheDocument()
    expect(live()).toHaveTextContent('Выбрано слово «pão»')
    expect(isLookupOpen()).toBe(true)
    expect(document.body.dataset.lookupOpen).toBe('')
    // the looked-up word is highlighted
    expect((CSS as unknown as { highlights: Map<string, unknown> }).highlights.has('lookup-active')).toBe(true)
    // the sentence context and the source come from <Pt>
    expect(await within(sheet).findByText('Я ем хлеб.')).toBeInTheDocument()
  })

  test('the sheet closes on «Закрыть» and on the dialog cancel (Esc)', async () => {
    page()
    tap(screen.getByText(SENTENCE), PAO)
    const sheet = await screen.findByRole('dialog')
    await within(sheet).findByRole('heading', { name: /pão/ })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(isLookupOpen()).toBe(false)
    expect((CSS as unknown as { highlights: Map<string, unknown> }).highlights.has('lookup-active')).toBe(false)

    tap(screen.getByText(SENTENCE), PAO)
    const again = await screen.findByRole('dialog')
    fireEvent(again, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('wide screen with a fine pointer: a non-modal popover; Esc closes it', async () => {
    setWideScreen(true)
    page()
    tap(screen.getByText(SENTENCE), PAO)
    const pop = await screen.findByRole('dialog')
    expect(pop.tagName).toBe('DIV')
    expect(pop).toHaveAttribute('aria-labelledby')
    await within(pop).findByRole('heading', { name: /pão/ })
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('a touch tap opens the sheet even on a wide screen', async () => {
    setWideScreen(true)
    page()
    tap(screen.getByText(SENTENCE), PAO, 'touch')
    expect((await screen.findByRole('dialog')).tagName).toBe('DIALOG')
  })

  test('popover: a pointerdown outside closes it, on the word itself does not', async () => {
    setWideScreen(true)
    page()
    tap(screen.getByText(SENTENCE), PAO)
    const pop = await screen.findByRole('dialog')
    await within(pop).findByRole('heading', { name: /pão/ })
    // on the word (inside the range box) → stays
    fireEvent.pointerDown(screen.getByText('Русский текст'), { clientX: 10, clientY: 10 })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // inside the card → stays
    fireEvent.pointerDown(within(pop).getByRole('heading'), { clientX: 500, clientY: 500 })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // elsewhere → closes
    fireEvent.pointerDown(screen.getByText('Русский текст'), { clientX: 500, clientY: 500 })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('popover closes on page scroll and on resize', async () => {
    setWideScreen(true)
    page()
    tap(screen.getByText(SENTENCE), PAO)
    await screen.findByRole('dialog')
    scrollPage()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    tap(screen.getByText(SENTENCE), PAO)
    await screen.findByRole('dialog')
    fireEvent(window, new Event('resize'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('tapping the same word again keeps the card (no re-open)', async () => {
    page()
    tap(screen.getByText(SENTENCE), PAO)
    await screen.findByRole('dialog')
    const before = live().textContent
    tap(screen.getByText(SENTENCE), PAO)
    expect(live().textContent).toBe(before)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  test('no lookup: locked areas (data-lookup="off", <Pt locked>), controls, non-pt text, punctuation', async () => {
    page()
    tap(screen.getByText('Locked texto aqui.'), 2)
    tap(screen.getByText('Bloqueado também.'), 2)
    tap(screen.getByRole('button', { name: 'Botão pão' }), 7)
    tap(screen.getByText('Русский текст'), 2)
    tap(screen.getByText(SENTENCE), SENTENCE.length) // after the final dot: not on a word
    await act(async () => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(live().textContent).not.toMatch(/Locked|Bloqueado|Botão|Русский/)
  })

  test('a tap that moved (drag) or a modified click does not open', async () => {
    page()
    const p = screen.getByText(SENTENCE)
    pointAt(textNode(p), PAO)
    fireEvent.pointerDown(p, { clientX: 10, clientY: 10 })
    fireEvent.click(p, { clientX: 40, clientY: 10, button: 0, detail: 1 })
    fireEvent.click(p, { clientX: 10, clientY: 10, button: 0, detail: 1, ctrlKey: true })
    fireEvent.click(p, { clientX: 10, clientY: 10, button: 0, detail: 2 })
    await act(async () => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('Settings.lookupOnTap = false: tap does nothing, double-click still works', async () => {
    page({ seed: { settings: { lookupOnTap: false } } })
    await act(async () => {})
    const p = screen.getByText(SENTENCE)
    tap(p, PAO)
    await act(async () => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    selectText(textNode(p), PAO - 1, PAO + 2)
    fireEvent.dblClick(p)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(live()).toHaveTextContent('Выбрано слово «pão»')
  })
})

describe('WordCaptureProvider · selection and keyboard', () => {
  test('double-click selects a word → the card opens for it', async () => {
    page()
    const p = screen.getByText(SENTENCE)
    selectText(textNode(p), 3, 7) // «como»
    fireEvent.dblClick(p)
    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByRole('heading', { name: /como/ })).toBeInTheDocument()
  })

  test('double-click inside a locked area does nothing', async () => {
    page()
    const p = screen.getByText('Locked texto aqui.')
    selectText(textNode(p), 0, 6)
    fireEvent.dblClick(p)
    await act(async () => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('a selection shows the «Перевести · В словарь» chip (desktop); pressing it opens the card', async () => {
    setWideScreen(true)
    page()
    const p = screen.getByText(SENTENCE)
    selectText(textNode(p), 3, 7)
    fireEvent(document, new Event('selectionchange'))
    const chip = await screen.findByRole('button', { name: 'Перевести и добавить в словарь: como' })
    expect(chip).toHaveTextContent('Перевести · В словарь')
    fireEvent.click(chip)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Перевести и добавить/ })).not.toBeInTheDocument()
  })

  test('phones: the chip is a bar «Перевести «…»»; collapsing the selection hides it', async () => {
    page()
    const p = screen.getByText(SENTENCE)
    selectText(textNode(p), 0, 7) // «Eu como» — two words
    fireEvent(document, new Event('selectionchange'))
    expect(await screen.findByRole('button', { name: 'Перевести «Eu como»' })).toBeInTheDocument()
    document.getSelection()!.removeAllRanges()
    fireEvent(document, new Event('selectionchange'))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Перевести/ })).not.toBeInTheDocument())
  })

  test('no chip for a selection in a locked area or with Cyrillic', async () => {
    page()
    selectText(textNode(screen.getByText('Locked texto aqui.')), 0, 6)
    fireEvent(document, new Event('selectionchange'))
    selectText(textNode(screen.getByText('Русский текст')), 0, 7)
    fireEvent(document, new Event('selectionchange'))
    await new Promise((r) => setTimeout(r, 400)) // the provider's selection debounce (250 ms)
    expect(screen.queryByRole('button', { name: /Перевести/ })).not.toBeInTheDocument()
  })

  test('Enter on a focused pt line opens the card with «Все слова фразы»; Esc closes and returns focus (popover)', async () => {
    setWideScreen(true)
    const { user } = page()
    const line = screen.getByText(SENTENCE)
    line.focus()
    await user.keyboard('{Enter}')
    const pop = await screen.findByRole('dialog')
    expect(await within(pop).findByRole('list', { name: 'Слова фразы' })).toBeInTheDocument()
    expect(await within(pop).findByRole('heading', { name: /^eu$/i })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(line).toHaveFocus()
  })

  test('opened from the keyboard, focus moves into the popover card (first control)', async () => {
    setWideScreen(true)
    const { user } = page()
    const line = screen.getByText(SENTENCE)
    line.focus()
    await user.keyboard('{Enter}')
    const pop = await screen.findByRole('dialog')
    await within(pop).findByRole('heading')
    await waitFor(() => expect(pop.contains(document.activeElement)).toBe(true))
    expect(document.activeElement).not.toHaveAccessibleName('Закрыть')
  })

  test('Alt+L looks up the selection', async () => {
    const { user } = page()
    selectText(textNode(screen.getByText(SENTENCE)), 8, 11)
    await user.keyboard('{Alt>}l{/Alt}')
    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByRole('heading', { name: /pão/ })).toBeInTheDocument()
  })

  test('«Все слова фразы» → picking a word re-opens the card for it', async () => {
    const { user } = page()
    tap(screen.getByText(SENTENCE), PAO)
    const sheet = await screen.findByRole('dialog')
    await user.click(await within(sheet).findByRole('button', { name: 'Все слова фразы' }))
    await user.click(within(screen.getByRole('list', { name: 'Слова фразы' })).getByRole('button', { name: 'como' }))
    expect(await within(screen.getByRole('dialog')).findByRole('heading', { name: /como/ })).toBeInTheDocument()
    expect(live()).toHaveTextContent('Выбрано слово «como»')
  })

  test('openForElement (API) opens with the words of the line; closeLookup closes', async () => {
    page()
    fireEvent.click(screen.getByRole('button', { name: 'probe-open-line' }))
    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByRole('list', { name: 'Слова фразы' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'probe-close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('navigation closes the card', async () => {
    page()
    tap(screen.getByText(SENTENCE), PAO)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'probe-nav' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('saving from the card through the provider writes the source of the line', async () => {
    const { user, store } = page()
    tap(screen.getByText(SENTENCE), PAO)
    const sheet = await screen.findByRole('dialog')
    await user.click(await within(sheet).findByRole('button', { name: /В словарь/ }))
    await within(sheet).findByText('в вашем словаре')
    expect(store.wordList()[0].sources[0]).toMatchObject({
      src: 'situation:centro-de-saude:dialogue:1',
      form: 'pão',
      sentence: SENTENCE,
      sentenceRu: 'Я ем хлеб.',
    })
  })
})

describe('WordCaptureProvider · word search', () => {
  test('«/» opens the word search; «Закрыть» closes it', async () => {
    const { user } = page()
    await user.keyboard('/')
    const dlg = await screen.findByRole('dialog', { name: 'Добавить слово' })
    expect(isLookupOpen()).toBe(true)
    await waitFor(() => expect(within(dlg).getByRole('searchbox')).toHaveFocus())
    await user.click(within(dlg).getByRole('button', { name: 'Закрыть' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Добавить слово' })).not.toBeInTheDocument())
  })

  test('Ctrl+K opens the search too; «/» typed into a field does not', async () => {
    const { user } = page({ extra: <input aria-label="поле" /> })
    await user.click(screen.getByRole('textbox', { name: 'поле' }))
    await user.keyboard('/')
    expect(screen.getByRole('textbox', { name: 'поле' })).toHaveValue('/')
    expect(screen.queryByRole('dialog', { name: 'Добавить слово' })).not.toBeInTheDocument()
    ;(document.activeElement as HTMLElement).blur()
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('dialog', { name: 'Добавить слово' })).toBeInTheDocument()
  })

  test('«/» does nothing while the lookup card is open', async () => {
    const { user } = page()
    tap(screen.getByText(SENTENCE), PAO)
    await screen.findByRole('dialog')
    fireEvent.keyDown(document.body, { key: '/' })
    await act(async () => {})
    expect(screen.queryByRole('dialog', { name: 'Добавить слово' })).not.toBeInTheDocument()
    void user
  })

  test('WordSearchButton «Найти слово» opens the search; adding a word shows the toast with undo', async () => {
    const { user, store } = page()
    const btn = screen.getByRole('button', { name: 'Найти слово' })
    expect(btn).toHaveAttribute('aria-keyshortcuts', '/ Control+K Meta+K')
    await user.click(btn)
    const dlg = await screen.findByRole('dialog', { name: 'Добавить слово' })
    await user.type(within(dlg).getByRole('searchbox'), 'chávena')
    await user.click(await within(dlg).findByRole('button', { name: 'Добавить «a chávena» в словарь' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Добавить слово' })).not.toBeInTheDocument())
    const toast = screen.getAllByRole('status').find((s) => s.getAttribute('aria-live') === 'polite' && !s.classList.contains('sr-only'))!
    expect(toast).toHaveTextContent('Добавлено в словарь: a chávena')
    expect(store.wordList().map((w) => w.id)).toEqual(['chávena#noun'])
    await user.click(within(toast).getByRole('button', { name: 'Отменить' }))
    await waitFor(() => expect(store.wordList()).toHaveLength(0))
  })

  test('WordSearchButton renders nothing outside the provider', () => {
    renderWithProviders(<WordSearchButton />)
    expect(screen.queryByRole('button', { name: 'Найти слово' })).not.toBeInTheDocument()
  })
})

describe('Saved-word highlights (CSS.highlights stub)', () => {
  const registry = () => (CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights
  const learning = (lemma: string, id: string, extra = {}) => {
    const w = word(lemma, 'x', { lexId: id, ...extra })
    return { words: [w], cards: [wordCard(w, 'recognize', { fsrs: fsrsNew() })] }
  }

  test('a word still being learned is marked in pt text (inflected forms too), not in locked text or controls', async () => {
    page({ seed: learning('comer', 'comer#verb') })
    await waitFor(() => expect(registry().get('lex-learning')).toBeDefined())
    const ranges = [...registry().get('lex-learning')!]
    expect(ranges.map((r) => r.toString())).toEqual(['como'])
  })

  test('known words, the /words pages and the setting switched off are not marked', async () => {
    const w = word('comer', 'x', { lexId: 'comer#verb', mark: 'known' })
    const first = page({ seed: { words: [w] } })
    await act(async () => {})
    expect(registry().has('lex-learning')).toBe(false)
    first.unmount()

    const second = page({ seed: learning('comer', 'comer#verb'), route: '/words' })
    await act(async () => {})
    expect(registry().has('lex-learning')).toBe(false)
    second.unmount()

    page({ seed: { ...learning('comer', 'comer#verb'), settings: { highlightSavedWords: false } } })
    await act(async () => {})
    expect(registry().has('lex-learning')).toBe(false)
  })

  test('user words (no lexicon id) match by lemma; new pt text is picked up after the DOM changes', async () => {
    const w = word('xyzzq', 'x')
    const r = page({ seed: { words: [w], cards: [wordCard(w, 'recognize', { fsrs: fsrsNew() })] } })
    await act(async () => {})
    expect(registry().has('lex-learning')).toBe(false)
    const p = document.createElement('p')
    p.setAttribute('lang', 'pt-PT')
    p.textContent = 'Um xyzzq aqui.'
    document.getElementById('main')!.appendChild(p)
    await waitFor(() => expect([...(registry().get('lex-learning') ?? [])].map((x) => x.toString())).toEqual(['xyzzq']))
    r.unmount()
    expect(registry().has('lex-learning')).toBe(false)
  })
})

describe('Source anchors', () => {
  test('a source hash scrolls to the element and flashes it', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [{}] as unknown as DOMRectList)
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    page({ route: '/situation/centro-de-saude#dlg-line-1', extra: <p id="dlg-line-1">linha</p> })
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    expect(screen.getByText('linha')).toHaveClass('anchor-flash')
  })
})
