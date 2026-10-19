import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, History } from 'lucide-react'
import type { Exercise } from '@/content'
import { ProgressBar } from '@/components/ProgressBar'
import { cx, haptic, scrollBehavior } from '@/components/cx'
import { exerciseExpected, exerciseHeading } from './describe'
import { ExerciseFeedback } from './ExerciseFeedback'
import { feedbackSummary } from './feedbackText'
import { clearRun, loadRun, saveRunSnapshot } from './runPersist'
import { isInHiddenPanel } from './keyboard'
import { ChoiceExercise, ListenChoiceExercise } from './kinds/Choice'
import { FillGapExercise } from './kinds/FillGap'
import { ListenTypeExercise } from './kinds/ListenType'
import { MatchExercise } from './kinds/Match'
import { OrderWordsExercise } from './kinds/OrderWords'
import { SpeakShadowExercise } from './kinds/SpeakShadow'
import { TransformExercise } from './kinds/Transform'
import { TranslateRuPtExercise } from './kinds/TranslateRuPt'
import type { AnswerRecord, RunSummary, Submission } from './types'
import { useSettings } from './useSettings'

export interface ExerciseRunnerProps {
  exercises: readonly Exercise[]
  /** Called after «Дальше» on the last exercise. */
  onFinish(summary: RunSummary): void
  title?: string
  /**
   * Stable id of this run (e.g. `topic:<id>:lesson`): progress is kept in sessionStorage under it,
   * so a reload / PWA update resumes the run. Omit to disable.
   */
  persistKey?: string
  /**
   * Started by a click whose button unmounts («Начать», «Пройти заново», next stage…): focus the first task
   * heading on mount if focus fell to <body>. Leave off for runs that are simply on the page at load.
   */
  focusOnMount?: boolean
}

function ExerciseView(props: {
  exercise: Exercise
  locked: boolean
  result?: AnswerRecord
  onSubmit(s: Submission): void
  onSkip(): void
}): ReactNode {
  const { exercise: ex, ...rest } = props
  switch (ex.type) {
    case 'fill-gap':
      return <FillGapExercise exercise={ex} {...rest} />
    case 'choice':
      return <ChoiceExercise exercise={ex} {...rest} />
    case 'transform':
      return <TransformExercise exercise={ex} {...rest} />
    case 'order-words':
      return <OrderWordsExercise exercise={ex} {...rest} />
    case 'translate-ru-pt':
      return <TranslateRuPtExercise exercise={ex} {...rest} />
    case 'listen-type':
      return <ListenTypeExercise exercise={ex} {...rest} />
    case 'listen-choice':
      return <ListenChoiceExercise exercise={ex} {...rest} />
    case 'match':
      return <MatchExercise exercise={ex} {...rest} />
    case 'speak-shadow':
      return <SpeakShadowExercise exercise={ex} {...rest} />
  }
}

/**
 * Runs a list of exercises one by one: progress bar, per-type UI, grading (honours
 * settings.lenientAccents), feedback with the correct answer + explanation, «Дальше».
 * Keyboard: Enter checks typed answers / order-words, 1–9 pick options, Enter → next.
 * Focus: after «Дальше» it moves to the new task heading; after answering — to «Дальше».
 * Give it a `key` to restart with a new list.
 */
