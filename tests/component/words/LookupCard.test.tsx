import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { loadLexicon } from '@/engine/lexicon/lookup'
import { LookupCard } from '@/features/words/capture/LookupCard'
import { NOW, word, wordCard, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { installRangeGeometry, ptBlock, removeMain, stubAudioFetch, targetFor } from '../../helpers/B-words-dom'

beforeAll(async () => {
  installRangeGeometry()
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
  vi.restoreAllMocks()
  removeMain()
})

function card(text: string, w: string, opts: { attrs?: Record<string, string>; seed?: Seed; multi?: boolean } = {}) {
  const block = ptBlock(text, opts.attrs)
  const target = targetFor(block, w, { multi: opts.multi })
  const onClose = vi.fn()
  const onPickWord = vi.fn()
  const r = renderWithProviders(<LookupCard target={target} titleId="lookup-title" onClose={onClose} onPickWord={onPickWord} />, { seed: opts.seed })
  return { ...r, onClose, onPickWord, target, block }
}

const heading = () => screen.getByRole('heading', { level: 2 })
const toast = () => screen.getAllByRole('status').find((s) => s.getAttribute('aria-live') === 'polite')!

describe('LookupCard · known word', () => {
  test('noun: lemma with article, part of speech, gender, level, meaning and the sentence with its translation', async () => {
    card('A saúde é importante.', 'saúde', { attrs: { 'data-pt-ru': 'Здоровье важно.', 'data-pt-src': 'vocab:saude' } })
    expect(heading()).toHaveTextContent('a saúde')
    expect(heading()).toHaveAttribute('id', 'lookup-title')
    expect(screen.getByText('существительное')).toBeInTheDocument()
    expect(screen.getByText('A2')).toBeInTheDocument()
    expect(screen.getByText('здоровье')).toBeInTheDocument()
    // one meaning → no chips
    expect(screen.queryByText('Значения в словарь:')).not.toBeInTheDocument()
    // the sentence with the word in bold + the translation
    const b = screen.getByText('saúde', { selector: 'b' })
    expect(b.closest('p')).toHaveTextContent('A saúde é importante.')
    expect(screen.getByText('Здоровье важно.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /В словарь/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Знаю/ })).toBeEnabled()
  })

  test('«В словарь» saves the word with its source, shows the saved state, the toast and an in-card undo', async () => {
    const { user, store } = card('A saúde é importante.', 'saúde', { attrs: { 'data-pt-src': 'vocab:saude', 'data-pt-ru': 'Здоровье важно.' } })
    await user.click(screen.getByRole('button', { name: /В словарь/ }))
    expect(await screen.findByText('в вашем словаре')).toBeInTheDocument()
    expect(screen.getByText('Новое')).toBeInTheDocument()
    expect(within(toast()).getByText('Добавлено в словарь: a saúde')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Открыть в словаре' })
    expect(link).toHaveAttribute('href', '/words/sa%C3%BAde%23noun')

    const saved = store.wordList()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ id: 'saúde#noun', lexId: 'saúde#noun', lemma: 'saúde', ru: 'здоровье', pos: 'noun', gender: 'f', level: 'A2' })
    expect(saved[0].sources[0]).toMatchObject({ src: 'vocab:saude', form: 'saúde', sentence: 'A saúde é importante.', sentenceRu: 'Здоровье важно.' })
    expect(store.cardList().map((c) => c.id)).toEqual(['lex:saúde#noun:recognize'])
    // the same source already saved → no «Сохранить этот пример»
    expect(screen.queryByRole('button', { name: 'Сохранить этот пример' })).not.toBeInTheDocument()

    // in-card undo (a toast under a modal sheet can't be reached)
    const inCard = screen.getAllByRole('button', { name: 'Отменить' }).find((b) => !toast().contains(b))!
    await user.click(inCard)
    expect(await screen.findByRole('button', { name: /В словарь/ })).toBeInTheDocument()
    expect(store.wordList()).toHaveLength(0)
    expect(store.cardList()).toHaveLength(0)
  })

  test('«Знаю» saves the word as known, without cards', async () => {
    const { user, store } = card('Hoje tenho saúde.', 'saúde')
    await user.click(screen.getByRole('button', { name: /Знаю/ }))
    expect(await screen.findByText('в вашем словаре')).toBeInTheDocument()
    expect(screen.getByText('Знаю', { selector: 'span *, span' })).toBeInTheDocument()
    expect(within(toast()).getByText('Отмечено «Знаю»: a saúde')).toBeInTheDocument()
    expect(store.wordList()[0]).toMatchObject({ mark: 'known' })
    expect(store.cardList()).toHaveLength(0)
    // no src on the block → saved as manual
    expect(store.wordList()[0].sources[0].src).toBe('manual')
  })

  test('the toast «Отменить» also undoes the save', async () => {
    const { user, store } = card('Hoje tenho saúde.', 'saúde')
    await user.click(screen.getByRole('button', { name: /В словарь/ }))
    await screen.findByText('в вашем словаре')
    await user.click(within(toast()).getByRole('button', { name: 'Отменить' }))
    await waitFor(() => expect(store.wordList()).toHaveLength(0))
    expect(await screen.findByRole('button', { name: /В словарь/ })).toBeInTheDocument()
  })

  test('a word already saved: status, «Открыть в словаре» closes the card, «Сохранить этот пример» adds the new source', async () => {
    const w = word('saúde', 'здоровье', { lexId: 'saúde#noun', pos: 'noun', gender: 'f' })
    const { user, store, onClose } = card('Como está a saúde?', 'saúde', {
      attrs: { 'data-pt-src': 'situation:centro-de-saude:dialogue:2' },
      seed: { words: [w], cards: [wordCard(w)] },
    })
    expect(await screen.findByText('в вашем словаре')).toBeInTheDocument()
    expect(screen.getByText('Учу')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Сохранить этот пример' }))
    expect(await within(toast()).findByText('Пример сохранён')).toBeInTheDocument()
    expect(store.wordList()[0].sources.map((s) => s.src)).toEqual(['manual', 'situation:centro-de-saude:dialogue:2'])
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Сохранить этот пример' })).not.toBeInTheDocument())
    await user.click(screen.getByRole('link', { name: 'Открыть в словаре' }))
    expect(onClose).toHaveBeenCalled()
  })

  test('several meanings: chips choose which go into the dictionary; none chosen disables saving', async () => {
    const { user, store } = card('A casa é grande.', 'casa')
    expect(screen.getByText('Значения в словарь:')).toBeInTheDocument()
    const chips = within(screen.getByRole('list', { name: 'Значения в словарь:' })).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual(['дом', 'квартира, жильё', 'em casa — дома'])
    chips.forEach((c) => expect(c).toHaveAttribute('aria-pressed', 'true'))

    for (const c of chips) await user.click(c)
    expect(screen.getByText('Выберите хотя бы одно значение.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /В словарь/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Знаю/ })).toBeDisabled()

    await user.click(chips[0])
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /В словарь/ }))
    await screen.findByText('в вашем словаре')
    expect(store.wordList()[0].ru).toBe('дом')
  })

  test('ambiguous form: «Другие разборы» switches the reading (casa → casar)', async () => {
    const { user } = card('Uma casa nova.', 'casa')
    expect(screen.getByText('Другие разборы:')).toBeInTheDocument()
    const alt = screen.getByRole('button', { name: /^casar/ })
    expect(alt).toHaveAttribute('aria-pressed', 'false')
    expect(alt).toHaveTextContent('глагол')
    await user.click(alt)
    expect(heading()).toHaveTextContent(/casa\s*→\s*—?\s*casar/)
    expect(screen.getByRole('button', { name: /^casar/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/от «casar»/)).toBeInTheDocument()
  })

  test('contraction: «do = de + o»', () => {
    card('Venho do mercado.', 'do')
    expect(screen.getByText('стяжение: do = de + o')).toBeInTheDocument()
    expect(heading()).toHaveTextContent(/do.*de/)
  })

  test('clitic: «levanto-me» → levantar-se first, with the breakdown', () => {
    card('Eu levanto-me cedo.', 'levanto-me')
    expect(heading()).toHaveTextContent(/levanto-me.*levantar-se/)
    expect(screen.getByText(/^levanto-me = levanto \+ me · /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^levantarглагол/ })).toBeInTheDocument()
  })

  test('inflected form: «pães» → plural of «o pão»', () => {
    card('Comprei dois pães.', 'pães')
    expect(heading()).toHaveTextContent(/pães.*o pão/)
    expect(screen.getByText(/от «o pão»/)).toBeInTheDocument()
  })

  test('approximate match is flagged «возможно»', () => {
    card('Nós falavamos muito.', 'falavamos')
    expect(heading()).toHaveTextContent(/falar/)
    expect(screen.getByText('возможно')).toBeInTheDocument()
  })

  test('Brazilian form points to the pt-PT word', () => {
    card('Apanhei o ônibus.', 'ônibus')
    expect(screen.getByText('бразильский вариант; в Португалии — «o autocarro»')).toBeInTheDocument()
  })

  test('expression around the word comes first («casa de banho»)', async () => {
    const { user } = card('Onde fica a casa de banho?', 'casa')
    expect(heading()).toHaveTextContent('a casa de banho')
    expect(screen.getByText('выражение со словом «casa»')).toBeInTheDocument()
    expect(screen.getByText('Выражение или слово:')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^casaсуществительное/ }))
    expect(heading()).toHaveTextContent('a casa')
  })

  test('save failure is reported in the card', async () => {
    const { user, store } = card('Hoje tenho saúde.', 'saúde')
    vi.spyOn(store, 'saveWordBundle').mockRejectedValue(new Error('offline'))
    await user.click(screen.getByRole('button', { name: /В словарь/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить: offline')
    expect(screen.getByRole('button', { name: /В словарь/ })).toBeEnabled()
  })

  test('«Закрыть» calls onClose', async () => {
    const { user, onClose } = card('Hoje tenho saúde.', 'saúde')
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('LookupCard · «Все слова фразы»', () => {
  test('lists the sentence words, marks the current one, picks another by block offsets', async () => {
    const { user, onPickWord } = card('Bom dia. Eu como pão.', 'pão')
    const toggle = screen.getByRole('button', { name: 'Все слова фразы' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const list = screen.getByRole('list', { name: 'Слова фразы' })
    const buttons = within(list).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Eu', 'como', 'pão'])
    expect(buttons[2]).toHaveAttribute('aria-current', 'true')
    expect(buttons[0]).not.toHaveAttribute('aria-current')
    await user.click(buttons[1])
    // «como» starts at 12 in the block text «Bom dia. Eu como pão.»
    expect(onPickWord).toHaveBeenCalledWith(12, 16)
  })

  test('opens expanded with initialWords', () => {
    const block = ptBlock('Eu como pão.')
    const target = targetFor(block, 'pão')
    renderWithProviders(<LookupCard target={target} titleId="t" initialWords onClose={() => {}} onPickWord={() => {}} />)
    expect(screen.getByRole('list', { name: 'Слова фразы' })).toBeInTheDocument()
  })
})

describe('LookupCard · word not in the lexicon', () => {
  test('form: lemma prefilled from the form, translation required, saves as a user word', async () => {
    const { user, store } = card('O xyzzq chegou.', 'xyzzq', { attrs: { 'data-pt-ru': 'Пришёл xyzzq.', 'data-pt-src': 'reading:x:paragraph:0' } })
    expect(heading()).toHaveTextContent('xyzzq')
    expect(screen.getByText(/^Нет в словаре приложения/)).toBeInTheDocument()
    // external dictionaries
    expect(screen.getByRole('link', { name: /Infopédia/ })).toHaveAttribute('href', 'https://www.infopedia.pt/dicionarios/portugues-russo/xyzzq')
    expect(screen.getByRole('link', { name: /Priberam/ })).toHaveAttribute('href', 'https://dicionario.priberam.org/xyzzq')

    await user.click(screen.getByRole('button', { name: /В словарь/ }))
    const lemma = screen.getByLabelText('Слово (начальная форма)')
    expect(lemma).toHaveValue('xyzzq')
    const ru = screen.getByLabelText('Перевод')
    expect(ru).toHaveFocus()
    expect(screen.getByText('Подсказка — перевод фразы: Пришёл xyzzq.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Сохранить/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Введите перевод')
    await user.clear(lemma)
    await user.click(screen.getByRole('button', { name: /Сохранить/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Введите слово на португальском')

    await user.type(lemma, 'Xyzzq')
    await user.type(ru, 'штуковина')
    await user.click(screen.getByRole('button', { name: /Сохранить/ }))
    expect(await screen.findByText('в вашем словаре: штуковина')).toBeInTheDocument()
    const w = store.wordList()[0]
    expect(w).toMatchObject({ id: 'u:xyzzq', lemma: 'xyzzq', ru: 'штуковина' })
    expect(w.lexId).toBeUndefined()
    expect(w.sources[0]).toMatchObject({ src: 'reading:x:paragraph:0', form: 'xyzzq', sentenceRu: 'Пришёл xyzzq.' })
    expect(screen.getByRole('link', { name: 'Открыть в словаре' })).toHaveAttribute('href', '/words/u%3Axyzzq')

    // undo inside the card
    const inCard = screen.getAllByRole('button', { name: 'Отменить' }).find((b) => !toast().contains(b))!
    await user.click(inCard)
    await waitFor(() => expect(store.wordList()).toHaveLength(0))
  })

  test.fails('a failed save of an unknown word keeps the form and shows the error [BUG B-40]', async () => {
    const { user, store } = card('O xyzzq chegou.', 'xyzzq')
    vi.spyOn(store, 'saveWordBundle').mockRejectedValue(new Error('offline'))
    await user.click(screen.getByRole('button', { name: /В словарь/ }))
    await user.type(screen.getByLabelText('Перевод'), 'штука')
    await user.click(screen.getByRole('button', { name: /Сохранить/ }))
    // the learner must see that nothing was saved (and keep what they typed)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить: offline')
    expect(screen.getByLabelText('Перевод')).toHaveValue('штука')
  })

  test('«Отмена» hides the form', async () => {
    const { user } = card('O xyzzq chegou.', 'xyzzq')
    await user.click(screen.getByRole('button', { name: /В словарь/ }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByLabelText('Перевод')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /В словарь/ })).toBeInTheDocument()
  })

  test('a user word saved earlier shows its translation', async () => {
    const w = word('xyzzq', 'моя штука')
    card('O xyzzq chegou.', 'xyzzq', { seed: { words: [w], cards: [wordCard(w, 'recognize', { fsrs: { due: NOW, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0 } })] } })
    expect(await screen.findByText('в вашем словаре: моя штука')).toBeInTheDocument()
    expect(screen.getByText('Новое')).toBeInTheDocument()
  })

  test('multi-word selection keeps the whole text and marks no word as current', async () => {
    const { user } = card('Eu xyzzq qwvvx hoje.', 'xyzzq qwvvx', { multi: true })
    expect(heading()).toHaveTextContent('xyzzq qwvvx')
    await user.click(screen.getByRole('button', { name: 'Все слова фразы' }))
    const buttons = within(screen.getByRole('list', { name: 'Слова фразы' })).getAllByRole('button')
    buttons.forEach((b) => expect(b).not.toHaveAttribute('aria-current'))
    await act(async () => {})
  })
})
