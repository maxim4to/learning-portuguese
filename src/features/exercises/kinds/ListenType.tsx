import { gradeTyped } from '../grade'
import { SpeakButton } from '../SpeakButton'
import { TextAnswer } from '../TextAnswer'
import type { ExerciseProps } from '../types'

export function ListenTypeExercise({ exercise: ex, locked, result, onSubmit, onSkip }: ExerciseProps<'listen-type'>) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SpeakButton text={ex.text} variant="solid" label="Слушать" />
        <SpeakButton text={ex.text} rateFactor={0.75} label="Медленно" />
      </div>
      {locked && (
        <p className="animate-enter text-base" lang="pt-PT">
          {ex.text}
        </p>
      )}
      <TextAnswer
        locked={locked}
        result={result}
        multiline
        label="Что вы услышали"
        placeholder="Что вы услышали?"
        onSubmit={(v) => onSubmit(gradeTyped(v, ex.answer))}
        onSkip={onSkip}
      />
    </div>
  )
}
