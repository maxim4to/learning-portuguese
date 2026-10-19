/**
 * Syllabus entries without written content («скоро») and a level without modules: the real content has none,
 * so getSyllabus is extended here.
 */
import { screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { SyllabusPage } from '@/features/syllabus/SyllabusPage'
import { renderWithProviders } from '../../helpers/render'

vi.mock('@/content', async (orig) => {
  const real = await orig<typeof import('@/content')>()
  const syl = real.getSyllabus()
  const levels = syl.levels.map((l) =>
    l.level === 'A1'
      ? { ...l, modules: [{ ...l.modules[0], topics: [...l.modules[0].topics, 'a1-futuro-proximo-extra'] }, ...l.modules.slice(1)] }
      : l.level === 'B2'
        ? { ...l, modules: [] }
        : l,
  )
  return { ...real, getSyllabus: () => ({ ...syl, levels }) }
})

describe('SyllabusPage with unwritten topics', () => {
  test('an unwritten topic is a disabled row «скоро» with a humanized id; an empty level says «Скоро» and its chip is muted', () => {
    renderWithProviders(<SyllabusPage />, { route: '/syllabus' })
    const soon = screen.getByText('futuro proximo extra').closest('li')!
    expect(soon).toHaveAttribute('aria-disabled')
    expect(within(soon).getByText('скоро')).toBeInTheDocument()
    expect(within(soon).queryByRole('link')).toBeNull()
    const b2 = screen.getByRole('region', { name: 'Уровень B2' })
    expect(within(b2).getByText('Скоро')).toBeInTheDocument()
    expect(within(b2).queryByRole('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'B2' }).className).toContain('text-ink-muted')
  })
})
