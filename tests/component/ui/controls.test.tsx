import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import { ProgressBar } from '@/components/ProgressBar'
import { ProgressRing } from '@/components/ProgressRing'
import { SegmentedControl } from '@/components/SegmentedControl'
import { SubNav } from '@/components/SubNav'
import { Switch } from '@/components/Switch'
import { TabPanel, Tabs } from '@/components/Tabs'

type T = 'a' | 'b' | 'c'

function TabsHarness({ onChange }: { onChange?: (v: T) => void }) {
  const [v, setV] = useState<T>('a')
  const items = [
    { value: 'a' as const, label: 'Альфа', meta: 3 },
    { value: 'b' as const, label: 'Бета' },
    { value: 'c' as const, label: 'Гамма', meta: '✓' },
  ]
  return (
    <>
      <Tabs
        idBase="t"
        label="Разделы"
        items={items}
        value={v}
        onChange={(n) => {
          onChange?.(n)
          setV(n)
        }}
      />
      {items.map((i) => (
        <TabPanel key={i.value} idBase="t" value={i.value} active={v === i.value}>
          Панель {i.label}
        </TabPanel>
      ))}
    </>
  )
}

describe('Tabs', () => {
  test('ARIA wiring: tablist label, selected tab, roving tabindex, panel labelled by its tab', () => {
    render(<TabsHarness />)
    const list = screen.getByRole('tablist', { name: 'Разделы' })
    const tabs = within(list).getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[0]).toHaveAttribute('tabindex', '0')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')
    expect(tabs[0]).toHaveAttribute('aria-controls', 't-panel-a')
    expect(tabs[0]).toHaveTextContent('Альфа3')
    const panel = screen.getByRole('tabpanel', { name: /Альфа/ })
    expect(panel).toHaveTextContent('Панель Альфа')
    // Inactive panels are hidden (not in the a11y tree).
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  })

  test('click selects; ArrowRight/ArrowLeft wrap; Home/End jump; focus follows', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TabsHarness onChange={onChange} />)
    await user.click(screen.getByRole('tab', { name: 'Бета' }))
    expect(screen.getByRole('tab', { name: 'Бета' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Панель Бета')

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Гамма/ })).toHaveFocus()
    await user.keyboard('{ArrowRight}') // wraps to the first
    expect(screen.getByRole('tab', { name: /Альфа/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Альфа/ })).toHaveFocus()
    await user.keyboard('{ArrowLeft}') // wraps to the last
    expect(screen.getByRole('tab', { name: /Гамма/ })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: /Альфа/ })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: /Гамма/ })).toHaveAttribute('aria-selected', 'true')
    onChange.mockClear()
    await user.keyboard('{ArrowDown}') // not a tab key
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('SubNav', () => {
  test('nav landmark of links, the active one has aria-current="page"', () => {
    render(
      <MemoryRouter>
        <SubNav
          label="Разделы практики"
          active="b"
          items={[
            { value: 'a', to: '/a', label: 'Первый', meta: 5 },
            { value: 'b', to: '/b', label: 'Второй' },
          ]}
        />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Разделы практики' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/a', '/b'])
    expect(links[1]).toHaveAttribute('aria-current', 'page')
    expect(links[0]).not.toHaveAttribute('aria-current')
    expect(links[0]).toHaveTextContent('Первый5')
  })
})

