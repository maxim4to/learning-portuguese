/**
 * CardList («Все карточки»): kind chips with counts, topic select (topics / «Мой словарь» / «Без темы»), text search,
 * newest-first order, per-row status labels, suspend / resume, delete with «Отменить» and focus hand-off.
 */
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getTopic } from '@/content'
import { useCards } from '@/data'
import type { SrsCard } from '@/data/types.ts'
import { CardList } from '@/features/srs/CardList'
import { LISTEN_MARK } from '@/features/srs/kinds'
import { DAY, NOW, card, fsrs, fsrsNew, wordCard } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { casa, flush, freezeDate } from '../../helpers/B-srs-fixtures'

const onChanged = vi.fn()
function Host() {
  return <CardList cards={useCards()} onChanged={onChanged} />
}

const at = (d: number) => NOW - d * DAY
const cards: SrsCard[] = [
  card('ph:1', { kind: 'phrase', front: 'Добрый день', back: 'Bom dia', topicId: 'a1-ser-estar', createdAt: at(5) }),
  card('gr:1', { kind: 'grammar', front: 'Я устал', back: 'Estou cansado', topicId: 'a1-ser-estar', createdAt: at(4), fsrs: fsrs({ lapses: 2 }) }),
  card('error:x', { kind: 'error', front: `${LISTEN_MARK} Até logo`, back: 'Até logo', createdAt: at(3), fsrs: fsrs({ due: NOW + 3 * DAY }) }),
  card('ph:2', { kind: 'phrase', front: 'Спасибо', back: 'Obrigado', createdAt: at(2), suspended: true }),
  wordCard(casa, 'recognize', { front: 'a casa', back: 'дом', createdAt: at(1), fsrs: fsrsNew() }),
]

function setup(list = cards) {
  return renderWithProviders(<Host />, { seed: { cards: list, words: [casa] } })
}
const rows = () => within(screen.getByRole('list')).getAllByRole('listitem')
const firstLines = () => rows().map((r) => r.querySelector('p')!.textContent)

