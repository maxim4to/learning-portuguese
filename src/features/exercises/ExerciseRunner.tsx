import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import type { Exercise } from '@/content'
import { Markdown } from '@/components/Markdown'
import { ProgressBar } from '@/components/ProgressBar'
import { exerciseExpected, exerciseHeading } from './describe'
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
}

function ExerciseView(props: {
  exercise: Exercise
  locked: boolean
  result?: AnswerRecord
  onSubmit(s: Submission): void
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

function Feedback({ ex, rec, lenient }: { ex: Exercise; rec: AnswerRecord; lenient: boolean }) {
  const accepted = exerciseExpected(ex)
  const others = accepted.filter((a) => a !== rec.expected)
  const isShadow = ex.type === 'speak-shadow'
  const isTyped = ['fill-gap', 'transform', 'translate-ru-pt', 'listen-type', 'order-words'].includes(ex.type)

  let head: ReactNode
  let tone: string
  if (rec.verdict === 'correct') {
    head = isShadow ? 'Отлично!' : 'Верно!'
    tone = 'border-brand-500/40 bg-brand-50 dark:bg-brand-800/20'
  } else if (rec.verdict === 'accents' && lenient) {
    head = 'Верно, но проверь акценты'
    tone = 'border-amber-400/60 bg-amber-50 dark:bg-amber-900/20'
  } else if (rec.verdict === 'accents') {
    head = 'Почти: ошибка только в акцентах'
    tone = 'border-amber-400/60 bg-amber-50 dark:bg-amber-900/20'
  } else {
    head = isShadow ? 'Потренируйтесь ещё' : 'Неверно'
    tone = 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
  }

  return (
    <div className={`space-y-2 rounded-xl border p-4 ${tone}`} role="status" aria-live="polite">
      <p className="font-semibold">
        {rec.ok ? '✓ ' : '✗ '}
        {head}
      </p>
      {!isShadow && isTyped && !rec.ok && rec.verdict !== 'accents' && (
        <p className="text-sm">
          <span className="text-stone-500">Ваш ответ: </span>
          <span lang="pt-PT">{rec.given || '—'}</span>
        </p>
      )}
      {!isShadow && (rec.verdict !== 'correct' || ex.type === 'match') && (
        <p>
          <span className="text-sm text-stone-500">{ex.type === 'match' ? 'Пары: ' : 'Правильно: '}</span>
          <b lang="pt-PT">{rec.expected}</b>
        </p>
      )}
      {!isShadow && others.length > 0 && isTyped && (
        <p className="text-sm">
          <span className="text-stone-500">Также принимается: </span>
          <span lang="pt-PT">{others.join(' · ')}</span>
        </p>
      )}
      {ex.type === 'match' && rec.verdict === 'wrong' && (
        <p className="text-sm text-stone-600 dark:text-stone-400">{rec.given}</p>
      )}
      {ex.explanation && <Markdown className="text-[15px] text-stone-700 dark:text-stone-300">{ex.explanation}</Markdown>}
    </div>
  )
}

/**
 * Runs a list of exercises one by one: progress bar, per-type UI, grading (honours
 * settings.lenientAccents), feedback with the correct answer + explanation, «Дальше».
 * Keyboard: Enter checks typed answers / order-words, 1–9 pick options, Enter → next.
 * Give it a `key` to restart with a new list.
 */
export function ExerciseRunner({ exercises, onFinish, title }: ExerciseRunnerProps) {
  const { lenientAccents } = useSettings()
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<AnswerRecord[]>([])
  const [current, setCurrent] = useState<AnswerRecord | null>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const topRef = useRef<HTMLDivElement>(null)

  const ex = exercises[index]
  const total = exercises.length
  const isLast = index === total - 1

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
    }
    setCurrent(rec)
  }

  function next() {
    if (!current) return
    const all = [...answers, current]
    if (isLast) {
      onFinish({ correct: all.filter((a) => a.ok).length, total: all.length, answers: all })
      return
    }
    setAnswers(all)
    setCurrent(null)
    setIndex((i) => i + 1)
    // Keep the exercise in view on mobile after a long feedback block.
    const top = topRef.current
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  // After answering: focus «Дальше» and let Enter (anywhere but buttons/links) advance.
  // The listener is attached on the next tick so the Enter that submitted the answer doesn't also advance.
  const advance = useEffectEvent(() => next())
  useEffect(() => {
    if (!current) return
    nextRef.current?.focus({ preventScroll: true })
    nextRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
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

  if (!ex) return <p className="text-stone-500">Упражнений пока нет.</p>

  const done = answers.length + (current ? 1 : 0)
  const correctSoFar = answers.filter((a) => a.ok).length + (current?.ok ? 1 : 0)

  return (
    <div ref={topRef} className="scroll-mt-20 space-y-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3 text-sm text-stone-500">
          <span className="font-medium text-stone-700 dark:text-stone-300">{title}</span>
          <span className="tabular-nums">
            {index + 1} / {total}
            {done > 0 && <span className="ml-2 text-brand-700 dark:text-brand-500">✓ {correctSoFar}</span>}
          </span>
        </div>
        <ProgressBar value={done / total} label={`Прогресс: ${done} из ${total}`} />
      </div>

      <section className="card space-y-4 sm:p-6">
        <h3 className="text-base font-medium text-stone-600 dark:text-stone-400">{exerciseHeading(ex)}</h3>
        <ExerciseView key={`${ex.id}:${index}`} exercise={ex} locked={!!current} result={current ?? undefined} onSubmit={submit} />
        {current && (
          <>
            <Feedback ex={ex} rec={current} lenient={lenientAccents} />
            <button ref={nextRef} type="button" className="btn-primary w-full sm:w-auto" onClick={next}>
              {isLast ? 'Завершить' : 'Дальше'} →
            </button>
          </>
        )}
      </section>
    </div>
  )
}
