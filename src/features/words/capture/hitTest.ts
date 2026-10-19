/**
 * DOM side of word capture: point / selection / focused element → a `CaptureTarget` (the word, its Range,
 * sentence, source and translation context). No per-word spans: the caret position under the pointer
 * (caretPositionFromPoint, caretRangeFromPoint in Safari) is mapped onto the text of the nearest block,
 * and the word is cut out with Intl.Segmenter (./text.ts).
 */
import { tokenize } from '@/engine/lexicon/normalize'
import {
  interactiveAncestor,
  lookupModeOf,
  selectionLookupText,
  sentenceAt,
  tokenIndexAt,
  wordAt,
  type ElementLike,
  type LookupMode,
} from './text.ts'

export interface CaptureTarget {
  /** As written: «Trouxe», «levanto-me», «conta à ordem». */
  form: string
  /** The word (or selection) in the page — for the highlight; null when picked from «Все слова фразы» off-page. */
  range: Range | null
  /** Where to anchor the popover. */
  rect: DOMRect
  /** Element to return focus to (and that counts as «inside» for outside-click). */
  anchorEl: HTMLElement
  /** Sentence around the word (≤ 300) and the word position in it. */
  sentence?: string
  wordStart?: number
  wordEnd?: number
  /** Block-text offset of `sentence[0]` (maps «Все слова фразы» back onto the page). */
  sentenceOffset?: number
  /** Translation of the sentence / line (`data-pt-ru`). */
  sentenceRu?: string
  /** Encoded source (`data-pt-src`). */
  src?: string
  /** Neighbouring tokens (ranking ambiguous forms) and the sentence tokens + index (expressions). */
  prev?: string
  next?: string
  tokens?: string[]
  tokenIndex?: number
  /** Several words were selected. */
  multi: boolean
  /** The block element whose text the sentence comes from. */
  block: HTMLElement
  /** Offsets of the word in the block text. */
  blockStart: number
  blockEnd: number
}

const BLOCK_SELECTOR = 'p, li, dd, dt, td, th, h1, h2, h3, h4, h5, h6, blockquote, figcaption, caption, [data-pt-src], [lang]'

const asLike = (el: Element | null) => el as unknown as ElementLike | null

export function elementOf(node: Node | null): Element | null {
  if (!node) return null
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
}

export function modeAt(node: Node | null): LookupMode {
  return lookupModeOf(asLike(elementOf(node)))
}

export function isInteractive(node: Node | null): boolean {
  return interactiveAncestor(asLike(elementOf(node))) !== null
}

/** Text node + offset under a viewport point (null outside text). */
export function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (typeof d.caretPositionFromPoint === 'function') {
    const p = d.caretPositionFromPoint(x, y)
    if (p?.offsetNode) return { node: p.offsetNode, offset: p.offset }
  }
  if (typeof d.caretRangeFromPoint === 'function') {
    const r = d.caretRangeFromPoint(x, y)
    if (r) return { node: r.startContainer, offset: r.startOffset }
  }
  return null
}

/** The nearest block (paragraph, list item, line…) around a node — the sentence is cut from its text. */
export function blockOf(node: Node): HTMLElement | null {
  return (elementOf(node)?.closest(BLOCK_SELECTOR) as HTMLElement | null) ?? null
}

/** Offset of (node, offset) in `container.textContent`. */
function textOffset(container: Node, node: Node, offset: number): number {
  const r = document.createRange()
  r.selectNodeContents(container)
  r.setEnd(node, offset)
  return r.toString().length
}

/** Range over [start, end) of `container.textContent`. */
export function rangeFromOffsets(container: Node, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const r = document.createRange()
  let pos = 0
  let started = false
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent?.length ?? 0
    if (!started && start <= pos + len) {
      r.setStart(n, Math.max(0, start - pos))
      started = true
    }
    if (started && end <= pos + len) {
      r.setEnd(n, Math.max(0, end - pos))
      return r
    }
    pos += len
  }
  return null
}

function pointInRects(range: Range, x: number, y: number, pad = 2): boolean {
  for (const r of range.getClientRects()) {
    if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return true
  }
  return false
}

function contextOf(el: Element): { src?: string; sentenceRu?: string } {
  const srcEl = el.closest('[data-pt-src]')
  const ruEl = el.closest('[data-pt-ru]')
  return { src: srcEl?.getAttribute('data-pt-src') ?? undefined, sentenceRu: ruEl?.getAttribute('data-pt-ru') ?? undefined }
}