describe('SegmentedControl', () => {
  function Seg({ initial = 'x' as string }) {
    const [v, setV] = useState(initial)
    return (
      <SegmentedControl
        label="Голос"
        value={v}
        onChange={setV}
        options={[
          { value: 'x', label: 'Икс' },
          { value: 'y', label: 'Игрек', ariaLabel: 'Вариант игрек' },
          { value: 'z', label: 'Зет' },
        ]}
      />
    )
  }

  test('radiogroup with one checked radio; click and arrows (incl. Up/Down, Home/End) move the selection', async () => {
    const user = userEvent.setup()
    render(<Seg />)
    const group = screen.getByRole('radiogroup', { name: 'Голос' })
    const [x, y, z] = within(group).getAllByRole('radio')
    expect(x).toBeChecked()
    expect(y).toHaveAccessibleName('Вариант игрек')
    expect(y).toHaveAttribute('tabindex', '-1')
    await user.click(z)
    expect(z).toBeChecked()
    await user.keyboard('{ArrowRight}')
    expect(x).toBeChecked()
    expect(x).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(z).toBeChecked()
    await user.keyboard('{ArrowDown}')
    expect(x).toBeChecked()
    await user.keyboard('{End}')
    expect(z).toBeChecked()
    await user.keyboard('{Home}')
    expect(x).toBeChecked()
    await user.keyboard('{ArrowLeft}')
    expect(z).toHaveFocus()
    await user.keyboard('a') // ignored
    expect(z).toBeChecked()
  })

  test('no option matches the value: the first segment is the tab stop', () => {
    render(<Seg initial="" />)
    const radios = screen.getAllByRole('radio')
    expect(radios.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(radios[0]).toHaveAttribute('tabindex', '0')
  })
})

describe('Switch', () => {
  test('role switch, name from label, description wired, toggles via click and label', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<Switch checked={false} onChange={onChange} label="Акценты" description="Подробности" />)
    const sw = screen.getByRole('switch', { name: 'Акценты' })
    expect(sw).not.toBeChecked()
    expect(sw).toHaveAccessibleDescription('Подробности')
    await user.click(sw)
    expect(onChange).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByText('Акценты'))
    expect(onChange).toHaveBeenCalledTimes(2)
    rerender(<Switch checked onChange={onChange} label="Акценты" />)
    expect(screen.getByRole('switch')).toBeChecked()
    expect(screen.getByRole('switch')).not.toHaveAttribute('aria-describedby')
    await user.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })
})

describe('ProgressBar', () => {
  test('value → rounded percent; negative clamps to 0; fill width matches', () => {
    const { container, rerender } = render(<ProgressBar value={0.456} label="P" tone="sun" size="sm" />)
    const bar = screen.getByRole('progressbar', { name: 'P' })
    expect(bar).toHaveAttribute('aria-valuenow', '46')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect((container.querySelector('[role=progressbar] > div') as HTMLElement).style.width).toBe('46%')
    rerender(<ProgressBar value={-3} label="P" size="lg" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  test('segments: flex-basis per value (capped at 100%), 4px minimum width, titles; empty → no label', () => {
    const { container, rerender } = render(
      <ProgressBar
        segments={[
          { value: 0.01, className: 's1', title: 'уверенно: 1' },
          { value: 1.4, className: 's2' },
        ]}
      />,
    )
    const img = screen.getByRole('img', { name: 'уверенно: 1' })
    const segs = [...img.children] as HTMLElement[]
    expect(segs).toHaveLength(2)
    expect(segs[0].style.flexBasis).toBe('1%')
    expect(segs[0].style.minWidth).toBe('4px')
    expect(segs[0]).toHaveAttribute('title', 'уверенно: 1')
    expect(segs[1].style.flexBasis).toBe('100%')
    rerender(<ProgressBar segments={[]} />)
    const empty = container.querySelector('[role=img]')!
    expect(empty).not.toHaveAttribute('aria-label')
    expect(empty.children).toHaveLength(0)
  })
})

describe('ProgressRing', () => {
  test('decorative by default (aria-hidden), progressbar with a label; animates from 0 on the next frame', async () => {
    const { container, rerender } = render(<ProgressRing value={0.5} size={100} stroke={10} />)
    const box = container.firstElementChild!
    expect(box).toHaveAttribute('aria-hidden', 'true')
    const arc = container.querySelectorAll('circle')[1]
    const c = 2 * Math.PI * 45
    expect(Number(arc.getAttribute('stroke-dasharray'))).toBeCloseTo(c)
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(c) // starts empty
    await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))))
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(c / 2)

    rerender(
      <ProgressRing value={2} label="Цель дня" tone="sun">
        <span>100%</span>
      </ProgressRing>,
    )
    const ring = screen.getByRole('progressbar', { name: 'Цель дня' })
    expect(ring).toHaveAttribute('aria-valuenow', '100')
    expect(ring).toHaveTextContent('100%')
  })

  test('with children and no label it is not hidden; value 0 hides the arc', () => {
    const { container } = render(
      <ProgressRing value={0}>
        <b>x</b>
      </ProgressRing>,
    )
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'false')
    expect((container.querySelectorAll('circle')[1] as SVGElement).style.opacity).toBe('0')
  })
})

describe('Switch inside forms does not submit', () => {
  test('type=button', () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault())
    render(
      <form onSubmit={(e) => onSubmit(e.nativeEvent)}>
        <Switch checked={false} onChange={() => {}} label="S" />
      </form>,
    )
    fireEvent.click(screen.getByRole('switch'))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
