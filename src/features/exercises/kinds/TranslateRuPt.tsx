import { gradeTyped } from '../grade'
import { TextAnswer } from '../TextAnswer'
import type { ExerciseProps } from '../types'

export function TranslateRuPtExercise({ exercise: ex, locked, result, onSubmit }: ExerciseProps<'translate-ru-pt'>) {
  return (
    <div className="space-y-4">
      <p className="text-xl">{ex.ru}</p>
      <TextAnswer
        locked={locked}
        result={result}
        multiline
        placeholder="По-португальски (pt-PT)"
        onSubmit={(v) => onSubmit(gradeTyped(v, ex.answer))}
      />
    </div>
  )
}
