import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WordEditor } from '@/features/words/WordEditor'
import type { WordEntry } from '@/data'
import { NOW, word, wordCard, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { stubAudioFetch } from '../../helpers/B-words-dom'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  stubAudioFetch()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const SAUDE = word('saúde', 'здоровье', {
  lexId: 'saúde#noun',
  pos: 'noun',
  gender: 'f',
  note: 'a nota',
  modes: ['recognize', 'produce', 'cloze', 'listen'],
})

function setup(w: WordEntry = SAUDE, seed: Seed = { words: [w], cards: [wordCard(w)] }) {
  const onClose = vi.fn()
  const r = renderWithProviders(<WordEditor word={w} onClose={onClose} />, { seed })
  const dialog = screen.getByRole('dialog', { name: 'Изменить слово' })
  return { ...r, onClose, dialog }
}

const toast = () => screen.getAllByRole('status').find((s) => s.getAttribute('aria-live') === 'polite')!

describe('WordEditor', () => {
  test('prefilled fields, description with the article, focus on the lemma', () => {
    const { dialog } = setup()
    expect(dialog).toHaveAccessibleDescription('a saúde')
    expect(within(dialog).getByLabelText('Слово (pt-PT)')).toHaveValue('saúde')
    expect(within(dialog).getByLabelText('Слово (pt-PT)')).toHaveFocus()
    expect(within(dialog).getByLabelText('Перевод')).toHaveValue('здоровье')
    expect(within(dialog).getByLabelText('Часть речи')).toHaveValue('noun')
    expect(within(dialog).getByLabelText('Род')).toHaveValue('f')
    expect(within(dialog).getByLabelText('Заметка')).toHaveValue('a nota')
    const modes = within(dialog).getByRole('group', { name: 'Карточки для этого слова' })
    expect(within(modes).getAllByRole('checkbox')).toHaveLength(4)
    within(modes).getAllByRole('checkbox').forEach((c) => expect(c).toBeChecked())
    expect(within(modes).getByText('создаётся сразу при добавлении')).toBeInTheDocument()
  })

  test('modes switched off in settings are labelled so', () => {
    setup(SAUDE, { words: [SAUDE], settings: { wordModes: ['recognize', 'produce'] } })
    expect(screen.getAllByText('выключено в настройках для всех слов')).toHaveLength(2)
  })

  test('validation: empty lemma / translation, no modes', async () => {
    const { user, dialog, onClose, store } = setup()
    await user.clear(within(dialog).getByLabelText('Слово (pt-PT)'))
    await user.clear(within(dialog).getByLabelText('Перевод'))
    for (const c of within(dialog).getAllByRole('checkbox')) await user.click(c)
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(within(dialog).getByText('Введите слово на португальском')).toBeInTheDocument()
    expect(within(dialog).getByText('Введите перевод')).toBeInTheDocument()
    expect(within(dialog).getByText('Оставьте хотя бы один вид карточек')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Слово (pt-PT)')).toHaveAttribute('aria-invalid', 'true')
    expect(onClose).not.toHaveBeenCalled()
    expect(store.wordList()[0].ru).toBe('здоровье')
  })

  test('no changes → closes without saving', async () => {
    const { user, dialog, onClose, store } = setup()
    const spy = vi.spyOn(store, 'saveWordBundle')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(spy).not.toHaveBeenCalled()
  })

  test('saves only changed fields, toasts «Сохранено», undo restores', async () => {
    const { user, dialog, onClose, store } = setup()
    const ru = within(dialog).getByLabelText('Перевод')
    await user.clear(ru)
    await user.type(ru, 'здоровье; самочувствие')
    await user.clear(within(dialog).getByLabelText('Заметка'))
    await user.click(within(dialog).getByRole('checkbox', { name: /На слух/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    const w = store.wordList()[0]
    expect(w.ru).toBe('здоровье; самочувствие')
    expect(w.note).toBeUndefined()
    expect(w.modes).toEqual(['recognize', 'produce', 'cloze'])
    expect(within(toast()).getByText('Сохранено: a saúde')).toBeInTheDocument()
    await user.click(within(toast()).getByRole('button', { name: 'Отменить' }))
    await waitFor(() => expect(store.wordList()[0].ru).toBe('здоровье'))
    expect(store.wordList()[0].note).toBe('a nota')
  })

  test('re-checking a mode keeps the unlock order', async () => {
    const { user, dialog, store } = setup()
    await user.click(within(dialog).getByRole('checkbox', { name: /RU → PT/ }))
    await user.click(within(dialog).getByRole('checkbox', { name: /RU → PT/ }))
    await user.selectOptions(within(dialog).getByLabelText('Часть речи'), '')
    await user.selectOptions(within(dialog).getByLabelText('Род'), '')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    const w = store.wordList()[0]
    expect(w.modes).toEqual(['recognize', 'produce', 'cloze', 'listen'])
    expect(within(toast()).getByText('Сохранено: saúde')).toBeInTheDocument()
    expect(w.pos).toBeUndefined()
    expect(w.gender).toBeUndefined()
  })

  test('a failed save keeps the dialog open with the error', async () => {
    const { user, dialog, onClose, store } = setup()
    vi.spyOn(store, 'saveWordBundle').mockRejectedValue(new Error('offline'))
    await user.type(within(dialog).getByLabelText('Перевод'), '!')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Не удалось сохранить: offline')
    expect(onClose).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('button', { name: 'Сохранить' })).toBeEnabled()
  })

  test('«Отмена» and «Закрыть» close', async () => {
    const { user, dialog, onClose } = setup()
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
