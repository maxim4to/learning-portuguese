import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { loadLexicon } from '@/engine/lexicon/lookup'
import { wordHref } from '@/features/words/source'
import { WordPage } from '@/features/words/WordPage'
import { NOW, fsrsNew, word, wordCard, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { stubAudioFetch } from '../../helpers/B-words-dom'
import { chavena, dictionarySeed, fixe, saude, xyzzq } from '../../helpers/B-words-seed'

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
  vi.restoreAllMocks()
})

function setup(id: string, seed: Seed = dictionarySeed()) {
  return renderWithProviders(
    <Routes>
      <Route path="/words/:id" element={<WordPage />} />
      <Route path="/words" element={<p>list page</p>} />
    </Routes>,
    { seed, route: wordHref(id) },
  )
}

const toast = () => screen.getAllByRole('status').find((s) => s.getAttribute('aria-live') === 'polite')!
const section = (name: string) => screen.getByRole('region', { name })
const modeRow = (label: string) =>
  within(section('Карточки'))
    .getAllByRole('listitem')
    .find((li) => li.querySelector('p')?.textContent?.match(/^Шаг \d: (.+)$/)?.[1] === label) as HTMLElement
const fact = (dt: string) => within(screen.getByRole('complementary', { name: 'О слове' })).getByText(dt).nextElementSibling as HTMLElement

