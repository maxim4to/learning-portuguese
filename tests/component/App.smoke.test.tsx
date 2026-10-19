import { screen, within } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { progress } from '../fixtures/seed'
import { renderApp } from '../helpers/render'

describe('App in jsdom (smoke)', () => {
  test('course page renders from seeded local progress', async () => {
    await renderApp('/syllabus', { seed: { progress: [progress('a1-ser-estar', 9, 10)] } })
    const main = await screen.findByRole('main')
    expect(await within(main).findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(within(main).getAllByText(/90\s?%/).length).toBeGreaterThan(0)
  })
})
