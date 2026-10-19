/**
 * useScrollEdges / useFitText measure layout jsdom doesn't have: sizes are stubbed per element / per label.
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { useFitText } from '@/components/useFitText'
import { useScrollEdges } from '@/components/useScrollEdges'
import { setLayout } from '../../helpers/B-ui-layout'

function Scroller() {
  const ref = useRef<HTMLDivElement>(null)
  useScrollEdges(ref)
  return (
    <div ref={ref} data-testid="row">
      <span>a</span>
      <span>b</span>
    </div>
  )
}

const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())))

describe('useScrollEdges', () => {
  test('fits → no fade; overflow at start → fade-end only; middle → both; end → fade-start only', async () => {
    const { getByTestId, unmount } = render(<Scroller />)
    const el = getByTestId('row')
    await frame()
    expect(el).not.toHaveAttribute('data-fade-start')
    expect(el).not.toHaveAttribute('data-fade-end')

    setLayout(el, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 })
    fireEvent.scroll(el)
    await frame()
    expect(el).not.toHaveAttribute('data-fade-start')
    expect(el).toHaveAttribute('data-fade-end')

    setLayout(el, { scrollLeft: 100 })
    fireEvent.scroll(el)
    await frame()
    expect(el).toHaveAttribute('data-fade-start')
    expect(el).toHaveAttribute('data-fade-end')

    // RTL scrollers report negative offsets; sub-pixel remainder (≤1px) counts as the end.
    setLayout(el, { scrollLeft: -199.5 })
    fireEvent.scroll(el)
    await frame()
    expect(el).toHaveAttribute('data-fade-start')
    expect(el).not.toHaveAttribute('data-fade-end')

    unmount()
    expect(el).not.toHaveAttribute('data-fade-start')
  })

  test('re-checks when children change (MutationObserver)', async () => {
    const { getByTestId } = render(<Scroller />)
    const el = getByTestId('row')
    await frame()
    setLayout(el, { scrollWidth: 500, clientWidth: 100, scrollLeft: 0 })
    el.appendChild(document.createElement('span'))
    await waitFor(() => expect(el).toHaveAttribute('data-fade-end'))
  })
})

// ── useFitText ────────────────────────────────────────────────────────────────────────────

/** Label widths per tried font size (the hook sets `--fit-label-fs` on the container before measuring). */
let widths: Record<string, number> = {}
const CELL = 60
let restore: (() => void) | undefined

function TabBar({ labels }: { labels: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useFitText(ref, [labels.join()])
  return (
    <nav ref={ref} data-testid="bar">
      {labels.map((l) => (
        <a key={l} style={{ paddingLeft: '0px', paddingRight: '0px' }} data-cell="">
          <span data-fit-label="">{l}</span>
        </a>
      ))}
    </nav>
  )
}

describe('useFitText', () => {
  beforeEach(() => {
    const proto = HTMLElement.prototype
    const sw = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')
    const cw = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
    Object.defineProperty(proto, 'scrollWidth', {
      configurable: true,
      get(this: HTMLElement) {
        if (!this.hasAttribute('data-fit-label')) return 0
        const fs = this.closest<HTMLElement>('[data-testid=bar]')!.style.getPropertyValue('--fit-label-fs')
        return (widths[this.textContent ?? ''] ?? 0) * (fs === 'var(--text-xs)' ? 1.2 : fs === 'var(--text-tabbar-mid)' ? 1.1 : 1)
      },
    })
    Object.defineProperty(proto, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute('data-cell') ? CELL : 0
      },
    })
    restore = () => {
      delete (proto as unknown as Record<string, unknown>).scrollWidth
      delete (proto as unknown as Record<string, unknown>).clientWidth
      if (sw) Object.defineProperty(Element.prototype, 'scrollWidth', sw)
      if (cw) Object.defineProperty(Element.prototype, 'clientWidth', cw)
    }
  })
  afterEach(() => restore?.())

  test('every label fits at 12px → step 0', () => {
    widths = { Курс: 30, Словарь: 40 }
    const { getByTestId } = render(<TabBar labels={['Курс', 'Словарь']} />)
    const bar = getByTestId('bar')
    expect(bar).toHaveAttribute('data-fit', '0')
    expect(bar.style.getPropertyValue('--fit-label-fs')).toBe('var(--text-xs)')
    expect(bar).not.toHaveAttribute('data-fit-measuring')
  })

  test('one label too wide at 12px but fits at 11px → step 1 for all', () => {
    // room = 60 - 2 = 58; 50*1.2 = 60 > 58, 50*1.1 = 55 ≤ 58
    widths = { Курс: 30, Повторение: 50 }
    const { getByTestId } = render(<TabBar labels={['Курс', 'Повторение']} />)
    expect(getByTestId('bar')).toHaveAttribute('data-fit', '1')
    expect(getByTestId('bar').style.getPropertyValue('--fit-label-fs')).toBe('var(--text-tabbar-mid)')
  })

  test('fits only at 10px → step 2; never fits → hidden at the smallest size', () => {
    widths = { Длинное: 56 } // 61.6, 67.2 > 58; 56 ≤ 58
    const { getByTestId, rerender } = render(<TabBar labels={['Длинное']} />)
    expect(getByTestId('bar')).toHaveAttribute('data-fit', '2')
    widths = { Длинное: 56, 'Очень длинное': 90 }
    rerender(<TabBar labels={['Длинное', 'Очень длинное']} />)
    expect(getByTestId('bar')).toHaveAttribute('data-fit', 'hidden')
    expect(getByTestId('bar').style.getPropertyValue('--fit-label-fs')).toBe('var(--text-tabbar-min)')
  })
})
