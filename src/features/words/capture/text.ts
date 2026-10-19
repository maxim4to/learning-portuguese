/**
 * Pure text helpers of word capture (no DOM, no `import.meta`, relative imports only — unit-tested in
 * scripts/words.test.ts):
 *
 * - `wordAt(text, offset)`: the word under a caret offset (Intl.Segmenter, hyphen/apostrophe joins:
 *   «levanto-me», «pequeno-almoço», «d'água» stay one word).
 * - `sentenceAt(text, start, end)`: the sentence around a word (Intl.Segmenter), ≤ 300 chars.
 * - `selectionLookupText(raw)`: a selection that can be looked up (no Cyrillic, ≤ 6 words), else null.
 * - `lookupModeOf(el)`: what a node allows by its ancestors (`lang`, `data-lookup`), and
 *   `interactiveAncestor(el)`: the control a tap must not be hijacked from.
 * - `tokenIndexAt(tokens, offset)`, `isTap(…)`.
 */
import { tokenize, type Token } from '../../../engine/lexicon/normalize.ts'

export const SENTENCE_MAX = 300
export const SELECTION_MAX_WORDS = 6
export const SELECTION_MAX_CHARS = 120
/** Tap = pointer moved < 8 px and was down < 500 ms. */
export const TAP_MAX_MOVE = 8
export const TAP_MAX_MS = 500

const CYRILLIC = /\p{Script=Cyrillic}/u
/** Joiners inside one word: ASCII and typographic hyphens, apostrophes. */
const JOINER = /^[-‐‑'’ʼ]$/u
const LETTER = /[\p{L}\p{M}]/u

export interface TextSpan {
  start: number
  end: number
  text: string
}

type SegmentLike = { segment: string; index: number; isWordLike?: boolean }

let wordSeg: Intl.Segmenter | null = null
let sentSeg: Intl.Segmenter | null = null
const words = (s: string): SegmentLike[] =>
  typeof Intl.Segmenter === 'function'
    ? [...(wordSeg ??= new Intl.Segmenter('pt-PT', { granularity: 'word' })).segment(s)]
    : fallbackWords(s)
const sentences = (s: string): SegmentLike[] =>
  typeof Intl.Segmenter === 'function'
    ? [...(sentSeg ??= new Intl.Segmenter('pt-PT', { granularity: 'sentence' })).segment(s)]
    : fallbackSentences(s)

function fallbackWords(s: string): SegmentLike[] {
  const out: SegmentLike[] = []
  const re = /[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+/gu
  for (const m of s.matchAll(re)) out.push({ segment: m[0], index: m.index, isWordLike: /[\p{L}\p{N}]/u.test(m[0]) })
  return out
}
function fallbackSentences(s: string): SegmentLike[] {
  const out: SegmentLike[] = []
  const re = /[^.!?…]+[.!?…]*\s*/gu
  for (const m of s.matchAll(re)) out.push({ segment: m[0], index: m.index })
  return out.length ? out : [{ segment: s, index: 0 }]
}

/**
 * The word at `offset` (a caret between characters: the word right of it, else the one ending there).
 * Null for spaces, punctuation and bare numbers.
 */
export function wordAt(text: string, offset: number): TextSpan | null {
  if (!text) return null
  const segs = words(text)
  let i = segs.findIndex((s) => offset >= s.index && offset < s.index + s.segment.length)
  if (i < 0 && offset === text.length) i = segs.length - 1
  if (i < 0) return null
  if (!segs[i].isWordLike && i > 0 && offset === segs[i].index && segs[i - 1].isWordLike) i-- // caret right after a word
  if (!segs[i].isWordLike) {
    // A joiner between two words («levanto|-me»): take the word to its left.
    if (JOINER.test(segs[i].segment) && segs[i - 1]?.isWordLike && segs[i + 1]?.isWordLike) i--
    else return null
  }
  let a = i
  let b = i
  while (a >= 2 && JOINER.test(segs[a - 1].segment) && segs[a - 2].isWordLike) a -= 2
  while (b + 2 < segs.length && JOINER.test(segs[b + 1].segment) && segs[b + 2].isWordLike) b += 2
  const start = segs[a].index
  const end = segs[b].index + segs[b].segment.length
  const out = text.slice(start, end)
  if (!LETTER.test(out)) return null
  return { start, end, text: out }
}

/** All words of a text (same joining rules as `wordAt`) — «Все слова фразы». */
export function wordsOf(text: string): TextSpan[] {
  const out: TextSpan[] = []
  let at = 0
  while (at < text.length) {
    const w = wordAt(text, at)
    if (w && w.start >= at) {
      out.push(w)
      at = w.end
    } else at++
  }
  return out
}

export interface SentenceSpan extends TextSpan {
  /** Word position inside `text`. */
  wordStart: number
  wordEnd: number
}

/**
 * The sentence containing [start, end) of `text`, trimmed; longer than `max` → a window around the
 * word cut at spaces, with «…» on the cut sides.
 */
export function sentenceAt(text: string, start: number, end: number, max = SENTENCE_MAX): SentenceSpan {
  const segs = sentences(text)
  let s0 = 0
  let s1 = text.length
  for (const s of segs) {
    if (start >= s.index && start < s.index + s.segment.length) {
      s0 = s.index
      s1 = s.index + s.segment.length
      break
    }
  }
  // A sentence that ends inside the word («…Sr.» abbreviations): extend to cover it.
  for (const s of segs) if (s.index > s0 && s.index < end) s1 = Math.max(s1, s.index + s.segment.length)
  while (s0 < s1 && /\s/u.test(text[s0])) s0++
  while (s1 > s0 && /\s/u.test(text[s1 - 1])) s1--
  if (s1 - s0 > max) {
    const half = Math.max(0, Math.floor((max - (end - start)) / 2))
    let a = Math.max(s0, start - half)
    let b = Math.min(s1, end + half)
    if (a > s0) {
      const sp = text.indexOf(' ', a)
      if (sp >= 0 && sp < start) a = sp + 1
    }
    if (b < s1) {
      const sp = text.lastIndexOf(' ', b)
      if (sp >= end) b = sp
    }
    const pre = a > s0 ? '…' : ''
    const post = b < s1 ? '…' : ''
    return {
      start: a,
      end: b,
      text: pre + text.slice(a, b) + post,
      wordStart: start - a + pre.length,
      wordEnd: end - a + pre.length,
    }
  }
  return { start: s0, end: s1, text: text.slice(s0, s1), wordStart: start - s0, wordEnd: end - s0 }
}

export const hasCyrillic = (s: string) => CYRILLIC.test(s)

/** Selected text that can be looked up: trimmed, single-spaced, no Cyrillic, 1–6 words, ≤ 120 chars. */
export function selectionLookupText(raw: string): string | null {
  const t = raw.replace(/\s+/gu, ' ').trim()
  if (!t || t.length > SELECTION_MAX_CHARS || hasCyrillic(t)) return null
  const n = tokenize(t).length
  if (n < 1 || n > SELECTION_MAX_WORDS) return null
  return t
}

/** Index of the token covering `offset` (or the nearest one before it); -1 for none. */
export function tokenIndexAt(tokens: readonly Token[], offset: number): number {
  let best = -1
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].start <= offset) best = i
    if (offset < tokens[i].end) break
  }
  return best
}

