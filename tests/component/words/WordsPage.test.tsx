import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { loadLexicon } from '@/engine/lexicon/lookup'
import { WordsPage } from '@/features/words/WordsPage'
import { NOW, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { stubAudioFetch } from '../../helpers/B-words-dom'
import { dictionarySeed } from '../../helpers/B-words-seed'

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

function Where() {
  const l = useLocation()
  return <output aria-label="url">{l.pathname + l.search}</output>
}

function setup(opts: { seed?: Seed; route?: string } = {}) {
  const r = renderWithProviders(
    <>
      <Routes>
        <Route path="/words" element={<WordsPage />} />
        <Route path="/words/:id" element={<p>word page</p>} />
      </Routes>
      <Where />
    </>,
    { seed: opts.seed ?? dictionarySeed(), route: opts.route ?? '/words' },
  )
  return r
}

const list = () => screen.getByRole('list', { name: 'Слова' })
const rowLinks = () => within(list()).getAllByRole('link').map((a) => a.textContent)
const url = () => screen.getByLabelText('url').textContent
const toast = () => screen.getAllByRole('status').find((s) => s.getAttribute('aria-live') === 'polite')!
const chip = (name: RegExp) => within(screen.getByRole('group', { name: 'Статус' })).getByRole('button', { name })

describe('WordsPage · list and panel', () => {
  test('rows newest first: pt with article, translation, meta line (level, next review, source), status pill', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Мой словарь' })).toBeInTheDocument()
    expect(rowLinks()).toEqual(['a saúde', 'o pão', 'a chávena', 'fixe', 'xyzzq'])
    const rows = within(list()).getAllByRole('listitem')
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/words/sa%C3%BAde%23noun')
    expect(rows[0]).toHaveTextContent('здоровье')
    expect(rows[0]).toHaveTextContent('A2 · из: Здоровье и медицина')
    expect(rows[1]).toHaveTextContent('пора повторить · из: В поликлинике (centro de saúde)')
    expect(rows[2]).toHaveTextContent(/A2 · повтор через 3\s?д/)
    expect(rows[3]).toHaveTextContent('A2 · добавлено вручную')
    expect(rows[4]).toHaveTextContent('добавлено вручную')
    expect(within(rows[0]).getAllByText('Новое').length).toBeGreaterThan(0)
    expect(within(rows[1]).getAllByText('Учу').length).toBeGreaterThan(0)
    expect(within(rows[3]).getAllByText('Знаю').length).toBeGreaterThan(0)
    expect(within(rows[4]).getAllByText('На паузе').length).toBeGreaterThan(0)
  })

  test('side panel counts by status and by card state', () => {
    setup()
    const panel = screen.getByRole('complementary', { name: 'Словарь' })
    const value = (dt: string) => within(panel).getByText(dt).nextElementSibling?.textContent
    expect(value('Всего слов')).toBe('5')
    expect(value('Новое')).toBe('1')
    expect(value('Учу')).toBe('2')
    expect(value('Знаю')).toBe('1')
    expect(value('На паузе')).toBe('1')
    expect(value('Ждут первого повторения')).toBe('1')
    expect(value('Пора повторить')).toBe('1')
    expect(value('Нет в словаре приложения')).toBe('1')
    expect(within(panel).getByRole('link', { name: 'К повторению' })).toHaveAttribute('href', '/review')
  })

  test('learn / review actions: «Учить новые (1)» sets ?learn=1, «Повторить слова (N)» links to the words deck', async () => {
    const { user } = setup()
    const review = screen.getByRole('link', { name: /^Повторить слова \(\d+\)$/ })
    expect(review).toHaveAttribute('href', '/review?deck=words')
    // the review tabs show the word count
    expect(screen.getByRole('link', { name: /Мой словарь/ })).toHaveTextContent('5')
    await user.click(screen.getByRole('button', { name: 'Учить новые (1)' }))
    expect(url()).toBe('/words?learn=1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Учить новые' })).toBeInTheDocument()
  })

  test('daily new-card limit reached: no «Учить новые», a note instead', () => {
    setup({ seed: dictionarySeed({ settings: { newCardsPerDay: 0 } }) })
    expect(screen.queryByRole('button', { name: /Учить новые/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Новых слов ждут: 1\. Лимит новых карточек на сегодня исчерпан \(0\)/)).toBeInTheDocument()
  })
})

