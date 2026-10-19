import { useId } from 'react'
import { gradeTyped } from '../grade'
import { TextAnswer } from '../TextAnswer'
import type { ExerciseProps } from '../types'

export function TranslateRuPtExercise({ exercise: ex, locked, result, onSubmit, onSkip }: ExerciseProps<'translate-ru-pt'>) {
  const id = useId()
  return (
    <div className="space-y-4">
      <p id={id} className="text-xl text-pretty">
        {ex.ru}
      </p>
      <TextAnswer
        locked={locked}
        result={result}
        multiline
        label="Перевод на португальский"
        describedBy={id}
        placeholder="По-португальски (pt-PT)"
        onSubmit={(v) => onSubmit(gradeTyped(v, ex.answer))}
        onSkip={onSkip}
      />
    </div>
  )
}
