/**
 * ReviewPicker (useReviewPicker + ReviewPickerBar / ReviewToggle / ReviewPickerConfirm), as used by topic examples and
 * situation phrases: per-row «Добавить» → «В повторении» + «Убрать», toast «Отменить», confirm before removing a card
 * with review history, counts in the bar, save / delete errors.
 */
import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SrsCard } from '@/data/types.ts'
import { ReviewPickerBar, ReviewPickerConfirm, ReviewToggle } from '@/features/srs/ReviewPicker'
import { useReviewPicker, type PickSpec } from '@/features/srs/useReviewPicker'
import { NOW, card, fsrs, fsrsNew } from '../../fixtures/seed'
import { renderWithProviders } from '../../helpers/render'
import { flush, freezeDate } from '../../helpers/B-srs-fixtures'

const SPECS: PickSpec[] = [
  { id: 'ex:a1-ser-estar:0', kind: 'grammar', front: 'Я из России', back: 'Sou da Rússia', topicId: 'a1-ser-estar' },
  { id: 'ex:a1-ser-estar:1', kind: 'grammar', front: 'Суп горячий', back: 'A sopa está quente', topicId: 'a1-ser-estar' },
  { id: 'ex:a1-ser-estar:2', kind: 'grammar', front: 'Я дома', back: 'Estou em casa', topicId: 'a1-ser-estar' },
]

function Host() {
  const picker = useReviewPicker(SPECS)
  return (
    <>
      <ReviewPickerBar picker={picker} noun={['примера', 'примеров', 'примеров']} />
      <ul>
        {SPECS.map((s) => (
          <li key={s.id}>
            {s.back} <ReviewToggle picker={picker} id={s.id} name={s.back} />
          </li>
        ))}
      </ul>
      <ReviewPickerConfirm picker={picker} />
    </>
  )
}

const setup = (cards: SrsCard[] = []) => renderWithProviders(<Host />, { seed: { cards } })
const addBtn = (name: string) => screen.getByRole('button', { name: `Добавить в повторение: «${name}»` })
const removeBtn = (name: string) => screen.getByRole('button', { name: `Убрать из повторения: «${name}»` })
const bar = () => screen.getByText((_, el) => el?.tagName === 'P' && el.getAttribute('aria-live') === 'polite')

beforeEach(() => freezeDate(NOW))
afterEach(() => vi.useRealTimers())

