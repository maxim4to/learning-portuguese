/**
 * Saved-word highlighting (Settings → «Подсвечивать мои слова», `highlightSavedWords`).
 *
 * Words of the personal dictionary that are still being learned (status new / learning) are marked in readable pt
 * text — dialogues, reading, examples, theory, cheatsheets — through the CSS Custom Highlight API: Range objects
 * registered under `CSS.highlights` ('lex-learning'), painted by `::highlight(lex-learning)` in src/index.css.
 * The DOM is never touched (no per-word spans, nothing re-renders), so tap / selection hit-testing works as before.
 * Known and paused words are left unmarked: the mark means «ещё учу», and it fades as words become known.
 *
 * Inflected forms map to lemmas through the lexicon (`lex.resolve`, the same ranking as the lookup card, with the
 * previous token as context: «como» after «eu» is comer). Multi-word lemmas («casa de banho») match by tokens.
 *
 * Scope: text nodes inside <main> whose capture mode is 'tap' (`lang="pt…"`) or 'select' (markdown with pt examples;
 * only Latin tokens there). Never inside `data-lookup="off"` (an exercise before checking, a flashcard front), the
 * lookup card, or controls (buttons, links, inputs). Recomputed when the page's DOM changes (MutationObserver,
 * debounced), when the dictionary changes and when the setting is switched. Without the API: no-op.
 *
 * Matching is pure (./savedMatch.ts); `useSavedWordHighlights()` is mounted once in WordCaptureProvider.
 */
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useStoredSettings } from '../../../data/hooks.ts'
import { getLoadedLexicon, loadLexicon } from '../../../engine/lexicon/lookup.ts'
import { tokenize } from '../../../engine/lexicon/normalize.ts'
import { useWords } from '../useWords.ts'
import { buildSavedMatcher, LETTER, MARKED, savedSpans, type SavedMatcher } from './savedMatch.ts'
import { interactiveAncestor, lookupModeOf, type ElementLike, type LookupMode } from './text.ts'

export const SAVED_HIGHLIGHT = 'lex-learning'
const DEBOUNCE_MS = 150

// ─── DOM ────────────────────────────────────────────────────────────────────────────────

type HighlightCtor = new (...ranges: Range[]) => { priority: number }
interface HighlightRegistry {
  set(name: string, h: unknown): void
  delete(name: string): void
}

/** `CSS.highlights` + `Highlight` when the browser supports the Custom Highlight API, else null. */
export function highlightApi(): { registry: HighlightRegistry; Highlight: HighlightCtor } | null {
  const g = globalThis as { CSS?: { highlights?: HighlightRegistry }; Highlight?: HighlightCtor }
  return g.CSS?.highlights && typeof g.Highlight === 'function' ? { registry: g.CSS.highlights, Highlight: g.Highlight } : null
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'svg'])
const asLike = (el: Element) => el as unknown as ElementLike
const BLOCK = 'p, li, dd, dt, td, th, h1, h2, h3, h4, h5, h6, blockquote, figcaption, [lang], [data-pt-src]'

/** Ranges of marked words in `root` (see the scope rules above). */
export function collectSavedRanges(root: Element, m: SavedMatcher): Range[] {
  const ranges: Range[] = []
  const modes = new Map<Element, LookupMode>()
  const modeOf = (el: Element): LookupMode => {
    let mode = modes.get(el)
    if (mode === undefined) {
      mode = interactiveAncestor(asLike(el)) ? 'none' : lookupModeOf(asLike(el))
      modes.set(el, mode)
    }
    return mode
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let prev: string | undefined
  let prevBlock: Element | null = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue
    const parent = node.parentElement
    if (!text || !parent || SKIP_TAGS.has(parent.tagName) || !LETTER.test(text)) continue
    const mode = modeOf(parent)
    if (mode !== 'tap' && mode !== 'select') {
      prev = undefined
      continue
    }
    // Context crosses inline elements of one block (glossary spans in a paragraph), not unrelated blocks.
    const block = parent.closest(BLOCK)
    if (block !== prevBlock) prev = undefined
    prevBlock = block
    for (const s of savedSpans(text, m, { latinOnly: mode === 'select', prev })) {
      const r = document.createRange()
      r.setStart(node, s.start)
      r.setEnd(node, s.end)
      ranges.push(r)
    }
    const toks = tokenize(text)
    prev = toks.length ? toks[toks.length - 1].norm : prev
  }
  return ranges
}

const PT_AREA = '[lang^="pt"], [data-lookup="select"]'

/**
 * Marks the user's words in the current page (mounted once, in WordCaptureProvider). The lexicon chunk is loaded
 * only when the dictionary has marked words and the page shows pt text.
 */
export function useSavedWordHighlights(): void {
  const { highlightSavedWords } = useStoredSettings()
  const { words, statuses } = useWords()
  // «Мой словарь» itself lists only saved words: marking them there says nothing.
  const inDictionary = useLocation().pathname.startsWith('/words')

  useEffect(() => {
    const api = highlightApi()
    if (!api) return
    const clear = () => api.registry.delete(SAVED_HIGHLIGHT)
    const main = document.getElementById('main')
    if (!highlightSavedWords || inDictionary || !main || !words.some((w) => MARKED.has(statuses.get(w.id) ?? 'known'))) {
      clear()
      return
    }
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let loading = false

    const run = () => {
      if (!alive) return
      if (!main.querySelector(PT_AREA)) {
        clear()
        return
      }
      const lex = getLoadedLexicon()
      if (!lex) {
        if (!loading) {
          loading = true
          loadLexicon().then(run, () => {})
        }
        return
      }
      const matcher = buildSavedMatcher(lex, words, statuses)
      const ranges = matcher ? collectSavedRanges(main, matcher) : []
      if (!ranges.length) {
        clear()
        return
      }
      const h = new api.Highlight(...ranges)
      h.priority = 0 // under the looked-up word ('lookup-active')
      api.registry.set(SAVED_HIGHLIGHT, h)
    }

    run()
    const observer = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(run, DEBOUNCE_MS)
    })
    // Locks flip through `data-lookup` (exercise checked, card turned): re-run on those attributes too.
    observer.observe(main, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-lookup', 'lang', 'hidden'] })
    return () => {
      alive = false
      clearTimeout(timer)
      observer.disconnect()
      clear()
    }
  }, [highlightSavedWords, inDictionary, words, statuses])
}
