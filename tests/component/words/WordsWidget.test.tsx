import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WordsWidget } from '@/features/words/WordsWidget'
import { NOW, type Seed } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { stubAudioFetch } from '../../helpers/B-words-dom'
import { dictionarySeed } from '../../helpers/B-words-seed'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  stubAudioFetch()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function setup(seed: Seed, opts: { capture?: boolean; newPerDay?: number } = {}) {
  return renderWithProviders(<WordsWidget now={NOW} newPerDay={opts.newPerDay ?? 15} />, { seed, capture: opts.capture })
}

describe('WordsWidget (dashboard)', () => {
  test('empty dictionary: how words get here; «Найти слово» only with word capture', async () => {
    const first = setup({})
    const card = screen.getByRole('region', { name: 'Мой словарь пока пуст' })
    expect(within(card).getByRole('link', { name: 'Открыть диалоги' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Найти слово' })).not.toBeInTheDocument()
    first.unmount()

    const { user } = setup({}, { capture: true })
    await user.click(screen.getByRole('button', { name: 'Найти слово' }))
    expect(await screen.findByRole('dialog', { name: 'Добавить слово' })).toBeInTheDocument()
  })

  test('with words: total, status counts (paused only when present), due today, learn link, recent words', () => {
    setup(dictionarySeed())
    const card = screen.getByRole('region', { name: 'Мой словарь' })
    expect(card).toHaveTextContent('5слов')
    expect(within(card).getByRole('img', { name: /^Слов в словаре: 5. Новое: 1/ })).toBeInTheDocument()
    const statuses = within(card).getByRole('list', { name: 'Слова по статусам' })
    expect(within(statuses).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Новое1', 'Учу2', 'Знаю1', 'На паузе1'])
    expect(within(card).getByText('Сегодня к повторению: 1 слово · новых ждут: 1')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Учить новые (1)' })).toHaveAttribute('href', '/words?learn=1')
    expect(within(card).getByRole('link', { name: 'Повторить слова (1)' })).toHaveAttribute('href', '/review?deck=words')
    expect(within(card).getByRole('link', { name: /Все слова/ })).toHaveAttribute('href', '/words')
    const recent = within(card).getByRole('heading', { name: 'Недавно добавлены' }).nextElementSibling as HTMLElement
    const links = within(recent).getAllByRole('link')
    expect(links).toHaveLength(4)
    expect(links[0]).toHaveTextContent('a saúdeздоровьеНовое')
    expect(links[0]).toHaveAttribute('href', '/words/sa%C3%BAde%23noun')
  })

  test('daily limit reached and nothing due', () => {
    const seed = dictionarySeed()
    seed.cards = seed.cards!.filter((c) => c.wordId !== 'pão#noun')
    setup(seed, { newPerDay: 0 })
    const card = screen.getByRole('region', { name: 'Мой словарь' })
    expect(within(card).getByText('Слов к повторению сегодня нет · новых ждут: 1 (лимит новых на сегодня исчерпан)')).toBeInTheDocument()
    expect(within(card).queryByRole('link', { name: /Учить новые/ })).not.toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Повторить слова' })).toBeInTheDocument()
  })

  test('no paused words → no «На паузе» entry', () => {
    const seed = dictionarySeed()
    seed.cards = seed.cards!.filter((c) => c.wordId !== 'u:xyzzq')
    seed.words = seed.words!.filter((w) => w.id !== 'u:xyzzq')
    setup(seed)
    const statuses = screen.getByRole('list', { name: 'Слова по статусам' })
    expect(within(statuses).queryByText('На паузе')).not.toBeInTheDocument()
  })
})
