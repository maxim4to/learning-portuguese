/**
 * The very first lookup of a session opened from the keyboard: neither the card chunk nor the lexicon is loaded
 * yet (nothing is preloaded in this file). Keyboard users must still land inside the card.
 */
import { screen, waitFor, within } from '@testing-library/react'
import { beforeAll, expect, test } from 'vitest'
import { getLoadedLexicon } from '@/engine/lexicon/lookup'
import { Pt } from '@/features/words/Pt'
import { renderWithProviders } from '../../helpers/render'
import { installRangeGeometry, setWideScreen, stubAudioFetch } from '../../helpers/B-words-dom'

beforeAll(() => {
  installRangeGeometry()
  stubAudioFetch()
})

test.fails('Enter on a pt line (first lookup, nothing loaded yet) moves focus into the popover card [BUG B-41]', async () => {
  expect(getLoadedLexicon()).toBeNull()
  setWideScreen(true)
  const { user } = renderWithProviders(
    <main id="main">
      <Pt as="p" tabIndex={0}>
        Eu como pão.
      </Pt>
    </main>,
    { capture: true },
  )
  screen.getByText('Eu como pão.').focus()
  await user.keyboard('{Enter}')
  const pop = await screen.findByRole('dialog')
  // the card is there (lexicon loaded, actions rendered)…
  expect(await within(pop).findByRole('button', { name: /В словарь/ }, { timeout: 10_000 })).toBeInTheDocument()
  // …and the keyboard user is in it
  await waitFor(() => expect(pop.contains(document.activeElement)).toBe(true))
})
