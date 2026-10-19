import { useEffect, useRef } from 'react'
import { isInHiddenPanel } from '../keyboard'
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
  // Number keys 1..9 pick an option.
  useEffect(() => {
    if (locked) return
    const onKey = (e: KeyboardEvent) => {
      if (isInHiddenPanel(listRef.current)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
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
    <ul ref={listRef} className="grid gap-2">
      {options.map((opt, i) => {
        const isCorrect = i === correct
        const isGiven = given === opt
        const tone = !locked
          ? 'border-stone-300 bg-white hover:border-brand-500 hover:bg-brand-50 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-brand-800/20'
          : isCorrect
            ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-800/30 dark:text-brand-100'
            : isGiven
              ? 'border-red-400 bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'
              : 'border-stone-200 bg-white opacity-60 dark:border-stone-800 dark:bg-stone-900'
        return (
          <li key={i}>
            <button
              type="button"
              disabled={locked}
              onClick={() => onPick(i)}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[17px] transition disabled:cursor-default ${tone}`}
              lang="pt-PT"
            >
              <span className="hidden w-5 shrink-0 text-sm text-stone-400 sm:inline">{i + 1}</span>
              <span className="flex-1">{opt}</span>
              {locked && isCorrect && <span aria-label="верно">✓</span>}
              {locked && isGiven && !isCorrect && <span aria-label="неверно">✗</span>}
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
      <p className="text-xl leading-relaxed" lang="pt-PT">
        {ex.prompt}
      </p>
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

export function ListenChoiceExercise({ exercise: ex, locked, result, onSubmit }: ExerciseProps<'listen-choice'>) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SpeakButton text={ex.text} size="lg" label="Слушать" />
        <SpeakButton text={ex.text} rateFactor={0.75} label="Медленно" />
      </div>
      {ex.prompt && <p className="text-lg">{ex.prompt}</p>}
      {locked && (
        <p className="rounded-xl bg-stone-100 px-4 py-2 dark:bg-stone-800" lang="pt-PT">
          🔊 {ex.text}
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
