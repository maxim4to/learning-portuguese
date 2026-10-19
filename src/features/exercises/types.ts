import type { Exercise, ExerciseOf, ExerciseType } from '@/content'
import type { GradeVerdict } from '@/engine/grading'

/** What an exercise component reports when the learner answers. */
export interface Submission {
  /** What the learner gave (typed text, chosen option, built sentence…). */
  given: string
  verdict: GradeVerdict
  /** Expected answer closest to `given` (defaults to the first accepted answer). */
  expected?: string
  /** «Не знаю»: counted as wrong, but no review card is created without the learner's consent. */
  skipped?: boolean
}

export interface ExerciseProps<T extends ExerciseType = ExerciseType> {
  exercise: ExerciseOf<T>
  /** true after answering: inputs become read-only and show the result. */
  locked: boolean
  /** Result of the current answer (only set when locked). */
  result?: AnswerRecord
  onSubmit(s: Submission): void
  /** «Не знаю» (provided by the runner; shows the answer without a guess). */
  onSkip?(): void
}

export interface AnswerRecord {
  exerciseId: string
  topicId: string
  given: string
  expected: string
  verdict: GradeVerdict
  /** Counted as correct (accent-only mismatches count when settings.lenientAccents). */
  ok: boolean
  /** Answered with «Не знаю». */
  skipped?: boolean
}

export interface RunSummary {
  correct: number
  total: number
  answers: AnswerRecord[]
}

export type AnyExercise = Exercise
