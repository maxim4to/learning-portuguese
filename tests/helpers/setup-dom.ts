/**
 * jsdom setup for component tests (vitest project «component»):
 * jest-dom matchers, RTL cleanup, a clean localStorage/sessionStorage per test, and stubs for the browser APIs
 * the app touches that jsdom lacks (matchMedia, IntersectionObserver, ResizeObserver, CSS.highlights/Highlight,
 * speechSynthesis, HTMLMediaElement/Audio playback, clipboard, scrollIntoView, <dialog>, requestIdleCallback,
 * caret*FromPoint, vibrate). Stubs are deliberately inert; spy on them with `vi.spyOn` when a test needs to.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

type AnyFn = (...args: unknown[]) => unknown
const w = window as unknown as Record<string, unknown>

// ── matchMedia ─────────────────────────────────────────────────────────────────────────────
if (!window.matchMedia) {
  w.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}

// ── Observers ──────────────────────────────────────────────────────────────────────────────
class NoopObserver {
  constructor(_cb?: AnyFn, _opts?: unknown) {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
  root = null
  rootMargin = ''
  thresholds = []
}
w.IntersectionObserver ??= NoopObserver
w.ResizeObserver ??= NoopObserver

// ── CSS Custom Highlight API (saved-word highlights) ───────────────────────────────────────
class HighlightStub extends Set<Range> {
  priority = 0
  type = 'highlight'
  constructor(...ranges: Range[]) {
    super(ranges)
  }
}
w.Highlight ??= HighlightStub
const cssObj = (globalThis as { CSS?: Record<string, unknown> }).CSS ?? ((globalThis as { CSS?: object }).CSS = {})
;(cssObj as Record<string, unknown>).highlights ??= new Map<string, unknown>()
;(cssObj as Record<string, unknown>).supports ??= () => false

// ── Speech synthesis ───────────────────────────────────────────────────────────────────────
class UtteranceStub {
  text: string
  lang = ''
  rate = 1
  pitch = 1
  volume = 1
  voice: unknown = null
  onend: AnyFn | null = null
  onerror: AnyFn | null = null
  onstart: AnyFn | null = null
  constructor(text = '') {
    this.text = text
  }
  addEventListener() {}
  removeEventListener() {}
}
w.SpeechSynthesisUtterance ??= UtteranceStub
w.speechSynthesis ??= {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: () => [],
  speaking: false,
  pending: false,
  paused: false,
  onvoiceschanged: null,
  addEventListener: () => {},
  removeEventListener: () => {},
}

// ── Media playback (jsdom throws «not implemented») ────────────────────────────────────────
Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: () => Promise.resolve() })
Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: () => {} })
Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: () => {} })

// ── Misc DOM ───────────────────────────────────────────────────────────────────────────────
Element.prototype.scrollIntoView ??= function () {}
Element.prototype.scrollTo ??= function () {}
window.scrollTo = (() => {}) as typeof window.scrollTo
w.requestIdleCallback ??= (cb: AnyFn) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0)
w.cancelIdleCallback ??= (id: number) => clearTimeout(id)
const doc = document as unknown as Record<string, unknown>
doc.caretRangeFromPoint ??= () => null
doc.caretPositionFromPoint ??= () => null
;(navigator as unknown as Record<string, unknown>).vibrate ??= () => true

if (!navigator.clipboard) {
  let clip = ''
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async (t: string) => {
        clip = t
      }),
      readText: vi.fn(async () => clip),
    },
  })
}

// <dialog>: jsdom versions differ in showModal support — make it predictable.
const dlg = HTMLDialogElement.prototype as unknown as Record<string, unknown>
if (typeof dlg.showModal !== 'function') {
  dlg.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  dlg.show = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  dlg.close = function (this: HTMLDialogElement, rv?: string) {
    this.removeAttribute('open')
    if (rv !== undefined) this.returnValue = rv
    this.dispatchEvent(new Event('close'))
  }
}

// ── Isolation ──────────────────────────────────────────────────────────────────────────────
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  cleanup()
})