export function ExerciseRunner({ exercises, onFinish, title, persistKey, focusOnMount }: ExerciseRunnerProps) {
  const { lenientAccents } = useSettings()
  const [restored] = useState(() => loadRun(persistKey, exercises.map((e) => e.id)))
  const [index, setIndex] = useState(restored?.index ?? 0)
  const [answers, setAnswers] = useState<AnswerRecord[]>(restored?.answers ?? [])
  const [current, setCurrent] = useState<AnswerRecord | null>(restored?.current ?? null)
  const [resumeNote, setResumeNote] = useState(!!restored)
  const [live, setLive] = useState('')
  const nextRef = useRef<HTMLButtonElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)

  const ex = exercises[index]
  const total = exercises.length
  const isLast = index === total - 1

  // Keep the snapshot in sync (cheap: a few KB in sessionStorage).
  useEffect(() => {
    if (index === 0 && !current && !answers.length) return
    saveRunSnapshot(persistKey, { ids: exercises.map((e) => e.id), index, answers, current })
  }, [persistKey, exercises, index, answers, current])

  function submit(s: Submission) {
    if (current || !ex) return
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
    setResumeNote(false)
    setLive(feedbackSummary(ex, rec, lenientAccents))
    if (!s.skipped) haptic(ok ? 10 : [12, 40, 12])
  }

  function next() {
    if (!current) return
    const all = [...answers, current]
    if (isLast) {
      clearRun(persistKey)
      onFinish({ correct: all.filter((a) => a.ok).length, total: all.length, answers: all })
      return
    }
    setAnswers(all)
    setCurrent(null)
    setLive('')
    setIndex((i) => i + 1)
    moved.current = true
    // Keep the exercise in view on mobile after a long feedback block.
    const top = topRef.current
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start', behavior: scrollBehavior() })
  }

  function restart() {
    clearRun(persistKey)
    setIndex(0)
    setAnswers([])
    setCurrent(null)
    setLive('')
    setResumeNote(false)
  }

  const focusOnStart = useEffectEvent(() => {
    const a = document.activeElement
    if (focusOnMount && (!a || a === document.body)) headingRef.current?.focus({ preventScroll: true })
  })
  useEffect(() => focusOnStart(), [])

  // New task: move focus to its heading (the previous «Дальше» unmounts; focus must not fall to <body>).
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    headingRef.current?.focus({ preventScroll: true })
  }, [index])

  // After answering: focus «Дальше» and let Enter (anywhere but buttons/links) advance.
  // The listener is attached on the next tick so the Enter that submitted the answer doesn't also advance.
  const advance = useEffectEvent(() => next())
  useEffect(() => {
    if (!current) return
    nextRef.current?.focus({ preventScroll: true })
    nextRef.current?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return
      if (isInHiddenPanel(topRef.current)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'A')) return
      e.preventDefault()
      advance()
    }
    const timer = setTimeout(() => window.addEventListener('keydown', onKey), 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [current])

  if (!ex) return <p className="text-ink-muted">Упражнений пока нет.</p>

  const done = answers.length + (current ? 1 : 0)
  const correctSoFar = answers.filter((a) => a.ok).length + (current?.ok ? 1 : 0)

  return (
    <div ref={topRef} className="scroll-mt-24 space-y-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate font-semibold text-ink">{title}</span>
          <span className="flex shrink-0 items-center gap-2 text-ink-muted tabular-nums">
            <span>
              <span className="sr-only">Задание </span>
              {index + 1} / {total}
            </span>
            {done > 0 && (
              <span
                key={correctSoFar}
                className="inline-flex animate-pop items-center gap-0.5 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand-ink"
              >
                <Check aria-hidden className="size-3.5" strokeWidth={3} />
                {correctSoFar}
                <span className="sr-only"> верно</span>
              </span>
            )}
          </span>
        </div>
        <ProgressBar value={done / total} label={`Прогресс: ${done} из ${total}`} />
      </div>

      {resumeNote && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-azulejo-soft px-3 py-2 text-sm text-azulejo-ink">
          <History aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">
            Продолжаем с задания {index + 1} из {total}.
          </span>
          <button type="button" className="min-h-11 font-semibold underline-offset-2 hover:underline" onClick={restart}>
            Начать заново
          </button>
        </div>
      )}

      <section className="card space-y-5 sm:p-6" aria-labelledby={`${ex.id}-h`}>
        <h3
          id={`${ex.id}-h`}
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold tracking-wide text-ink-muted uppercase outline-none"
        >
          {exerciseHeading(ex)}
        </h3>
        <ExerciseView
          key={`${ex.id}:${index}`}
          exercise={ex}
          locked={!!current}
          result={current ?? undefined}
          onSubmit={submit}
          onSkip={() => submit({ given: '', verdict: 'wrong', skipped: true })}
        />
        {current && (
          <>
            <ExerciseFeedback ex={ex} rec={current} lenient={lenientAccents} />
            <div className="sticky-actions -mx-2 rounded-control bg-surface/95 p-2 backdrop-blur-sm sm:static sm:mx-0 sm:bg-transparent sm:p-0">
              <button
                ref={nextRef}
                type="button"
                className={cx('btn-primary w-full sm:w-auto sm:min-w-40')}
                onClick={next}
              >
                {isLast ? 'Завершить' : 'Дальше'}
                <ArrowRight aria-hidden className="size-5" />
              </button>
            </div>
          </>
        )}
      </section>
      {/* Always mounted, so screen readers announce each verdict. */}
      <div aria-live="polite" className="sr-only">
        {live}
      </div>
    </div>
  )
}
