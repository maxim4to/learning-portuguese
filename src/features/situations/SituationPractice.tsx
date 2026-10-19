import { useState } from 'react'
import type { Exercise, Situation } from '@/content'
import { useRepository, type TopicProgress, type TopicStatus } from '@/data'
import { ExerciseRunner, type RunSummary } from '@/features/exercises'
import { saveRun, type SaveOutcome } from '@/features/lessons/persist'
import { ResultScreen } from '@/features/lessons/ResultScreen'

interface Props {
  situation: Situation
  progress?: TopicProgress
  onSaved(): void
  next?: { label: string; onClick(): void }
}

interface Result {
  summary: RunSummary
  list: Exercise[]
  retry: boolean
  before: TopicStatus
  saving: boolean
  outcome?: SaveOutcome
  error?: string
}

/**
 * Situation exercises: runner → saves `{ topicId: situation.id, source: 'situation' }`,
 * logs errors and creates `error:<exerciseId>` SRS cards (same pipeline as lessons).
 */
export function SituationPractice({ situation, progress, onSaved, next }: Props) {
  const repo = useRepository()
  const exercises = situation.exercises
  const [run, setRun] = useState({ key: 0, list: exercises, retry: false })
  const [result, setResult] = useState<Result | null>(null)

  if (!exercises.length) return <p className="text-stone-500">В этой ситуации пока нет упражнений.</p>

  function start(list: Exercise[], retry: boolean) {
    setResult(null)
    setRun((r) => ({ key: r.key + 1, list, retry }))
  }

  function finish(summary: RunSummary) {
    const { list, retry } = run
    setResult({ summary, list, retry, before: progress?.status ?? 'not-started', saving: true })
    saveRun(repo, situation, summary, list, { source: 'situation', countProgress: !retry })
      .then((outcome) => {
        setResult((r) => (r && r.summary === summary ? { ...r, saving: false, outcome } : r))
        onSaved()
      })
      .catch((e: unknown) =>
        setResult((r) =>
          r && r.summary === summary ? { ...r, saving: false, error: e instanceof Error ? e.message : String(e) } : r,
        ),
      )
  }

  if (result) {
    const wrongIds = new Set(result.summary.answers.filter((a) => !a.ok).map((a) => a.exerciseId))
    return (
      <ResultScreen
        summary={result.summary}
        exercises={result.list}
        retry={result.retry}
        before={result.before}
        saving={result.saving}
        outcome={result.outcome}
        error={result.error}
        statusLabel="Статус ситуации:"
        back={{ to: '/situations', label: 'К ситуациям' }}
        onRetryWrong={() => start(result.list.filter((e) => wrongIds.has(e.id)), true)}
        onRestart={() => start(exercises, false)}
        next={next}
      />
    )
  }

  return (
    <ExerciseRunner
      key={run.key}
      exercises={run.list}
      title={run.retry ? 'Упражнения: работа над ошибками' : 'Упражнения'}
      onFinish={finish}
    />
  )
}
