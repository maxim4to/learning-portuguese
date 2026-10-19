import { Fragment } from 'react'
import { gradeTyped } from '../grade'
import { TextAnswer } from '../TextAnswer'
import type { ExerciseProps } from '../types'

function GapSentence({ prompt, fill }: { prompt: string; fill?: string }) {
  if (fill !== undefined) {
    // Show the sentence with the expected filling highlighted.
    const parts = fill.split(/\s*\/\s*/)
    let i = 0
    return (
      <>
        {prompt.split(/_{3,}/).map((chunk, k, arr) => (
          <Fragment key={k}>
            {chunk}
            {k < arr.length - 1 && (
              <mark className="rounded bg-brand-100 px-1 font-semibold text-brand-800 dark:bg-brand-800/40 dark:text-brand-100">
                {parts[i++] ?? parts[parts.length - 1]}
              </mark>
            )}
          </Fragment>
        ))}
      </>
    )
  }
  return (
    <>
      {prompt.split(/_{3,}/).map((chunk, k, arr) => (
        <Fragment key={k}>
          {chunk}
          {k < arr.length - 1 && (
            <span className="mx-0.5 inline-block w-14 border-b-2 border-dashed border-stone-400 align-baseline" aria-label="пропуск" />
          )}
        </Fragment>
      ))}
    </>
  )
}

export function FillGapExercise({ exercise: ex, locked, result, onSubmit }: ExerciseProps<'fill-gap'>) {
  const gaps = Math.max(1, (ex.prompt.match(/_{3,}/g) ?? []).length)
  return (
    <div className="space-y-4">
      <p className="text-xl leading-relaxed" lang="pt-PT">
        <GapSentence prompt={ex.prompt} fill={locked ? (result?.expected ?? ex.answer[0]) : undefined} />
      </p>
      {(ex.ru || ex.hint) && (
        <div className="space-y-0.5 text-sm text-stone-500 dark:text-stone-400">
          {ex.ru && <p>{ex.ru}</p>}
          {ex.hint && <p>Подсказка: {ex.hint}</p>}
        </div>
      )}
      <TextAnswer fields={gaps} locked={locked} result={result} onSubmit={(v) => onSubmit(gradeTyped(v, ex.answer))} />
    </div>
  )
}
