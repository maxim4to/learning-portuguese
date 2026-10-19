/**
 * Workstream D (personal dictionary) e2e helpers: precise pointer gestures on a single word of pt text, text
 * selection, probe paragraphs with arbitrary pt text, the lookup card / sheet / search dialog, seed builders for
 * dictionary words with lexicon ids, and CSS Custom Highlight inspection.
 *
 * The app has no per-word spans (capture hit-tests the caret under the pointer), so a "click on a word" needs the
 * word's on-screen box: `wordBox()` builds a DOM Range over the n-th occurrence of the word inside an element.
 */
import { expect, type Locator, type Page } from '@playwright/test'
import { NOW, DAY, card, fsrs, word, type Seed } from '../fixtures/seed'
import type { SrsCard, WordCardMode, WordEntry, WordPos } from '../../src/data/types.ts'

export { NOW, DAY }

// ─── Seed builders ────────────────────────────────────────────────────────────

/** All four card modes (the app's default for a saved word; `seed.word()` defaults to recognize only). */
export const ALL_MODES: WordCardMode[] = ['recognize', 'produce', 'cloze', 'listen']

/** A dictionary entry linked to the app lexicon (`lemma#pos`, the id format of content/schema.ts). */
export function lexWord(lemma: string, pos: WordPos, ru: string, patch: Partial<WordEntry> = {}): WordEntry {
  const id = `${lemma}#${pos}`
  return word(lemma, ru, { id, lexId: id, pos, modes: [...ALL_MODES], ...patch })
}

/** The dictionary card of `w` in `mode` (`lex:<id>:<mode>`). */
export function dictCard(w: WordEntry, mode: WordCardMode, patch: Partial<SrsCard> = {}): SrsCard {
  const faces: Record<WordCardMode, { front: string; back: string }> = {
    recognize: { front: w.lemma, back: w.ru },
    produce: { front: w.ru, back: w.lemma },
    listen: { front: w.lemma, back: w.ru },
    cloze: { front: w.sources.at(-1)?.sentence ?? w.lemma, back: w.lemma },
  }
  return card(`lex:${w.id}:${mode}`, { kind: 'word', wordId: w.id, mode, ...faces[mode], ...patch })
}

/** FSRS of a never-reviewed card, due now. */
export const fsrsNewAt = (now = NOW) => ({ due: now - 60_000, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0 as const })

/** FSRS of a card in Review, due `dueIn` ms from `now` (negative = overdue), with `stability` days. */
export const fsrsReview = (stability: number, dueIn = -DAY, now = NOW) =>
  fsrs({ state: 2, stability, due: now + dueIn, scheduled_days: Math.max(1, Math.round(stability)), last_review: now - Math.round(stability) * DAY, reps: 3 }, now)

/** Settings used by most dictionary specs (no daily limit surprises). */
export const BASE_SETTINGS: Seed['settings'] = { newCardsPerDay: 50 }

/** Disables Web Speech (no voices) or installs a fake pt-PT voice, so listening cards are deterministic. */
export async function fakeSpeech(page: Page, { ptVoice }: { ptVoice: boolean }) {
  await page.addInitScript((withVoice: boolean) => {
    const voices = withVoice ? [{ name: 'Joana', lang: 'pt-PT', localService: true, default: true, voiceURI: 'Joana' }] : []
    const synth = {
      speaking: false,
      pending: false,
      paused: false,
      onvoiceschanged: null,
      getVoices: () => voices,
      speak: (u: { onend?: () => void }) => setTimeout(() => u.onend?.(), 10),
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth })
    // A plain class: the native one only accepts real SpeechSynthesisVoice objects.
    ;(window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = class {
      text: string
      voice: unknown = null
      lang = ''
      rate = 1
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(t: string) {
        this.text = t
      }
    }
  }, ptVoice)
}

// ─── Text geometry and gestures ───────────────────────────────────────────────

