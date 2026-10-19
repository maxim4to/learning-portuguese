import { Fragment, useId } from 'react'
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
              <mark className="animate-pop rounded-md bg-success-soft px-1.5 font-semibold text-success [box-decoration-break:clone]">
                {parts[i++] ?? parts[parts.length - 1]}
              </mark>
            )}
          </Fragment>
        ))}
      </>
    )
  }
  const n = prompt.split(/_{3,}/).length - 1
  return (
    <>
      {prompt.split(/_{3,}/).map((chunk, k, arr) => (
        <Fragment key={k}>
          {chunk}
          {k < arr.length - 1 && (
            <>
              <span aria-hidden className="mx-0.5 inline-block w-14 translate-y-0.5 border-b-2 border-dashed border-ink/60" />
              <span className="sr-only">[пропуск{n > 1 ? ` ${k + 1}` : ''}]</span>
            </>
          )}
        </Fragment>
      ))}
    </>
  )
}

export function FillGapExercise({ exercise: ex, locked, result, onSubmit, onSkip }: ExerciseProps<'fill-gap'>) {
  const gaps = Math.max(1, (ex.prompt.match(/_{3,}/g) ?? []).length)
  const id = useId()
  return (
    <div className="space-y-4">
      <p id={`${id}-p`} className="text-prompt text-pretty" lang="pt-PT">
        <GapSentence prompt={ex.prompt} fill={locked ? (result?.expected ?? ex.answer[0]) : undefined} />
      </p>
      {(ex.ru || ex.hint) && (
        <div className="space-y-0.5 text-sm text-ink-muted">
          {ex.ru && <p id={`${id}-ru`}>{ex.ru}</p>}
          {ex.hint && <p id={`${id}-h`}>Подсказка: {ex.hint}</p>}
        </div>
      )}
      <TextAnswer
        fields={gaps}
        locked={locked}
        result={result}
        describedBy={[`${id}-p`, ex.ru && `${id}-ru`, ex.hint && `${id}-h`].filter(Boolean).join(' ')}
        onSubmit={(v) => onSubmit(gradeTyped(v, ex.answer))}
        onSkip={onSkip}
      />
    </div>
  )
}
