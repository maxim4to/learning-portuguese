/**
 * DotGrid on a fake Canvas2D (jsdom has none): a recording 2D context, captured Resize/IntersectionObserver
 * callbacks to drive size and visibility, a Path2D stub. Checks the observable contract: canvas sized by
 * devicePixelRatio, dots drawn per tint level, pointer kicks animate frames until the dots settle, offscreen
 * stops drawing, theme changes recolour, reduced motion / non-interactive ignore the pointer.
 */
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DotGrid, HalftoneSurface, type DotMask } from '@/components/DotGrid'

type Cb = (entries: unknown[]) => void
let roCbs: Cb[] = []
let ioCbs: Cb[] = []
let ctx: Record<string, unknown> & { fill: ReturnType<typeof vi.fn>; clearRect: ReturnType<typeof vi.fn> }
const saved: Record<string, unknown> = {}

function fakeCtx() {
  return {
    fill: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    setTransform: vi.fn(),
    getImageData: vi.fn(() => ({ data: [200, 100, 50, 255] })),
    fillStyle: '',
  }
}

beforeEach(() => {
  roCbs = []
  ioCbs = []
  ctx = fakeCtx()
  const w = window as unknown as Record<string, unknown>
  for (const k of ['ResizeObserver', 'IntersectionObserver', 'Path2D']) saved[k] = w[k]
  w.ResizeObserver = class {
    constructor(cb: Cb) {
      roCbs.push(cb)
    }
    observe() {}
    disconnect() {}
  }
  w.IntersectionObserver = class {
    constructor(cb: Cb) {
      ioCbs.push(cb)
    }
    observe() {}
    disconnect() {}
  }
  w.Path2D = class {
    moveTo() {}
    arc() {}
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D)
})
afterEach(() => {
  const w = window as unknown as Record<string, unknown>
  for (const k of Object.keys(saved)) w[k] = saved[k]
  vi.restoreAllMocks()
})

const frames = async (n = 3) => {
  for (let i = 0; i < n; i++) await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())))
}
const resizeAll = (width: number, height: number) =>
  act(() => {
    for (const cb of roCbs) cb([{ contentRect: { width, height } }])
  })

describe('DotGrid (fake canvas)', () => {
  test('sizes the canvas, draws dots, reacts to pointer kicks, settles, stops offscreen', async () => {
    const { container, unmount } = render(
      <HalftoneSurface as="section" dots={{ mask: 'radial', dotSize: 4, gap: 4, returnDuration: 0.2, resistance: 5000 }}>
        <p>content</p>
      </HalftoneSurface>,
    )
    const canvas = container.querySelector('canvas')!
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    resizeAll(120, 80)
    expect(canvas.width).toBe(120 * Math.min(2, window.devicePixelRatio || 1))
    await frames(1)
    expect(ctx.fill).toHaveBeenCalled()
    const surface = container.querySelector('[data-halftone-surface]') as HTMLElement
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 120, height: 80, right: 120, bottom: 80, x: 0, y: 0, toJSON() {} } as DOMRect)

    // Shockwave on press, fast moves kick nearby dots, hover tints.
    fireEvent.pointerDown(surface, { clientX: 60, clientY: 40 })
    fireEvent.pointerMove(surface, { clientX: 10, clientY: 10, pointerType: 'mouse' })
    fireEvent.pointerMove(surface, { clientX: 100, clientY: 70, pointerType: 'mouse' })
    const before = ctx.fill.mock.calls.length
    await frames(6)
    expect(ctx.fill.mock.calls.length).toBeGreaterThan(before)
    fireEvent.pointerUp(surface, { pointerType: 'touch' })
    fireEvent.pointerLeave(surface)
    await frames(30) // spring back

    // Offscreen: no frames.
    act(() => ioCbs.forEach((cb) => cb([{ isIntersecting: false }])))
    const off = ctx.clearRect.mock.calls.length
    fireEvent.pointerDown(surface, { clientX: 60, clientY: 40 })
    await frames(2)
    expect(ctx.clearRect.mock.calls.length).toBe(off)
    act(() => ioCbs.forEach((cb) => cb([{ isIntersecting: true }])))
    await frames(2)
    expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(off)

    // Theme change → recolour + a frame.
    const fills = ctx.fill.mock.calls.length
    act(() => document.documentElement.classList.toggle('dark'))
    await frames(2)
    expect(ctx.fill.mock.calls.length).toBeGreaterThan(fills)
    document.documentElement.classList.remove('dark')
    unmount()
  })

  test.each(['none', 'corner', 'edge', 'fade-left', 'fade-right', 'fade-top', 'fade-bottom', 'ramp'] as DotMask[])('mask %s draws', async (mask) => {
    render(
      <div>
        <DotGrid mask={mask} rotate={20} as="block" baseColor="var(--brand, #f00)" activeColor="#00f" />
      </div>,
    )
    resizeAll(60, 60)
    await frames(1)
    expect(ctx.fill).toHaveBeenCalled()
  })

  test('geometry / colour prop changes rebuild and recolour', async () => {
    const { rerender } = render(<div><DotGrid dotSize={4} /></div>)
    resizeAll(50, 50)
    await frames(1)
    const n = ctx.fill.mock.calls.length
    rerender(<div><DotGrid dotSize={6} tint={0.9} activeColor="--sun-fill" /></div>)
    await frames(2)
    expect(ctx.fill.mock.calls.length).toBeGreaterThan(n)
  })

  test('non-interactive: pointer events are ignored', async () => {
    const { container } = render(<div><DotGrid interactive={false} /></div>)
    resizeAll(50, 50)
    await frames(1)
    const n = ctx.clearRect.mock.calls.length
    fireEvent.pointerDown(container.firstElementChild!, { clientX: 10, clientY: 10 })
    await frames(2)
    expect(ctx.clearRect.mock.calls.length).toBe(n)
  })

  test('explicit fallback is used without canvas support', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const { getByText } = render(<DotGrid fallback={<span>static</span>} />)
    expect(getByText('static')).toBeInTheDocument()
  })
})