beforeEach(() => {
  freezeDate(NOW)
  onChanged.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('CardList · filters', () => {
  test('all cards newest first, with per-row details', () => {
    setup()
    expect(firstLines()).toEqual(['a casa', 'Спасибо', 'Até logo', 'Я устал', 'Добрый день'])
    const [w, susp, dict, gr, ph] = rows()
    expect(w).toHaveTextContent('Слово · PT → RU')
    expect(w).toHaveTextContent('новая')
    expect(within(w).getByRole('link', { name: '· Открыть слово' })).toHaveAttribute('href', `/words/${encodeURIComponent(casa.id)}`)
    expect(within(w).getByText('дом')).not.toHaveAttribute('lang') // RU back of a PT → RU card
    expect(susp).toHaveTextContent('приостановлена')
    expect(within(dict).getByLabelText('Диктант')).toBeInTheDocument()
    expect(dict).toHaveTextContent('через 3 д')
    expect(gr).toHaveTextContent('к повторению')
    expect(gr).toHaveTextContent('· ошибок 2')
    expect(gr).toHaveTextContent(`· ${getTopic('a1-ser-estar')!.title}`)
    expect(within(ph).getByText('Bom dia')).toHaveAttribute('lang', 'pt-PT')
  })

  test('kind chips show counts and filter; «Все» resets', async () => {
    const { user } = setup()
    const chips = screen.getByRole('group', { name: 'Тип карточек' })
    const chip = (name: RegExp) => within(chips).getByRole('button', { name })
    expect(chip(/^Все/)).toHaveTextContent('Все5')
    expect(chip(/^Все/)).toHaveAttribute('aria-pressed', 'true')
    expect(chip(/^Слова/)).toHaveTextContent('Слова1')
    expect(chip(/^Фразы/)).toHaveTextContent('Фразы2')
    expect(chip(/^Грамматика/)).toHaveTextContent('Грамматика1')
    expect(chip(/^Ошибки/)).toHaveTextContent('Ошибки1')
    await user.click(chip(/^Фразы/))
    expect(chip(/^Фразы/)).toHaveAttribute('aria-pressed', 'true')
    expect(firstLines()).toEqual(['Спасибо', 'Добрый день'])
    await user.click(chip(/^Все/))
    expect(rows()).toHaveLength(5)
  })

  test('topic select: a topic, «Мой словарь», «Без темы»', async () => {
    const { user } = setup()
    const select = screen.getByRole('combobox', { name: 'Тема' })
    const opts = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(opts).toEqual(['Все темы', 'Мой словарь', 'Без темы', getTopic('a1-ser-estar')!.title])
    await user.selectOptions(select, 'a1-ser-estar')
    expect(firstLines()).toEqual(['Я устал', 'Добрый день'])
    await user.selectOptions(select, 'words')
    expect(firstLines()).toEqual(['a casa'])
    await user.selectOptions(select, 'none')
    expect(firstLines()).toEqual(['Спасибо', 'Até logo'])
  })

  test('search matches front or back, case-insensitively; no match → empty state', async () => {
    const { user } = setup()
    const search = screen.getByRole('searchbox', { name: 'Поиск по карточкам' })
    await user.type(search, 'OBRIG')
    expect(firstLines()).toEqual(['Спасибо'])
    await user.clear(search)
    await user.type(search, 'устал')
    expect(firstLines()).toEqual(['Я устал'])
    await user.type(search, 'zzz')
    expect(screen.getByText('Нет карточек под фильтр')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('CardList · actions', () => {
  test('suspend / resume writes the card and calls onChanged', async () => {
    const { user, store } = setup()
    await user.click(screen.getByRole('button', { name: 'Приостановить «Добрый день»' }))
    await flush()
    // A hand pause is flagged so automatic resumes (word / settings modes) leave it paused (A-20).
    expect(store.cardList().find((c) => c.id === 'ph:1')).toMatchObject({ suspended: true, pausedByUser: true, updatedAt: NOW })
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(rows().at(-1)).toHaveTextContent('приостановлена')

    await user.click(screen.getByRole('button', { name: 'Вернуть «Спасибо» в повторение' }))
    await flush()
    expect(store.cardList().find((c) => c.id === 'ph:2')).not.toHaveProperty('suspended')
    expect(store.cardList().find((c) => c.id === 'ph:2')).not.toHaveProperty('pausedByUser')
    expect(screen.getByRole('button', { name: 'Приостановить «Спасибо»' })).toBeInTheDocument()
  })

  test('delete removes the card at once, focus moves to the next row; «Отменить» restores it', async () => {
    const { user, store } = setup()
    await user.click(screen.getByRole('button', { name: 'Удалить «Я устал»' }))
    await flush()
    expect(store.cardList().some((c) => c.id === 'gr:1')).toBe(false)
    expect(firstLines()).not.toContain('Я устал')
    expect(screen.getByRole('button', { name: 'Удалить «Добрый день»' })).toHaveFocus()
    expect(screen.getByText('Карточка «Я устал» удалена')).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Отменить' }))
    await flush()
    expect(store.cardList().find((c) => c.id === 'gr:1')).toMatchObject({ front: 'Я устал', fsrs: { lapses: 2 } })
    expect(firstLines()).toContain('Я устал')
  })

  test('deleting the last row moves focus to the previous one; the only row → the search box', async () => {
    const two = cards.slice(0, 2)
    const { user } = setup(two)
    await user.click(screen.getByRole('button', { name: 'Удалить «Добрый день»' })) // last (oldest)
    await flush()
    expect(screen.getByRole('button', { name: 'Удалить «Я устал»' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Удалить «Я устал»' }))
    await flush()
    expect(screen.getByRole('searchbox', { name: 'Поиск по карточкам' })).toHaveFocus()
    expect(screen.getByText('Нет карточек под фильтр')).toBeInTheDocument()
  })
})
