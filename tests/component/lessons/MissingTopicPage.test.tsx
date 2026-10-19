import { screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { MissingTopicPage } from '@/features/lessons/MissingTopicPage'
import { renderWithProviders } from '../../helpers/render'

// Every syllabus topic has content today: add a planned-but-unwritten topic to the syllabus for the «not ready» branch.
vi.mock('@/content', async (orig) => {
  const real = await orig<typeof import('@/content')>()
  const syl = real.getSyllabus()
  const [a1, ...rest] = syl.levels
  const [m0, ...mods] = a1.modules
  const patched = { ...syl, levels: [{ ...a1, modules: [{ ...m0, topics: [...m0.topics, 'a1-planned-topic'] }, ...mods] }, ...rest] }
  return { ...real, getSyllabus: () => patched }
})

describe('MissingTopicPage', () => {
  test('a syllabus topic without materials → «Тема ещё не готова» with its place in the module', async () => {
    const { getSyllabus } = await import('@/content')
    const mod = getSyllabus().levels[0].modules[0]
    renderWithProviders(<MissingTopicPage id="a1-planned-topic" />)
    expect(screen.getByText('Тема ещё не готова')).toBeInTheDocument()
    expect(screen.getByText(`${mod.title} · тема ${mod.topics.length} из ${mod.topics.length}`, { exact: false })).toBeInTheDocument()
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.getByText('a1-planned-topic')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'К курсу' })).toHaveAttribute('href', '/syllabus')
  })

  test('unknown id → «Тема не найдена»', () => {
    renderWithProviders(<MissingTopicPage id="nope" />)
    expect(screen.getByText('Тема не найдена')).toBeInTheDocument()
    expect(screen.getByText('nope')).toBeInTheDocument()
  })
})
