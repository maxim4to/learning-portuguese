import { useEffect, useRef, useState } from 'react'
import { cx } from '@/components/cx'
import { gradeTyped, shuffle } from '../grade'
import { isInHiddenPanel } from '../keyboard'
import type { ExerciseProps } from '../types'

const chip =
  'inline-flex min-h-11 items-center rounded-pill border-[1.5px] px-4 text-[1.0625rem] leading-none transition-[background-color,border-color,transform,opacity] duration-150 active:scale-95 disabled:cursor-default'

/** Tap-to-build sentence from shuffled word chips (may contain distractors). */
export function OrderWordsExercise({ exercise: ex, locked, result, onSubmit, onSkip }: ExerciseProps<'order-words'>) {
  const [pool] = useState(() => shuffle(ex.words.map((w, id) => ({ id, w }))))
  const [built, setBuilt] = useState<number[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const used = new Set(built)
  const sentence = built.map((id) => ex.words[id]).join(' ')

  function check() {
    if (locked || !built.length) return
    onSubmit(gradeTyped(sentence, [ex.answer]))
  }

  // Enter checks, Backspace removes the last chip (when focus isn't in a text field).
  useEffect(() => {
    if (locked) return
    const onKey = (e: KeyboardEvent) => {
      if (isInHiddenPanel(rootRef.current)) return
      const t = e.target as HTMLElement | null
      // A just-picked chip is disabled but keeps focus until the browser's focus fixup — treat it as no focus.
      const activeButton = t?.tagName === 'BUTTON' && !(t as HTMLButtonElement).disabled
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || activeButton)) {
        if (!(activeButton && e.key === 'Backspace')) return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        check()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        setBuilt((b) => b.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tone = !result
    ? 'border-line-strong bg-sunken'
    : result.ok
      ? 'animate-pop border-success bg-success-soft'
      : result.skipped
        ? 'border-line-strong bg-surface-2'
        : 'animate-shake border-danger bg-danger-soft'

  return (
    <div ref={rootRef} className="space-y-4">
      {ex.ru && <p className="text-xl text-pretty">{ex.ru}</p>}
      <div
        role="group"
        aria-label="Ваше предложение"
        className={cx('flex min-h-[4.25rem] flex-wrap content-start gap-2 rounded-control border-2 border-dashed p-2.5', tone)}
        lang="pt-PT"
      >
        {built.length === 0 && (
          <span className="self-center px-1 text-ink-muted" lang="ru">
            Нажимайте на слова ниже…
          </span>
        )}
        {built.map((id, i) => (
          <button
            key={id}
            type="button"
            disabled={locked}
            aria-label={`${ex.words[id]} — убрать`}
            onClick={() => setBuilt((b) => b.filter((_, j) => j !== i))}
            className={cx(chip, 'animate-pop border-ink bg-ink text-surface')}
          >
            {ex.words[id]}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {sentence ? `Собрано: ${sentence}` : ''}
      </p>
      <div role="group" aria-label="Слова" className={cx('flex flex-wrap gap-2', locked && 'hidden')} lang="pt-PT">
        {pool.map(({ id, w }) => (
          <button
            key={id}
            type="button"
            disabled={locked || used.has(id)}
            onClick={() => setBuilt((b) => [...b, id])}
            className={cx(chip, 'border-line-strong bg-surface hover:border-ink', used.has(id) && 'invisible')}
          >
            {w}
          </button>
        ))}
      </div>
      {!locked && (
        <div className="sticky-actions -mx-2 flex flex-wrap gap-2 rounded-[1.875rem] bg-surface/95 p-2 backdrop-blur-sm sm:static sm:mx-0 sm:bg-transparent sm:p-0">
          <button type="button" className="btn-primary flex-[1_0_auto] sm:min-w-36 sm:flex-none" disabled={!built.length} onClick={check}>
            Проверить
          </button>
          <button type="button" className="btn-secondary shrink-0" disabled={!built.length} onClick={() => setBuilt([])}>
            Сбросить
          </button>
          {onSkip && (
            <button type="button" className="btn-ghost shrink-0 grow sm:grow-0" onClick={onSkip}>
              Не знаю
            </button>
          )}
        </div>
      )}
    </div>
  )
}
