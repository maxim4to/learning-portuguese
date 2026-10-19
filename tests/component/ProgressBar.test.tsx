import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Button } from '@/components/Button'
import { ProgressBar } from '@/components/ProgressBar'

describe('ProgressBar (smoke)', () => {
  test('clamps value to 0..100 and exposes it via aria', () => {
    render(<ProgressBar value={1.7} label="Прогресс" />)
    const bar = screen.getByRole('progressbar', { name: 'Прогресс' })
    expect(bar).toHaveAttribute('aria-valuenow', '100')
  })

  test('segments: only non-empty segments are drawn, titles go into the label', () => {
    const { container } = render(
      <ProgressBar
        label="Темы"
        segments={[
          { value: 0.5, className: 'a', title: 'уверенно 5' },
          { value: 0, className: 'b', title: 'слабо 0' },
        ]}
      />,
    )
    expect(screen.getByRole('img', { name: 'Темы. уверенно 5, слабо 0' })).toBeInTheDocument()
    expect(container.querySelectorAll('[role=img] > div')).toHaveLength(1)
  })
})

describe('Button (smoke)', () => {
  test('is a type=button by default and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Проверить</Button>)
    const btn = screen.getByRole('button', { name: 'Проверить' })
    expect(btn).toHaveAttribute('type', 'button')
    await userEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
