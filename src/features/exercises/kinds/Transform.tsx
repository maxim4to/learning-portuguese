import { gradeTyped } from '../grade'
import { TextAnswer } from '../TextAnswer'
import type { ExerciseProps } from '../types'

export function TransformExercise({ exercise: ex, locked, result, onSubmit }: ExerciseProps<'transform'>) {
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-stone-100 px-4 py-3 text-xl dark:bg-stone-800" lang="pt-PT">
        {ex.prompt}
      </p>
      <TextAnswer
        locked={locked}
        result={result}
        multiline
        placeholder="Новое предложение"
        onSubmit={(v) => onSubmit(gradeTyped(v, ex.answer))}
      />
    </div>
  )
}
