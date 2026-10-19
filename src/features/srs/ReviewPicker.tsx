import { useEffect, useRef } from 'react'
import { Check, ListChecks, Plus } from 'lucide-react'
import { Button } from '@/components/Button'
import { cx } from '@/components/cx'
import { Dialog } from '@/components/Dialog'
import { plural } from '@/features/library/format'
import type { ReviewPicker } from './useReviewPicker'

/**
 * Bar above the list: how many are in review and «Выбрать несколько»; in selection mode — «Добавить выбранные (N)»,
 * with «Добавить все» as a quiet secondary option and «Отмена».
 */
export function ReviewPickerBar({ picker, noun }: { picker: ReviewPicker; noun: [string, string, string] }) {
  const { cards, specs, missing, selecting, selected, busy } = picker
  const inReview = cards ? specs.length - missing.length : null
  const selectRef = useRef<HTMLButtonElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const wasSelecting = useRef(selecting)
  // Keep keyboard focus on the bar when it switches modes (the pressed button unmounts).
  useEffect(() => {
    if (wasSelecting.current === selecting) return
    wasSelecting.current = selecting
    const bar = selectRef.current ?? addRef.current
    if (bar && document.activeElement === document.body) bar.focus({ preventScroll: true })
  }, [selecting])

  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <p className="text-sm text-ink-muted" aria-live="polite">
        {selecting ? (
          <>
            Выбрано: <span className="font-semibold text-ink tabular-nums">{selected.size}</span> · отметьте, что хотите повторять
          </>
        ) : inReview === null ? (
          ' '
        ) : inReview === 0 ? (
          `Добавляйте в повторение только то, что ещё не знаете`
        ) : (
          <>
            В повторении: <span className="font-semibold text-ink tabular-nums">{inReview}</span> из {plural(specs.length, ...noun)}
          </>
        )}
        {!selecting && picker.msg && <span className="max-sm:hidden"> · {picker.msg}</span>}
      </p>
      {selecting ? (
        <div className="flex flex-wrap items-center gap-1">
          <Button ref={addRef} size="sm" icon={<Plus />} disabled={busy || selected.size === 0} onClick={() => void picker.add([...selected])}>
            Добавить выбранные ({selected.size})
          </Button>
          {missing.length > 1 && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void picker.add(missing.map((s) => s.id))}>
              Добавить все ({missing.length})
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={picker.stopSelecting}>
            Отмена
          </Button>
        </div>
      ) : (
        missing.length > 1 && (
          <Button ref={selectRef} size="sm" variant="ghost" icon={<ListChecks />} disabled={!cards} onClick={picker.startSelecting}>
            Выбрать несколько
          </Button>
        )
      )}
    </div>
  )
}

/**
 * Per-row control. Normal mode: a toggle «в повторение» ↔ «в повторении» (pressing again removes the card).
 * Selection mode: a checkbox; items already in review show as added and can't be picked.
 */
export function ReviewToggle({ picker, id, name }: { picker: ReviewPicker; id: string; name: string }) {
  const added = !!picker.cards?.has(id)
  const loading = picker.cards === null

  if (picker.selecting) {
    if (added) {
      return (
        <span className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-sm font-semibold text-brand-ink">
          <Check aria-hidden className="size-4" strokeWidth={2.5} />
          <span className="max-sm:sr-only">в повторении</span>
        </span>
      )
    }
    const checked = picker.selected.has(id)
    return (
      <label className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-2 px-2 text-sm font-semibold">
        <input
          type="checkbox"
          className="size-5 shrink-0 cursor-pointer accent-[var(--color-brand)]"
          checked={checked}
          onChange={() => picker.toggleSelected(id)}
          aria-label={`Выбрать «${name}»`}
        />
        <span aria-hidden className="max-sm:hidden text-ink-muted">выбрать</span>
      </label>
    )
  }

  return (
    <button
      type="button"
      aria-pressed={added}
      aria-label={`В повторение: «${name}»`}
      title={added ? 'В повторении — нажмите, чтобы убрать' : 'Добавить в повторение'}
      disabled={loading || picker.busy}
      onClick={() => (added ? picker.remove(id) : void picker.add([id]))}
      className={cx(
        'group inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-pill px-2.5 text-sm font-semibold whitespace-nowrap transition-colors disabled:cursor-default sm:px-3',
        added ? 'text-brand-ink hover:bg-surface-2' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
      )}
    >
      {added ? <Check aria-hidden className="size-4" strokeWidth={2.5} /> : <Plus aria-hidden className="size-4" />}
      <span className="max-sm:sr-only">{added ? 'в повторении' : 'в повторение'}</span>
    </button>
  )
}

/** Confirmation for removing a card that already has review history. */
export function ReviewPickerConfirm({ picker }: { picker: ReviewPicker }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const c = picker.confirm
  if (!c) return null
  const close = () => picker.setConfirm(null)
  return (
    <Dialog
      open
      role="alertdialog"
      onClose={close}
      initialFocusRef={cancelRef}
      title="Убрать из повторения?"
      description={
        <>
          Карточка «{c.back}» уже повторялась ({plural(c.fsrs.reps, 'раз', 'раза', 'раз')}). Её прогресс будет потерян.
        </>
      }
      actions={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={close}>
            Оставить
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              close()
              void picker.removeNow(c.id)
            }}
          >
            Убрать
          </Button>
        </>
      }
    />
  )
}