describe('ReviewPicker', () => {
  test('nothing in review: the bar suggests adding only unknown items; every row offers «Добавить»', () => {
    setup()
    expect(bar()).toHaveTextContent('Добавляйте в повторение только то, что ещё не знаете')
    for (const s of SPECS) expect(addBtn(s.back)).toBeEnabled()
  })

  test('existing cards are marked «В повторении»; the bar counts them («1 из 3»)', () => {
    setup([card(SPECS[1].id, { kind: 'grammar', front: SPECS[1].front, back: SPECS[1].back, fsrs: fsrsNew() }), card('other', {})])
    expect(bar()).toHaveTextContent(/В повторении: 1 из 3 примеров/)
    expect(removeBtn(SPECS[1].back)).toBeInTheDocument()
    expect(within(removeBtn(SPECS[1].back).parentElement!).getByText('В повторении')).toBeInTheDocument()
  })

  test('«Добавить» creates a new card from the spec, the row turns «В повторении», a toast offers «Отменить»', async () => {
    const { user, store } = setup()
    await user.click(addBtn(SPECS[0].back))
    await flush()
    const created = store.cardList().find((c) => c.id === SPECS[0].id)
    expect(created).toMatchObject({ kind: 'grammar', front: SPECS[0].front, back: SPECS[0].back, topicId: 'a1-ser-estar', createdAt: NOW })
    expect(created?.fsrs.state).toBe(0)
    expect(removeBtn(SPECS[0].back)).toBeEnabled()
    expect(bar()).toHaveTextContent(/В повторении: 1 из 3/)
    expect(screen.getByText('Добавлено в повторение')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Отменить' }))
    await flush()
    expect(store.cardList().some((c) => c.id === SPECS[0].id)).toBe(false)
    expect(addBtn(SPECS[0].back)).toBeInTheDocument()
  })

  test('«Убрать» on a never-reviewed card deletes it at once (no confirm)', async () => {
    const { user, store } = setup([card(SPECS[2].id, { kind: 'grammar', fsrs: fsrsNew() })])
    await user.click(removeBtn(SPECS[2].back))
    await flush()
    expect(store.cardList()).toHaveLength(0)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(addBtn(SPECS[2].back)).toBeEnabled()
  })

  // The replacing control is still disabled (picker.busy) when the `added` effect calls focus(), and the effect
  // does not run again once busy clears — keyboard focus falls to <body>.
  test.fails('keyboard focus moves from «Добавить» to «Убрать» [BUG B-20]', async () => {
    const { user } = setup()
    addBtn(SPECS[0].back).focus()
    await user.keyboard('{Enter}')
    await flush()
    expect(removeBtn(SPECS[0].back)).toHaveFocus()
  })

  test.fails('keyboard focus moves from «Убрать» back to «Добавить» [BUG B-20]', async () => {
    const { user } = setup([card(SPECS[2].id, { kind: 'grammar', fsrs: fsrsNew() })])
    removeBtn(SPECS[2].back).focus()
    await user.keyboard('{Enter}')
    await flush()
    expect(addBtn(SPECS[2].back)).toHaveFocus()
  })

  test('«Убрать» on a card with history asks first: «Оставить» keeps it, «Убрать» deletes it', async () => {
    const reviewed = card(SPECS[0].id, { kind: 'grammar', front: SPECS[0].front, back: SPECS[0].back, fsrs: fsrs({ reps: 3 }) })
    const { user, store } = setup([reviewed])
    await user.click(removeBtn(SPECS[0].back))
    const dlg = screen.getByRole('alertdialog', { name: 'Убрать из повторения?' })
    expect(dlg).toHaveAccessibleDescription(/Карточка «Sou da Rússia» уже повторялась \(3 раза\)\. Её прогресс будет потерян\./)
    expect(within(dlg).getByRole('button', { name: 'Оставить' })).toHaveFocus()
    await user.click(within(dlg).getByRole('button', { name: 'Оставить' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(store.cardList()).toHaveLength(1)

    await user.click(removeBtn(SPECS[0].back))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Убрать' }))
    await flush()
    expect(store.cardList()).toHaveLength(0)
    expect(addBtn(SPECS[0].back)).toBeInTheDocument()
  })

  test('a lapsed card with reps 0 but a last review also asks first', async () => {
    const { user } = setup([card(SPECS[0].id, { kind: 'grammar', back: SPECS[0].back, fsrs: fsrs({ reps: 0, last_review: NOW - 1 }) })])
    await user.click(removeBtn(SPECS[0].back))
    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(/уже повторялась \(0 раз\)/)
  })

  test('a failed save shows the error in the bar and no toast; the row stays «Добавить»', async () => {
    const { user, store } = setup()
    vi.spyOn(store, 'upsertCards').mockRejectedValue(new Error('offline'))
    await user.click(addBtn(SPECS[0].back))
    await flush()
    expect(bar()).toHaveTextContent('· Не удалось сохранить: offline')
    expect(screen.queryByText('Добавлено в повторение')).not.toBeInTheDocument()
    expect(addBtn(SPECS[0].back)).toBeEnabled()
  })

  test('a failed delete shows «Не удалось удалить»', async () => {
    const { user, store } = setup([card(SPECS[0].id, { kind: 'grammar', fsrs: fsrsNew() })])
    vi.spyOn(store, 'deleteCards').mockRejectedValue(new Error('denied'))
    await user.click(removeBtn(SPECS[0].back))
    await flush()
    expect(bar()).toHaveTextContent('Не удалось удалить: denied')
    expect(removeBtn(SPECS[0].back)).toBeInTheDocument()
  })
})
