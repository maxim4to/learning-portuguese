import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { loadLexicon } from '@/engine/lexicon/lookup'
import { WordSearchDialog } from '@/features/words/WordSearchDialog'
import { NOW, word, wordCard } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { stubAudioFetch } from '../../helpers/B-words-dom'

beforeAll(async () => {
  await loadLexicon()
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  stubAudioFetch()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setup() {
  const onClose = vi.fn()
  const onAdded = vi.fn()
  const r = renderWithProviders(
    <Routes>
      <Route path="/" element={<WordSearchDialog onClose={onClose} onAdded={onAdded} />} />
      <Route path="/words/:id" element={<p>word page</p>} />
    </Routes>,
  )
  const dialog = screen.getByRole('dialog', { name: 'Добавить слово' })
  return { ...r, onClose, onAdded, dialog, box: within(dialog).getByRole('searchbox') }
}

describe('WordSearchDialog · search', () => {
  test('focus in the search box; the status tells the lexicon size', async () => {
    const { box, dialog } = setup()
    expect(box).toHaveFocus()
    expect(within(dialog).getByText(/^В словаре приложения \d+ слов и выражений\. Поиск без учёта акцентов\.$/)).toBeInTheDocument()
    expect(within(dialog).getByText('Слова нет в приложении?')).toBeInTheDocument()
  })

  test('pt without accents finds the word; results show pos, level and meanings', async () => {
    const { user, box, dialog } = setup()
    await user.type(box, 'saude')
    const list = await within(dialog).findByRole('list', { name: 'Результаты поиска' })
    const first = within(list).getAllByRole('listitem')[0]
    expect(first).toHaveTextContent('a saúde')
    expect(first).toHaveTextContent('сущ. · A2 — здоровье')
    expect(within(dialog).getByText(/^Найдено: \d+$/)).toBeInTheDocument()
    expect(within(dialog).getByText('Нет нужного значения?')).toBeInTheDocument()
  })

  test('Russian query finds by meaning', async () => {
    const { user, box, dialog } = setup()
    await user.type(box, 'чашка')
    expect(await within(dialog).findByRole('button', { name: 'Добавить «a chávena» в словарь' })).toBeInTheDocument()
  })

  test('«Добавить» saves the lexicon entry (all meanings, manual source) and reports it', async () => {
    const { user, box, dialog, onAdded, store } = setup()
    await user.type(box, 'casa')
    await user.click(await within(dialog).findByRole('button', { name: 'Добавить «a casa» в словарь' }))
    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(onAdded.mock.calls[0][0].words[0]).toMatchObject({ id: 'casa#noun' })
    expect(store.wordList()[0]).toMatchObject({ id: 'casa#noun', ru: 'дом; квартира, жильё; em casa — дома', level: 'A1' })
    expect(store.wordList()[0].sources[0]).toMatchObject({ src: 'manual', form: 'casa' })
  })

  test('a saved word shows «В словаре» linking to it (and closes the dialog)', async () => {
    const w = word('saúde', 'здоровье', { lexId: 'saúde#noun', pos: 'noun', gender: 'f' })
    const onClose = vi.fn()
    const r = renderWithProviders(
      <Routes>
        <Route path="/" element={<WordSearchDialog onClose={onClose} onAdded={() => {}} />} />
        <Route path="/words/:id" element={<p>word page</p>} />
      </Routes>,
      { seed: { words: [w], cards: [wordCard(w)] } },
    )
    await r.user.type(screen.getByRole('searchbox'), 'saúde')
    const link = await screen.findByRole('link', { name: '«a saúde» уже в словаре — открыть' })
    expect(link).toHaveAttribute('href', '/words/sa%C3%BAde%23noun')
    await r.user.click(link)
    expect(onClose).toHaveBeenCalled()
    expect(await screen.findByText('word page')).toBeInTheDocument()
  })

  test('a failed save is shown', async () => {
    const { user, box, dialog, store, onAdded } = setup()
    vi.spyOn(store, 'saveWordBundle').mockRejectedValue(new Error('denied'))
    await user.type(box, 'chávena')
    await user.click(await within(dialog).findByRole('button', { name: 'Добавить «a chávena» в словарь' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Не удалось сохранить: denied')
    expect(onAdded).not.toHaveBeenCalled()
    // typing clears the error
    await user.type(box, 'x')
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('WordSearchDialog · own word', () => {
  test('not found (pt): «Нет в словаре приложения», the form is prefilled with the query in lower case', async () => {
    const { user, box, dialog, onAdded, store } = setup()
    await user.type(box, 'Xyzzq')
    expect(await within(dialog).findByText('Нет в словаре приложения')).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Добавить своё слово' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Слово (pt-PT)')).toHaveValue('xyzzq')
    expect(within(dialog).getByLabelText('Перевод')).toHaveValue('')
    expect(within(dialog).getByRole('link', { name: /Infopédia/ })).toHaveAttribute('href', 'https://www.infopedia.pt/dicionarios/portugues-russo/xyzzq')

    // translation required
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить в словарь' }))
    expect(within(dialog).getByText('Введите перевод')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Перевод')).toHaveAttribute('aria-invalid', 'true')
    expect(onAdded).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Перевод'), 'штука')
    await user.selectOptions(within(dialog).getByLabelText('Часть речи'), 'noun')
    await user.selectOptions(within(dialog).getByLabelText('Род'), 'f')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить в словарь' }))
    expect(onAdded).toHaveBeenCalledTimes(1)
    expect(store.wordList()[0]).toMatchObject({ id: 'u:xyzzq', lemma: 'xyzzq', ru: 'штука', pos: 'noun', gender: 'f' })
  })

  test('not found (Russian): the translation is prefilled instead', async () => {
    const { user, box, dialog } = setup()
    await user.type(box, 'абракадабра')
    expect(await within(dialog).findByText('Нет в словаре приложения')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Слово (pt-PT)')).toHaveValue('')
    expect(within(dialog).getByLabelText('Перевод')).toHaveValue('абракадабра')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить в словарь' }))
    expect(within(dialog).getByText('Введите слово на португальском')).toBeInTheDocument()
  })

  test('«Добавить своё слово» opens the form from the search; same lemma already saved → «Дополнить слово»', async () => {
    const w = word('xyzzq', 'старое')
    const onAdded = vi.fn()
    const { user } = renderWithProviders(<WordSearchDialog onClose={() => {}} onAdded={onAdded} />, { seed: { words: [w], cards: [wordCard(w)] } })
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить своё слово' }))
    expect(within(dialog).getByRole('heading', { name: 'Своё слово' })).toBeInTheDocument()
    const lemma = within(dialog).getByLabelText('Слово (pt-PT)')
    await waitFor(() => expect(lemma).toHaveFocus())
    await user.type(lemma, 'xyzzq')
    expect(within(dialog).getByText(/^Уже в словаре:/)).toHaveTextContent('Уже в словаре: xyzzq. Сохранение добавит к нему этот источник.')
    expect(within(dialog).getByRole('button', { name: 'Дополнить слово' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
  })

  test('«Отмена» / «Закрыть» close', async () => {
    const { user, box, dialog, onClose } = setup()
    await user.type(box, 'qqqzz')
    await within(dialog).findByText('Нет в словаре приложения')
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
