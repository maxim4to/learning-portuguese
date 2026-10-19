import { useEffect, useRef, useState } from 'react'
import { Check, Volume2, X } from 'lucide-react'
import { cx, haptic } from '@/components/cx'
import { focusMark, isInHiddenPanel, noMods, rovingIndex } from '../keyboard'
import { SpeakButton } from '../SpeakButton'
import type { ExerciseProps } from '../types'

function Options({
  options,
  correct,
  locked,
  given,
  onPick,
}: {
  options: string[]
  correct: number
  locked: boolean
  given?: string
  onPick(i: number): void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const btns = useRef<(HTMLButtonElement | null)[]>([])
  // Roving tabindex: one Tab stop for the whole group; arrows move between options, Enter / Space answers.
  const [active, setActive] = useState(0)
  // Number keys 1..9 pick an option.
  useEffect(() => {
    if (locked) return
    const onKey = (e: KeyboardEvent) => {
      if (isInHiddenPanel(listRef.current)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (!noMods(e)) return
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        e.preventDefault()
        onPick(n - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked, options.length, onPick])

  return (
    <ul
      ref={listRef}
      role="radiogroup"
      aria-label="Варианты ответа"
      className="grid gap-2"
      {...focusMark}
      onKeyDown={(e) => {
        if (locked || !noMods(e) || e.shiftKey) return
        const to = rovingIndex(e.key, active, options.length)
        if (to === null) return
        e.preventDefault()
        setActive(to)
        btns.current[to]?.focus()
      }}
    >
      {options.map((opt, i) => {
        const isCorrect = i === correct
        const isGiven = given === opt
        const tone = !locked
          ? 'border-line-strong bg-surface hover:border-ink active:scale-[0.99]'
          : isCorrect
            ? cx('border-success bg-success-soft text-success font-semibold', isGiven && 'animate-pop')
            : isGiven
              ? 'animate-shake border-danger bg-danger-soft text-danger'
              : 'border-line bg-surface text-ink-muted opacity-70'
        return (
          <li key={i} role="none">
            <button
              ref={(el) => {
                btns.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={locked ? isGiven : false}
              tabIndex={i === active ? 0 : -1}
              disabled={locked}
              onFocus={() => setActive(i)}
              onClick={() => onPick(i)}
              className={cx(
                'flex min-h-13 w-full items-center gap-3 rounded-control border-[1.5px] px-4 py-3 text-left text-base transition-[background-color,border-color,transform] duration-150 disabled:cursor-default',
                tone,
              )}
              lang="pt-PT"
            >
              <span
                aria-hidden
                className={cx(
                  'hidden size-6 shrink-0 place-items-center rounded-md border text-xs font-bold text-ink-muted tabular-nums sm:grid',
                  locked ? 'border-transparent' : 'border-line-strong',
                )}
              >
                {i + 1}
              </span>
              <span className="flex-1">{opt}</span>
              {locked && isCorrect && (
                <>
                  <Check aria-hidden className="size-5 shrink-0" strokeWidth={2.75} />
                  <span className="sr-only" lang="ru">
                    {isGiven ? ' — ваш ответ, верно' : ' — верный ответ'}
                  </span>
                </>
              )}
              {locked && isGiven && !isCorrect && (
                <>
                  <X aria-hidden className="size-5 shrink-0" strokeWidth={2.75} />
                  <span className="sr-only" lang="ru">
                    {' — ваш ответ, неверно'}
                  </span>
                </>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function ChoiceExercise({ exercise: ex, locked, result, onSubmit }: ExerciseProps<'choice'>) {
  return (
    <div className="space-y-4">
      <p className="text-prompt text-pretty" lang="pt-PT">
        {ex.prompt}
      </p>
      <Options
        options={ex.options}
        correct={ex.correct}
        locked={locked}
        given={result?.given}
        onPick={(i) => {
          haptic(5)
          onSubmit({ given: ex.options[i], verdict: i === ex.correct ? 'correct' : 'wrong', expected: ex.options[ex.correct] })
        }}
      />
    </div>
  )
}

export function ListenChoiceExercise({ exercise: ex, locked, result, onSubmit }: ExerciseProps<'listen-choice'>) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="contents" {...focusMark}>
          <SpeakButton text={ex.text} variant="solid" label="Слушать" />
        </span>
        <SpeakButton text={ex.text} rateFactor={0.75} label="Медленно" />
      </div>
      {ex.prompt && <p className="text-prompt text-pretty">{ex.prompt}</p>}
      {locked && (
        <p className="card-sunken flex animate-enter items-center gap-2 px-4 py-2.5" lang="pt-PT">
          <Volume2 aria-hidden className="size-4 shrink-0 text-ink" />
          {ex.text}
        </p>
      )}
      <Options
        options={ex.options}
        correct={ex.correct}
        locked={locked}
        given={result?.given}
        onPick={(i) =>
          onSubmit({ given: ex.options[i], verdict: i === ex.correct ? 'correct' : 'wrong', expected: ex.options[ex.correct] })
        }
      />
    </div>
  )
}