export function isTap(dx: number, dy: number, ms: number): boolean {
  return Math.hypot(dx, dy) < TAP_MAX_MOVE && ms < TAP_MAX_MS
}

// ─── Scope rules (work on real elements and on test stubs) ──────────────────────────────

/** The minimum of Element the rules read. */
export interface ElementLike {
  tagName: string
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  parentElement: ElementLike | null
}

/** Tags whose taps and selections are never hijacked. */
const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'LABEL', 'SUMMARY', 'OPTION'])
const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'slider', 'textbox'])

/** Closest interactive element (button, link, input, label, summary, role=button…, contenteditable) or null. */
export function interactiveAncestor(el: ElementLike | null): ElementLike | null {
  for (let n = el; n; n = n.parentElement) {
    const tag = n.tagName.toUpperCase()
    if (INTERACTIVE_TAGS.has(tag)) {
      if (tag === 'A' && !n.hasAttribute('href')) continue
      return n
    }
    const role = n.getAttribute('role')
    if (role && INTERACTIVE_ROLES.has(role)) return n
    const ce = n.getAttribute('contenteditable')
    if (ce !== null && ce !== 'false') return n
  }
  return null
}

/**
 * What a node allows, by its ancestors (closest wins):
 * - `data-lookup-ui` (the lookup card itself) → 'none';
 * - `data-lookup="off"` (exercise before checking, flashcard front, inputs) → 'off';
 * - `data-lookup="on"` re-enables inside an «off» ancestor (it does not make Russian text pt);
 * - `lang="pt…"` → 'tap' (tap, double-click and selection); another `lang` → 'none';
 * - `data-lookup="select"` (markdown theory with pt examples inside Russian) → 'select' (selection only).
 */
export type LookupMode = 'tap' | 'select' | 'off' | 'none'

export function lookupModeOf(el: ElementLike | null): LookupMode {
  let lang: 'pt' | 'other' | null = null
  let select = false
  for (let n = el; n; n = n.parentElement) {
    if (n.hasAttribute('data-lookup-ui')) return 'none'
    const dl = n.getAttribute('data-lookup')
    if (dl === 'off') return 'off'
    if (lang === null) {
      const l = n.getAttribute('lang')
      if (l) lang = /^pt\b/i.test(l) ? 'pt' : 'other'
    }
    if (dl === 'select' && lang === null) select = true
    if (dl === 'on') break
  }
  if (lang === 'pt') return 'tap'
  return select ? 'select' : 'none'
}
