import { useId } from 'react'
import { gradeTyped } from '../grade'
import { TextAnswer } from '../TextAnswer'
import type { ExerciseProps } from '../types'

export function TransformExercise({ exercise: ex, locked, result, onSubmit, onSkip }: ExerciseProps<'transform'>) {
  const id = useId()
  return (
    <div className="space-y-4">
      <p id={id} className="card-sunken px-4 py-3 text-xl" lang="pt-PT">
        {ex.prompt}
      </p>
      <TextAnswer
        locked={locked}
        result={result}
        multiline
        label="Новое предложение"
        describedBy={id}
        placeholder="Новое предложение"
        onSubmit={(v) => onSubmit(gradeTyped(v, ex.answer))}
        onSkip={onSkip}
      />
    </div>
  )
}
