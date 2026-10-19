/**
 * The lexicon chunk fails to load (offline first visit, broken deploy): the dictionary UI falls back to manual input.
 */
import { screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { ImportListDialog } from '@/features/words/ImportListDialog'
import { LookupCard } from '@/features/words/capture/LookupCard'
import { WordSearchDialog } from '@/features/words/WordSearchDialog'
import { renderWithProviders } from '../../helpers/render'
import { installRangeGeometry, ptBlock, removeMain, stubAudioFetch, targetFor } from '../../helpers/B-words-dom'

vi.mock('@/engine/lexicon/lookup', async (orig) => ({
  ...(await orig<typeof import('@/engine/lexicon/lookup')>()),
  loadLexicon: () => Promise.reject(new Error('chunk failed')),
  getLoadedLexicon: () => null,
  preloadLexicon: () => {},
}))

beforeAll(() => {
  installRangeGeometry()
  stubAudioFetch()
})
afterEach(() => removeMain())

describe('lexicon failed to load', () => {
  test('LookupCard: the word is treated as unknown (manual form)', async () => {
    const block = ptBlock('A saúde é boa.')
    renderWithProviders(<LookupCard target={targetFor(block, 'saúde')} titleId="t" onClose={() => {}} onPickWord={() => {}} />)
    expect(screen.getByRole('status', { name: 'Загружаю словарь' })).toBeInTheDocument()
    expect(await screen.findByText(/^Нет в словаре приложения/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /В словарь/ })).toBeInTheDocument()
  })

  test('WordSearchDialog: explains and shows the manual form at once', async () => {
    const onAdded = vi.fn()
    const { user, store } = renderWithProviders(<WordSearchDialog onClose={() => {}} onAdded={onAdded} />)
    const dlg = screen.getByRole('dialog', { name: 'Добавить слово' })
    expect(await within(dlg).findByText('Словарь приложения не загрузился — слово можно добавить вручную.')).toBeInTheDocument()
    expect(within(dlg).getByRole('heading', { name: 'Своё слово' })).toBeInTheDocument()
    await user.type(within(dlg).getByLabelText('Слово (pt-PT)'), 'saúde')
    await user.type(within(dlg).getByLabelText('Перевод'), 'здоровье')
    await user.click(within(dlg).getByRole('button', { name: 'Сохранить в словарь' }))
    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(store.wordList()[0]).toMatchObject({ id: 'u:saúde', lemma: 'saúde', ru: 'здоровье' })
  })

  test('ImportListDialog: a note, and words are saved with the pasted translations', async () => {
    const onAdded = vi.fn()
    const { user, store } = renderWithProviders(<ImportListDialog onClose={() => {}} onAdded={onAdded} />)
    expect(await screen.findByText('Словарь приложения не загрузился — слова сохранятся с вашими переводами.')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Список слов'))
    await user.paste('saúde — здоровье')
    await user.click(screen.getByRole('button', { name: 'Разобрать (1)' }))
    expect(screen.getByText('своё слово')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Добавить 1 слово' }))
    expect(onAdded).toHaveBeenCalledWith(expect.anything(), 1)
    expect(store.wordList()[0]).toMatchObject({ id: 'u:saúde', ru: 'здоровье' })
  })
})