describe('WordPage', () => {
  test('unknown id → «Слово не найдено» with a way back', () => {
    setup('nope#noun')
    expect(screen.getByRole('heading', { level: 1, name: 'Слово не найдено' })).toBeInTheDocument()
    expect(screen.getByText('Этого слова нет в словаре')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Открыть словарь' })).toHaveAttribute('href', '/words')
  })

  test('new lexicon word: header, translation, source, cards by stage, facts and themes', async () => {
    setup(saude.id)
    expect(screen.getByRole('heading', { level: 1, name: 'a saúde' })).toHaveAttribute('lang', 'pt-PT')
    expect(screen.getByText('существительное · женский род (a)')).toBeInTheDocument()
    expect(within(section('Перевод')).getByText('здоровье')).toBeInTheDocument()
    expect(within(section('Перевод')).queryByText(/нет в словаре приложения/)).not.toBeInTheDocument()

    const src = section('Где встретилось')
    expect(within(src).getByRole('link', { name: 'Тема «Здоровье и медицина»' })).toHaveAttribute('href', expect.stringContaining('saude'))
    expect(within(src).getByText('18 октября 2026 г.')).toBeInTheDocument()

    const cards = section('Карточки')
    expect(within(cards).getByText('1 из 4 · открываются по очереди')).toBeInTheDocument()
    expect(modeRow('PT → RU')).toHaveTextContent('новая карточка')
    expect(modeRow('PT → RU')).toHaveTextContent('Ждёт первого повторения')
    expect(modeRow('RU → PT')).toHaveTextContent('Откроется после первого успешного повторения PT → RU')
    expect(modeRow('RU → PT')).toHaveTextContent('закрыта')
    expect(modeRow('Пропуск в предложении')).toHaveTextContent('Нужен пример из источника')
    expect(modeRow('На слух')).toHaveTextContent('Нет записи и голоса pt-PT на этом устройстве')
    expect(within(cards).getByRole('link', { name: 'К повторению' })).toHaveAttribute('href', '/review')

    expect(fact('Уровень')).toHaveTextContent('A2')
    expect(fact('Часть речи')).toHaveTextContent('существительное')
    expect(fact('Род')).toHaveTextContent('женский род (a)')
    expect(fact('Карточек')).toHaveTextContent('1')
    expect(fact('Добавлено')).toHaveTextContent('18 октября 2026 г.')
    expect(fact('В словаре приложения')).toHaveTextContent('есть')
    expect(within(fact('Статус')).getByText('Новое')).toBeInTheDocument()

    // lexicon themes
    const aside = screen.getByRole('complementary', { name: 'О слове' })
    expect(await within(aside).findByText('Есть в темах')).toBeInTheDocument()
    expect(within(aside).getByRole('link', { name: 'Здоровье и медицина' })).toBeInTheDocument()
  })

  test('«Другие слова темы»: up to 5 missing theme words, «в словарь» saves one and it stays listed', async () => {
    const { user, store } = setup(saude.id)
    const block = await screen.findByRole('region', { name: 'Другие слова темы' })
    const items = within(block).getAllByRole('listitem')
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(5)
    expect(within(block).getByText(/^В словаре \d+ из \d+ слов/)).toBeInTheDocument()
    const before = store.wordList().length
    const add = within(items[0]).getByRole('button')
    await user.click(add)
    await waitFor(() => expect(store.wordList().length).toBe(before + 1))
    expect(within(block).getAllByRole('listitem')).toHaveLength(items.length)
    expect(store.wordList().some((w) => w.sources.some((s) => s.src.startsWith('vocab:saude')))).toBe(true)
  })

  test('learning word: the review schedule, unlocked-but-not-created modes, the example sentence as pt text', () => {
    setup(chavena.id)
    expect(modeRow('PT → RU')).toHaveTextContent(/Повтор через 3\s?д/)
    expect(modeRow('PT → RU')).toHaveTextContent(/держится ≈ 6\s?д · повторений 3 · ошибок 1/)
    expect(modeRow('RU → PT')).toHaveTextContent('Условие выполнено — карточка появится после следующего повторения')
    expect(modeRow('RU → PT')).toHaveTextContent('скоро')
    expect(modeRow('Пропуск в предложении')).toHaveTextContent('скоро')
    const src = section('Где встретилось')
    expect(within(src).getByRole('link', { name: /^Текст «.+» · абзац 2$/ })).toBeInTheDocument()
    const sentence = within(src).getByText('Bebo uma chávena de café.')
    expect(sentence).toHaveAttribute('lang', 'pt-PT')
    expect(sentence).toHaveAttribute('data-pt-src', 'reading:a2-a-minha-rotina:paragraph:1')
  })

  test('known word: «Учить снова», modes disabled because of the mark', async () => {
    const { user, store } = setup(fixe.id)
    expect(within(fact('Статус')).getByText('Знаю')).toBeInTheDocument()
    expect(modeRow('PT → RU')).toHaveTextContent('Слово отмечено как известное')
    expect(within(section('Карточки')).queryByRole('link', { name: 'К повторению' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Учить снова' }))
    expect(await within(toast()).findByText('Снова учу: fixe')).toBeInTheDocument()
    expect(store.wordList().find((w) => w.id === fixe.id)!.mark).toBeUndefined()
    expect(await screen.findByRole('button', { name: 'Знаю — не учить' })).toBeInTheDocument()
  })

  test('paused user word (no lexicon id): own translation note, dictionary links, suspended card, tutor source', () => {
    setup(xyzzq.id)
    expect(screen.getByText('Этого слова нет в словаре приложения — перевод ваш.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Priberam/ })).toHaveAttribute('href', 'https://dicionario.priberam.org/xyzzq')
    expect(modeRow('PT → RU')).toHaveTextContent('Приостановлена')
    expect(within(section('Где встретилось')).getByText('Из беседы с агентом')).toBeInTheDocument()
    expect(within(section('Где встретилось')).queryByRole('link')).not.toBeInTheDocument()
    expect(fact('В словаре приложения')).toHaveTextContent('нет')
    expect(fact('Уровень')).toHaveTextContent('—')
  })

  test('several meanings are a numbered list; a note is shown; mode switches by settings and by word', () => {
    const w = word('pão', 'хлеб; булка', { lexId: 'pão#noun', pos: 'noun', gender: 'm', note: 'no café', modes: ['recognize', 'cloze', 'listen'], sources: [] })
    setup(w.id, { words: [w], cards: [wordCard(w, 'recognize', { fsrs: fsrsNew() })], settings: { wordModes: ['recognize', 'produce', 'cloze'] } })
    const m = section('Значения')
    expect(within(m).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['хлеб', 'булка'])
    expect(within(m).getByText('no café')).toBeInTheDocument()
    expect(modeRow('RU → PT')).toHaveTextContent('Выключено для этого слова')
    expect(modeRow('На слух')).toHaveTextContent('Выключено в настройках для всех слов')
    expect(within(section('Где встретилось')).getByText('Источник не сохранён.')).toBeInTheDocument()
  })

  test('«Знаю — не учить» marks known with an undo toast', async () => {
    const { user, store } = setup(saude.id)
    await user.click(screen.getByRole('button', { name: 'Знаю — не учить' }))
    expect(await within(toast()).findByText('Отмечено как известное: a saúde')).toBeInTheDocument()
    expect(await within(fact('Статус')).findByText('Знаю')).toBeInTheDocument()
    await user.click(within(toast()).getByRole('button', { name: 'Отменить' }))
    await waitFor(() => expect(store.wordList().find((w) => w.id === saude.id)!.mark).toBeUndefined())
  })

  test('«Удалить из словаря» deletes, goes back to the list and offers undo', async () => {
    const { user, store } = setup(saude.id)
    await user.click(screen.getByRole('button', { name: 'Удалить из словаря' }))
    expect(await screen.findByText('list page')).toBeInTheDocument()
    expect(within(toast()).getByText('Удалено из словаря: a saúde')).toBeInTheDocument()
    expect(store.wordList().some((w) => w.id === saude.id)).toBe(false)
    await user.click(within(toast()).getByRole('button', { name: 'Отменить' }))
    await waitFor(() => expect(store.wordList().some((w) => w.id === saude.id)).toBe(true))
  })

  test('a failed action shows a danger toast and stays on the page', async () => {
    const { user, store } = setup(saude.id)
    vi.spyOn(store, 'saveWordBundle').mockRejectedValue(new Error('offline'))
    await user.click(screen.getByRole('button', { name: 'Удалить из словаря' }))
    expect(await within(toast()).findByText('Не удалось сохранить: offline')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'a saúde' })).toBeInTheDocument()
  })

  test('«Изменить» opens the editor; saving updates the page', async () => {
    const { user } = setup(saude.id)
    await user.click(screen.getAllByRole('button', { name: 'Изменить' })[0])
    const dlg = screen.getByRole('dialog', { name: 'Изменить слово' })
    const ru = within(dlg).getByLabelText('Перевод')
    await user.clear(ru)
    await user.type(ru, 'здоровье; самочувствие')
    await user.click(within(dlg).getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('region', { name: 'Значения' })).toHaveTextContent('самочувствие')
  })
})