/** Builds the full target for [start, end) of a block's text. */
export function targetIn(
  block: HTMLElement,
  start: number,
  end: number,
  opts: { multi?: boolean; range?: Range | null; anchorEl?: HTMLElement } = {},
): CaptureTarget | null {
  const text = block.textContent ?? ''
  const form = text.slice(start, end).replace(/\s+/gu, ' ').trim()
  if (!form) return null
  const range = opts.range !== undefined ? opts.range : rangeFromOffsets(block, start, end)
  const rect = range?.getBoundingClientRect() ?? block.getBoundingClientRect()
  const s = sentenceAt(text, start, end)
  // Tokens of the sentence for expressions and context ranking.
  const plain = s.text
  const toks = tokenize(plain)
  const ti = tokenIndexAt(toks, s.wordStart)
  const multi = opts.multi ?? false
  const lastTi = multi ? tokenIndexAt(toks, Math.max(s.wordStart, s.wordEnd - 1)) : ti
  return {
    form,
    range,
    rect,
    anchorEl: opts.anchorEl ?? block,
    sentence: s.text,
    wordStart: s.wordStart,
    wordEnd: s.wordEnd,
    sentenceOffset: start - s.wordStart,
    ...contextOf(range ? (elementOf(range.startContainer) ?? block) : block),
    prev: ti > 0 ? toks[ti - 1].text : undefined,
    next: lastTi >= 0 && lastTi + 1 < toks.length ? toks[lastTi + 1].text : undefined,
    tokens: toks.map((t) => t.text),
    tokenIndex: ti >= 0 ? ti : undefined,
    multi,
    block,
    blockStart: start,
    blockEnd: end,
  }
}

/** Word under a point in tappable pt text (null: not text, not pt, locked, interactive, or not on a word). */
export function targetAtPoint(x: number, y: number): CaptureTarget | null {
  const c = caretAt(x, y)
  if (!c || c.node.nodeType !== Node.TEXT_NODE) return null
  if (modeAt(c.node) !== 'tap' || isInteractive(c.node)) return null
  const block = blockOf(c.node)
  if (!block) return null
  const off = textOffset(block, c.node, c.offset)
  const w = wordAt(block.textContent ?? '', off)
  if (!w) return null
  const range = rangeFromOffsets(block, w.start, w.end)
  // caretPositionFromPoint snaps to the nearest caret even in margins: the point must be on the word.
  if (!range || !pointInRects(range, x, y)) return null
  return targetIn(block, w.start, w.end, { range })
}

/**
 * The current selection as a lookup target: inside pt (or `data-lookup="select"`) text, not in a control,
 * one block, no Cyrillic, ≤ 6 words. A single partially selected word is widened to the whole word.
 */
export function targetFromSelection(sel: Selection | null = document.getSelection()): CaptureTarget | null {
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  const a = range.startContainer
  const b = range.endContainer
  const ma = modeAt(a)
  const mb = modeAt(b)
  if (ma === 'off' || ma === 'none' || mb === 'off' || mb === 'none') return null
  if (isInteractive(a) || isInteractive(b)) return null
  const text = selectionLookupText(range.toString())
  if (!text) return null
  const block = blockOf(range.commonAncestorContainer) ?? blockOf(a)
  if (!block || !block.contains(a) || !block.contains(b)) return null
  const full = block.textContent ?? ''
  let start = textOffset(block, a, range.startOffset)
  let end = textOffset(block, b, range.endOffset)
  // Trim spaces / punctuation the selection grabbed at its edges.
  while (start < end && /[\s.,;:!?«»"“”()…]/u.test(full[start])) start++
  while (end > start && /[\s.,;:!?«»"“”()…]/u.test(full[end - 1])) end--
  if (start >= end) return null
  const multi = /\s/u.test(full.slice(start, end))
  if (!multi) {
    const w = wordAt(full, start)
    if (w && w.start <= start && w.end >= end) {
      start = w.start
      end = w.end
    }
  }
  return targetIn(block, start, end, { multi, anchorEl: block })
}

/** Lookup for a focused pt element without a selection (keyboard): the element's whole text. */
export function targetForElement(el: HTMLElement): CaptureTarget | null {
  const mode = modeAt(el)
  if (mode !== 'tap' && mode !== 'select') return null
  const text = el.textContent ?? ''
  const first = wordAt(text, text.search(/[\p{L}]/u))
  if (!first) return null
  const t = targetIn(el, first.start, first.end, { anchorEl: el })
  if (!t) return null
  // Anchor to the whole element (the card goes beside the line, not over it).
  return { ...t, rect: el.getBoundingClientRect(), sentence: text.trim(), sentenceOffset: text.length - text.trimStart().length, wordStart: undefined, wordEnd: undefined }
}

/** Whether an element (or its ancestors) is pt text where lookups are allowed (for the lexicon warm-up). */
export function isPtArea(node: Node | null): boolean {
  const m = modeAt(node)
  return m === 'tap' || m === 'select'
}