describe('WordsPage · search and filters', () => {
  test('search is accent- and case-insensitive over pt, ru and the note; the live status counts', async () => {
    const { user } = setup()
    const box = screen.getByRole('searchbox', { name: 'Поиск по словарю' })
    await user.type(box, 'PAO')
    expect(rowLinks()).toEqual(['o pão'])
    expect(screen.getByText('Показано 1 слово из 5')).toBeInTheDocument()
    // status chips count within the search
    expect(chip(/^Все/)).toHaveTextContent('1')
    expect(chip(/^Учу/)).toHaveTextContent('1')
    expect(chip(/^Новые/)).toHaveTextContent('0')
    await user.clear(box)
    await user.type(box, 'чашк')
    expect(rowLinks()).toEqual(['a chávena'])
    await user.clear(box)
    await user.type(box, 'a sau')
    expect(rowLinks()).toEqual(['a saúde'])
  })

  test('status chips filter and write ?status=; «Все» clears it', async () => {
    const { user } = setup()
    expect(chip(/^Все/)).toHaveAttribute('aria-pressed', 'true')
    await user.click(chip(/^Учу/))
    expect(chip(/^Учу/)).toHaveAttribute('aria-pressed', 'true')
    expect(rowLinks()).toEqual(['o pão', 'a chávena'])
    expect(url()).toBe('/words?status=learning')
    await user.click(chip(/^Все/))
    expect(url()).toBe('/words')
    expect(rowLinks()).toHaveLength(5)
  })

  test('filters come from the URL; an unknown value is ignored', () => {
    setup({ route: '/words?status=paused&level=B9&source=zzz' })
    expect(rowLinks()).toEqual(['xyzzq'])
    expect(screen.getByLabelText('Уровень')).toHaveValue('all')
    expect(screen.getByLabelText('Источник')).toHaveValue('all')
  })

  test('level filter (with counts), «Без уровня»', async () => {
    const { user } = setup()
    const level = screen.getByLabelText('Уровень')
    expect(within(level).getByRole('option', { name: 'A2 · 4' })).toBeInTheDocument()
    expect(within(level).getByRole('option', { name: 'Без уровня · 1' })).toBeInTheDocument()
    await user.selectOptions(level, 'none')
    expect(rowLinks()).toEqual(['xyzzq'])
    expect(url()).toBe('/words?level=none')
    await user.selectOptions(level, 'A2')
    expect(rowLinks()).toEqual(['a saúde', 'o pão', 'a chávena', 'fixe'])
  })

  test('source filter: groups with counts, «Нет в словаре приложения»', async () => {
    const { user } = setup()
    const source = screen.getByLabelText('Источник')
    expect(within(source).getByRole('option', { name: 'Тематические словари · 1' })).toBeInTheDocument()
    expect(within(source).getByRole('option', { name: 'Вручную · 2' })).toBeInTheDocument()
    await user.selectOptions(source, 'reading')
    expect(rowLinks()).toEqual(['a chávena'])
    await user.selectOptions(source, 'situation')
    expect(rowLinks()).toEqual(['o pão'])
    await user.selectOptions(source, 'nolex')
    expect(rowLinks()).toEqual(['xyzzq'])
    await user.selectOptions(source, 'manual')
    expect(rowLinks()).toEqual(['fixe', 'xyzzq'])
  })

  test('nothing matches → empty state; «Сбросить фильтры» clears search and URL and focuses the search', async () => {
    const { user } = setup({ route: '/words?status=known' })
    const box = screen.getByRole('searchbox', { name: 'Поиск по словарю' })
    await user.type(box, 'zzz')
    expect(screen.getByText('Нет слов под этот фильтр')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Слова' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Проверить себя' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
    expect(box).toHaveValue('')
    expect(box).toHaveFocus()
    expect(url()).toBe('/words')
    expect(rowLinks()).toHaveLength(5)
  })
})

describe('WordsPage · row menu', () => {
  test('menu button pattern: opens with focus on the first item, arrows / Home / End move, Esc closes and returns focus', async () => {
    const { user } = setup()
    const btn = screen.getByRole('button', { name: 'Действия: o pão' })
    expect(btn).toHaveAttribute('aria-haspopup', 'menu')
    await user.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: 'Действия: o pão' })
    expect(btn).toHaveAttribute('aria-controls', menu.id)
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((i) => i.textContent?.trim())).toEqual(['Изменить', 'Знаю — не учить', 'Удалить'])
    expect(items[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()
    await user.keyboard('{End}')
    expect(items[2]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(items[0]).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(items[2]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(items[0]).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(btn).toHaveFocus()
  })

  test('ArrowDown on the button opens the menu; Tab or a click outside closes it', async () => {
    const { user } = setup()
    const btn = screen.getByRole('button', { name: 'Действия: a saúde' })
    btn.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Tab}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.click(btn)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.click(screen.getByRole('heading', { level: 1 }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('«Знаю — не учить» marks known (toast with undo); «Учить снова» unmarks', async () => {
    const { user, store } = setup()
    await user.click(screen.getByRole('button', { name: 'Действия: o pão' }))
    await user.click(screen.getByRole('menuitem', { name: 'Знаю — не учить' }))
    expect(await within(toast()).findByText('Отмечено как известное: o pão')).toBeInTheDocument()
    expect(store.wordList().find((w) => w.id === 'pão#noun')!.mark).toBe('known')
    expect(store.cardList().find((c) => c.id === 'lex:pão#noun:recognize')!.suspended).toBe(true)
    await user.click(within(toast()).getByRole('button', { name: 'Отменить' }))
    await waitFor(() => expect(store.wordList().find((w) => w.id === 'pão#noun')!.mark).toBeUndefined())

    await user.click(screen.getByRole('button', { name: 'Действия: fixe' }))
    await user.click(screen.getByRole('menuitem', { name: 'Учить снова' }))
    expect(await within(toast()).findByText('Снова учу: fixe')).toBeInTheDocument()
    expect(store.wordList().find((w) => w.id === 'fixe#adj')!.mark).toBeUndefined()
    expect(store.cardList().some((c) => c.id === 'lex:fixe#adj:recognize')).toBe(true)
  })

  test('«Удалить»: row and cards removed, focus to the neighbour\'s menu, toast undo restores', async () => {
    const { user, store } = setup()
    await user.click(screen.getByRole('button', { name: 'Действия: o pão' }))
    await user.click(screen.getByRole('menuitem', { name: 'Удалить' }))
    expect(await within(toast()).findByText('Удалено из словаря: o pão')).toBeInTheDocument()
    expect(rowLinks()).toEqual(['a saúde', 'a chávena', 'fixe', 'xyzzq'])
    expect(store.cardList().some((c) => c.wordId === 'pão#noun')).toBe(false)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Действия: a chávena' })).toHaveFocus())
    await user.click(within(toast()).getByRole('button', { name: 'Отменить' }))
    await waitFor(() => expect(rowLinks()).toEqual(['a saúde', 'o pão', 'a chávena', 'fixe', 'xyzzq']))
    expect(store.cardList().some((c) => c.wordId === 'pão#noun')).toBe(true)
  })

  test('deleting the last shown word moves focus to the search box', async () => {
    const { user } = setup({ route: '/words?status=paused' })
    await user.click(screen.getByRole('button', { name: 'Действия: xyzzq' }))
    await user.click(screen.getByRole('menuitem', { name: 'Удалить' }))
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Поиск по словарю' })).toHaveFocus())
  })

  test('a failed action shows a danger toast', async () => {
    const { user, store } = setup()
    vi.spyOn(store, 'saveWordBundle').mockRejectedValue(new Error('offline'))
    await user.click(screen.getByRole('button', { name: 'Действия: o pão' }))
    await user.click(screen.getByRole('menuitem', { name: 'Удалить' }))
    expect(await within(toast()).findByText('Не удалось сохранить: offline')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Действия: o pão' })).toBeEnabled()
  })

  test('«Изменить» opens the editor for the word', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Действия: a chávena' }))
    await user.click(screen.getByRole('menuitem', { name: 'Изменить' }))
    const dlg = screen.getByRole('dialog', { name: 'Изменить слово' })
    expect(within(dlg).getByLabelText('Слово (pt-PT)')).toHaveValue('chávena')
    await user.click(within(dlg).getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('dialog', { name: 'Изменить слово' })).not.toBeInTheDocument()
  })
})

describe('WordsPage · add, import, quiz, empty', () => {
  test('«Добавить слово» → search dialog → added word appears, toast with undo', async () => {
    const { user, store } = setup()
    await user.click(screen.getAllByRole('button', { name: 'Добавить слово' })[0])
    const dlg = screen.getByRole('dialog', { name: 'Добавить слово' })
    await user.type(within(dlg).getByRole('searchbox'), 'casa')
    await user.click(await within(dlg).findByRole('button', { name: 'Добавить «a casa» в словарь' }))
    expect(screen.queryByRole('dialog', { name: 'Добавить слово' })).not.toBeInTheDocument()
    expect(within(toast()).getByText('Добавлено в словарь: a casa')).toBeInTheDocument()
    expect(rowLinks()[0]).toBe('a casa')
    await user.click(within(toast()).getByRole('button', { name: 'Отменить' }))
    await waitFor(() => expect(store.wordList()).toHaveLength(5))
  })

  test('?add=1 opens the add dialog; closing it drops the parameter', async () => {
    const { user } = setup({ route: '/words?add=1&status=new' })
    const dlg = screen.getByRole('dialog', { name: 'Добавить слово' })
    await user.click(within(dlg).getByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('dialog', { name: 'Добавить слово' })).not.toBeInTheDocument()
    expect(url()).toBe('/words?status=new')
  })

  test('«Импорт списка» → import dialog → toast «Добавлено в словарь: 2 слова»', async () => {
    const { user, store } = setup()
    await user.click(screen.getByRole('button', { name: 'Импорт списка' }))
    const dlg = screen.getByRole('dialog', { name: 'Импорт списка' })
    await user.click(within(dlg).getByLabelText('Список слов'))
    await user.paste('casa — дом\nqwvvx — нечто')
    await user.click(within(dlg).getByRole('button', { name: 'Разобрать (2)' }))
    await user.click(within(dlg).getByRole('button', { name: 'Добавить 2 слова' }))
    expect(screen.queryByRole('dialog', { name: 'Импорт списка' })).not.toBeInTheDocument()
    expect(within(toast()).getByText('Добавлено в словарь: 2 слова')).toBeInTheDocument()
    expect(store.wordList()).toHaveLength(7)
  })

  test('«Проверить себя» → «Не знаю» on a reviewed word rates its PT→RU card «Снова»', async () => {
    const { user, store } = setup({ route: '/words?status=learning' })
    await user.click(screen.getByRole('button', { name: 'Проверить себя' }))
    const quiz = screen.getByRole('region', { name: 'Самопроверка' })
    const before = new Map(store.cardList().map((c) => [c.id, c.fsrs.reps]))
    await user.click(within(quiz).getByRole('button', { name: 'Показать ответ' }))
    await user.click(within(quiz).getByRole('button', { name: /Не знаю/ }))
    await waitFor(() =>
      expect(store.cardList().some((c) => (c.id === 'lex:pão#noun:recognize' || c.id === 'lex:chávena#noun:recognize') && c.fsrs.reps > before.get(c.id)!)).toBe(true),
    )
    const rated = store.cardList().find((c) => c.fsrs.reps > (before.get(c.id) ?? 0))!
    expect(rated.fsrs.lapses).toBeGreaterThan(0)
  })

  test('empty dictionary: explanation and the three ways in', async () => {
    const { user } = setup({ seed: {} })
    expect(screen.getByText('Словарь пока пуст')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Тематические словари' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Словарь' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Импорт списка' }))
    expect(screen.getByRole('dialog', { name: 'Импорт списка' })).toBeInTheDocument()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }))
    await user.click(screen.getByRole('button', { name: 'Добавить слово' }))
    expect(screen.getByRole('dialog', { name: 'Добавить слово' })).toBeInTheDocument()
  })
})
