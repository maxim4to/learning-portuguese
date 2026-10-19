/**
 * useDueCount (badge on «Повторение»): due cards from the local-first store, live on writes, the daily new-card
 * limit, legacy soft-deleted cards, recount after leaving /review and every 5 minutes.
 */
import { act, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { SrsCard } from '@/data/types.ts'
import { useDueCount } from '@/features/srs/useDueCount'
import { DAY, NOW, card, fsrs, fsrsNew } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { flush, freezeDate, newSeenKey, setNow } from '../../helpers/B-srs-fixtures'
import type { Seed } from '../../fixtures/seed'

let go: (p: string) => void = () => {}
function Badge({ initial }: { initial: string }) {
  const [path, setPath] = useState(initial)
  useEffect(() => {
    go = setPath
  }, [])
  return <output aria-label="due">{useDueCount(path)}</output>
}
const count = () => Number(screen.getByRole('status', { name: 'due' }).textContent)
const setup = (seed: Seed, path = '/') => renderWithProviders(<Badge initial={path} />, { seed })

afterEach(() => vi.useRealTimers())

describe('useDueCount', () => {
  test('counts due reviews + new cards; suspended, future and legacy-deleted cards are not counted', () => {
    freezeDate(NOW)
    const deleted = { ...card('del'), deleted: true } as SrsCard
    setup({
      cards: [card('r1'), card('r2'), card('fut', { fsrs: fsrs({ due: NOW + DAY }) }), card('s', { suspended: true }), deleted, card('n1', { fsrs: fsrsNew() })],
    })
    expect(count()).toBe(3)
  })

  test('respects newCardsPerDay minus the new cards already seen today', () => {
    freezeDate(NOW)
    localStorage.setItem(newSeenKey(), '1')
    const fresh = Array.from({ length: 4 }, (_, i) => card(`n${i}`, { fsrs: fsrsNew() }))
    setup({ cards: [card('r1'), ...fresh], settings: { newCardsPerDay: 3 } })
    expect(count()).toBe(1 + 2)
  })

  test('follows card writes; a card written «now» counts even if the hook’s clock is older', async () => {
    freezeDate(NOW)
    const { store } = setup({ cards: [card('r1')] })
    expect(count()).toBe(1)
    setNow(NOW + 60 * 60_000)
    await act(() => store.upsertCards([card('late', { fsrs: fsrs({ due: NOW + 30 * 60_000 }), updatedAt: NOW + 60 * 60_000 })]))
    await flush()
    expect(count()).toBe(2)
    await act(() => store.deleteCards(['r1']))
    expect(count()).toBe(1)
  })

  test('re-counts after leaving /review (not while staying on it)', () => {
    freezeDate(NOW)
    setup({ cards: [card('soon', { fsrs: fsrs({ due: NOW + 10 * 60_000 }) })] }, '/review')
    expect(count()).toBe(0)
    setNow(NOW + 20 * 60_000)
    act(() => go('/review?tab=all'))
    expect(count()).toBe(0)
    act(() => go('/'))
    expect(count()).toBe(1)
  })

  test('re-counts every 5 minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    setup({ cards: [card('soon', { fsrs: fsrs({ due: NOW + 3 * 60_000 }) })] })
    expect(count()).toBe(0)
    act(() => vi.advanceTimersByTime(4 * 60_000))
    expect(count()).toBe(0)
    act(() => vi.advanceTimersByTime(60_000))
    expect(count()).toBe(1)
  })
})
