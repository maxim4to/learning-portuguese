/**
 * Layout stubs for jsdom component tests of area B-ui (jsdom has no layout engine: offsetParent is always null,
 * every size is 0). Each helper returns a restore function.
 */

/** offsetParent → parentElement for connected, non-[hidden] elements (so "visible" filters keep them). */
export function stubLayoutVisibility(): () => void {
  const proto = HTMLElement.prototype
  const orig = Object.getOwnPropertyDescriptor(proto, 'offsetParent')
  Object.defineProperty(proto, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.isConnected && !this.closest('[hidden]') ? this.parentElement : null
    },
  })
  return () => {
    if (orig) Object.defineProperty(proto, 'offsetParent', orig)
  }
}

/** Defines fixed numeric layout props on one element (scrollWidth, clientWidth, scrollLeft, offsetLeft…). */
export function setLayout(el: Element, props: Partial<Record<'scrollWidth' | 'clientWidth' | 'scrollLeft' | 'offsetLeft' | 'offsetWidth' | 'offsetHeight', number>>) {
  for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { configurable: true, writable: true, value: v })
}

/** requestAnimationFrame that runs callbacks synchronously-ish through setTimeout(0) — deterministic in tests. */
export function stubRaf(): () => void {
  const raf = window.requestAnimationFrame
  const caf = window.cancelAnimationFrame
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0)) as typeof raf
  window.cancelAnimationFrame = ((id: number) => window.clearTimeout(id)) as typeof caf
  return () => {
    window.requestAnimationFrame = raf
    window.cancelAnimationFrame = caf
  }
}