export interface Box {
  x: number
  y: number
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Viewport box of the `nth` (0-based) occurrence of `text` inside `el` (case-sensitive, may span text nodes).
 * The element is scrolled into view first.
 */
export async function wordBox(el: Locator, text: string, nth = 0): Promise<Box> {
  // Centre it: at the bottom edge a phone's fixed tab bar would take the tap.
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const box = await el.evaluate(
    (root, [needle, n]) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      const nodes: Text[] = []
      let full = ''
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        nodes.push(t as Text)
        full += t.nodeValue ?? ''
      }
      let at = -1
      for (let i = 0; i <= (n as number); i++) {
        at = full.indexOf(needle as string, at + 1)
        if (at < 0) return null
      }
      const end = at + (needle as string).length
      const r = document.createRange()
      let pos = 0
      let started = false
      for (const t of nodes) {
        const len = t.nodeValue?.length ?? 0
        if (!started && at < pos + len) {
          r.setStart(t, at - pos)
          started = true
        }
        if (started && end <= pos + len) {
          r.setEnd(t, end - pos)
          break
        }
        pos += len
      }
      const b = r.getClientRects()[0]
      if (!b) return null
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, left: b.left, right: b.right, top: b.top, bottom: b.bottom }
    },
    [text, nth] as const,
  )
  if (!box) throw new Error(`«${text}» (#${nth}) not found in the element`)
  return box
}

/** The word's box once it stopped moving (reveal animations, smooth scrolls). */
export async function stableWordBox(el: Locator, text: string, nth = 0): Promise<Box> {
  let last = await wordBox(el, text, nth)
  await expect
    .poll(async () => {
      const b = await wordBox(el, text, nth)
      const same = Math.abs(b.x - last.x) < 0.5 && Math.abs(b.y - last.y) < 0.5
      last = b
      return same
    }, { intervals: [50, 100, 100, 200] })
    .toBe(true)
  return last
}

/** Mouse click on a word (desktop: popover, or the sheet on a narrow / coarse viewport). */
export async function clickWord(page: Page, el: Locator, text: string, nth = 0) {
  const b = await stableWordBox(el, text, nth)
  await page.mouse.click(b.x, b.y)
}

/** Native double click on a word (selects it; capture opens the card at once). */
export async function dblclickWord(page: Page, el: Locator, text: string, nth = 0) {
  const b = await stableWordBox(el, text, nth)
  await page.mouse.dblclick(b.x, b.y)
}

/** Touch tap on a word (mobile projects: pointerType 'touch' → bottom sheet). */
export async function tapWord(page: Page, el: Locator, text: string, nth = 0) {
  const b = await stableWordBox(el, text, nth)
  await page.touchscreen.tap(b.x, b.y)
}

/** Tap on touch devices, click otherwise. */
export async function pressWord(page: Page, el: Locator, text: string, { touch }: { touch: boolean }, nth = 0) {
  if (touch) await tapWord(page, el, text, nth)
  else await clickWord(page, el, text, nth)
}

/** Selects `text` inside `el` programmatically (fires selectionchange like a mouse/keyboard selection). */
export async function selectText(el: Locator, text: string, nth = 0) {
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const ok = await el.evaluate(
    (root, [needle, n]) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      const nodes: Text[] = []
      let full = ''
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        nodes.push(t as Text)
        full += t.nodeValue ?? ''
      }
      let at = -1
      for (let i = 0; i <= (n as number); i++) {
        at = full.indexOf(needle as string, at + 1)
        if (at < 0) return false
      }
      const end = at + (needle as string).length
      const r = document.createRange()
      let pos = 0
      let started = false
      for (const t of nodes) {
        const len = t.nodeValue?.length ?? 0
        if (!started && at < pos + len) {
          r.setStart(t, at - pos)
          started = true
        }
        if (started && end <= pos + len) {
          r.setEnd(t, end - pos)
          break
        }
        pos += len
      }
      const sel = document.getSelection()!
      sel.removeAllRanges()
      sel.addRange(r)
      return true
    },
    [text, nth] as const,
  )
  if (!ok) throw new Error(`«${text}» not found for selection`)
}

