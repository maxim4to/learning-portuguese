/**
 * Workstream B · words: jsdom helpers for the personal dictionary / word capture tests.
 *
 *   installRangeGeometry()   Range#getClientRects / getBoundingClientRect (jsdom has none) → a fixed box
 *   stubAudioFetch()         fetch → 404 (audio HEAD probes of useCanSpeak / listenText never leave the test)
 *   setWideScreen(bool)      matchMedia('(min-width: 640px) and (pointer: fine)') → popover vs. sheet
 *   ptBlock(text, attrs)     <p lang="pt-PT" …>text</p> appended to a <main id="main"> in document.body
 *   targetFor(block, word)   CaptureTarget for the first occurrence of `word` in the block (hitTest.targetIn)
 *   pointAt(node, offset)    caretPositionFromPoint → that text position (tap hit-testing)
 *   selectText(node, a, b)   document selection over [a, b) of a text node
 */
import { vi } from 'vitest'
import { targetIn, type CaptureTarget } from '@/features/words/capture/hitTest'

export const BOX = { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0 }

function rect(): DOMRect {
  return { ...BOX, toJSON: () => BOX } as DOMRect
}

export function installRangeGeometry(): void {
  const proto = Range.prototype as unknown as Record<string, unknown>
  if (typeof proto.getClientRects !== 'function') {
    proto.getClientRects = function () {
      const list = [rect()] as unknown as DOMRectList
      return list
    }
  }
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = rect
}

export function stubAudioFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 })),
  )
}

export function setWideScreen(wide: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: wide && query.includes('min-width: 640px'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

/** A <main id="main"> with one pt paragraph (outside React: the capture provider listens on the document). */
export function ptBlock(text: string, attrs: Record<string, string> = {}, tag = 'p'): HTMLElement {
  let main = document.getElementById('main')
  if (!main) {
    main = document.createElement('main')
    main.id = 'main'
    document.body.appendChild(main)
  }
  const el = document.createElement(tag)
  el.setAttribute('lang', 'pt-PT')
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.textContent = text
  main.appendChild(el)
  return el
}

export function removeMain(): void {
  document.getElementById('main')?.remove()
}

export function targetFor(block: HTMLElement, word: string, opts: { multi?: boolean } = {}): CaptureTarget {
  const text = block.textContent ?? ''
  const start = text.indexOf(word)
  if (start < 0) throw new Error(`«${word}» not in «${text}»`)
  const t = targetIn(block, start, start + word.length, { multi: opts.multi })
  if (!t) throw new Error('no target')
  return t
}

/** The text node inside `el` (first one). */
export function textNode(el: Node): Text {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const n = walker.nextNode()
  if (!n) throw new Error('no text node')
  return n as Text
}

export function pointAt(node: Node, offset: number): void {
  const d = document as unknown as { caretPositionFromPoint: (x: number, y: number) => unknown }
  vi.spyOn(d, 'caretPositionFromPoint').mockImplementation(() => ({ offsetNode: node, offset }))
}

export function selectText(node: Node, start: number, end: number): void {
  const sel = document.getSelection()!
  sel.removeAllRanges()
  const r = document.createRange()
  r.setStart(node, start)
  r.setEnd(node, end)
  sel.addRange(r)
}
