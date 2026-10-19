import { useEffect, useRef, useState } from 'react'
import type { Exercise } from '@/content'
import { haptic } from '@/components/cx'
import { exerciseExpected, exerciseHeading } from './describe'
import { ExerciseFeedback } from './ExerciseFeedback'
import { ExerciseView } from './ExerciseRunner'
import { feedbackSummary } from './feedbackText'
import type { AnswerRecord, Submission } from './types'
import { useSettings } from './useSettings'

interface Props {
  exercise: Exercise
  /** Called once, when the learner answers (or presses «Не знаю»). */
  onAnswered(rec: AnswerRecord): void
  /** Optional line above the task (e.g. «Задание, в котором была ошибка»). */
  note?: string
}

/**
 * One exercise in single-item mode (used by SRS review of 'error' cards): the same per-type UI and grading
 * as in lessons, then the feedback (correct answer + explanation). No «Дальше», no persistence, no error log —
 * the caller decides what happens next. Give it a `key` to start over.
 * Focus: on mount, a text field (when the kind autofocuses it) or else the task heading.
 */
export function ReviewExercise({ exercise: ex, onAnswered, note }: Props) {
  const { lenientAccents } = useSettings()
  const [current, setCurrent] = useState<AnswerRecord | null>(null)
  const [live, setLive] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Child effects (TextAnswer autofocus on fine pointers) run first; only take focus if it isn't already inside.
  useEffect(() => {
    if (!rootRef.current?.contains(document.activeElement)) headingRef.current?.focus({ preventScroll: true })
  }, [])

  function submit(s: Submission) {
    if (current) return
    const ok = s.verdict === 'correct' || (s.verdict === 'accents' && lenientAccents)
    const rec: AnswerRecord = {
      exerciseId: ex.id,
      topicId: ex.topicId,
      given: s.given,
      expected: s.expected ?? exerciseExpected(ex)[0],
      verdict: s.verdict,
      ok,
      ...(s.skipped ? { skipped: true } : {}),
    }
    setCurrent(rec)
    setLive(feedbackSummary(ex, rec, lenientAccents))
    if (!s.skipped) haptic(ok ? 10 : [12, 40, 12])
    onAnswered(rec)
  }

  return (
    <div ref={rootRef} className="space-y-5" aria-labelledby={`${ex.id}-rh`} role="group">
      <div className="space-y-2">
        {note && <p className="text-sm text-ink-muted">{note}</p>}
        <h3
          id={`${ex.id}-rh`}
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-ink-muted outline-none"
        >
          {exerciseHeading(ex)}
        </h3>
      </div>
      <ExerciseView
        exercise={ex}
        locked={!!current}
        result={current ?? undefined}
        onSubmit={submit}
        onSkip={() => submit({ given: '', verdict: 'wrong', skipped: true })}
      />
      {current && <ExerciseFeedback ex={ex} rec={current} lenient={lenientAccents} />}
      <div aria-live="polite" className="sr-only">
        {live}
      </div>
    </div>
  )
}