/**
 * Adds a probe block of pt text to <main> (outside React's own nodes, so re-renders keep it): the capture
 * provider hit-tests any `lang="pt…"` text on the page. `src`/`ru` become `data-pt-src` / `data-pt-ru`.
 */
export async function injectPt(page: Page, text: string, opts: { src?: string; ru?: string; id?: string } = {}): Promise<Locator> {
  const id = opts.id ?? 'd-probe'
  // Lazy routes swap <main>'s content once loaded: inject after the page heading is there.
  await expect(page.locator('main h1').first()).toBeVisible()
  await page.evaluate(
    ({ text, src, ru, id }) => {
      document.getElementById(id)?.remove()
      const host = document.getElementById('main') ?? document.querySelector('main') ?? document.body
      const p = document.createElement('p')
      p.id = id
      p.lang = 'pt-PT'
      p.style.fontSize = '22px'
      p.style.lineHeight = '2'
      p.style.padding = '8px 16px'
      p.style.maxWidth = '100%'
      if (src) p.dataset.ptSrc = src
      if (ru) p.dataset.ptRu = ru
      p.textContent = text
      host.prepend(p)
    },
    { text, src: opts.src, ru: opts.ru, id },
  )
  return page.locator(`#${id}`)
}

// ─── Lookup UI ────────────────────────────────────────────────────────────────

/** The open lookup card: popover (div role=dialog) or the phone sheet (<dialog>). */
export function lookupCard(page: Page): Locator {
  return page.locator('[role="dialog"][data-lookup-ui], dialog.lookup-sheet[open]').last()
}

/** The phone sheet (<dialog class="lookup-sheet">). */
export function lookupSheet(page: Page): Locator {
  return page.locator('dialog.lookup-sheet')
}

/** Card title (h2 — «форма → лемма»), waits until the lexicon replaced the skeleton. */
export async function cardTitle(page: Page): Promise<Locator> {
  const c = lookupCard(page)
  await expect(c).toBeVisible()
  await expect(c.getByRole('status', { name: 'Загружаю словарь' })).toHaveCount(0, { timeout: 15_000 })
  return c.getByRole('heading', { level: 2 }).first()
}

/** The word search dialog («/», Ctrl/⌘+K, «Найти слово», «Добавить слово»). */
export function searchDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Добавить слово' })
}

/** The visible toast (one at a time; polite status region with «Закрыть уведомление»). */
export function toastBox(page: Page): Locator {
  return page.getByRole('status').filter({ has: page.getByRole('button', { name: 'Закрыть уведомление' }) })
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export async function storedWords(page: Page): Promise<Record<string, WordEntry>> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ptpt:v1:words') ?? '{}'))
}

export async function storedCards(page: Page): Promise<Record<string, SrsCard>> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ptpt:v1:cards') ?? '{}'))
}

export async function storedSettings(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ptpt:v1:settings') ?? '{}'))
}

// ─── CSS Custom Highlights ────────────────────────────────────────────────────

/** Texts of the ranges registered under `CSS.highlights.get(name)` (null: API missing; [] when not registered). */
export async function highlightTexts(page: Page, name: string): Promise<string[] | null> {
  return page.evaluate((n) => {
    const reg = (globalThis as unknown as { CSS?: { highlights?: Map<string, Set<Range>> } }).CSS?.highlights
    if (!reg) return null
    const h = reg.get(n)
    return h ? [...h].map((r) => r.toString()) : []
  }, name)
}

/** Like `highlightTexts`, limited to ranges inside `el`. */
export async function highlightTextsIn(el: Locator, name: string): Promise<string[]> {
  return el.evaluate((root, n) => {
    const h = (globalThis as unknown as { CSS?: { highlights?: Map<string, Set<Range>> } }).CSS?.highlights?.get(n)
    return h ? [...h].filter((r) => root.contains(r.commonAncestorContainer)).map((r) => r.toString()) : []
  }, name)
}
