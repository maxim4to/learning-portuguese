/** First lookup before the lexicon chunk is loaded: a skeleton with the tapped form, then the card. */
import { screen } from '@testing-library/react'
import { afterEach, beforeAll, expect, test } from 'vitest'
import { getLoadedLexicon } from '@/engine/lexicon/lookup'
import { LookupCard } from '@/features/words/capture/LookupCard'
import { renderWithProviders } from '../../helpers/render'
import { installRangeGeometry, ptBlock, removeMain, stubAudioFetch, targetFor } from '../../helpers/B-words-dom'

beforeAll(() => {
  installRangeGeometry()
  stubAudioFetch()
})
afterEach(() => removeMain())

test('LookupCard shows «Загружаю словарь» with the form and a close button, then the entry', async () => {
  expect(getLoadedLexicon()).toBeNull()
  const block = ptBlock('Bebo uma chávena de chá.')
  renderWithProviders(<LookupCard target={targetFor(block, 'chávena')} titleId="t" onClose={() => {}} onPickWord={() => {}} />)
  const loading = screen.getByRole('status', { name: 'Загружаю словарь' })
  expect(loading).toHaveTextContent('chávena')
  expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument()
  // no «Все слова фразы» while loading
  expect(screen.queryByRole('button', { name: 'Все слова фразы' })).not.toBeInTheDocument()
  expect(await screen.findByText('чашка', {}, { timeout: 10_000 })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('a chávena')
})
