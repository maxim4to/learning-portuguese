import { useEffect, useRef } from 'react'
import { Check, Plus } from 'lucide-react'
import { Button } from '@/components/Button'
import { cx } from '@/components/cx'
import { Dialog } from '@/components/Dialog'
import { useToast } from '@/components/toastContext'
import { plural } from '@/features/library/format'
import type { ReviewPicker } from './useReviewPicker'

/** Line above the list: how many items are in review (and a save error, if any). */
export function ReviewPickerBar({ picker, noun }: { picker: ReviewPicker; noun: [string, string, string] }) {
  const { cards, specs, missing } = picker
  const inReview = cards ? specs.length - missing.length : null
  return (
    <p className="min-h-5 text-sm text-ink-muted" aria-live="polite">
      {inReview === null ? (
        ' '
      ) : inReview === 0 ? (
        'Добавляйте в повторение только то, что ещё не знаете'
      ) : (
        <>
          В повторении: <span className="font-semibold text-ink tabular-nums">{inReview}</span> из {plural(specs.length, ...noun)}
        </>
      )}
      {picker.msg && <span className="text-danger"> · {picker.msg}</span>}
    </p>
  )
}

const ROW_BTN =
  'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill px-3 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default'

/**
 * Per-row control: «+ Добавить» → «✓ В повторении» with an inline «Убрать». Adding shows a toast with «Отменить».
 * A just-added card is removed at once; one with review history asks first (ReviewPickerConfirm).
 * Keyboard focus moves to the control that replaces the pressed one.
 */
export function ReviewToggle({ picker, id, name }: { picker: ReviewPicker; id: string; name: string }) {
  const toast = useToast()
  const added = !!picker.cards?.has(id)
  const loading = picker.cards === null
  const addRef = useRef<HTMLButtonElement>(null)
  const removeRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    ;(added ? removeRef : addRef).current?.focus({ preventScroll: true })
  }, [added])

  if (added) {
    return (
      <span className="inline-flex shrink-0 items-center">
        <span className="inline-flex min-h-11 items-center gap-1.5 pl-3 max-sm:pl-0 text-sm font-semibold whitespace-nowrap text-brand-ink">
          <Check aria-hidden className="size-4" strokeWidth={2.5} />В повторении
        </span>
        <button
          ref={removeRef}
          type="button"
          aria-label={`Убрать из повторения: «${name}»`}
          disabled={picker.busy}
          onClick={(e) => {
            refocus.current = e.currentTarget === document.activeElement
            picker.remove(id)
          }}
          className={cx(ROW_BTN, 'px-2.5 text-ink-muted underline-offset-4 hover:bg-surface-2 hover:text-ink hover:underline')}
        >
          Убрать
        </button>
      </span>
    )
  }

  return (
    <button
      ref={addRef}
      type="button"
      aria-label={`Добавить в повторение: «${name}»`}
      disabled={loading || picker.busy}
      onClick={(e) => {
        refocus.current = e.currentTarget === document.activeElement
        void picker.add([id]).then((n) => {
          if (n)
            toast({
              text: 'Добавлено в повторение',
              tone: 'success',
              action: { label: 'Отменить', onClick: () => void picker.removeNow(id) },
            })
        })
      }}
      className={cx(ROW_BTN, 'bg-surface-2 text-ink hover:bg-sunken/60 disabled:text-ink-muted')}
    >
      <Plus aria-hidden className="size-4" />
      Добавить
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
